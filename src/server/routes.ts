import { Hono, type Context } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { randomId, sha256, hmac, hashPassword, verifyPassword, timingSafeEqual } from './crypto'
import { normalizePhone } from './phone'
import { normalizeUrl, unfurl } from './unfurl'
import { translateError } from './messages'
import { normalizeDocument } from './dni'

export type Env = {
  DB: D1Database
  DNI_PEPPER: string
  SESSION_PEPPER: string
  ADMIN_USERNAMES?: string // separados por comas; se marcan como admin al registrarse
}

type Vars = { userId: string }
type Ctx = Context<{ Bindings: Env; Variables: Vars }>

const SESSION_DAYS = 60
const COOKIE = 'cample_session'

const app = new Hono<{ Bindings: Env; Variables: Vars }>().basePath('/api')

/* ---------------------------------- utils --------------------------------- */

const now = () => Math.floor(Date.now() / 1000)

function pair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

async function rateLimit(env: Env, key: string, max: number, windowSec: number) {
  const t = now()
  const row = await env.DB.prepare('SELECT count, reset_at FROM rate_limits WHERE key = ?')
    .bind(key)
    .first<{ count: number; reset_at: number }>()
  if (!row || row.reset_at < t) {
    await env.DB.prepare(
      'INSERT INTO rate_limits (key, count, reset_at) VALUES (?1, 1, ?2) ' +
        'ON CONFLICT(key) DO UPDATE SET count = 1, reset_at = ?2',
    )
      .bind(key, t + windowSec)
      .run()
    return true
  }
  if (row.count >= max) return false
  await env.DB.prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?').bind(key).run()
  return true
}

async function notify(env: Env, userId: string, kind: string, body: string, link?: string) {
  await env.DB.prepare(
    'INSERT INTO notifications (id, user_id, kind, body, link, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(randomId(8), userId, kind, body, link ?? null, now())
    .run()
}

async function areFriends(env: Env, a: string, b: string) {
  const [x, y] = pair(a, b)
  const r = await env.DB.prepare('SELECT 1 AS ok FROM friendships WHERE user_a = ? AND user_b = ?')
    .bind(x, y)
    .first()
  return !!r
}

/* ----------------------- confianza y cuentas duplicadas -------------------- */
// En la web abierta no se puede impedir que alguien se cree una segunda cuenta, así que en vez de
// intentarlo se hace que no sirva de nada: para ver lo que llevan los demás en una lista hay que
// llevar unos días de amistad Y tener amigos en común, cosa que una cuenta recién hecha no puede
// falsificar sola (haría falta que dos personas reales la aceptasen). El atajo es que un admin la
// desbloquee a mano, o el teléfono verificado.
//
// ⚠️ Solo mira a QUIEN MIRA, nunca al dueño de la lista: el atacante es el propio dueño (se espía
// su propia lista con una cuenta falsa), así que fiarse de él sería darle la llave de su casa.
const DIAS_PARA_VER_RESERVAS = 7
const AMIGOS_EN_COMUN_PARA_VER_RESERVAS = 2

async function puedeVerReservas(env: Env, viewer: string, owner: string) {
  const u = await env.DB.prepare('SELECT trust_level FROM users WHERE id = ?')
    .bind(viewer)
    .first<{ trust_level: number }>()
  if (u?.trust_level) return true

  const [x, y] = pair(viewer, owner)
  const f = await env.DB.prepare(
    'SELECT created_at FROM friendships WHERE user_a = ? AND user_b = ?',
  )
    .bind(x, y)
    .first<{ created_at: number }>()
  if (!f) return false
  if (now() - f.created_at < DIAS_PARA_VER_RESERVAS * 86400) return false

  const r = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM (
       SELECT CASE WHEN user_a = ?1 THEN user_b ELSE user_a END AS amigo
         FROM friendships WHERE user_a = ?1 OR user_b = ?1
       INTERSECT
       SELECT CASE WHEN user_a = ?2 THEN user_b ELSE user_a END
         FROM friendships WHERE user_a = ?2 OR user_b = ?2
     )`,
  )
    .bind(viewer, owner)
    .first<{ n: number }>()
  return (r?.n ?? 0) >= AMIGOS_EN_COMUN_PARA_VER_RESERVAS
}

/**
 * La misma regla que `puedeVerReservas`, pero en SQL, para poder filtrar dentro de una consulta
 * grande. Espera `?1` = quien mira, `?2` = el corte de antigüedad, y una tabla `g` con `user_id`
 * (el dueño). Nada de subconsultas en FROM: no pueden mirar columnas de fuera.
 */
const VE_RESERVAS_SQL = `(
  (SELECT trust_level FROM users WHERE id = ?1) = 1
  OR (
    (SELECT f.created_at FROM friendships f
      WHERE f.user_a = MIN(?1, g.user_id) AND f.user_b = MAX(?1, g.user_id)) <= ?2
    AND (SELECT COUNT(*) FROM friendships f1
          WHERE (f1.user_a = ?1 OR f1.user_b = ?1)
            AND EXISTS (SELECT 1 FROM friendships f2
                         WHERE (f2.user_a = g.user_id OR f2.user_b = g.user_id)
                           AND CASE WHEN f2.user_a = g.user_id THEN f2.user_b ELSE f2.user_a END
                             = CASE WHEN f1.user_a = ?1 THEN f1.user_b ELSE f1.user_a END))
        >= ${AMIGOS_EN_COMUN_PARA_VER_RESERVAS}
  )
)`

/** Amistad ya aceptada para quien llega por un enlace de invitación. Falla en silencio. */
async function aceptarInvitacion(c: Ctx, code: string, nuevo: string) {
  const limpio = code.trim().toLowerCase()
  if (!limpio) return
  const inv = await c.env.DB.prepare('SELECT user_id FROM invites WHERE code = ?')
    .bind(limpio)
    .first<{ user_id: string }>()
  if (!inv || inv.user_id === nuevo) return
  const [x, y] = pair(inv.user_id, nuevo)
  const t = now()
  await c.env.DB.prepare(
    'INSERT OR IGNORE INTO friendships (user_a, user_b, created_at) VALUES (?, ?, ?)',
  )
    .bind(x, y, t)
    .run()
  await c.env.DB.prepare('UPDATE invites SET uses = uses + 1 WHERE code = ?').bind(limpio).run()
  const u = await c.env.DB.prepare('SELECT display_name FROM users WHERE id = ?')
    .bind(nuevo)
    .first<{ display_name: string }>()
  await notify(c.env, inv.user_id, 'friend_accept', `${u?.display_name ?? 'Alguien'} ya está en Cample`, '/amigos')
}

/* --------------------------- sesión y protección --------------------------- */

/**
 * Las rutas escriben sus mensajes de error en español; aquí se traducen al vuelo según el
 * `Accept-Language` que manda el cliente. Un solo sitio en vez de una clave en cada `c.json`.
 */
app.use('*', async (c, next) => {
  await next()
  const lang = c.req.header('Accept-Language')
  if (!lang || c.res.ok) return
  if (!c.res.headers.get('Content-Type')?.includes('application/json')) return

  const cuerpo = await c.res.clone().json<any>().catch(() => null)
  if (!cuerpo?.error || typeof cuerpo.error !== 'string') return

  const traducido = translateError(cuerpo.error, lang)
  if (traducido === cuerpo.error) return
  c.res = new Response(JSON.stringify({ ...cuerpo, error: traducido }), {
    status: c.res.status,
    headers: c.res.headers,
  })
})

// Ninguna respuesta de la API debe cachearse: son datos vivos y personales. (La única excepción
// es la foto de perfil, que pone su propia cabecera más abajo.)
app.use('*', async (c, next) => {
  await next()
  if (!c.res.headers.has('Cache-Control')) c.res.headers.set('Cache-Control', 'no-store')
})

// CSRF: cookie SameSite=Lax + verificación de Origin en métodos que escriben.
app.use('*', async (c, next) => {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    const origin = c.req.header('Origin')
    if (origin) {
      const host = c.req.header('Host')
      try {
        if (new URL(origin).host !== host) return c.json({ error: 'origen no permitido' }, 403)
      } catch {
        return c.json({ error: 'origen no permitido' }, 403)
      }
    }
  }
  await next()
})

async function currentUserId(c: Ctx): Promise<string | null> {
  const token = getCookie(c, COOKIE)
  if (!token) return null
  const th = await sha256(token + c.env.SESSION_PEPPER)
  const row = await c.env.DB.prepare(
    'SELECT user_id, expires_at FROM sessions WHERE token_hash = ?',
  )
    .bind(th)
    .first<{ user_id: string; expires_at: number }>()
  if (!row) return null
  if (row.expires_at < now()) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(th).run()
    return null
  }
  return row.user_id
}

const auth = async (c: Ctx, next: any) => {
  const uid = await currentUserId(c)
  if (!uid) return c.json({ error: 'no autenticado' }, 401)
  c.set('userId', uid)
  await next()
}

async function startSession(c: Ctx, userId: string) {
  const token = randomId(32)
  const th = await sha256(token + c.env.SESSION_PEPPER)
  const t = now()
  await c.env.DB.prepare(
    'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
  )
    .bind(th, userId, t, t + SESSION_DAYS * 86400)
    .run()
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_DAYS * 86400,
  })
}

const publicUser = (u: any) => ({
  id: u.id,
  username: u.username,
  displayName: u.display_name,
  bio: u.bio,
  avatarSeed: u.avatar_seed,
  birthday: u.birthday,
  // La versión solo sube, así cada foto nueva estrena dirección y nunca se sirve la vieja.
  avatarVersion: u.avatar_version ?? 0,
  hasAvatar: !!u.has_avatar,
  onboardingSeen: u.onboarding_seen ?? 0,
  // Solo si lo tiene puesto; el número en sí no sale nunca de la base.
  hasPhone: !!u.phone_hash,
})

/** Cumpleaños en DD-MM; se guarda tal cual o null si no cuadra. */
function normalizeBirthday(raw: unknown): string | null {
  const s = String(raw ?? '').trim().replace(/[/.]/g, '-')
  const m = s.match(/^(\d{1,2})-(\d{1,2})$/)
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}`
}

/* ---------------------------------- auth ---------------------------------- */

app.post('/auth/register', async (c) => {
  const ip = c.req.header('CF-Connecting-IP') ?? 'local'
  const b = await c.req.json().catch(() => ({}))
  const username = String(b.username ?? '').trim().toLowerCase()
  const displayName = String(b.displayName ?? '').trim()
  const password = String(b.password ?? '')
  const telRaw = String(b.phone ?? '').trim()
  const phone = telRaw ? normalizePhone(telRaw) : null

  if (!/^[a-z0-9._]{3,20}$/.test(username))
    return c.json({ error: 'El usuario debe tener 3-20 letras, números, punto o guion bajo' }, 400)
  if (displayName.length < 2 || displayName.length > 40)
    return c.json({ error: 'Escribe tu nombre (2-40 caracteres)' }, 400)
  if (password.length < 8) return c.json({ error: 'La contraseña necesita al menos 8 caracteres' }, 400)
  if (telRaw && !phone) return c.json({ error: 'Ese teléfono no parece válido. Escríbelo con los 9 dígitos.' }, 400)

  // El límite se comprueba aquí, ya validado todo: elegir un usuario que ya existe no debe gastar
  // intentos (media familia comparte el mismo wifi).
  if (!(await rateLimit(c.env, `reg:${ip}`, 20, 3600)))
    return c.json({ error: 'Demasiadas cuentas nuevas desde aquí. Prueba dentro de un rato.' }, 429)

  // Un nombre recién soltado sigue reservado para su antiguo dueño (ver /me/username).
  if (await reservaDe(c.env, username))
    return c.json({ error: 'Ese nombre de usuario ya está cogido' }, 409)

  const id = randomId(8)
  const t = now()
  try {
    const isAdmin = (c.env.ADMIN_USERNAMES ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .includes(username)
    await c.env.DB.prepare(
      'INSERT INTO users (id, username, display_name, bio, avatar_seed, password_hash, phone_hash, birthday, created_at, is_admin, trust_level, trust_source, trusted_at) ' +
        'VALUES (?, ?, ?, "", ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(
        id,
        username,
        displayName,
        randomId(4),
        await hashPassword(password),
        phone ? await hmac(c.env.DNI_PEPPER, phone) : null,
        normalizeBirthday(b.birthday),
        t,
        isAdmin ? 1 : 0,
        // Un admin es alguien que ya conocemos; el resto empieza en 0 y va ganando confianza.
        isAdmin ? 1 : 0,
        isAdmin ? 'admin' : null,
        isAdmin ? t : null,
      )
      .run()
  } catch (e: any) {
    const m = String(e?.message ?? '')
    if (m.includes('users.username')) return c.json({ error: 'Ese nombre de usuario ya está cogido' }, 409)
    if (m.includes('phone_hash') || m.includes('idx_users_phone'))
      return c.json({ error: 'Ese teléfono ya está puesto en otra cuenta' }, 409)
    throw e
  }
  // Rastro mínimo para que un admin pueda detectar cuentas duplicadas. Ni la IP ni el navegador se
  // guardan en claro, y esto no bloquea a nadie ni se le enseña nunca al usuario.
  await c.env.DB.prepare(
    'INSERT OR REPLACE INTO signup_signals (user_id, ip_hash, ua_hash, created_at) VALUES (?, ?, ?, ?)',
  )
    .bind(
      id,
      await sha256(ip + c.env.SESSION_PEPPER),
      await sha256(String(c.req.header('User-Agent') ?? '') + c.env.SESSION_PEPPER),
      t,
    )
    .run()
  // Si viene por invitación, sale con un amigo ya aceptado: una lista vacía y sin nadie no vale nada.
  await aceptarInvitacion(c, String(b.invite ?? ''), id)
  await startSession(c, id)
  const u = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first()
  return c.json({ user: publicUser(u) })
})

app.post('/auth/login', async (c) => {
  const ip = c.req.header('CF-Connecting-IP') ?? 'local'
  const b = await c.req.json().catch(() => ({}))
  const username = String(b.username ?? '').trim().toLowerCase()
  if (!(await rateLimit(c.env, `login:${ip}:${username}`, 10, 900)))
    return c.json({ error: 'Demasiados intentos, prueba dentro de un rato' }, 429)

  const u = await c.env.DB.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1')
    .bind(username)
    .first<any>()
  const ok = u ? await verifyPassword(String(b.password ?? ''), u.password_hash) : false
  if (!ok) return c.json({ error: 'Usuario o contraseña incorrectos' }, 401)
  await startSession(c, u.id)
  return c.json({ user: publicUser(u) })
})

app.post('/auth/logout', async (c) => {
  const token = getCookie(c, COOKIE)
  if (token) {
    const th = await sha256(token + c.env.SESSION_PEPPER)
    await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(th).run()
  }
  deleteCookie(c, COOKIE, { path: '/' })
  return c.json({ ok: true })
})

app.get('/me', async (c) => {
  const uid = await currentUserId(c)
  if (!uid) return c.json({ user: null })
  const u = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(uid).first<any>()
  return c.json({ user: u ? { ...publicUser(u), isAdmin: !!u.is_admin } : null })
})

/* ------------------------ recuperar contraseña ---------------------------- */
// No hay email en el sistema: la persona lo pide con su DNI, un administrador de la familia lo
// aprueba y le dicta el código por teléfono. Así, conocer el DNI de alguien no basta para entrar.

// Sin caracteres ambiguos: se dicta en voz alta.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function resetCode() {
  const a = new Uint8Array(8)
  crypto.getRandomValues(a)
  const s = [...a].map((n) => CODE_ALPHABET[n % CODE_ALPHABET.length]).join('')
  return `${s.slice(0, 4)}-${s.slice(4)}`
}

app.post('/auth/reset/request', async (c) => {
  const ip = c.req.header('CF-Connecting-IP') ?? 'local'
  if (!(await rateLimit(c.env, `reset:${ip}`, 5, 3600)))
    return c.json({ error: 'Demasiados intentos, prueba dentro de un rato' }, 429)

  const b = await c.req.json().catch(() => ({}))
  const doc = normalizeDocument(String(b.document ?? ''))
  const username = String(b.username ?? '').trim().toLowerCase()

  // Respuesta idéntica acierte o no: no confirmamos si una cuenta existe.
  if (username) {
    // Las cuentas antiguas siguen teniendo DNI y se les sigue pidiendo. Las nuevas no tienen, así
    // que basta el usuario: quien decide de verdad es el admin que lo aprueba a mano.
    const u = await c.env.DB.prepare(
      'SELECT id FROM users WHERE username = ? AND is_active = 1 ' +
        'AND (dni_hash IS NULL OR dni_hash = ?)',
    )
      .bind(username, doc ? await hmac(c.env.DNI_PEPPER, doc) : '')
      .first<{ id: string }>()
    if (u) {
      const pending = await c.env.DB.prepare(
        "SELECT id FROM password_resets WHERE user_id = ? AND status IN ('pending','approved')",
      )
        .bind(u.id)
        .first()
      if (!pending) {
        await c.env.DB.prepare(
          'INSERT INTO password_resets (id, user_id, created_at) VALUES (?, ?, ?)',
        )
          .bind(randomId(8), u.id, now())
          .run()
        const { results } = await c.env.DB.prepare('SELECT id FROM users WHERE is_admin = 1').all<{
          id: string
        }>()
        for (const a of results)
          await notify(c.env, a.id, 'reset_request', 'Alguien ha pedido recuperar su contraseña', '/admin')
      }
    }
  }
  return c.json({ ok: true })
})

app.post('/auth/reset/confirm', async (c) => {
  const ip = c.req.header('CF-Connecting-IP') ?? 'local'
  if (!(await rateLimit(c.env, `resetc:${ip}`, 10, 3600)))
    return c.json({ error: 'Demasiados intentos, prueba dentro de un rato' }, 429)

  const b = await c.req.json().catch(() => ({}))
  const username = String(b.username ?? '').trim().toLowerCase()
  const code = String(b.code ?? '').trim().toUpperCase()
  const password = String(b.password ?? '')
  if (password.length < 8) return c.json({ error: 'La contraseña necesita al menos 8 caracteres' }, 400)

  const row = await c.env.DB.prepare(
    `SELECT r.* FROM password_resets r JOIN users u ON u.id = r.user_id
      WHERE u.username = ? AND r.status = 'approved' ORDER BY r.created_at DESC LIMIT 1`,
  )
    .bind(username)
    .first<any>()
  const invalid = { error: 'El código no es correcto o ha caducado' }
  if (!row || row.expires_at < now() || row.attempts >= 5) return c.json(invalid, 400)

  if (!timingSafeEqual(await sha256(code + c.env.SESSION_PEPPER), row.code_hash)) {
    await c.env.DB.prepare('UPDATE password_resets SET attempts = attempts + 1 WHERE id = ?')
      .bind(row.id)
      .run()
    return c.json(invalid, 400)
  }

  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(
      await hashPassword(password),
      row.user_id,
    ),
    c.env.DB.prepare("UPDATE password_resets SET status = 'used', used_at = ? WHERE id = ?").bind(
      now(),
      row.id,
    ),
    // Cierra cualquier sesión abierta de esa cuenta.
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(row.user_id),
  ])
  return c.json({ ok: true })
})

