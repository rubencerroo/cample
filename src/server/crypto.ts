const enc = new TextEncoder()

export function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function randomId(bytes = 16): string {
  const a = new Uint8Array(bytes)
  crypto.getRandomValues(a)
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function sha256(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(text)))
}

export async function hmac(secret: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(text)))
}

// Workers no admite más de 100.000 iteraciones (NotSupportedError en producción).
const PBKDF2_ITER = 100_000

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(new ArrayBuffer(16))
  crypto.getRandomValues(salt)
  const hash = await pbkdf2(password, salt.buffer as ArrayBuffer, PBKDF2_ITER)
  return `pbkdf2$${PBKDF2_ITER}$${toHex(salt.buffer as ArrayBuffer)}$${hash}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterStr, saltHex, expected] = stored.split('$')
  if (scheme !== 'pbkdf2') return false
  const bytes = saltHex.match(/../g)!.map((h) => parseInt(h, 16))
  const salt = new Uint8Array(new ArrayBuffer(bytes.length))
  salt.set(bytes)
  const actual = await pbkdf2(password, salt.buffer as ArrayBuffer, Number(iterStr))
  return timingSafeEqual(actual, expected)
}

async function pbkdf2(password: string, salt: BufferSource, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    256,
  )
  return toHex(bits)
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
