/**
 * Activar y desactivar los avisos al móvil desde el navegador.
 *
 * ⚠️ **El permiso solo se pide una vez en la vida.** Si la persona dice que no, el navegador no
 * vuelve a preguntar nunca y no hay forma de recuperarlo desde la app. Por eso Cample enseña
 * siempre su propia explicación antes (`AvisosPrompt`) y nunca lanza el cuadro del sistema al
 * entrar: en frío, la gente le da a «Bloquear» por reflejo.
 */
import { api } from './api'
import { getLang } from './i18n'

export const pushSoportado = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/** En iPhone los avisos solo existen si la app está añadida a la pantalla de inicio. */
export const esIphone = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
export const instalada = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true

/** 'no-disponible' | 'bloqueado' (dijo que no y no hay vuelta atrás) | 'activo' | 'apagado' */
export type EstadoPush = 'no-disponible' | 'bloqueado' | 'activo' | 'apagado'

export async function estadoPush(): Promise<EstadoPush> {
  if (!pushSoportado()) return 'no-disponible'
  if (Notification.permission === 'denied') return 'bloqueado'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub ? 'activo' : 'apagado'
}

function bytesDeClave(base64: string): Uint8Array<ArrayBuffer> {
  const b64 = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const b64url = (buf: ArrayBuffer | null) => {
  if (!buf) return ''
  let s = ''
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Pide el permiso, suscribe el aparato y lo registra en el servidor. Devuelve si ha quedado activo. */
export async function activarPush(): Promise<boolean> {
  if (!pushSoportado()) return false
  const { key } = await api.pushKey()
  if (!key) return false

  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') return false

  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: bytesDeClave(key),
    }))

  await api.subscribePush({
    endpoint: sub.endpoint,
    p256dh: b64url(sub.getKey('p256dh')),
    auth: b64url(sub.getKey('auth')),
    lang: getLang(),
  })
  return true
}

/** Apaga los avisos en este aparato. También se llama al cerrar sesión (tablets compartidas). */
export async function desactivarPush(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (sub) {
      await api.unsubscribePush(sub.endpoint).catch(() => {})
      await sub.unsubscribe().catch(() => {})
    }
  } catch {
    /* si no se puede, no pasa nada: el servidor limpia las suscripciones muertas él solo */
  }
}