/* ---------------------------------- admin --------------------------------- */
// REGLA: el panel de administración NO expone NADA de la tabla `reservations`, ni siquiera
// contadores globales. El admin es un usuario más de la red y también recibe regalos: enseñarle
// cualquier cifra de reservas le destriparía su propia sorpresa. No añadir excepciones.

const adminOnly = async (c: Ctx, next: any) => {
  const u = await c.env.DB.prepare('SELECT is_admin FROM users WHERE id = ?')
    .bind(c.get('userId'))
    .first<{ is_admin: number }>()
  if (!u?.is_admin) return c.json({ error: 'No autorizado' }, 403)
  await next()
}

app.get('/admin/resets', auth, adminOnly, async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT r.id, r.status, r.created_at, r.expires_at, u.username, u.display_name
       FROM password_resets r JOIN users u ON u.id = r.user_id
      WHERE r.status IN ('pending','approved') ORDER BY r.created_at DESC`,
  ).all<any>()
  return c.json({
    resets: results.map((r) => ({
      id: r.id,
      status: r.status,
      username: r.username,
      displayName: r.display_name,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
    })),
  })
})

// Devuelve el código en claro UNA sola vez: el admin se lo dicta a la persona.
app.post('/admin/resets/:id/approve', auth, adminOnly, async (c) => {
  const r = await c.env.DB.prepare("SELECT * FROM password_resets WHERE id = ? AND status = 'pending'")
    .bind(c.req.param('id')!)
    .first<any>()
  if (!r) return c.json({ error: 'Esa solicitud ya no está pendiente' }, 404)
  const code = resetCode()
  await c.env.DB.prepare(
    "UPDATE password_resets SET status = 'approved', code_hash = ?, approved_at = ?, expires_at = ? WHERE id = ?",
  )
    .bind(await sha256(code + c.env.SESSION_PEPPER), now(), now() + 3600, r.id)
    .run()
  await notify(c.env, r.user_id, 'reset_ready', 'Tu solicitud de contraseña nueva está aprobada')
  return c.json({ code })
})

app.post('/admin/resets/:id/reject', auth, adminOnly, async (c) => {
  await c.env.DB.prepare("UPDATE password_resets SET status = 'rejected' WHERE id = ?")
    .bind(c.req.param('id')!)
    .run()
  return c.json({ ok: true })
})

// Límite del plan gratuito de D1.
const D1_FREE_BYTES = 5 * 1024 * 1024 * 1024

/* --------------------- fallos y sugerencias (buzón) ----------------------- */
// Texto libre que manda cualquiera desde Ajustes y solo leen los administradores.

app.post('/feedback', auth, async (c) => {
  const b = await c.req.json().catch(() => ({}))
  const body = String(b.body ?? '').trim().slice(0, 2000)
  if (body.length < 5) return c.json({ error: 'Cuéntanos un poco más' }, 400)
  if (!(await rateLimit(c.env, `fb:${c.get('userId')}`, 10, 3600)))
    return c.json({ error: 'Has enviado varios mensajes seguidos. Prueba dentro de un rato.' }, 429)
  await c.env.DB.prepare(
    'INSERT INTO feedback (id, user_id, kind, body, created_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(randomId(8), c.get('userId'), b.kind === 'bug' ? 'bug' : 'idea', body, now())
    .run()
  return c.json({ ok: true })
})

app.get('/admin/feedback', auth, adminOnly, async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT f.*, u.username, u.display_name FROM feedback f
       LEFT JOIN users u ON u.id = f.user_id
      ORDER BY f.status, f.created_at DESC LIMIT 200`,
  ).all<any>()
  return c.json({
    feedback: results.map((f) => ({
      id: f.id,
      kind: f.kind,
      body: f.body,
      status: f.status,
      createdAt: f.created_at,
      from: f.username ? { username: f.username, displayName: f.display_name } : null,
    })),
  })
})

app.post('/admin/feedback/:id/done', auth, adminOnly, async (c) => {
  const b = await c.req.json().catch(() => ({}))
  await c.env.DB.prepare('UPDATE feedback SET status = ? WHERE id = ?')
    .bind(b.done === false ? 'new' : 'done', c.req.param('id')!)
    .run()
  return c.json({ ok: true })
})

app.delete('/admin/feedback/:id', auth, adminOnly, async (c) => {
  await c.env.DB.prepare('DELETE FROM feedback WHERE id = ?').bind(c.req.param('id')!).run()
  return c.json({ ok: true })
})

app.get('/admin/stats', auth, adminOnly, async (c) => {
  // D1 devuelve el tamaño real de la base en la metainformación de cualquier consulta.
  const sizeProbe = await c.env.DB.prepare('SELECT 1').run()
  const photos = await c.env.DB.prepare('SELECT COALESCE(SUM(LENGTH(data)), 0) AS n FROM avatars').first<{
    n: number
  }>()
  const r = await c.env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM users WHERE is_active = 1) AS usuarios,
            (SELECT COUNT(*) FROM users WHERE is_active = 0) AS desactivados,
            (SELECT COUNT(*) FROM gifts WHERE is_archived = 0) AS regalos,
            (SELECT COUNT(*) FROM friendships) AS amistades,
            (SELECT COUNT(*) FROM friend_requests) AS solicitudes,
            (SELECT COUNT(*) FROM password_resets WHERE status = 'pending') AS resets,
            (SELECT COUNT(*) FROM gift_groups WHERE status = 'open') AS colectas`,
  ).first<any>()
  return c.json({
    stats: {
      ...r,
      db: {
        used: (sizeProbe.meta as any)?.size_after ?? 0,
        limit: D1_FREE_BYTES,
        photos: photos?.n ?? 0,
      },
    },
  })
})

app.get('/admin/users', auth, adminOnly, async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.username, u.display_name, u.created_at, u.is_active, u.is_admin,
            u.trust_level, u.trust_source,
            (SELECT COUNT(*) FROM gifts g WHERE g.user_id = u.id) AS gifts,
            (SELECT COUNT(*) FROM friendships f WHERE f.user_a = u.id OR f.user_b = u.id) AS friends,
            -- Sospecha de cuenta duplicada: comparte rastro de registro con otra cuenta Y son
            -- amigas entre sí (que es lo que hace falta para espiarse a uno mismo).
            (SELECT COUNT(*) FROM signup_signals s1
               JOIN signup_signals s2 ON s2.ip_hash = s1.ip_hash AND s2.ua_hash = s1.ua_hash
                                     AND s2.user_id != s1.user_id
              WHERE s1.user_id = u.id
                AND EXISTS (SELECT 1 FROM friendships f
                             WHERE f.user_a = MIN(u.id, s2.user_id)
                               AND f.user_b = MAX(u.id, s2.user_id))) AS twins
       FROM users u ORDER BY u.created_at DESC`,
  ).all<any>()
  return c.json({
    users: results.map((u) => ({
      username: u.username,
      displayName: u.display_name,
      createdAt: u.created_at,
      isActive: !!u.is_active,
      isAdmin: !!u.is_admin,
      gifts: u.gifts,
      friends: u.friends,
      trusted: !!u.trust_level,
      trustSource: u.trust_source,
      // Solo una señal para mirar con calma; no bloquea nada ni se le dice al interesado.
      suspicious: u.twins > 0,
    })),
  })
})

// «Desbloquear»: para cuentas que un admin sabe que son de una persona real. Es un juicio sobre la
// persona, así que se puede retirar y surte efecto al momento.
app.post('/admin/users/:username/trust', auth, adminOnly, async (c) => {
  const b = await c.req.json().catch(() => ({}))
  const target = await userByUsername(c, c.req.param('username')!)
  if (!target) return c.json({ error: 'No existe ese usuario' }, 404)
  const on = b.trusted ? 1 : 0
  await c.env.DB.prepare(
    'UPDATE users SET trust_level = ?, trust_source = ?, trusted_at = ? WHERE id = ?',
  )
    .bind(on, on ? 'admin' : null, on ? now() : null, target.id)
    .run()
  return c.json({ ok: true })
})

