import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { getLang, localeOf, translate } from './i18n'
import { ICON, Icon } from './icons'

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
    <span className="chip inline-flex items-center gap-1 bg-violet-100 text-violet-800" title={tr('visibility.title')}>
      <Icon icon={ICON.privacidad} size={14} />
      {text}
    </span>
  )
}

/* --------------------- ventanas de confirmar y de avisar ------------------- */
/**
 * Sustituye a `confirm()` y `alert()` del navegador. No es cosmética: las ventanas nativas salen
 * pegadas arriba del navegador en escritorio, con letra pequeña y botones minúsculos, y en algunos
 * móviles ni se ven bien. Aquí mandan las mismas reglas que en el resto de la app: 17px, botones
 * de 48px y castellano llano.
 *
 * Se usa con `const { confirmar, avisar } = useDialogos()`:
 *
 *   if (await confirmar({ title: '¿Borrar «X»?', danger: true, confirmLabel: 'Borrar' })) …
 *   await avisar('No se ha podido reservar', motivo)
 */
type Peticion = {
  title: string
  body?: string
  confirmLabel?: string
  danger?: boolean
  /** Solo un botón de «Entendido»: es un aviso, no hay nada que decidir. */
  soloAviso?: boolean
}

type Dialogos = {
  confirmar: (p: Peticion) => Promise<boolean>
  avisar: (title: string, body?: string) => Promise<boolean>
}

const DialogosCtx = createContext<Dialogos>(null!)
export const useDialogos = () => useContext(DialogosCtx)

export function DialogosProvider({ children }: { children: React.ReactNode }) {
  const [abierto, setAbierto] = useState<(Peticion & { resolver: (v: boolean) => void }) | null>(null)
  const primero = useRef<HTMLButtonElement>(null)

  const confirmar = useCallback(
    (p: Peticion) => new Promise<boolean>((resolver) => setAbierto({ ...p, resolver })),
    [],
  )
  const avisar = useCallback(
    (title: string, body?: string) => confirmar({ title, body, soloAviso: true }),
    [confirmar],
  )

  // Cerrar con Escape equivale a cancelar; el foco entra en la opción segura.
  useEffect(() => {
    if (!abierto) return
    primero.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      abierto.resolver(false)
      setAbierto(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [abierto])

  const responder = (v: boolean) => {
    abierto?.resolver(v)
    setAbierto(null)
  }

  return (
    <DialogosCtx.Provider value={{ confirmar, avisar }}>
      {children}
      {abierto && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          onClick={(e) => e.target === e.currentTarget && responder(false)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="dlg-t"
            className="w-full max-w-md space-y-4 rounded-t-3xl bg-white p-5 sm:rounded-3xl"
          >
            <h2 id="dlg-t" className="text-xl font-extrabold">
              {abierto.title}
            </h2>
            {abierto.body && <p className="whitespace-pre-wrap text-slate-600">{abierto.body}</p>}
            <div className="flex gap-2 pt-1">
              {abierto.soloAviso ? (
                <button ref={primero} className="btn-primary flex-1" onClick={() => responder(true)}>
                  {tr('common.ok')}
                </button>
              ) : (
                <>
                  <button ref={primero} className="btn-ghost flex-1" onClick={() => responder(false)}>
                    {tr('common.cancel')}
                  </button>
                  <button
                    className={`${abierto.danger ? 'btn-danger' : 'btn-primary'} flex-1`}
                    onClick={() => responder(true)}
                  >
                    {abierto.confirmLabel ?? tr('common.ok')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </DialogosCtx.Provider>
  )
}

/* -------------------------------- reacciones ------------------------------ */

/** Los mismos cuatro que acepta el servidor (`EMOJIS` en routes.ts). */
export const REACTION_EMOJIS = ['❤️', '👍', '😍', '🎉']

type Reaction = { emoji: string; count: number; people: { username: string; displayName: string }[] }

/**
 * Reacciones de un regalo. En la lista de un amigo se puede pulsar; en la propia solo se leen.
 *
 * ⚠️ El aviso de que «lo ve» el dueño es parte de la función, no adorno: nadie debe reaccionar
 * creyendo que hace algo privado. Y ojo, esto no es una reserva: el texto no debe insinuar
 * nunca que quien reacciona vaya a comprar nada.
 */
export function Reacciones({
  reactions,
  mine,
  onPick,
  readOnly,
}: {
  reactions?: Reaction[]
  mine?: string | null
  onPick?: (emoji: string | null) => void
  readOnly?: boolean
}) {
  const lista = reactions ?? []
  const total = lista.reduce((n, r) => n + r.count, 0)
  if (readOnly && total === 0) return null

  const nombres = [...new Map(lista.flatMap((r) => r.people).map((p) => [p.username, p])).values()].map(
    (p) => p.displayName.split(' ')[0],
  )
  const unir = (xs: string[]) =>
    xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${tr('common.and')} ${xs.at(-1)}`
  const quien =
    nombres.length <= 3
      ? unir(nombres)
      : tr('react.andMore', { who: nombres.slice(0, 2).join(', '), n: nombres.length - 2 })

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {(readOnly ? lista.map((r) => r.emoji) : REACTION_EMOJIS).map((emoji) => {
          const n = lista.find((r) => r.emoji === emoji)?.count ?? 0
          const puesta = mine === emoji
          if (readOnly)
            return (
              <span key={emoji} className="chip bg-rose-50 text-rose-800">
                {emoji} {n}
              </span>
            )
          return (
            <button
              key={emoji}
              type="button"
              aria-pressed={puesta}
              aria-label={tr('react.aria', { emoji })}
              onClick={() => onPick?.(puesta ? null : emoji)}
              className={`flex h-11 min-w-11 items-center justify-center gap-1 rounded-2xl border px-3 text-lg ${
                puesta ? 'border-rose-400 bg-rose-50' : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span aria-hidden>{emoji}</span>
              {n > 0 && <span className="text-sm font-bold text-slate-600">{n}</span>}
            </button>
          )
        })}
      </div>
      {total > 0 && <p className="mt-1 text-sm text-slate-500">{tr('react.likedBy', { who: quien })}</p>}
    </div>
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
