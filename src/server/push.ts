/**
 * Envío de avisos al móvil (Web Push) desde Cloudflare Pages Functions.
 *
 * ⚠️ **Los avisos van sin contenido a propósito.** Cifrar el cuerpo de un push (RFC 8291,
 * `aes128gcm`) es lo más difícil de todo esto y aquí no hace falta: se manda el aviso vacío —que
 * solo necesita la firma VAPID— y es el service worker el que pide el texto a `/api/push/pending`
 * con la cookie de sesión. De propina, el texto sale en el idioma que tenga puesto esa persona en
 * ese aparato y no en el que se generó. Lo único criptográfico que queda es firmar un JWT ES256.
 *
 * La contrapartida: si el móvil está sin conexión justo al recibirlo, el aviso llega genérico.
 * Con avisos de cumpleaños eso da igual.
 */

const enc = new TextEncoder()

export type PushEnv = {
  DB: D1Database
  VAPID_PUBLIC_KEY?: string
  VAPID_PRIVATE_KEY?: string
  VAPID_SUBJECT?: string
}

/** Sin claves puestas, el push simplemente no existe: nada revienta. */
export const pushConfigurado = (env: PushEnv) => !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY)

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice((s.length + 3) % 4)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function bytesToB64url(b: Uint8Array): string {
  let s = ''
  for (const x of b) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const jsonB64url = (o: unknown) => bytesToB64url(enc.encode(JSON.stringify(o)))

/**
 * La clave privada de VAPID es solo el escalar `d`; las coordenadas `x` e `y` salen de la pública
 * (65 bytes: 0x04 || x || y), así que no hace falta guardar un JWK entero como secreto.
 */
async function claveVapid(env: PushEnv): Promise<CryptoKey> {
  const pub = b64urlToBytes(env.VAPID_PUBLIC_KEY!)
  return crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      d: env.VAPID_PRIVATE_KEY!,
      x: bytesToB64url(pub.slice(1, 33)),
      y: bytesToB64url(pub.slice(33, 65)),
      ext: true,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
}

/** JWT ES256 para un servicio de push concreto. La firma de WebCrypto ya viene en crudo (r||s). */
async function firmarVapid(env: PushEnv, endpoint: string): Promise<string> {
  const aud = new URL(endpoint).origin
  const cabecera = jsonB64url({ typ: 'JWT', alg: 'ES256' })
  const cuerpo = jsonB64url({
    aud,
    // Menos de 24 h, que es el máximo que aceptan los servicios de push.
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: env.VAPID_SUBJECT ?? 'https://cample.pages.dev',
  })
  const datos = `${cabecera}.${cuerpo}`
  const firma = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    await claveVapid(env),
    enc.encode(datos),
  )
  return `${datos}.${bytesToB64url(new Uint8Array(firma))}`
}

type Sub = { id: string; endpoint: string }

/**
 * Manda el aviso a todos los aparatos de una persona. No lanza nunca: un fallo del servicio de
 * push no puede tumbar la petición que lo ha provocado (agregar a un amigo, escribir en el chat…).
 *
 * Un 404 o un 410 significa que esa suscripción ya no vale (app desinstalada, datos borrados) y se
 * borra en el momento: si no se limpian, la tabla crece y el recorrido semanal se vuelve lento.
 */
export async function enviarPush(env: PushEnv, userId: string): Promise<void> {
  if (!pushConfigurado(env)) return
  try {
    const { results } = await env.DB.prepare(
      'SELECT id, endpoint FROM push_subs WHERE user_id = ?',
    )
      .bind(userId)
      .all<Sub>()
    if (!results.length) return

    const muertas: string[] = []
    for (const s of results) {
      try {
        const res = await fetch(s.endpoint, {
          method: 'POST',
          headers: {
            Authorization: `vapid t=${await firmarVapid(env, s.endpoint)}, k=${env.VAPID_PUBLIC_KEY}`,
            TTL: '86400',
            Urgency: 'normal',
            'Content-Length': '0',
          },
        })
        if (res.status === 404 || res.status === 410) muertas.push(s.id)
      } catch {
        // Un fallo de red suelto no significa que la suscripción esté muerta: se deja estar.
      }
    }
    if (muertas.length)
      await env.DB.prepare(
        `DELETE FROM push_subs WHERE id IN (${muertas.map(() => '?').join(',')})`,
      )
        .bind(...muertas)
        .run()
  } catch (e) {
    console.error('push', e)
  }
}