// Desactivar deja la cuenta sin acceso pero conserva sus datos y sus reservas.
app.post('/admin/users/:username/active', auth, adminOnly, async (c) => {
  const b = await c.req.json().catch(() => ({}))
  const target = await userByUsername(c, c.req.param('username')!)
  if (!target) return c.json({ error: 'No existe ese usuario' }, 404)
  if (target.id === c.get('userId')) return c.json({ error: 'No puedes desactivarte a ti mismo' }, 400)
  const active = b.isActive ? 1 : 0
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET is_active = ? WHERE id = ?').bind(active, target.id),
    ...(active ? [] : [c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(target.id)]),
  ])
  return c.json({ ok: true })
})

app.delete('/admin/users/:username', auth, adminOnly, async (c) => {
  const target = await c.env.DB.prepare('SELECT id FROM users WHERE username = ?')
    .bind(c.req.param('username')!.toLowerCase())
    .first<{ id: string }>()
  if (!target) return c.json({ error: 'No existe ese usuario' }, 404)
  if (target.id === c.get('userId')) return c.json({ error: 'No puedes borrar tu propia cuenta' }, 400)
  // Explícito por si las claves foráneas no estuvieran activas en la conexión.
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM reservations WHERE reserver_id = ?1 OR gift_id IN (SELECT id FROM gifts WHERE user_id = ?1)').bind(target.id),
    c.env.DB.prepare('DELETE FROM gift_audience WHERE user_id = ?1 OR gift_id IN (SELECT id FROM gifts WHERE user_id = ?1)').bind(target.id),
    c.env.DB.prepare('DELETE FROM gift_reactions WHERE user_id = ?1 OR gift_id IN (SELECT id FROM gifts WHERE user_id = ?1)').bind(target.id),
    c.env.DB.prepare('DELETE FROM list_views WHERE owner_id = ?1 OR viewer_id = ?1').bind(target.id),
    c.env.DB.prepare('DELETE FROM gift_images WHERE gift_id IN (SELECT id FROM gifts WHERE user_id = ?)').bind(target.id),
    c.env.DB.prepare('DELETE FROM gifts WHERE user_id = ?').bind(target.id),
    c.env.DB.prepare('DELETE FROM feedback WHERE user_id = ?').bind(target.id),
    c.env.DB.prepare('DELETE FROM friendships WHERE user_a = ?1 OR user_b = ?1').bind(target.id),
    c.env.DB.prepare('DELETE FROM friend_requests WHERE from_id = ?1 OR to_id = ?1').bind(target.id),
    c.env.DB.prepare('DELETE FROM notifications WHERE user_id = ?').bind(target.id),
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(target.id),
    c.env.DB.prepare('DELETE FROM password_resets WHERE user_id = ?').bind(target.id),
    c.env.DB.prepare('DELETE FROM signup_signals WHERE user_id = ?').bind(target.id),
    c.env.DB.prepare('DELETE FROM username_history WHERE user_id = ?').bind(target.id),
    c.env.DB.prepare('DELETE FROM invites WHERE user_id = ?').bind(target.id),
    c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(target.id),
  ])
  return c.json({ ok: true })
})

app.patch('/me', auth, async (c) => {
  const b = await c.req.json().catch(() => ({}))
  const u = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(c.get('userId')).first<any>()
  const displayName = b.displayName !== undefined ? String(b.displayName).trim().slice(0, 40) : u.display_name
  const bio = b.bio !== undefined ? String(b.bio).slice(0, 200) : u.bio
  const birthday = b.birthday !== undefined ? normalizeBirthday(b.birthday) : u.birthday
  if (displayName.length < 2) return c.json({ error: 'El nombre no puede estar vacío' }, 400)
  await c.env.DB.prepare('UPDATE users SET display_name = ?, bio = ?, birthday = ? WHERE id = ?')
    .bind(displayName, bio, birthday, u.id)
    .run()
  return c.json({ user: publicUser({ ...u, display_name: displayName, bio, birthday }) })
})

/* --------------------- cambiar el nombre de usuario ------------------------ */
// Copiado de Instagram, que es donde la gente ya ha aprendido cómo funciona esto:
//  - como mucho 2 cambios cada 14 días, para que un nombre signifique algo y no se pueda usar
//    para hacerse pasar por otro a base de saltos;
//  - el nombre que sueltas te queda reservado esos mismos 14 días, así que puedes volver atrás si
//    te arrepientes y nadie te lo quita mientras tanto;
//  - y volver a un nombre tuyo reservado no gasta cambio: arreglar una equivocación no se castiga.

const USERNAME_DIAS = 14
const USERNAME_CAMBIOS = 2

/** Quién tiene reservado ese nombre ahora mismo, o null si está libre. */
async function reservaDe(env: Env, username: string) {
  const r = await env.DB.prepare(
    'SELECT user_id FROM username_history WHERE old_username = ? AND changed_at > ?',
  )
    .bind(username, now() - USERNAME_DIAS * 86400)
    .first<{ user_id: string }>()
  return r?.user_id ?? null
}

app.get('/me/username', auth, async (c) => {
  const desde = now() - USERNAME_DIAS * 86400
  const r = await c.env.DB.prepare(
    'SELECT COUNT(*) AS n, MIN(changed_at) AS primero FROM username_history WHERE user_id = ? AND changed_at > ?',
  )
    .bind(c.get('userId'), desde)
    .first<{ n: number; primero: number | null }>()
  const usados = r?.n ?? 0
  return c.json({
    left: Math.max(0, USERNAME_CAMBIOS - usados),
    // Cuándo se libera el hueco más antiguo, para poder decir «podrás volver a cambiarlo el…».
    nextAt: usados >= USERNAME_CAMBIOS && r?.primero ? r.primero + USERNAME_DIAS * 86400 : null,
  })
})

app.post('/me/username', auth, async (c) => {
  const me = c.get('userId')
  const b = await c.req.json().catch(() => ({}))
  const nuevo = String(b.username ?? '').trim().toLowerCase()
  const actual = await c.env.DB.prepare('SELECT username FROM users WHERE id = ?')
    .bind(me)
    .first<{ username: string }>()
  if (!actual) return c.json({ error: 'No encontrado' }, 404)
  if (nuevo === actual.username) return c.json({ error: 'Ese ya es tu nombre de usuario' }, 400)
  if (!/^[a-z0-9._]{3,20}$/.test(nuevo))
    return c.json({ error: 'El usuario debe tener 3-20 letras, números, punto o guion bajo' }, 400)

  const dueno = await c.env.DB.prepare('SELECT id FROM users WHERE username = ?')
    .bind(nuevo)
    .first<{ id: string }>()
  if (dueno) return c.json({ error: 'Ese nombre de usuario ya está cogido' }, 409)

  // Si lo tiene reservado otra persona, para ella está cogido aunque no lo esté usando.
  const reservado = await reservaDe(c.env, nuevo)
  if (reservado && reservado !== me)
    return c.json({ error: 'Ese nombre de usuario ya está cogido' }, 409)

  // Recuperar un nombre propio es deshacer, no cambiar: no gasta.
  const esVolverAtras = reservado === me
  if (!esVolverAtras) {
    const r = await c.env.DB.prepare(
      'SELECT COUNT(*) AS n FROM username_history WHERE user_id = ? AND changed_at > ?',
    )
      .bind(me, now() - USERNAME_DIAS * 86400)
      .first<{ n: number }>()
    if ((r?.n ?? 0) >= USERNAME_CAMBIOS)
      return c.json(
        { error: 'Solo puedes cambiar tu nombre de usuario dos veces cada 14 días' },
        429,
      )
  }

  const t = now()
  await c.env.DB.batch([
    // El nombre que suelta queda reservado para él; si ya estaba en la tabla, se renueva la fecha.
    c.env.DB.prepare(
      'INSERT INTO username_history (old_username, user_id, changed_at) VALUES (?1, ?2, ?3) ' +
        'ON CONFLICT(old_username) DO UPDATE SET user_id = ?2, changed_at = ?3',
    ).bind(actual.username, me, t),
    c.env.DB.prepare('UPDATE users SET username = ? WHERE id = ?').bind(nuevo, me),
    // El que estrena deja de estar reservado: ya lo está usando.
    c.env.DB.prepare('DELETE FROM username_history WHERE old_username = ?').bind(nuevo),
  ])
  const u = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(me).first()
  return c.json({ user: publicUser(u) })
})

/**
 * Teléfono opcional. Se guarda como HMAC igual que el DNI: sirve para que te encuentren
 * desde la agenda, nunca para mostrarlo ni para identificarte al entrar.
 */
app.post('/me/phone', auth, async (c) => {
  const b = await c.req.json().catch(() => ({}))
  const raw = String(b.phone ?? '').trim()

  if (!raw) {
    await c.env.DB.prepare('UPDATE users SET phone_hash = NULL WHERE id = ?').bind(c.get('userId')).run()
    return c.json({ ok: true, hasPhone: false })
  }

  const phone = normalizePhone(raw)
  if (!phone) return c.json({ error: 'Ese teléfono no parece válido. Escríbelo con los 9 dígitos.' }, 400)

  try {
    await c.env.DB.prepare('UPDATE users SET phone_hash = ? WHERE id = ?')
      .bind(await hmac(c.env.DNI_PEPPER, phone), c.get('userId'))
      .run()
  } catch {
    return c.json({ error: 'Ese teléfono ya está puesto en otra cuenta' }, 409)
  }
  return c.json({ ok: true, hasPhone: true })
})

/**
 * Cruce con la agenda del móvil: llegan los teléfonos que la persona ha elegido a mano en el
 * selector del sistema, se convierten a hash y se devuelven los que existen en Cample.
 * Los números **no se guardan** en ningún sitio: se usan para esta consulta y se tiran.
 */
app.post('/friends/from-contacts', auth, async (c) => {
  const me = c.get('userId')
  const b = await c.req.json().catch(() => ({}))
  const raw: unknown[] = Array.isArray(b.phones) ? b.phones.slice(0, 500) : []

  const hashes: string[] = []
  for (const r of raw) {
    const p = normalizePhone(String(r ?? ''))
    if (p) hashes.push(await hmac(c.env.DNI_PEPPER, p))
  }
  if (!hashes.length) return c.json({ matches: [] })

  const vistos = new Set<string>()
  const matches: any[] = []
  // D1 limita los parámetros por consulta, así que se pregunta a trozos.
  for (let i = 0; i < hashes.length; i += 50) {
    const trozo = [...new Set(hashes.slice(i, i + 50))]
    const { results } = await c.env.DB.prepare(
      `SELECT u.* FROM users u
        WHERE u.phone_hash IN (${trozo.map(() => '?').join(',')})
          AND u.is_active = 1
          AND u.id <> ?
          AND u.id NOT IN (
            SELECT CASE WHEN user_a = ? THEN user_b ELSE user_a END FROM friendships WHERE user_a = ? OR user_b = ?
            UNION SELECT to_id FROM friend_requests WHERE from_id = ?
            UNION SELECT from_id FROM friend_requests WHERE to_id = ?
          )`,
    )
      .bind(...trozo, me, me, me, me, me, me)
      .all<any>()
    for (const u of results) {
      if (vistos.has(u.id)) continue
      vistos.add(u.id)
      matches.push(publicUser(u))
    }
  }
  return c.json({ matches })
})

app.post('/me/onboarding', auth, async (c) => {
  const b = await c.req.json().catch(() => ({}))
  await c.env.DB.prepare('UPDATE users SET onboarding_seen = ? WHERE id = ?')
    .bind(Math.max(0, Number(b.version) || 0), c.get('userId'))
    .run()
  return c.json({ ok: true })
})

app.post('/me/password', auth, async (c) => {
  const b = await c.req.json().catch(() => ({}))
  const u = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(c.get('userId')).first<any>()
  if (!(await verifyPassword(String(b.current ?? ''), u.password_hash)))
    return c.json({ error: 'La contraseña actual no es correcta' }, 403)
  const next = String(b.next ?? '')
  if (next.length < 8) return c.json({ error: 'La nueva contraseña necesita 8 caracteres' }, 400)
  await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .bind(await hashPassword(next), u.id)
    .run()
  // Cierra el resto de sesiones.
  const token = getCookie(c, COOKIE)!
  await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?')
    .bind(u.id, await sha256(token + c.env.SESSION_PEPPER))
    .run()
  return c.json({ ok: true })
})

/* ------------------------------ foto de perfil ---------------------------- */
// La imagen llega ya recortada a 256x256 y comprimida por el navegador (~20 KB). Se guarda en la
// tabla `avatars`, nunca en `users`, y se sirve con una URL distinta por cada foto (?v=version).

const MAX_AVATAR_BYTES = 150 * 1024

app.post('/me/avatar', auth, async (c) => {
  const b = await c.req.json().catch(() => ({}))
  const dataUrl = String(b.dataUrl ?? '')
  const m = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/)
  if (!m) return c.json({ error: 'Esa imagen no vale. Prueba con otra foto.' }, 400)

  const binary = atob(m[2])
  if (binary.length > MAX_AVATAR_BYTES) return c.json({ error: 'La foto es demasiado grande' }, 413)
  // D1 solo admite ArrayBuffer para los BLOB: un Uint8Array hace fallar el bind.
  const buffer = new ArrayBuffer(binary.length)
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

  await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO avatars (user_id, mime, data, updated_at) VALUES (?1, ?2, ?3, ?4) ' +
        'ON CONFLICT(user_id) DO UPDATE SET mime = ?2, data = ?3, updated_at = ?4',
    ).bind(c.get('userId'), m[1], buffer, now()),
    c.env.DB.prepare(
      'UPDATE users SET avatar_version = avatar_version + 1, has_avatar = 1 WHERE id = ?',
    ).bind(c.get('userId')),
  ])
  const u = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(c.get('userId')).first()
  return c.json({ user: publicUser(u) })
})

