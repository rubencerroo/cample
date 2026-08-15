import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, Gift } from '../api'
import { Avatar, Empty, ErrorBox, Reacciones, Spinner, VisibilityChip, money, useAsync, useDialogos } from '../ui'
import { useAuth } from '../App'
import { getLang, translate, useT } from '../i18n'
import { ICON, Icon } from '../icons'

const EMPTY = {
  title: '',
  notes: '',
  url: '',
  imageUrl: '',
  price: '',
  priority: 1,
  quantity: 1,
  visibility: 'all' as Gift['visibility'],
  audience: [] as string[],
}

type Prefill = Partial<typeof EMPTY>

/**
 * «Compartir con Cample» desde otra app (Amazon, el navegador…) entra por aquí:
 * el manifiesto manda title/text/url a /mi-lista. Muchas apps meten el enlace
 * dentro del texto, así que se rescata de donde esté.
 */
function prefillDesdeCompartir(p: URLSearchParams): Prefill | null {
  const title = (p.get('title') || '').trim()
  const text = (p.get('text') || '').trim()
  let url = (p.get('url') || '').trim()
  if (!title && !text && !url) return null

  const suelto = text.match(/https?:\/\/\S+/)
  if (!url && suelto) url = suelto[0]
  const notes = suelto ? text.replace(suelto[0], '').trim() : text

  return { title: title || notes.split('\n')[0].slice(0, 80) || translate(getLang(), 'gift.sharedFallback'), notes: title ? notes : '', url }
}

