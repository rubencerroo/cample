import { useCallback, useEffect, useState } from 'react'
import { getLang, localeOf, translate } from './i18n'

/** Traducción fuera de React, para las funciones sueltas de este fichero. */
const tr = (key: string, vars?: Record<string, string | number>) => translate(getLang(), key, vars)

const AVATAR_SIDE = 256
const AVATAR_MAX_BYTES = 150 * 1024

/**
 * Acepta cualquier imagen que el navegador sepa abrir (JPG, PNG, WebP, GIF, AVIF, HEIC en
 * Safari…) y siempre devuelve un JPEG cuadrado de 256px. Dos caminos de decodificación porque
 * `createImageBitmap` no traga todos los formatos en todos los navegadores.
 */
export async function fileToAvatarDataUrl(file: File): Promise<string> {
  const source = await decodeImage(file)

  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_SIDE
  canvas.height = AVATAR_SIDE
  const ctx = canvas.getContext('2d')!
  // Los formatos con transparencia (PNG, WebP) quedarían con el fondo negro al pasar a JPEG.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, AVATAR_SIDE, AVATAR_SIDE)

  const w = 'width' in source ? source.width : (source as HTMLImageElement).naturalWidth
  const h = 'height' in source ? source.height : (source as HTMLImageElement).naturalHeight
  const side = Math.min(w, h)
  ctx.drawImage(source as CanvasImageSource, (w - side) / 2, (h - side) / 2, side, side, 0, 0, AVATAR_SIDE, AVATAR_SIDE)
  if ('close' in source) source.close()

  // Si aun así pesa demasiado (fotos con mucho detalle), se baja la calidad hasta que quepa.
  for (const quality of [0.82, 0.7, 0.55, 0.4]) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    if (dataUrl.length * 0.75 <= AVATAR_MAX_BYTES) return dataUrl
  }
  return canvas.toDataURL('image/jpeg', 0.3)
}

async function decodeImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|gif|avif|heic|heif|bmp)$/i.test(file.name))
    throw new Error(tr('image.notAnImage'))

  try {
    // `from-image` respeta la orientación EXIF: sin esto, las fotos de móvil salen tumbadas.
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    // Formatos que este navegador no decodifica por esta vía (HEIC en Safari, algún AVIF…).
    return await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        URL.revokeObjectURL(url)
        resolve(img)
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error(tr('image.cannotOpen')))
      }
      img.src = url
    })
  }
}

type AvatarUser = {
  displayName: string
  username?: string
  avatarSeed?: string
  avatarVersion?: number
  hasAvatar?: boolean
}

export function Avatar({ user, size = 44 }: { user: AvatarUser; size?: number }) {
  const src =
    user.hasAvatar && user.username ? `/api/avatar/${user.username}?v=${user.avatarVersion ?? 0}` : null
  const [failed, setFailed] = useState(false)

  // Si cambia la foto (o el usuario), se vuelve a intentar: sin esto, un fallo puntual de red
  // dejaba las iniciales puestas para siempre en esa sesión.
  useEffect(() => {
    setFailed(false)
  }, [src])

  const hue = [...(user.avatarSeed || user.displayName)].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 360
  const initials = user.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

  const hasPhoto = !!src && !failed
  return (
    <div
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 40) % 360} 70% 45%))`,
      }}
    >
      {hasPhoto ? (
        <img
          src={src!}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        initials
      )}
    </div>
  )
}

/** «24 de diciembre» / «24 December» a partir de DD-MM. */
export function birthdayLabel(birthday: string | null | undefined) {
  if (!birthday) return null
  const [d, m] = birthday.split('-').map(Number)
  if (!d || !m || m < 1 || m > 12) return null
  // Un año cualquiera: solo se usan el día y el mes.
  const fecha = new Date(2001, m - 1, d)
  return new Intl.DateTimeFormat(localeOf(), { day: 'numeric', month: 'long' }).format(fecha)
}

/** Días que faltan para el próximo cumpleaños (0 = hoy). */
export function daysUntilBirthday(birthday: string | null | undefined) {
  if (!birthday) return null
  const [d, m] = birthday.split('-').map(Number)
  if (!d || !m) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  let next = new Date(today.getFullYear(), m - 1, d)
  if (next < today) next = new Date(today.getFullYear() + 1, m - 1, d)
  return Math.round((next.getTime() - today.getTime()) / 86400000)
}

export function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-brand-500" />
    </div>
  )
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 p-8 text-center">
      <p className="font-semibold text-slate-700">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
    </div>
  )
}

export function ErrorBox({ children }: { children: React.ReactNode }) {
  if (!children) return null
  return (
    <div role="alert" className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-red-700">
      {children}
    </div>
  )
}

/**
 * Distintivo de «este regalo no lo ve todo el mundo».
 * En mi lista se ven los nombres; en la lista de un amigo, jamás: solo cuánta gente lo ve, para
 * que quien lo está mirando sepa que no puede darlo por sabido delante de los demás.
 */
export function VisibilityChip({
  visibility,
  audience,
  audienceCount,
  owner,
}: {
  visibility: 'all' | 'only' | 'except'
  audience?: { displayName: string }[]
  audienceCount?: number
  owner?: boolean
}) {
  if (visibility === 'all') return null

  let text: string
  if (owner) {
    const nombres = (audience ?? []).map((a) => a.displayName)
    const varios = nombres.length > 2
    const who = varios
      ? tr('visibility.nPeople', { n: nombres.length })
      : nombres.join(getLang() === 'en' ? ' and ' : ' y ')
    const clave =
      visibility === 'only'
        ? varios
          ? 'visibility.onlySeePlural'
          : 'visibility.onlySees'
        : varios
          ? 'visibility.notSeePlural'
          : 'visibility.notSees'
    text = tr(clave, { who })
  } else if (visibility === 'only') {
    text = audienceCount === 1 ? tr('visibility.onlyYou') : tr('visibility.onlyAFew')
  } else {
    text = tr('visibility.someoneCant')
  }

  return (
    <span className="chip bg-violet-100 text-violet-800" title={tr('visibility.title')}>
      🔒 {text}
    </span>
  )
}

export function money(v: number | null, currency = 'EUR') {
  if (v === null || v === undefined) return null
  return new Intl.NumberFormat(localeOf(), { style: 'currency', currency, maximumFractionDigits: 2 }).format(v)
}

/** Carga asíncrona sencilla con recarga manual. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const run = useCallback(() => {
    setLoading(true)
    fn()
      .then((d) => {
        setData(d)
        setError('')
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(run, [run])
  return { data, error, loading, reload: run, setData }
}