app.delete('/me/avatar', auth, async (c) => {
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM avatars WHERE user_id = ?').bind(c.get('userId')),
    // Ojo: la versión también sube al quitar. Si volviera a 0, la siguiente foto reutilizaría
    // una dirección ya cacheada por el navegador y se vería la anterior.
    c.env.DB.prepare(
      'UPDATE users SET avatar_version = avatar_version + 1, has_avatar = 0 WHERE id = ?',
    ).bind(c.get('userId')),
  ])
  const u = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(c.get('userId')).first()
  return c.json({ user: publicUser(u) })
})

// Visible para cualquiera que haya iniciado sesión: son caras, no datos sensibles.
app.get('/avatar/:username', auth, async (c) => {
  const row = await c.env.DB.prepare(
    'SELECT a.mime, a.data FROM avatars a JOIN users u ON u.id = a.user_id WHERE u.username = ?',
  )
    .bind(c.req.param('username')!.toLowerCase())
    .first<{ mime: string; data: ArrayBuffer | number[] }>()
  if (!row) return c.json({ error: 'Sin foto' }, 404)
  // D1 devuelve los BLOB como array de números: sin convertirlos, Response los serializa
  // como texto («137,80,78,…») y el navegador no ve una imagen.
  const body = row.data instanceof ArrayBuffer ? row.data : new Uint8Array(row.data)
  return new Response(body, {
    headers: {
      'Content-Type': row.mime,
      // Caché corta a propósito: con «immutable» durante un año, cualquier respuesta mala que
      // se colara en la caché del navegador se quedaba pegada y no había forma de arreglarlo.
      'Cache-Control': 'private, max-age=300, must-revalidate',
    },
  })
})

/* -------------------------------- personas -------------------------------- */

app.get('/users/search', auth, async (c) => {
  const q = (c.req.query('q') ?? '').trim().toLowerCase()
  if (q.length < 2) return c.json({ users: [] })
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM users WHERE is_active = 1 AND id != ?1 AND (username LIKE ?2 OR lower(display_name) LIKE ?2) LIMIT 20',
  )
    .bind(c.get('userId'), `%${q}%`)
    .all()
  return c.json({ users: results.map(publicUser) })
})

async function relationOf(c: Ctx, meId: string, otherId: string) {
  if (meId === otherId) return 'self'
  if (await areFriends(c.env, meId, otherId)) return 'friends'
  const out = await c.env.DB.prepare('SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ?')
    .bind(meId, otherId)
    .first()
  if (out) return 'requested'
  const inc = await c.env.DB.prepare('SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ?')
    .bind(otherId, meId)
    .first()
  if (inc) return 'incoming'
  return 'none'
}

app.get('/users/:username', auth, async (c) => {
  const u = await c.env.DB.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1')
    .bind(c.req.param('username')!.toLowerCase())
    .first<any>()
  if (!u) return c.json({ error: 'No existe ese usuario' }, 404)
  return c.json({ user: publicUser(u), relation: await relationOf(c, c.get('userId'), u.id) })
})

app.get('/friends', auth, async (c) => {
  const me = c.get('userId')
  const { results } = await c.env.DB.prepare(
    `SELECT u.* FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.user_a = ?1 THEN f.user_b ELSE f.user_a END
      WHERE (f.user_a = ?1 OR f.user_b = ?1) AND u.is_active = 1
      ORDER BY u.display_name COLLATE NOCASE`,
  )
    .bind(me)
    .all()
  return c.json({ friends: results.map(publicUser) })
})

// A quién le puede interesar agregar: primero amigos de sus amigos (con cuántos comparten),
// y si no llega, gente de la red a la que aún no ha agregado. Es un círculo cerrado y pequeño.
app.get('/friends/suggestions', auth, async (c) => {
  const me = c.get('userId')
  const { results } = await c.env.DB.prepare(
    `WITH mis_amigos AS (
       SELECT CASE WHEN user_a = ?1 THEN user_b ELSE user_a END AS id
         FROM friendships WHERE user_a = ?1 OR user_b = ?1
     ),
     excluidos AS (
       SELECT ?1 AS id
       UNION SELECT id FROM mis_amigos
       UNION SELECT to_id FROM friend_requests WHERE from_id = ?1
       UNION SELECT from_id FROM friend_requests WHERE to_id = ?1
     )
     SELECT u.*, COUNT(DISTINCT ma.id) AS comunes
       FROM mis_amigos ma
       JOIN friendships f ON f.user_a = ma.id OR f.user_b = ma.id
       JOIN users u ON u.id = CASE WHEN f.user_a = ma.id THEN f.user_b ELSE f.user_a END
      WHERE u.is_active = 1 AND u.id NOT IN (SELECT id FROM excluidos)
      GROUP BY u.id

      UNION ALL

     SELECT u.*, 0 AS comunes
       FROM users u
      WHERE u.is_active = 1
        AND u.id NOT IN (SELECT id FROM excluidos)
        AND u.id NOT IN (
          SELECT CASE WHEN f.user_a = ma.id THEN f.user_b ELSE f.user_a END
            FROM mis_amigos ma JOIN friendships f ON f.user_a = ma.id OR f.user_b = ma.id
        )
      ORDER BY comunes DESC, created_at DESC
      LIMIT 12`,
  )
    .bind(me)
    .all<any>()

  return c.json({
    suggestions: results.map((u) => ({ ...publicUser(u), mutual: u.comunes })),
  })
})

app.get('/friends/requests', auth, async (c) => {
  const me = c.get('userId')
  const incoming = await c.env.DB.prepare(
    'SELECT u.* FROM friend_requests r JOIN users u ON u.id = r.from_id WHERE r.to_id = ? ORDER BY r.created_at DESC',
  )
    .bind(me)
    .all()
  const outgoing = await c.env.DB.prepare(
    'SELECT u.* FROM friend_requests r JOIN users u ON u.id = r.to_id WHERE r.from_id = ? ORDER BY r.created_at DESC',
  )
    .bind(me)
    .all()
  return c.json({
    incoming: incoming.results.map(publicUser),
    outgoing: outgoing.results.map(publicUser),
  })
})

async function userByUsername(c: Ctx, username: string) {
  return c.env.DB.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1')
    .bind(username.toLowerCase())
    .first<any>()
}

app.post('/friends/:username/request', auth, async (c) => {
  const me = c.get('userId')
  const other = await userByUsername(c, c.req.param('username')!)
  if (!other) return c.json({ error: 'No existe ese usuario' }, 404)
  if (other.id === me) return c.json({ error: 'No puedes agregarte a ti mismo' }, 400)
  if (await areFriends(c.env, me, other.id)) return c.json({ relation: 'friends' })

  // Si ya me habían enviado solicitud, aceptamos directamente.
  const inc = await c.env.DB.prepare('SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ?')
    .bind(other.id, me)
    .first()
  if (inc) return c.json({ relation: await acceptRequest(c, other.id, me) })

  await c.env.DB.prepare(
    'INSERT OR IGNORE INTO friend_requests (from_id, to_id, created_at) VALUES (?, ?, ?)',
  )
    .bind(me, other.id, now())
    .run()
  const meUser = await c.env.DB.prepare('SELECT display_name, username FROM users WHERE id = ?')
    .bind(me)
    .first<any>()
  await notify(
    c.env,
    other.id,
    'friend_request',
    `${meUser.display_name} quiere ser tu amigo`,
    '/amigos',
  )
  return c.json({ relation: 'requested' })
})

async function acceptRequest(c: Ctx, fromId: string, toId: string) {
  const [a, b] = pair(fromId, toId)
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM friend_requests WHERE (from_id = ?1 AND to_id = ?2) OR (from_id = ?2 AND to_id = ?1)').bind(
      fromId,
      toId,
    ),
    c.env.DB.prepare('INSERT OR IGNORE INTO friendships (user_a, user_b, created_at) VALUES (?, ?, ?)').bind(
      a,
      b,
      now(),
    ),
  ])
  const to = await c.env.DB.prepare('SELECT display_name FROM users WHERE id = ?').bind(toId).first<any>()
  await notify(c.env, fromId, 'friend_accept', `${to.display_name} ha aceptado tu solicitud`, '/amigos')
  return 'friends'
}

app.post('/friends/:username/accept', auth, async (c) => {
  const me = c.get('userId')
  const other = await userByUsername(c, c.req.param('username')!)
  if (!other) return c.json({ error: 'No existe ese usuario' }, 404)
  const inc = await c.env.DB.prepare('SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ?')
    .bind(other.id, me)
    .first()
  if (!inc) return c.json({ error: 'No hay ninguna solicitud pendiente' }, 400)
  return c.json({ relation: await acceptRequest(c, other.id, me) })
})

// Rechazar solicitud, cancelar la enviada o eliminar amistad.
app.delete('/friends/:username', auth, async (c) => {
  const me = c.get('userId')
  const other = await userByUsername(c, c.req.param('username')!)
  if (!other) return c.json({ error: 'No existe ese usuario' }, 404)
  const [a, b] = pair(me, other.id)
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM friend_requests WHERE (from_id = ?1 AND to_id = ?2) OR (from_id = ?2 AND to_id = ?1)').bind(
      me,
      other.id,
    ),
    c.env.DB.prepare('DELETE FROM friendships WHERE user_a = ? AND user_b = ?').bind(a, b),
    // Al dejar de ser amigos se sueltan las reservas mutuas.
    c.env.DB.prepare(
      'DELETE FROM reservations WHERE (reserver_id = ?1 AND gift_id IN (SELECT id FROM gifts WHERE user_id = ?2)) OR (reserver_id = ?2 AND gift_id IN (SELECT id FROM gifts WHERE user_id = ?1))',
    ).bind(me, other.id),
    // Y las reacciones cruzadas: si ya no sois amigos, no debe quedar rastro de esa persona
    // en la lista del otro. (A diferencia de `gift_audience`, aquí no hay nada que conservar.)
    c.env.DB.prepare(
      'DELETE FROM gift_reactions WHERE (user_id = ?1 AND gift_id IN (SELECT id FROM gifts WHERE user_id = ?2)) OR (user_id = ?2 AND gift_id IN (SELECT id FROM gifts WHERE user_id = ?1))',
    ).bind(me, other.id),
    // Y se sale de las colectas por regalos de la otra persona.
    c.env.DB.prepare(
      `DELETE FROM group_members WHERE (user_id = ?1 AND group_id IN
         (SELECT gg.id FROM gift_groups gg JOIN gifts g ON g.id = gg.gift_id WHERE g.user_id = ?2))
        OR (user_id = ?2 AND group_id IN
         (SELECT gg.id FROM gift_groups gg JOIN gifts g ON g.id = gg.gift_id WHERE g.user_id = ?1))`,
    ).bind(me, other.id),
    // Las colectas que se queden sin nadie se cancelan.
    c.env.DB.prepare(
      "UPDATE gift_groups SET status = 'cancelled' WHERE status = 'open' AND id NOT IN (SELECT group_id FROM group_members)",
    ),
  ])
  return c.json({ relation: 'none' })
})

/* --------------------------------- regalos -------------------------------- */

function giftFromBody(b: any) {
  const title = String(b.title ?? '').trim()
  const priceRaw = b.price
  const price =
    priceRaw === '' || priceRaw === null || priceRaw === undefined
      ? null
      : Math.max(0, Math.round(Number(priceRaw) * 100))
  return {
    title,
    notes: String(b.notes ?? '').slice(0, 1000),
    url: b.url ? String(b.url).slice(0, 500) : null,
    imageUrl: b.imageUrl ? String(b.imageUrl).slice(0, 500) : null,
    price: Number.isFinite(price as number) ? price : null,
    priority: [0, 1, 2].includes(Number(b.priority)) ? Number(b.priority) : 1,
    quantity: Math.min(20, Math.max(1, Number(b.quantity) || 1)),
    visibility: ['all', 'only', 'except'].includes(String(b.visibility)) ? String(b.visibility) : 'all',
  }
}

function isHttpUrl(u: string | null) {
  if (!u) return true
  try {
    const p = new URL(u).protocol
    return p === 'http:' || p === 'https:'
  } catch {
    return false
  }
}

/**
 * Rellenar un regalo desde un enlace. El deseo no nace dentro de Cample: nace en una tienda, en
 * un vídeo o en el móvil de otro. Cuanto menos haya que escribir al volver, más cosas se apuntan.
 * Devuelve una propuesta que la persona ve y puede cambiar antes de guardar; aquí no se escribe
 * nada en la base.
 */
app.get('/unfurl', auth, async (c) => {
  const url = normalizeUrl(c.req.query('url') ?? '')
  if (!url) return c.json({ error: 'Ese enlace no vale. Copia la dirección de la página del producto.' }, 400)
  // El servidor descarga una página por cada llamada: se limita por persona, no por IP.
  if (!(await rateLimit(c.env, `unfurl:${c.get('userId')}`, 60, 3600)))
    return c.json({ error: 'Has probado con muchos enlaces seguidos. Prueba dentro de un rato.' }, 429)

  const info = await unfurl(url)
  if (!info) return c.json({ error: 'No he podido leer esa página. Escríbelo a mano.' }, 422)
  return c.json({ preview: info })
})