export default function MyList() {
  const { user } = useAuth()
  const t = useT()
  const { confirmar } = useDialogos()
  const list = useAsync(() => api.gifts(), [])
  const [editing, setEditing] = useState<Gift | 'new' | null>(null)
  const [prefill, setPrefill] = useState<Prefill | null>(null)
  const [params, setParams] = useSearchParams()

  useEffect(() => {
    const p = prefillDesdeCompartir(params)
    if (!p) return
    setPrefill(p)
    setEditing('new')
    setParams({}, { replace: true })
  }, [params, setParams])

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">{t('myList.title')}</h1>
          <p className="text-slate-600">{t('myList.sub')}</p>
        </div>
        <button className="btn-primary shrink-0 inline-flex items-center gap-2" onClick={() => setEditing('new')}>
          <Icon icon={ICON.lista} size={20} />
          {t('myList.add')}
        </button>
      </div>

      <p className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
        {t('myList.secret')}
      </p>

      <Pulso />

      <ErrorBox>{list.error}</ErrorBox>
      {list.loading ? (
        <Spinner />
      ) : list.data?.gifts.length ? (
        <ul className="space-y-3">
          {list.data.gifts.map((g) => (
            <li key={g.id} className={`card ${g.isReceived ? 'opacity-60' : ''}`}>
              <div className="flex items-start gap-3">
                {g.imageUrl && (
                  <img src={g.imageUrl} alt="" className="h-16 w-16 rounded-2xl object-cover" loading="lazy" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold">{g.title}</h3>
                    {g.priority === 2 && <span className="chip bg-brand-100 text-brand-700">{t('myList.veryExcited')}</span>}
                    {g.quantity > 1 && <span className="chip bg-slate-100 text-slate-600">x{g.quantity}</span>}
                    {g.isReceived && <span className="chip bg-green-100 text-green-700">{t('myList.got')}</span>}
                    <VisibilityChip visibility={g.visibility} audience={g.audience} owner />
                  </div>
                  {g.notes && <p className="mt-1 whitespace-pre-wrap text-slate-600">{g.notes}</p>}
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-sm">
                    {g.price !== null && <span className="font-semibold text-slate-700">{money(g.price)}</span>}
                    {g.url && (
                      <a className="text-brand-600 underline" href={g.url} target="_blank" rel="noreferrer noopener">
                        {t('myList.seeProduct')}
                      </a>
                    )}
                  </div>
                  {/* Quién ha dicho «qué buena idea». Nunca quién lo va a comprar (regla 1). */}
                  <Reacciones reactions={g.reactions} readOnly />
                  <div className="mt-3 flex flex-wrap gap-2">
                    {/* El icono cambia con el estado, así que la transición se anima sola. */}
                    <button
                      className="btn-ghost !py-2 !px-4 !text-sm inline-flex items-center gap-2"
                      onClick={() => api.setReceived(g.id, !g.isReceived).then(list.reload)}
                    >
                      <Icon icon={g.isReceived ? ICON.deshacer : ICON.recibido} size={18} />
                      {g.isReceived ? t('myList.notGot') : t('myList.got')}
                    </button>
                    <button
                      className="btn-ghost !py-2 !px-4 !text-sm inline-flex items-center gap-2"
                      onClick={() => setEditing(g)}
                    >
                      <Icon icon={ICON.editar} size={18} />
                      {t('myList.edit')}
                    </button>
                    <button
                      className="btn-danger !py-2 !px-4 !text-sm inline-flex items-center gap-2"
                      onClick={async () => {
                        const ok = await confirmar({
                          title: t('myList.confirmDelete', { title: g.title }),
                          confirmLabel: t('common.delete'),
                          danger: true,
                        })
                        if (ok) api.deleteGift(g.id).then(list.reload)
                      }}
                    >
                      <Icon icon={ICON.borrar} size={18} />
                      {t('common.delete')}
                    </button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <Empty title={t('myList.emptyTitle')} hint={t('myList.emptyHint')} />
      )}

      {editing && (
        <GiftDialog
          gift={editing === 'new' ? null : editing}
          prefill={editing === 'new' ? prefill : null}
          onClose={() => {
            setEditing(null)
            setPrefill(null)
          }}
          onSaved={() => {
            setEditing(null)
            setPrefill(null)
            list.reload()
          }}
        />
      )}

      <p className="text-center text-sm text-slate-500">
        {t('myList.shareUser', { user: `@${user.username}` })}
      </p>
    </div>
  )
}

/**
 * Señal de vida de la propia lista. Sin esto, escribir una lista es tirar cosas a un pozo: por la
 * regla 1 el dueño no ve ninguna reserva, así que si tampoco ve nada más, deja de apuntar cosas.
 *
 * Lo que se enseña son rangos y medias, nunca cifras que se puedan cruzar con nadie: «la ha
 * mirado bastante gente» no dice quién, ni cuándo, ni —sobre todo— si alguien reservó algo.
 */
function Pulso() {
  const t = useT()
  const p = useAsync(() => api.pulse(), [])
  const d = p.data?.pulse
  if (!d || d.friends === 0) return null

  const pocos = d.myGifts < Math.max(3, d.friendsAvg)
  if (!d.views && !pocos) return null

  return (
    <section className="card space-y-1 border-brand-200 bg-brand-50">
      {d.views && <p className="font-semibold text-brand-900">{t(`myList.views.${d.views}`)}</p>}
      {pocos && (
        <p className="text-sm text-brand-800">
          {d.myGifts === 0
            ? t('myList.compareNone')
            : t('myList.compare', { mine: d.myGifts, avg: Math.max(1, d.friendsAvg) })}
        </p>
      )}
    </section>
  )
}

/**
 * «¿Quién puede ver este regalo?». Tres modos y, si no es «todos», una lista de amigos con
 * casillas grandes. Los nombres solo salen aquí: quien mira la lista nunca sabe a quién se oculta.
 */
function QuienLoVe({
  visibility,
  audience,
  onChange,
}: {
  visibility: Gift['visibility']
  audience: string[]
  onChange: (v: Gift['visibility'], audience: string[]) => void
}) {
  const amigos = useAsync(() => api.friends(), [])
  const t = useT()

  const opciones = [
    { v: 'all' as const, l: t('gift.whoAll'), d: t('gift.whoAllHint') },
    { v: 'only' as const, l: t('gift.whoOnly'), d: t('gift.whoOnlyHint') },
    { v: 'except' as const, l: t('gift.whoExcept'), d: t('gift.whoExceptHint') },
  ]

  function toggle(username: string) {
    onChange(
      visibility,
      audience.includes(username) ? audience.filter((u) => u !== username) : [...audience, username],
    )
  }

  return (
    <div>
      <span className="label">{t('gift.whoSees')}</span>
      <div className="space-y-2">
        {opciones.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v, o.v === 'all' ? [] : audience)}
            className={`block w-full rounded-2xl border px-4 py-3 text-left ${
              visibility === o.v ? 'border-brand-500 bg-brand-50' : 'border-slate-300'
            }`}
          >
            <span className={`block font-semibold ${visibility === o.v ? 'text-brand-700' : 'text-slate-700'}`}>
              {o.l}
            </span>
            <span className="block text-sm text-slate-600">{o.d}</span>
          </button>
        ))}
      </div>

      {visibility !== 'all' && (
        <div className="mt-3 rounded-2xl border border-slate-200 p-2">
          {amigos.loading ? (
            <Spinner />
          ) : amigos.data?.friends.length ? (
            <ul className="max-h-56 space-y-1 overflow-y-auto">
              {amigos.data.friends.map((u) => (
                <li key={u.username}>
                  <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-2 py-2 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      className="h-6 w-6 shrink-0 accent-brand-600"
                      checked={audience.includes(u.username)}
                      onChange={() => toggle(u.username)}
                    />
                    <Avatar user={u} size={36} />
                    <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">{u.displayName}</span>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-2 py-3 text-sm text-slate-500">{t('gift.noFriendsToPick')}</p>
          )}
        </div>
      )}
    </div>
  )
}

function GiftDialog({
  gift,
  prefill,
  onClose,
  onSaved,
}: {
  gift: Gift | null
  prefill?: Prefill | null
  onClose: () => void
  onSaved: () => void
}) {
  const [f, setF] = useState(
    gift
      ? {
          title: gift.title,
          notes: gift.notes,
          url: gift.url ?? '',
          imageUrl: gift.imageUrl ?? '',
          price: gift.price === null ? '' : String(gift.price),
          priority: gift.priority,
          quantity: gift.quantity,
          visibility: gift.visibility,
          audience: (gift.audience ?? []).map((a) => a.username),
        }
      : { ...EMPTY, ...prefill },
  )
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [leyendo, setLeyendo] = useState(false)
  const [aviso, setAviso] = useState('')
  const t = useT()

  /**
   * Rellena el regalo a partir del enlace. Lo que ya esté escrito manda: esto solo completa los
   * huecos, para que volver a pulsarlo nunca borre lo que la persona haya cambiado a mano.
   */
  async function rellenar(url: string, silencioso = false) {
    if (!url.trim()) return
    setLeyendo(true)
    setAviso('')
    try {
      const { preview } = await api.unfurl(url)
      setF((prev) => ({
        ...prev,
        title: prev.title || preview.title || '',
        imageUrl: prev.imageUrl || preview.imageUrl || '',
        price: prev.price || (preview.price === null ? '' : String(preview.price)),
      }))
    } catch (err: any) {
      // Al llegar desde «Compartir» no se avisa: la persona no ha pedido nada, escribe y ya.
      if (!silencioso) setAviso(err.message)
    } finally {
      setLeyendo(false)
    }
  }

  // Enlace que llega desde «Compartir con Cample»: se intenta leer solo, sin que nadie lo pida.
  useEffect(() => {
    if (prefill?.url) rellenar(prefill.url, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function pegar() {
    try {
      const texto = (await navigator.clipboard.readText()).trim()
      const url = texto.match(/https?:\/\/\S+/)?.[0]
      if (!url) return setAviso(t('gift.clipboardEmpty'))
      setF((prev) => ({ ...prev, url }))
      await rellenar(url)
    } catch {
      setAviso(t('gift.clipboardEmpty'))
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (f.visibility !== 'all' && f.audience.length === 0) {
        setError(t('gift.pickSomeone'))
        return
      }
      const payload = { ...f, url: f.url || null, imageUrl: f.imageUrl || null }
      if (gift) await api.updateGift(gift.id, payload)
      else await api.createGift(payload)
      onSaved()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <form
        onSubmit={save}
        className="max-h-[92dvh] w-full max-w-lg space-y-4 overflow-y-auto rounded-t-3xl bg-white p-5 sm:rounded-3xl"
      >
        <h2 className="text-xl font-extrabold">{gift ? t('gift.editTitle') : t('gift.newTitle')}</h2>

        {/* El enlace va primero a propósito: pegarlo rellena el resto y es el camino corto. */}
        <div>
          <label className="label" htmlFor="u">{t('gift.url')}</label>
          <div className="flex gap-2">
            <input
              id="u"
              className="input flex-1"
              inputMode="url"
              placeholder="https://…"
              value={f.url}
              onChange={(e) => setF({ ...f, url: e.target.value })}
            />
            {/* El portapapeles no existe en todos los navegadores; si no está, no se pinta. */}
            {typeof navigator !== 'undefined' && !!navigator.clipboard && (
              <button
                type="button"
                className="btn-ghost !px-4 shrink-0 inline-flex items-center gap-2"
                onClick={pegar}
              >
                <Icon icon={ICON.pegar} size={18} />
                {t('gift.paste')}
              </button>
            )}
          </div>
          <button
            type="button"
            className="btn-ghost mt-2 w-full !py-2 !text-sm inline-flex items-center justify-center gap-2"
            disabled={!f.url.trim() || leyendo}
            onClick={() => rellenar(f.url)}
          >
            <Icon icon={ICON.magia} size={18} />
            {leyendo ? t('gift.reading') : t('gift.fillFromLink')}
          </button>
          {aviso && <p className="mt-1 text-sm text-slate-500">{aviso}</p>}
        </div>

        {f.imageUrl && (
          <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
            <img src={f.imageUrl} alt="" className="h-16 w-16 rounded-2xl object-cover" />
            <span className="flex-1 text-sm text-slate-600">{t('gift.photoFromLink')}</span>
            <button
              type="button"
              className="btn-ghost !py-2 !px-4 !text-sm"
              onClick={() => setF({ ...f, imageUrl: '' })}
            >
              {t('common.remove')}
            </button>
          </div>
        )}

        <div>
          <label className="label" htmlFor="t">{t('gift.what')}</label>
          <input id="t" className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required />
        </div>

        <div>
          <label className="label" htmlFor="n">{t('gift.notes')}</label>
          <textarea
            id="n"
            className="input min-h-24"
            placeholder={t('gift.notesPlaceholder')}
            value={f.notes}
            onChange={(e) => setF({ ...f, notes: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="p">{t('gift.price')}</label>
            <input id="p" className="input" inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="q">{t('gift.quantity')}</label>
            <input
              id="q"
              className="input"
              type="number"
              min={1}
              max={20}
              value={f.quantity}
              onChange={(e) => setF({ ...f, quantity: Number(e.target.value) })}
            />
          </div>
        </div>

        <div>
          {f.quantity > 1 ? (
            <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {t('gift.quantityHint', { n: f.quantity })}
            </p>
          ) : null}
        </div>

        <div>
          <span className="label">{t('gift.excitement')}</span>
          <div className="grid grid-cols-3 gap-2">
            {[
              { v: 0, l: t('gift.excitementLow') },
              { v: 1, l: t('gift.excitementMid') },
              { v: 2, l: t('gift.excitementHigh') },
            ].map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setF({ ...f, priority: o.v })}
                className={`rounded-2xl border py-3 font-semibold ${
                  f.priority === o.v ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-600'
                }`}
              >
                {o.l}
              </button>
            ))}
          </div>
        </div>

        <QuienLoVe
          visibility={f.visibility}
          audience={f.audience}
          onChange={(visibility, audience) => setF({ ...f, visibility, audience })}
        />

        <ErrorBox>{error}</ErrorBox>

        <div className="flex gap-2 pt-1">
          <button type="button" className="btn-ghost flex-1" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn-primary flex-1" disabled={busy}>
            {t('common.save')}
          </button>
        </div>
      </form>
    </div>
  )
}
