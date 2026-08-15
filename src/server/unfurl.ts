/**
 * Lee una página de una tienda y saca de ella el título, la foto y el precio, para que apuntar
 * un regalo sea pegar el enlace y nada más. Es la diferencia entre escribir cuatro campos a mano
 * (que casi nadie hace) y pulsar un botón.
 *
 * ⚠️ Esto hace que el servidor descargue una dirección que elige quien la escribe, así que hay
 * que tratarla como hostil:
 *  - `hostPermitido()` rechaza IP literales y nombres internos, para que nadie use Cample de
 *    puente hacia una red privada.
 *  - La descarga está acotada en tiempo (`TIMEOUT_MS`) y en bytes (`MAX_BYTES`): una página
 *    infinita no puede dejar la petición colgada.
 *  - Lo que se devuelve son cadenas cortas y recortadas; el cliente las mete en un formulario
 *    que la persona ve y puede cambiar antes de guardar. Nunca se guarda nada a ciegas.
 */

const TIMEOUT_MS = 6000
const MAX_BYTES = 512 * 1024

// Un navegador normal: bastantes tiendas devuelven una página vacía a un agente desconocido.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

export type Unfurled = {
  title: string | null
  imageUrl: string | null
  price: number | null
  siteName: string | null
}

/**
 * Solo nombres de dominio públicos. Se rechazan las IP escritas a mano (y por tanto también
 * 127.0.0.1, 169.254.169.254 y compañía) y los nombres que resuelven dentro de una red local.
 */
function hostPermitido(u: URL) {
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
  if (u.username || u.password) return false

  const host = u.hostname.toLowerCase()
  if (!host.includes('.')) return false // localhost, nombres de máquina sueltos
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false // IPv4 literal
  if (host.startsWith('[')) return false // IPv6 literal
  if (/\.(local|internal|localdomain|home|lan|intranet)$/.test(host)) return false
  if (host.endsWith('.home.arpa') || host.endsWith('.in-addr.arpa')) return false
  return true
}

/** Deja la URL en algo que se pueda pedir, o null si no vale. Acepta que falte el `https://`. */
export function normalizeUrl(raw: string): URL | null {
  const s = raw.trim()
  if (!s) return null
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`)
    return hostPermitido(u) ? u : null
  } catch {
    return null
  }
}

/** Las cuatro entidades que de verdad aparecen en un título de tienda. */
function decodeEntities(s: string) {
  return s
    .replace(/&(#\d+|#x[0-9a-f]+);/gi, (_, c) =>
      String.fromCodePoint(Number(c[1] === 'x' || c[1] === 'X' ? `0${c.slice(1)}` : c.slice(1))),
    )
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
}

const limpio = (s: string, max: number) => decodeEntities(s).replace(/\s+/g, ' ').trim().slice(0, max)

/**
 * Busca el contenido de un `<meta>` por su `property` o su `name`. Los dos órdenes de atributos
 * son igual de comunes en la vida real, de ahí las dos expresiones.
 */
function meta(html: string, nombres: string[]): string | null {
  for (const n of nombres) {
    const clave = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const patrones = [
      new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${clave}["'][^>]*content=["']([^"']*)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name|itemprop)=["']${clave}["']`, 'i'),
    ]
    for (const p of patrones) {
      const m = html.match(p)
      if (m?.[1]?.trim()) return m[1]
    }
  }
  return null
}

/** «1.234,56 €», «$1,234.56», «29.99» → número. Devuelve null si no hay nada creíble. */
function parsePrice(raw: string | null): number | null {
  if (!raw) return null
  const m = raw.replace(/\s/g, '').match(/-?\d[\d.,]*/)
  if (!m) return null
  let s = m[0]
  // El último separador manda: si va seguido de 1-2 cifras es el decimal, si no es de millares.
  const ultimo = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','))
  if (ultimo >= 0 && s.length - ultimo - 1 <= 2) {
    s = s.slice(0, ultimo).replace(/[.,]/g, '') + '.' + s.slice(ultimo + 1)
  } else {
    s = s.replace(/[.,]/g, '')
  }
  const n = Number(s)
  return Number.isFinite(n) && n > 0 && n < 1_000_000 ? Math.round(n * 100) / 100 : null
}

/** Lee como mucho `MAX_BYTES`: una respuesta sin fin no puede dejar la petición colgada. */
async function leerAcotado(res: Response): Promise<string> {
  const reader = res.body?.getReader()
  if (!reader) return ''
  const trozos: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done || !value) break
      trozos.push(value)
      total += value.length
      if (total >= MAX_BYTES) break
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  const buf = new Uint8Array(total)
  let off = 0
  for (const t of trozos) {
    buf.set(t.subarray(0, Math.min(t.length, total - off)), off)
    off += t.length
    if (off >= total) break
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(buf)
}

export async function unfurl(url: URL): Promise<Unfurled | null> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS)
  let html = ''
  try {
    const res = await fetch(url.toString(), {
      signal: ac.signal,
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
    })
    if (!res.ok) return null
    // Si acaba en una descarga o en una imagen no hay nada que leer.
    if (!(res.headers.get('Content-Type') ?? '').toLowerCase().includes('html')) return null
    html = await leerAcotado(res)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
  if (!html) return null

  // A partir de aquí solo se leen cadenas: el <head> trae todo lo interesante.
  const cabeza = html.slice(0, 200_000)

  const tituloMeta = meta(cabeza, ['og:title', 'twitter:title', 'title'])
  const tituloTag = cabeza.match(/<title[^>]*>([\s\S]{0,300}?)<\/title>/i)?.[1] ?? null
  const title = tituloMeta || tituloTag ? limpio((tituloMeta ?? tituloTag)!, 120) : null

  const imagenRaw = meta(cabeza, ['og:image:secure_url', 'og:image', 'twitter:image', 'image'])
  let imageUrl: string | null = null
  if (imagenRaw) {
    try {
      const abs = new URL(decodeEntities(imagenRaw.trim()), url)
      // La foto la va a pedir el navegador de cada amigo: mismas reglas de host.
      if (hostPermitido(abs) && abs.toString().length <= 500) imageUrl = abs.toString()
    } catch {
      /* imagen inservible: se ignora */
    }
  }

  const price = parsePrice(
    meta(cabeza, ['og:price:amount', 'product:price:amount', 'twitter:data1', 'price']),
  )
  const siteName = meta(cabeza, ['og:site_name'])

  if (!title && !imageUrl && price === null) return null
  return { title, imageUrl, price, siteName: siteName ? limpio(siteName, 60) : null }
}