/* --------------------------- visibilidad por regalo -------------------------
 * Un regalo puede ocultarse a parte del círculo: 'only' lo ven solo las personas de
 * `gift_audience`, 'except' lo ven todas menos ellas. Los amigos que sí lo ven saben que
 * está restringido (así nadie da por hecho que lo ve todo el mundo), pero NUNCA se les
 * dice a quién se le oculta: los nombres son solo para el dueño.
 */

// Fragmento SQL reutilizable. `?1` tiene que ser el id de quien mira; `g` la tabla gifts.
const VISIBLE_SQL = `(g.visibility = 'all'
   OR (g.visibility = 'only' AND EXISTS (SELECT 1 FROM gift_audience a WHERE a.gift_id = g.id AND a.user_id = ?1))
   OR (g.visibility = 'except' AND NOT EXISTS (SELECT 1 FROM gift_audience a WHERE a.gift_id = g.id AND a.user_id = ?1)))`

async function canSeeGift(env: Env, gift: any, userId: string) {
  if (gift.visibility === 'all' || !gift.visibility) return true
  const row = await env.DB.prepare('SELECT 1 AS n FROM gift_audience WHERE gift_id = ? AND user_id = ?')
    .bind(gift.id, userId)
    .first<{ n: number }>()
  return gift.visibility === 'only' ? !!row : !row
}

// Guarda la lista de señalados (por nombre de usuario). Solo admite amigos aceptados.
// Si no queda nadie señalado, la restricción no significa nada: el regalo vuelve a ser para todos.
async function setAudience(c: Ctx, giftId: string, visibility: string, usernames: unknown) {
  await c.env.DB.prepare('DELETE FROM gift_audience WHERE gift_id = ?').bind(giftId).run()
  let n = 0
  if (visibility !== 'all' && Array.isArray(usernames)) {
    const wanted = [...new Set(usernames.map((u) => String(u).toLowerCase()))].slice(0, 100)
    for (const username of wanted) {
      const u = await userByUsername(c, username)
      if (!u || !(await areFriends(c.env, c.get('userId'), u.id))) continue
      await c.env.DB.prepare('INSERT OR IGNORE INTO gift_audience (gift_id, user_id) VALUES (?, ?)')
        .bind(giftId, u.id)
        .run()
      n++
    }
  }
  const final = n > 0 ? visibility : 'all'
  await c.env.DB.prepare('UPDATE gifts SET visibility = ? WHERE id = ?').bind(final, giftId).run()
  return final
}

// Al restringir un regalo, quien ya no puede verlo pierde su reserva o su sitio en la colecta.
// Se le avisa con un texto neutro; el dueño no se entera de nada de esto.
async function purgeHidden(c: Ctx, giftId: string, title: string) {
  const { results } = await c.env.DB.prepare(
    `SELECT DISTINCT uid FROM (
       SELECT reserver_id AS uid FROM reservations WHERE gift_id = ?1
       UNION
       SELECT m.user_id AS uid FROM group_members m JOIN gift_groups gg ON gg.id = m.group_id
        WHERE gg.gift_id = ?1 AND gg.status IN ('open','bought')
     ) WHERE uid NOT IN (
       SELECT u.id FROM users u JOIN gifts g ON g.id = ?1
        WHERE ${VISIBLE_SQL.replace(/\?1/g, 'u.id')}
     )`,
  )
    .bind(giftId)
    .all<{ uid: string }>()
  if (!results.length) return

  for (const r of results) {
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM reservations WHERE gift_id = ? AND reserver_id = ?').bind(giftId, r.uid),
      c.env.DB.prepare(
        `DELETE FROM group_members WHERE user_id = ?2 AND group_id IN
           (SELECT id FROM gift_groups WHERE gift_id = ?1 AND status IN ('open','bought'))`,
      ).bind(giftId, r.uid),
    ])
    await notify(c.env, r.uid, 'gift_changed', `Ya no está disponible un regalo que reservaste: «${title}»`, '/reservas')
  }
  // Una colecta que se quede sin nadie se cancela sola y el regalo vuelve a estar libre.
  await c.env.DB.prepare(
    "UPDATE gift_groups SET status = 'cancelled', closed_at = ?1 WHERE status = 'open' AND gift_id = ?2 AND id NOT IN (SELECT group_id FROM group_members)",
  )
    .bind(now(), giftId)
    .run()
}

// Vista del dueño: SIN ninguna información de reservas.
const ownerView = (g: any) => ({
  id: g.id,
  title: g.title,
  notes: g.notes,
  url: g.url,
  imageUrl: g.image_url,
  price: g.price_cents === null ? null : g.price_cents / 100,
  currency: g.currency,
  priority: g.priority,
  quantity: g.quantity,
  isReceived: !!g.is_received,
  isArchived: !!g.is_archived,
  visibility: (g.visibility ?? 'all') as 'all' | 'only' | 'except',
  createdAt: g.created_at,
  // Foto propia subida desde la galería. La versión solo sube, así cada foto estrena dirección.
  hasImage: !!g.has_image,
  imageVersion: g.image_version ?? 0,
})

// Las personas señaladas de cada regalo, agrupadas por regalo. SOLO para el dueño.
async function audienceOf(c: Ctx, giftIds: string[]) {
  const out: Record<string, { username: string; displayName: string }[]> = {}
  if (!giftIds.length) return out
  const { results } = await c.env.DB.prepare(
    `SELECT a.gift_id, u.username, u.display_name FROM gift_audience a
       JOIN users u ON u.id = a.user_id
      WHERE a.gift_id IN (${giftIds.map(() => '?').join(',')})
      ORDER BY u.display_name COLLATE NOCASE`,
  )
    .bind(...giftIds)
    .all<any>()
  for (const r of results) (out[r.gift_id] ??= []).push({ username: r.username, displayName: r.display_name })
  return out
}

/* -------------------------------- reacciones ------------------------------ */
/**
 * «Qué buena idea». Una reacción por persona y regalo, y el dueño SÍ las ve.
 *
 * Esto no rompe la regla 1: una reacción no dice nada de quién va a comprar qué, y es la única
 * señal alegre que recibe de vuelta quien se molesta en escribir su lista. Sin ella, escribir la
 * lista es tirar cosas a un pozo: no pasa nada, y por eso nadie vuelve a apuntar nada.
 *
 * ⚠️ Lo que sí existe es una fuga por deducción (quien reacciona puede acabar siendo quien
 * regala). Por eso la interfaz dice claramente que la reacción la ve el dueño: nadie debe
 * reaccionar creyendo que está haciendo algo privado. No convertir esto nunca en «anónimo»:
 * una reacción anónima sí se leería como «alguien ha cogido esto».
 */
const EMOJIS = ['❤️', '👍', '😍', '🎉']

/** Reacciones de cada regalo, agrupadas. `me` sirve para saber cuál he puesto yo. */
async function reactionsOf(c: Ctx, giftIds: string[]) {
  const out: Record<string, { emoji: string; people: { username: string; displayName: string }[] }[]> = {}
  if (!giftIds.length) return out
  const { results } = await c.env.DB.prepare(
    `SELECT r.gift_id, r.emoji, u.username, u.display_name FROM gift_reactions r
       JOIN users u ON u.id = r.user_id
      WHERE r.gift_id IN (${giftIds.map(() => '?').join(',')})
      ORDER BY r.created_at`,
  )
    .bind(...giftIds)
    .all<any>()
  for (const r of results) {
    const lista = (out[r.gift_id] ??= [])
    const grupo = lista.find((x) => x.emoji === r.emoji) ?? (lista.push({ emoji: r.emoji, people: [] }), lista.at(-1)!)
    grupo.people.push({ username: r.username, displayName: r.display_name })
  }
  return out
}

const reactionPayload = (
  grupos: { emoji: string; people: { username: string; displayName: string }[] }[] | undefined,
  meUsername: string,
) => ({
  reactions: (grupos ?? []).map((g) => ({ emoji: g.emoji, count: g.people.length, people: g.people })),
  myReaction: (grupos ?? []).find((g) => g.people.some((p) => p.username === meUsername))?.emoji ?? null,
})

app.post('/gifts/:id/react', auth, async (c) => {
  const me = c.get('userId')
  const g = await c.env.DB.prepare('SELECT * FROM gifts WHERE id = ?').bind(c.req.param('id')!).first<any>()
  if (!g) return c.json({ error: 'No encontrado' }, 404)
  if (g.user_id === me) return c.json({ error: 'No puedes reaccionar a tus propios regalos' }, 400)
  if (!(await areFriends(c.env, me, g.user_id))) return c.json({ error: 'No sois amigos' }, 403)
  // Un regalo que no ves no existe para ti: 404, nunca 403.
  if (!(await canSeeGift(c.env, g, me))) return c.json({ error: 'No encontrado' }, 404)

  const b = await c.req.json().catch(() => ({}))
  // «❤️» y «❤» son el mismo emoji con y sin selector de variación (U+FE0F), y según el teclado
  // llega uno u otro. Se compara sin él y se guarda siempre la forma de `EMOJIS`, para que no
  // acaben dos corazones distintos contando por separado.
  const selector = String.fromCharCode(0xfe0f)
  const pelado = (s: string) => s.split(selector).join('')
  const emoji = EMOJIS.find((e) => pelado(e) === pelado(String(b.emoji ?? '')))
  if (!emoji) return c.json({ error: 'Esa reacción no vale' }, 400)

  const yaTenia = await c.env.DB.prepare('SELECT emoji FROM gift_reactions WHERE gift_id = ? AND user_id = ?')
    .bind(g.id, me)
    .first<{ emoji: string }>()
  await c.env.DB.prepare(
    'INSERT INTO gift_reactions (gift_id, user_id, emoji, created_at) VALUES (?1, ?2, ?3, ?4) ' +
      'ON CONFLICT(gift_id, user_id) DO UPDATE SET emoji = ?3',
  )
    .bind(g.id, me, emoji, now())
    .run()

  // Solo se avisa la primera vez: cambiar de emoji no tiene que llenarle los avisos a nadie.
  if (!yaTenia) {
    const yo = await c.env.DB.prepare('SELECT display_name FROM users WHERE id = ?').bind(me).first<any>()
    await notify(c.env, g.user_id, 'reaction', `A ${yo.display_name} le gusta que hayas pedido «${g.title}»`, '/mi-lista')
  }
  return c.json({ ok: true })
})

app.delete('/gifts/:id/react', auth, async (c) => {
  await c.env.DB.prepare('DELETE FROM gift_reactions WHERE gift_id = ? AND user_id = ?')
    .bind(c.req.param('id')!, c.get('userId'))
    .run()
  return c.json({ ok: true })
})

/* ----------------------------- mi propia lista ---------------------------- */

app.get('/gifts', auth, async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM gifts WHERE user_id = ? ORDER BY is_received, priority DESC, created_at DESC',
  )
    .bind(c.get('userId'))
    .all<any>()
  const aud = await audienceOf(c, results.filter((g) => g.visibility !== 'all').map((g) => g.id))
  // Reacciones sí; de `reservations` no se consulta nada aquí, nunca (regla 1).
  const react = await reactionsOf(c, results.map((g) => g.id))
  const yo = await c.env.DB.prepare('SELECT username FROM users WHERE id = ?').bind(c.get('userId')).first<any>()
  return c.json({
    gifts: results.map((g) => ({
      ...ownerView(g),
      audience: aud[g.id] ?? [],
      ...reactionPayload(react[g.id], yo.username),
    })),
  })
})

app.post('/gifts', auth, async (c) => {
  const b = await c.req.json().catch(() => ({}))
  const g = giftFromBody(b)
  if (g.title.length < 2) return c.json({ error: 'Ponle un nombre al regalo' }, 400)
  if (!isHttpUrl(g.url) || !isHttpUrl(g.imageUrl))
    return c.json({ error: 'El enlace debe empezar por http:// o https://' }, 400)
  const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM gifts WHERE user_id = ?')
    .bind(c.get('userId'))
    .first<{ n: number }>()
  if ((count?.n ?? 0) >= 300) return c.json({ error: 'Has alcanzado el máximo de regalos' }, 400)

  const id = randomId(8)
  const t = now()
  await c.env.DB.prepare(
    'INSERT INTO gifts (id, user_id, title, notes, url, image_url, price_cents, priority, quantity, visibility, created_at, updated_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(id, c.get('userId'), g.title, g.notes, g.url, g.imageUrl, g.price, g.priority, g.quantity, g.visibility, t, t)
    .run()
  await setAudience(c, id, g.visibility, b.audience)
  const row = await c.env.DB.prepare('SELECT * FROM gifts WHERE id = ?').bind(id).first()
  const aud = await audienceOf(c, [id])
  return c.json({ gift: { ...ownerView(row), audience: aud[id] ?? [] } })
})

async function ownedGift(c: Ctx, id: string) {
  return c.env.DB.prepare('SELECT * FROM gifts WHERE id = ? AND user_id = ?')
    .bind(id, c.get('userId'))
    .first<any>()
}

// Avisa a quien lo tenga reservado, sin que el dueño se entere de nada.
async function notifyReservers(c: Ctx, giftId: string, body: string) {
  // Incluye a quien lo tenga reservado y a quien esté en una colecta por ese regalo.
  const { results } = await c.env.DB.prepare(
    `SELECT reserver_id AS user_id FROM reservations WHERE gift_id = ?1
     UNION
     SELECT m.user_id FROM group_members m JOIN gift_groups gg ON gg.id = m.group_id
      WHERE gg.gift_id = ?1 AND gg.status IN ('open','bought')`,
  )
    .bind(giftId)
    .all<{ user_id: string }>()
  for (const r of results) await notify(c.env, r.user_id, 'gift_changed', body, '/reservas')
}

app.patch('/gifts/:id', auth, async (c) => {
  const old = await ownedGift(c, c.req.param('id')!)
  if (!old) return c.json({ error: 'No encontrado' }, 404)
  const b = await c.req.json().catch(() => ({}))
  const g = giftFromBody({ ...ownerView(old), ...b })
  if (g.title.length < 2) return c.json({ error: 'Ponle un nombre al regalo' }, 400)
  if (!isHttpUrl(g.url) || !isHttpUrl(g.imageUrl))
    return c.json({ error: 'El enlace debe empezar por http:// o https://' }, 400)
  await c.env.DB.prepare(
    'UPDATE gifts SET title=?, notes=?, url=?, image_url=?, price_cents=?, priority=?, quantity=?, visibility=?, is_archived=?, updated_at=? WHERE id=?',
  )
    .bind(
      g.title,
      g.notes,
      g.url,
      g.imageUrl,
      g.price,
      g.priority,
      g.quantity,
      g.visibility,
      b.isArchived === undefined ? old.is_archived : b.isArchived ? 1 : 0,
      now(),
      old.id,
    )
    .run()
  // Si viene `audience` se reescribe; si no, se conserva la que ya tenía (salvo que pase a 'all').
  if (b.audience !== undefined || g.visibility === 'all') await setAudience(c, old.id, g.visibility, b.audience)
  if (g.visibility !== 'all') await purgeHidden(c, old.id, g.title)
  if (old.title !== g.title || old.notes !== g.notes || old.url !== g.url)
    await notifyReservers(c, old.id, `Ha cambiado un regalo que reservaste: «${g.title}»`)
  const row = await c.env.DB.prepare('SELECT * FROM gifts WHERE id = ?').bind(old.id).first()
  const aud = await audienceOf(c, [old.id])
  return c.json({ gift: { ...ownerView(row), audience: aud[old.id] ?? [] } })
})

app.delete('/gifts/:id', auth, async (c) => {
  const g = await ownedGift(c, c.req.param('id')!)
  if (!g) return c.json({ error: 'No encontrado' }, 404)
  await notifyReservers(c, g.id, `Se ha eliminado un regalo que habías reservado: «${g.title}»`)
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM gift_images WHERE gift_id = ?').bind(g.id),
    c.env.DB.prepare('DELETE FROM gifts WHERE id = ?').bind(g.id),
  ])
  return c.json({ ok: true })
})

/* --------------------------- foto propia del regalo ------------------------ */
// Para lo que no sale de una tienda: «unos guantes de lana como los de la foto». Mismo camino que
// los avatares (BLOB aparte + contador de versión), con las mismas trampas de D1.

/** Decodifica un data URL de imagen a ArrayBuffer, que es lo único que admite `bind()`. */
function imagenDesdeDataUrl(dataUrl: string) {
  const m = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/)
  if (!m) return null
  const binary = atob(m[2])
  if (binary.length > MAX_AVATAR_BYTES) return 'grande' as const
  const buffer = new ArrayBuffer(binary.length)
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return { mime: m[1], buffer }
}

app.post('/gifts/:id/image', auth, async (c) => {
  const g = await ownedGift(c, c.req.param('id')!)
  if (!g) return c.json({ error: 'No encontrado' }, 404)
  const b = await c.req.json().catch(() => ({}))
  const img = imagenDesdeDataUrl(String(b.dataUrl ?? ''))
  if (img === 'grande') return c.json({ error: 'La foto es demasiado grande' }, 413)
  if (!img) return c.json({ error: 'Esa imagen no vale. Prueba con otra foto.' }, 400)

  await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO gift_images (gift_id, mime, data, updated_at) VALUES (?1, ?2, ?3, ?4) ' +
        'ON CONFLICT(gift_id) DO UPDATE SET mime = ?2, data = ?3, updated_at = ?4',
    ).bind(g.id, img.mime, img.buffer, now()),
    c.env.DB.prepare(
      'UPDATE gifts SET image_version = image_version + 1, has_image = 1 WHERE id = ?',
    ).bind(g.id),
  ])
  const row = await c.env.DB.prepare('SELECT * FROM gifts WHERE id = ?').bind(g.id).first()
  return c.json({ gift: ownerView(row) })
})

app.delete('/gifts/:id/image', auth, async (c) => {
  const g = await ownedGift(c, c.req.param('id')!)
  if (!g) return c.json({ error: 'No encontrado' }, 404)
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM gift_images WHERE gift_id = ?').bind(g.id),
    // La versión sube también al quitarla: si volviera a 0, la siguiente foto reutilizaría una
    // dirección ya cacheada y se vería la anterior.
    c.env.DB.prepare(
      'UPDATE gifts SET image_version = image_version + 1, has_image = 0 WHERE id = ?',
    ).bind(g.id),
  ])
  const row = await c.env.DB.prepare('SELECT * FROM gifts WHERE id = ?').bind(g.id).first()
  return c.json({ gift: ownerView(row) })
})

// A diferencia de los avatares, esto sí dice qué ha pedido alguien: se comprueba quién mira.
app.get('/gift-image/:id', auth, async (c) => {
  const me = c.get('userId')
  const g = await c.env.DB.prepare('SELECT id, user_id, visibility FROM gifts WHERE id = ?')
    .bind(c.req.param('id')!)
    .first<any>()
  if (!g) return c.json({ error: 'No encontrado' }, 404)
  if (g.user_id !== me) {
    if (!(await areFriends(c.env, me, g.user_id))) return c.json({ error: 'No encontrado' }, 404)
    if (!(await canSeeGift(c.env, g, me))) return c.json({ error: 'No encontrado' }, 404)
  }
  const row = await c.env.DB.prepare('SELECT mime, data FROM gift_images WHERE gift_id = ?')
    .bind(g.id)
    .first<{ mime: string; data: ArrayBuffer | number[] }>()
  if (!row) return c.json({ error: 'Sin foto' }, 404)
  // D1 devuelve los BLOB como array de números: sin convertirlos, Response los manda como texto.
  const body = row.data instanceof ArrayBuffer ? row.data : new Uint8Array(row.data)
  return new Response(body, {
    headers: {
      'Content-Type': row.mime,
      // ⚠️ Sin caché, a diferencia de los avatares. Una cara no es un secreto, pero esto sí dice
      // qué ha pedido alguien: en la tablet compartida de casa, la caché se la queda el navegador
      // y la siguiente persona que entre podría sacarla aunque el servidor le diga que no.
      'Cache-Control': 'private, no-store',
    },
  })
})

app.post('/gifts/:id/received', auth, async (c) => {
  const g = await ownedGift(c, c.req.param('id')!)
  if (!g) return c.json({ error: 'No encontrado' }, 404)
  const b = await c.req.json().catch(() => ({}))
  const received = b.isReceived === false ? 0 : 1
  await c.env.DB.prepare('UPDATE gifts SET is_received = ?, received_at = ?, updated_at = ? WHERE id = ?')
    .bind(received, received ? now() : null, now(), g.id)
    .run()
  if (received) await notifyReservers(c, g.id, `«${g.title}» ya está marcado como recibido`)
  return c.json({ ok: true })
})

/* --------------------------- enlace de invitación -------------------------- */
// No es obligatorio para entrar (eso mataría el boca a boca), pero quien llega por aquí sale con
// un amigo ya aceptado: una lista vacía y sin nadie alrededor no le dice nada a nadie.

app.get('/invite', auth, async (c) => {
  const me = c.get('userId')
  let row = await c.env.DB.prepare('SELECT code FROM invites WHERE user_id = ?')
    .bind(me)
    .first<{ code: string }>()
  if (!row) {
    const code = randomId(10).toLowerCase()
    await c.env.DB.prepare('INSERT INTO invites (code, user_id, created_at) VALUES (?, ?, ?)')
      .bind(code, me, now())
      .run()
    row = { code }
  }
  return c.json({ code: row.code })
})

/** Quién invita, para poder enseñarlo en el registro. Sin sesión: es la pantalla de entrada. */
app.get('/invite/:code', async (c) => {
  const row = await c.env.DB.prepare(
    'SELECT u.* FROM invites i JOIN users u ON u.id = i.user_id ' +
      'WHERE i.code = ? AND u.is_active = 1',
  )
    .bind(c.req.param('code')!.toLowerCase())
    .first<any>()
  if (!row) return c.json({ user: null })
  return c.json({ user: publicUser(row) })
})

/* ------------------------- lista de otra persona -------------------------- */

// Unidades ocupadas: las que se lleva cada persona más una por cada colecta viva.
async function unitsTaken(env: Env, giftId: string, exceptUserId?: string) {
  const r = await env.DB.prepare(
    `SELECT (SELECT COALESCE(SUM(units), 0) FROM reservations
              WHERE gift_id = ?1 AND (?2 IS NULL OR reserver_id != ?2))
          + (SELECT COUNT(*) FROM gift_groups WHERE gift_id = ?1 AND status IN ('open','bought')) AS n`,
  )
    .bind(giftId, exceptUserId ?? null)
    .first<{ n: number }>()
  return r?.n ?? 0
}

app.get('/lists/:username', auth, async (c) => {
  const me = c.get('userId')
  const other = await userByUsername(c, c.req.param('username')!)
  if (!other) return c.json({ error: 'No existe ese usuario' }, 404)
  if (other.id === me) return c.json({ error: 'Esta es tu propia lista' }, 400)
  if (!(await areFriends(c.env, me, other.id)))
    return c.json({ error: 'Solo puedes ver la lista de tus amigos' }, 403)

  const { results } = await c.env.DB.prepare(
    `SELECT g.*,
            (SELECT COALESCE(SUM(r.units), 0) FROM reservations r WHERE r.gift_id = g.id) AS reserved,
            (SELECT COALESCE(SUM(r.units), 0) FROM reservations r WHERE r.gift_id = g.id AND r.reserver_id = ?1) AS mine,
            (SELECT gg.id FROM gift_groups gg WHERE gg.gift_id = g.id AND gg.status IN ('open','bought')) AS group_id,
            (SELECT gg.status FROM gift_groups gg WHERE gg.gift_id = g.id AND gg.status IN ('open','bought')) AS group_status,
            (SELECT COUNT(*) FROM group_members m
              WHERE m.group_id = (SELECT gg.id FROM gift_groups gg WHERE gg.gift_id = g.id AND gg.status IN ('open','bought'))) AS group_members,
            (SELECT COUNT(*) FROM group_members m
              WHERE m.user_id = ?1 AND m.group_id = (SELECT gg.id FROM gift_groups gg WHERE gg.gift_id = g.id AND gg.status IN ('open','bought'))) AS group_mine,
            (SELECT COUNT(*) FROM gift_audience a WHERE a.gift_id = g.id) AS aud_n
       FROM gifts g
      WHERE g.user_id = ?2 AND g.is_archived = 0 AND ${VISIBLE_SQL}
      ORDER BY g.is_received, g.priority DESC, g.created_at DESC`,
  )
    .bind(me, other.id)
    .all<any>()

  // Queda constancia de que alguien ha pasado por aquí, una fila por persona y día. Solo se usa
  // para el rango de `GET /me/pulse`; el dueño nunca sabrá quién ni cuándo.
  await c.env.DB.prepare(
    'INSERT OR IGNORE INTO list_views (owner_id, viewer_id, day) VALUES (?, ?, ?)',
  )
    .bind(other.id, me, Math.floor(now() / 86400))
    .run()

  const react = await reactionsOf(c, results.map((g) => g.id))
  const yo = await c.env.DB.prepare('SELECT username FROM users WHERE id = ?').bind(me).first<any>()
  // Amistad recién hecha: se ve la lista entera, pero no lo que llevan los demás. Se filtra aquí,
  // en el servidor, no escondiéndolo en la pantalla.
  const verReservas = await puedeVerReservas(c.env, me, other.id)

  return c.json({
    user: publicUser(other),
    canSeeReservations: verReservas,
    gifts: results.map((g) => {
      const taken = g.reserved + (g.group_id ? 1 : 0)
      return {
        ...ownerView(g),
        ...reactionPayload(react[g.id], yo.username),
        // Cuántas unidades quedan y si la he cogido yo. Nunca decimos quién más.
        taken: verReservas ? taken : 0,
        remaining: verReservas ? Math.max(0, g.quantity - taken) : g.quantity,
        // Lo mío sí lo veo siempre: si no, no podría saber qué he cogido yo.
        reservedByMe: g.mine > 0,
        myUnits: g.mine,
        // Cuántas personas hay señaladas, nunca quiénes son.
        audienceCount: g.visibility === 'all' ? 0 : g.aud_n,
        // Que exista una colecta ya dice que alguien se está encargando: se oculta igual.
        group: g.group_id && (verReservas || g.group_mine > 0)
          ? {
              id: g.group_id,
              status: g.group_status,
              members: g.group_members,
              imMember: g.group_mine > 0,
            }
          : null,
      }
    }),
  })
})

app.post('/gifts/:id/reserve', auth, async (c) => {
  const me = c.get('userId')
  const g = await c.env.DB.prepare('SELECT * FROM gifts WHERE id = ?').bind(c.req.param('id')!).first<any>()
  if (!g) return c.json({ error: 'No encontrado' }, 404)
  if (g.user_id === me) return c.json({ error: 'No puedes reservarte tus propios regalos' }, 400)
  if (!(await areFriends(c.env, me, g.user_id))) return c.json({ error: 'No sois amigos' }, 403)
  if (!(await canSeeGift(c.env, g, me))) return c.json({ error: 'No encontrado' }, 404)
  if (g.is_received) return c.json({ error: 'Ese regalo ya está recibido' }, 400)
  // Sin esto el filtro de la lista se saltaría a base de probar: los regalos que respondiesen «ya
  // está reservado» serían justo los que estábamos ocultando.
  if (!(await puedeVerReservas(c.env, me, g.user_id)))
    return c.json({ error: 'Todavía no puedes reservar en esta lista' }, 403)

  const b = await c.req.json().catch(() => ({}))
  // Las unidades que ya tenía cogidas no cuentan como ocupadas: puede subir o bajar su cantidad.
  const ocupadasPorOtros = await unitsTaken(c.env, g.id, me)
  const libres = g.quantity - ocupadasPorOtros
  if (libres <= 0) return c.json({ error: 'Ya está reservado' }, 409)

  const units = Math.min(libres, Math.max(1, Math.round(Number(b.units) || 1)))
  await c.env.DB.prepare(
    'INSERT INTO reservations (id, gift_id, reserver_id, units, note, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ' +
      'ON CONFLICT(gift_id, reserver_id) DO UPDATE SET units = ?4',
  )
    .bind(randomId(8), g.id, me, units, String(b.note ?? '').slice(0, 200), now())
    .run()
  return c.json({ ok: true, units })
})

app.delete('/gifts/:id/reserve', auth, async (c) => {
  await c.env.DB.prepare('DELETE FROM reservations WHERE gift_id = ? AND reserver_id = ?')
    .bind(c.req.param('id')!, c.get('userId'))
    .run()
  return c.json({ ok: true })
})

app.get('/reservations', auth, async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT g.*, u.username, u.display_name, r.created_at AS reserved_at, r.units AS my_units
       FROM reservations r JOIN gifts g ON g.id = r.gift_id JOIN users u ON u.id = g.user_id
      WHERE r.reserver_id = ? ORDER BY r.created_at DESC`,
  )
    .bind(c.get('userId'))
    .all<any>()
  return c.json({
    reservations: results.map((g) => ({
      ...ownerView(g),
      for: { username: g.username, displayName: g.display_name },
      reservedAt: g.reserved_at,
      myUnits: g.my_units,
    })),
  })
})

/* -------------------------------- colectas -------------------------------- */
// Regalos en grupo. Reglas duras:
//  - El dueño del regalo NO puede ver ni tocar nada de esto (ni existencia, ni chat).
//  - Solo amigos del dueño participan.
//  - Una colecta viva ocupa una unidad del regalo (ver unitsTaken).

type GroupAccess = { group: any; gift: any; isMember: boolean; isOrganizer: boolean }

// Devuelve el contexto de la colecta o un motivo de rechazo. `requireMember` para chat y dinero.
async function groupAccess(c: Ctx, groupId: string, requireMember = false): Promise<GroupAccess | Response> {
  const me = c.get('userId')
  const group = await c.env.DB.prepare('SELECT * FROM gift_groups WHERE id = ?').bind(groupId).first<any>()
  if (!group) return c.json({ error: 'Esa colecta no existe' }, 404)
  const gift = await c.env.DB.prepare('SELECT * FROM gifts WHERE id = ?').bind(group.gift_id).first<any>()
  if (!gift) return c.json({ error: 'Esa colecta no existe' }, 404)
  // El destinatario nunca puede asomarse, aunque adivine el enlace.
  if (gift.user_id === me) return c.json({ error: 'Esa colecta no existe' }, 404)
  if (!(await areFriends(c.env, me, gift.user_id)))
    return c.json({ error: 'No puedes ver esta colecta' }, 403)
  // Si el regalo se ha restringido y ya no lo ve, tampoco existe la colecta para esta persona.
  if (!(await canSeeGift(c.env, gift, me))) return c.json({ error: 'Esa colecta no existe' }, 404)
  // Amistad demasiado nueva: la colecta tampoco existe para esta persona (404, nunca 403). Quien ya
  // está dentro sigue entrando: se le metió cuando sí podía.
  const yaDentro = await c.env.DB.prepare(
    'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
  )
    .bind(groupId, me)
    .first()
  if (!yaDentro && !(await puedeVerReservas(c.env, me, gift.user_id)))
    return c.json({ error: 'Esa colecta no existe' }, 404)
  // Si quien organizaba ya no está dentro (se fue o dejó de ser amigo), toma el relevo el más antiguo.
  const orgStillIn = await c.env.DB.prepare(
    'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
  )
    .bind(groupId, group.organizer_id)
    .first()
  if (!orgStillIn) {
    const next = await c.env.DB.prepare(
      'SELECT user_id FROM group_members WHERE group_id = ? ORDER BY joined_at LIMIT 1',
    )
      .bind(groupId)
      .first<{ user_id: string }>()
    if (next) {
      await c.env.DB.prepare('UPDATE gift_groups SET organizer_id = ? WHERE id = ?')
        .bind(next.user_id, groupId)
        .run()
      group.organizer_id = next.user_id
    }
  }

  const member = await c.env.DB.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?')
    .bind(groupId, me)
    .first()
  if (requireMember && !member) return c.json({ error: 'Únete a la colecta para ver esto' }, 403)
  return { group, gift, isMember: !!member, isOrganizer: group.organizer_id === me }
}

const isResponse = (x: unknown): x is Response => x instanceof Response

/** Parte que le toca a cada uno. En «equal» el organizador asume el resto de la división. */
function shares(group: any, members: any[]): Record<string, number | null> {
  const out: Record<string, number | null> = {}
  if (group.split_mode === 'custom') {
    for (const m of members) out[m.user_id] = m.pledge_cents ?? null
    return out
  }
  const target = group.target_cents
  if (!target || members.length === 0) {
    for (const m of members) out[m.user_id] = null
    return out
  }
  const base = Math.floor(target / members.length)
  for (const m of members) out[m.user_id] = base
  const rest = target - base * members.length
  if (rest > 0) out[group.organizer_id] = (out[group.organizer_id] ?? base) + rest
  return out
}

async function groupPayload(c: Ctx, group: any, gift: any, withMessages: boolean) {
  const me = c.get('userId')
  const { results: members } = await c.env.DB.prepare(
    `SELECT m.*, u.username, u.display_name, u.avatar_seed, u.avatar_version, u.has_avatar
       FROM group_members m JOIN users u ON u.id = m.user_id
      WHERE m.group_id = ? ORDER BY m.joined_at`,
  )
    .bind(group.id)
    .all<any>()
  const owner = await c.env.DB.prepare('SELECT username, display_name FROM users WHERE id = ?')
    .bind(gift.user_id)
    .first<any>()
  const sh = shares(group, members)
  const collected = members.reduce((sum, m) => sum + (m.has_paid ? sh[m.user_id] ?? 0 : 0), 0)

  let messages: any[] = []
  if (withMessages) {
    const r = await c.env.DB.prepare(
      `SELECT msg.id, msg.body, msg.created_at, u.username, u.display_name, u.avatar_seed, u.avatar_version, u.has_avatar
         FROM group_messages msg JOIN users u ON u.id = msg.user_id
        WHERE msg.group_id = ? ORDER BY msg.created_at LIMIT 300`,
    )
      .bind(group.id)
      .all<any>()
    messages = r.results.map((m) => ({
      id: m.id,
      body: m.body,
      createdAt: m.created_at,
      author: {
        username: m.username,
        displayName: m.display_name,
        avatarSeed: m.avatar_seed,
        avatarVersion: m.avatar_version,
        hasAvatar: !!m.has_avatar,
      },
    }))
  }

  return {
    id: group.id,
    status: group.status,
    splitMode: group.split_mode,
    note: group.note,
    target: group.target_cents === null ? null : group.target_cents / 100,
    collected: collected / 100,
    createdAt: group.created_at,
    gift: {
      id: gift.id,
      title: gift.title,
      notes: gift.notes,
      url: gift.url,
      price: gift.price_cents === null ? null : gift.price_cents / 100,
      isReceived: !!gift.is_received,
    },
    for: { username: owner.username, displayName: owner.display_name },
    isOrganizer: group.organizer_id === me,
    isMember: members.some((m) => m.user_id === me),
    members: members.map((m) => ({
      username: m.username,
      displayName: m.display_name,
      avatarSeed: m.avatar_seed,
      avatarVersion: m.avatar_version,
      hasAvatar: !!m.has_avatar,
      isOrganizer: m.user_id === group.organizer_id,
      isMe: m.user_id === me,
      share: sh[m.user_id] === null || sh[m.user_id] === undefined ? null : sh[m.user_id]! / 100,
      hasPaid: !!m.has_paid,
    })),
    messages,
  }
}

async function notifyGroup(c: Ctx, groupId: string, body: string, exceptUserId?: string) {
  const { results } = await c.env.DB.prepare('SELECT user_id FROM group_members WHERE group_id = ?')
    .bind(groupId)
    .all<{ user_id: string }>()
  for (const m of results)
    if (m.user_id !== exceptUserId) await notify(c.env, m.user_id, 'group', body, `/colecta/${groupId}`)
}

app.post('/gifts/:id/group', auth, async (c) => {
  const me = c.get('userId')
  const gift = await c.env.DB.prepare('SELECT * FROM gifts WHERE id = ?').bind(c.req.param('id')!).first<any>()
  if (!gift) return c.json({ error: 'No encontrado' }, 404)
  if (gift.user_id === me) return c.json({ error: 'No puedes organizar tu propio regalo' }, 400)
  if (!(await areFriends(c.env, me, gift.user_id))) return c.json({ error: 'No sois amigos' }, 403)
  if (!(await canSeeGift(c.env, gift, me))) return c.json({ error: 'No encontrado' }, 404)
  if (gift.is_received) return c.json({ error: 'Ese regalo ya está recibido' }, 400)
  if (!(await puedeVerReservas(c.env, me, gift.user_id)))
    return c.json({ error: 'Todavía no puedes reservar en esta lista' }, 403)
  if ((await unitsTaken(c.env, gift.id)) >= gift.quantity)
    return c.json({ error: 'Ese regalo ya está cogido' }, 409)

  const b = await c.req.json().catch(() => ({}))
  const target =
    b.target === '' || b.target === null || b.target === undefined
      ? gift.price_cents
      : Math.max(0, Math.round(Number(b.target) * 100))
  if (!Number.isFinite(target as number) || !target)
    return c.json({ error: 'Pon cuánto va a costar el regalo' }, 400)

  const id = randomId(8)
  const t = now()
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        'INSERT INTO gift_groups (id, gift_id, organizer_id, target_cents, split_mode, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).bind(id, gift.id, me, target, b.splitMode === 'custom' ? 'custom' : 'equal', String(b.note ?? '').slice(0, 500), t),
      c.env.DB.prepare('INSERT INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, ?)').bind(id, me, t),
    ])
  } catch {
    return c.json({ error: 'Ya hay una colecta para ese regalo' }, 409)
  }
  // La nota inicial abre la conversación.
  const note = String(b.note ?? '').trim().slice(0, 500)
  if (note)
    await c.env.DB.prepare(
      'INSERT INTO group_messages (id, group_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)',
    )
      .bind(randomId(8), id, me, note, t)
      .run()
  return c.json({ group: await groupPayload(c, await c.env.DB.prepare('SELECT * FROM gift_groups WHERE id = ?').bind(id).first<any>(), gift, true) })
})

app.get('/groups', auth, async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT gg.*, g.title, u.username, u.display_name,
            (SELECT COUNT(*) FROM group_members m WHERE m.group_id = gg.id) AS members
       FROM group_members mm
       JOIN gift_groups gg ON gg.id = mm.group_id
       JOIN gifts g ON g.id = gg.gift_id
       JOIN users u ON u.id = g.user_id
      WHERE mm.user_id = ? AND gg.status != 'cancelled'
      ORDER BY gg.created_at DESC`,
  )
    .bind(c.get('userId'))
    .all<any>()
  return c.json({
    groups: results.map((g) => ({
      id: g.id,
      status: g.status,
      title: g.title,
      members: g.members,
      target: g.target_cents === null ? null : g.target_cents / 100,
      for: { username: g.username, displayName: g.display_name },
    })),
  })
})

app.get('/groups/:id', auth, async (c) => {
  const acc = await groupAccess(c, c.req.param('id')!)
  if (isResponse(acc)) return acc
  const payload = await groupPayload(c, acc.group, acc.gift, acc.isMember)
  // Abrir la colecta cuenta como leer el chat.
  if (acc.isMember)
    await c.env.DB.prepare('UPDATE group_members SET last_read_at = ? WHERE group_id = ? AND user_id = ?')
      .bind(now(), acc.group.id, c.get('userId'))
      .run()
  return c.json({ group: payload })
})

app.post('/groups/:id/join', auth, async (c) => {
  const acc = await groupAccess(c, c.req.param('id')!)
  if (isResponse(acc)) return acc
  if (acc.group.status !== 'open') return c.json({ error: 'Esta colecta ya está cerrada' }, 400)
  if (acc.isMember) return c.json({ ok: true })
  const b = await c.req.json().catch(() => ({}))
  const pledge =
    acc.group.split_mode === 'custom' && b.pledge ? Math.max(0, Math.round(Number(b.pledge) * 100)) : null
  await c.env.DB.prepare(
    'INSERT OR IGNORE INTO group_members (group_id, user_id, pledge_cents, joined_at) VALUES (?, ?, ?, ?)',
  )
    .bind(acc.group.id, c.get('userId'), pledge, now())
    .run()
  const me = await c.env.DB.prepare('SELECT display_name FROM users WHERE id = ?').bind(c.get('userId')).first<any>()
  await notifyGroup(c, acc.group.id, `${me.display_name} se ha unido a la colecta`, c.get('userId'))
  return c.json({ ok: true })
})

app.post('/groups/:id/leave', auth, async (c) => {
  const acc = await groupAccess(c, c.req.param('id')!, true)
  if (isResponse(acc)) return acc
  const me = c.get('userId')
  await c.env.DB.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?')
    .bind(acc.group.id, me)
    .run()

  const rest = await c.env.DB.prepare(
    'SELECT user_id FROM group_members WHERE group_id = ? ORDER BY joined_at LIMIT 1',
  )
    .bind(acc.group.id)
    .first<{ user_id: string }>()
  if (!rest) {
    // Sin nadie dentro la colecta se cancela y el regalo vuelve a estar libre.
    await c.env.DB.prepare("UPDATE gift_groups SET status = 'cancelled', closed_at = ? WHERE id = ?")
      .bind(now(), acc.group.id)
      .run()
    return c.json({ ok: true, cancelled: true })
  }
  if (acc.isOrganizer) {
    // El más antiguo toma el relevo.
    await c.env.DB.prepare('UPDATE gift_groups SET organizer_id = ? WHERE id = ?')
      .bind(rest.user_id, acc.group.id)
      .run()
    await notify(c.env, rest.user_id, 'group', 'Ahora organizas tú la colecta', `/colecta/${acc.group.id}`)
  }
  return c.json({ ok: true })
})

app.patch('/groups/:id', auth, async (c) => {
  const acc = await groupAccess(c, c.req.param('id')!, true)
  if (isResponse(acc)) return acc
  if (!acc.isOrganizer) return c.json({ error: 'Solo quien organiza puede cambiar esto' }, 403)
  const b = await c.req.json().catch(() => ({}))
  const g = acc.group
  const target =
    b.target === undefined ? g.target_cents : Math.max(0, Math.round(Number(b.target) * 100)) || null
  const status = ['open', 'bought', 'cancelled'].includes(b.status) ? b.status : g.status
  await c.env.DB.prepare(
    'UPDATE gift_groups SET target_cents = ?, split_mode = ?, note = ?, status = ?, closed_at = ? WHERE id = ?',
  )
    .bind(
      target,
      b.splitMode === 'custom' || b.splitMode === 'equal' ? b.splitMode : g.split_mode,
      b.note === undefined ? g.note : String(b.note).slice(0, 500),
      status,
      status === 'open' ? null : now(),
      g.id,
    )
    .run()
  if (status !== g.status && status === 'bought')
    await notifyGroup(c, g.id, 'La colecta está completa: el regalo ya está comprado 🎉', c.get('userId'))
  return c.json({ ok: true })
})

app.post('/groups/:id/paid', auth, async (c) => {
  const acc = await groupAccess(c, c.req.param('id')!, true)
  if (isResponse(acc)) return acc
  const b = await c.req.json().catch(() => ({}))
  await c.env.DB.prepare('UPDATE group_members SET has_paid = ? WHERE group_id = ? AND user_id = ?')
    .bind(b.hasPaid === false ? 0 : 1, acc.group.id, c.get('userId'))
    .run()
  return c.json({ ok: true })
})

app.post('/groups/:id/pledge', auth, async (c) => {
  const acc = await groupAccess(c, c.req.param('id')!, true)
  if (isResponse(acc)) return acc
  const b = await c.req.json().catch(() => ({}))
  const pledge = b.pledge === '' || b.pledge === null ? null : Math.max(0, Math.round(Number(b.pledge) * 100))
  await c.env.DB.prepare('UPDATE group_members SET pledge_cents = ? WHERE group_id = ? AND user_id = ?')
    .bind(Number.isFinite(pledge as number) ? pledge : null, acc.group.id, c.get('userId'))
    .run()
  return c.json({ ok: true })
})

app.post('/groups/:id/messages', auth, async (c) => {
  const acc = await groupAccess(c, c.req.param('id')!, true)
  if (isResponse(acc)) return acc
  const b = await c.req.json().catch(() => ({}))
  const text = String(b.body ?? '').trim().slice(0, 1000)
  if (!text) return c.json({ error: 'Escribe algo' }, 400)
  await c.env.DB.prepare(
    'INSERT INTO group_messages (id, group_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(randomId(8), acc.group.id, c.get('userId'), text, now())
    .run()
  return c.json({ ok: true })
})

/* ------------------------------- inicio/avisos ---------------------------- */

app.get('/feed', auth, async (c) => {
  const me = c.get('userId')
  const { results } = await c.env.DB.prepare(
    `SELECT u.*,
            (SELECT COUNT(*) FROM gifts g
              WHERE g.user_id = u.id AND g.is_archived = 0 AND g.is_received = 0 AND ${VISIBLE_SQL}) AS open_gifts
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.user_a = ?1 THEN f.user_b ELSE f.user_a END
      WHERE (f.user_a = ?1 OR f.user_b = ?1) AND u.is_active = 1
      ORDER BY open_gifts DESC, u.display_name COLLATE NOCASE`,
  )
    .bind(me)
    .all<any>()
  return c.json({ friends: results.map((u) => ({ ...publicUser(u), openGifts: u.open_gifts })) })
})

/**
 * Actividad reciente de mis amigos, para el inicio. Tres tipos de suceso:
 *
 * - `gift`: un amigo ha pedido algo nuevo.
 * - `received`: un amigo ha marcado un regalo como recibido (la única señal que emite el dueño).
 * - `group`: se ha abierto una colecta sobre el regalo de un amigo.
 *
 * Todo pasa por `VISIBLE_SQL`, así que un regalo restringido no asoma por aquí. **Nunca aparecen
 * reservas** (regla 1) y las colectas salen solo porque `amigos` no me incluye a mí: el dueño de
 * un regalo jamás ve la colecta que hay sobre él.
 */
app.get('/activity', auth, async (c) => {
  const me = c.get('userId')
  const PERSONA = 'u.id AS uid, u.username, u.display_name, u.avatar_seed, u.avatar_version, u.has_avatar'
  const { results } = await c.env.DB.prepare(
    `WITH amigos AS (
       SELECT CASE WHEN user_a = ?1 THEN user_b ELSE user_a END AS id
         FROM friendships WHERE user_a = ?1 OR user_b = ?1
     )
     SELECT 'gift' AS kind, g.id AS ref, g.created_at AS at, g.title, g.image_url, g.price_cents,
            NULL AS extra, ${PERSONA}
       FROM gifts g JOIN users u ON u.id = g.user_id
      WHERE g.user_id IN (SELECT id FROM amigos) AND u.is_active = 1
        AND g.is_archived = 0 AND g.is_received = 0 AND ${VISIBLE_SQL}

     UNION ALL

     SELECT 'received', g.id, g.received_at, g.title, g.image_url, g.price_cents,
            NULL, ${PERSONA}
       FROM gifts g JOIN users u ON u.id = g.user_id
      WHERE g.user_id IN (SELECT id FROM amigos) AND u.is_active = 1
        AND g.is_archived = 0 AND g.is_received = 1 AND g.received_at IS NOT NULL
        AND ${VISIBLE_SQL}

     UNION ALL

     SELECT 'group', gr.id, gr.created_at, g.title, g.image_url, gr.target_cents,
            (SELECT COUNT(*) FROM group_members m WHERE m.group_id = gr.id), ${PERSONA}
       FROM gift_groups gr
       JOIN gifts g ON g.id = gr.gift_id
       JOIN users u ON u.id = g.user_id
      WHERE gr.status IN ('open', 'bought') AND g.user_id IN (SELECT id FROM amigos)
        AND u.is_active = 1 AND g.is_archived = 0 AND ${VISIBLE_SQL}
        AND ${VE_RESERVAS_SQL}

     ORDER BY at DESC
     LIMIT 30`,
  )
    .bind(me, now() - DIAS_PARA_VER_RESERVAS * 86400)
    .all<any>()

  return c.json({
    activity: results.map((r) => ({
      kind: r.kind as 'gift' | 'received' | 'group',
      ref: r.ref,
      at: r.at,
      title: r.title,
      imageUrl: r.image_url,
      price: r.price_cents === null ? null : r.price_cents / 100,
      members: r.extra === null ? null : Number(r.extra),
      user: publicUser({ ...r, id: r.uid }),
    })),
  })
})

/**
 * El «pulso» de mi propia lista. Escribir una lista y que no ocurra absolutamente nada es lo que
 * hace que la gente no vuelva a apuntar nada: la regla 1 deja al dueño a ciegas por diseño, así
 * que hay que devolverle alguna señal que no destripe nada.
 *
 * Lo que se devuelve:
 *  - `views`: un RANGO ('none' | 'few' | 'some' | 'many') de cuántas personas distintas han
 *    entrado en mi lista en los últimos 30 días. Nunca el número exacto ni quién, y **nada** si
 *    tengo menos de 3 amigos: con dos, cualquier cifra señala a alguien concreto.
 *  - `myGifts` y `friendsAvg`: comparación sana («tus amigos tienen 8 apuntados, tú 2»).
 *
 * Aquí no se consulta `reservations` ni `gift_groups`: una visita no es una reserva, y el rango
 * está justamente para que no se pueda hacer aritmética con él.
 */
app.get('/me/pulse', auth, async (c) => {
  const me = c.get('userId')
  const desde = Math.floor(now() / 86400) - 30
  const r = await c.env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM friendships WHERE user_a = ?1 OR user_b = ?1) AS amigos,
       (SELECT COUNT(DISTINCT viewer_id) FROM list_views WHERE owner_id = ?1 AND day >= ?2) AS visitantes,
       (SELECT COUNT(*) FROM gifts WHERE user_id = ?1 AND is_archived = 0 AND is_received = 0) AS mios,
       (SELECT COUNT(*) FROM gifts g
          WHERE g.is_archived = 0 AND g.is_received = 0
            AND g.user_id IN (SELECT CASE WHEN user_a = ?1 THEN user_b ELSE user_a END
                                FROM friendships WHERE user_a = ?1 OR user_b = ?1)) AS deAmigos`,
  )
    .bind(me, desde)
    .first<any>()

  const amigos = r?.amigos ?? 0
  const v = r?.visitantes ?? 0
  const views = amigos < 3 ? null : v === 0 ? 'none' : v <= 2 ? 'few' : v <= 5 ? 'some' : 'many'

  return c.json({
    pulse: {
      friends: amigos,
      views,
      myGifts: r?.mios ?? 0,
      friendsAvg: amigos > 0 ? Math.round((r?.deAmigos ?? 0) / amigos) : 0,
    },
  })
})

/**
 * «Apunta algo, que no sé qué regalarte». Un empujón explícito de una persona a otra: es la única
 * forma honesta de pedirle a alguien que llene su lista sin insinuarle nada sobre las reservas.
 * Como mucho uno por semana y por pareja, para que no se convierta en una lata.
 */
app.post('/nudge/:username', auth, async (c) => {
  const me = c.get('userId')
  const other = await userByUsername(c, c.req.param('username')!)
  if (!other) return c.json({ error: 'No existe ese usuario' }, 404)
  if (other.id === me) return c.json({ error: 'No puedes darte un toque a ti mismo' }, 400)
  if (!(await areFriends(c.env, me, other.id))) return c.json({ error: 'No sois amigos' }, 403)
  if (!(await rateLimit(c.env, `nudge:${me}:${other.id}`, 1, 7 * 86400)))
    return c.json({ error: 'Ya le has dado un toque hace poco. Espera unos días.' }, 429)

  const yo = await c.env.DB.prepare('SELECT display_name FROM users WHERE id = ?').bind(me).first<any>()
  await notify(
    c.env,
    other.id,
    'nudge',
    `${yo.display_name} te pide que apuntes algo en tu lista`,
    '/mi-lista',
  )
  return c.json({ ok: true })
})

// Avisos de cada pestaña. Se calculan del estado real, no de notificaciones marcadas como leídas.
app.get('/badges', auth, async (c) => {
  const me = c.get('userId')
  const r = await c.env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM friend_requests WHERE to_id = ?1) AS friends,
       (SELECT COUNT(*) FROM notifications WHERE user_id = ?1 AND is_read = 0) AS home,
       (SELECT COUNT(*) FROM group_messages msg
          JOIN group_members m ON m.group_id = msg.group_id AND m.user_id = ?1
         WHERE msg.user_id != ?1 AND msg.created_at > m.last_read_at) AS reservations,
       (SELECT CASE WHEN (SELECT is_admin FROM users WHERE id = ?1) = 1
                    THEN (SELECT COUNT(*) FROM password_resets WHERE status = 'pending')
                       + (SELECT COUNT(*) FROM feedback WHERE status = 'new') ELSE 0 END) AS admin`,
  )
    .bind(me)
    .first()
  return c.json({ badges: r })
})

app.get('/notifications', auth, async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
  )
    .bind(c.get('userId'))
    .all()
  return c.json({ notifications: results })
})

app.post('/notifications/read', auth, async (c) => {
  await c.env.DB.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?')
    .bind(c.get('userId'))
    .run()
  return c.json({ ok: true })
})

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'Ha ocurrido un error, inténtalo de nuevo' }, 500)
})

export default app
