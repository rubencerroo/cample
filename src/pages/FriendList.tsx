import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, Gift } from '../api'
import {
  Avatar,
  Empty,
  ErrorBox,
  Reacciones,
  Spinner,
  VisibilityChip,
  birthdayLabel,
  daysUntilBirthday,
  giftImageSrc,
  money,
  useAsync,
  useDialogos,
} from '../ui'
import { useT } from '../i18n'
import { ICON, Icon } from '../icons'

export default function FriendList() {
  const t = useT()
  const { username = '' } = useParams()
  const { avisar } = useDialogos()
  const list = useAsync(() => api.list(username), [username])
  const [grouping, setGrouping] = useState<Gift | null>(null)

  /** Los fallos al reservar se cuentan en una ventana propia, no en la del navegador. */
  const fallo = (e: Error) => avisar(t('common.problem'), e.message)

  if (list.loading) return <Spinner />
  if (list.error) return <ErrorBox>{list.error}</ErrorBox>
  if (!list.data) return null

  const { user, gifts, canSeeReservations } = list.data
  const pending = gifts.filter((g) => !g.isReceived)
  const received = gifts.filter((g) => g.isReceived)

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Avatar user={user} size={64} />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold">{user.displayName}</h1>
          <p className="text-slate-500">@{user.username}</p>
          {birthdayLabel(user.birthday) && (
            <p className="mt-0.5 text-sm font-medium text-brand-700">
              <Icon icon={ICON.cumple} size={18} className="mr-1 inline-block align-[-3px]" />
              {birthdayLabel(user.birthday)}
              {(() => {
                const d = daysUntilBirthday(user.birthday)
                if (d === null) return null
                if (d === 0) return t('friendList.birthdayToday')
                if (d === 1) return t('friendList.birthdayTomorrow')
                if (d <= 30) return t('friendList.birthdayIn', { n: d })
                return null
              })()}
            </p>
          )}
        </div>
      </div>
      {user.bio && <p className="text-slate-600">{user.bio}</p>}

      <p className="rounded-2xl bg-brand-50 border border-brand-200 px-4 py-3 text-sm text-brand-900">
        {canSeeReservations
          ? t('friendList.notice', { name: user.displayName.split(' ')[0] })
          : t('friendList.waitingNotice')}
      </p>

      {/* Una reacción NO es una reserva y sí la ve el dueño: hay que decirlo antes, no después. */}
      <p className="text-sm text-slate-500">
        {t('friendList.reactionNotice', { name: user.displayName.split(' ')[0] })}
      </p>

      {pending.length < 3 && <Toque user={user} />}

      {pending.length === 0 ? (
        <Empty title={t('friendList.nothingPending')} />
      ) : (
        <ul className="space-y-3">
          {pending.map((g) => {
            const free = (g.remaining ?? 0) > 0
            return (
              <li key={g.id} className="card">
                <div className="flex items-start gap-3">
                  {giftImageSrc(g) && (
                    <img src={giftImageSrc(g)!} alt="" className="h-16 w-16 rounded-2xl object-cover" loading="lazy" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold">{g.title}</h3>
                      {g.priority === 2 && <span className="chip bg-brand-100 text-brand-700">{t('friendList.veryExcited')}</span>}
                      {g.reservedByMe ? (
                        <span className="chip bg-green-100 text-green-700">
                          {g.quantity > 1 ? t('friendList.youTakeN', { n: g.myUnits! }) : t('friendList.youTake')}
                        </span>
                      ) : !free ? (
                        <span className="chip bg-slate-200 text-slate-600">{t('friendList.taken')}</span>
                      ) : null}
                      {/* «Quedan N» es información de reserva: si aún no la ve, no se enseña. */}
                      {g.quantity > 1 && canSeeReservations && (
                        <span className="chip bg-slate-100 text-slate-600">
                          {t('friendList.asksFor', { n: g.quantity, left: g.remaining! })}
                        </span>
                      )}
                      <VisibilityChip visibility={g.visibility} audienceCount={g.audienceCount} />
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
                    {g.group && (
                      <Link
                        to={`/colecta/${g.group.id}`}
                        className="mt-3 flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 hover:bg-brand-100"
                      >
                        <Icon icon={ICON.colecta} size={28} className="shrink-0 text-brand-700" />
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold text-brand-800">
                            {g.group.status === 'bought' ? t('friendList.groupBought') : t('friendList.groupRunning')}
                          </span>
                          <span className="block text-sm text-brand-700">
                            {g.group.members} {g.group.members === 1 ? t('common.person') : t('common.people')} ·{' '}
                            {g.group.imMember ? t('friendList.groupIn') : t('friendList.groupCanJoin')}
                          </span>
                        </span>
                        <span className="shrink-0 font-semibold text-brand-700">
                          {g.group.imMember ? t('common.open') : t('friendList.groupJoin')}
                        </span>
                      </Link>
                    )}

                    {/* Sin la señal de reservas no se puede reservar (si no, se sabría probando).
                        Lo que ya llevaba uno sí se puede soltar. */}
                    <div
                      className={`mt-3 flex flex-wrap items-center gap-2 ${
                        canSeeReservations || g.reservedByMe ? '' : 'hidden'
                      }`}
                    >
                      {g.reservedByMe ? (
                        <>
                          {g.quantity > 1 && (
                            <Unidades
                              gift={g}
                              onChange={(n) => api.reserve(g.id, n).then(list.reload).catch(fallo)}
                            />
                          )}
                          <button className="btn-ghost !py-2 !px-4 !text-sm" onClick={() => api.unreserve(g.id).then(list.reload)}>
                            {t('friendList.dropIt')}
                          </button>
                        </>
                      ) : (
                        !g.group && (
                          <>
                            {g.quantity > 1 && free && (
                              <Unidades
                                gift={g}
                                onChange={(n) => api.reserve(g.id, n).then(list.reload).catch(fallo)}
                                soloElegir
                              />
                            )}
                            {!(g.quantity > 1 && free) && (
                              <button
                                className="btn-primary !py-2 !px-4 !text-sm"
                                disabled={!free}
                                onClick={() => api.reserve(g.id).then(list.reload).catch(fallo)}
                              >
                                {free ? t('friendList.iGiveIt') : t('friendList.alreadyTaken')}
                              </button>
                            )}
                          </>
                        )
                      )}
                      {!g.group && !g.reservedByMe && free && (
                        <button
                          className="btn-ghost !py-2 !px-4 !text-sm inline-flex items-center gap-2"
                          onClick={() => setGrouping(g)}
                        >
                          <Icon icon={ICON.colecta} size={18} />
                          {t('friendList.groupGift')}
                        </button>
                      )}
                    </div>

                    <Reacciones
                      reactions={g.reactions}
                      mine={g.myReaction}
                      onPick={(emoji) =>
                        (emoji ? api.react(g.id, emoji) : api.unreact(g.id))
                          .then(list.reload)
                          .catch(fallo)
                      }
                    />
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {grouping && <NewGroup gift={grouping} onClose={() => setGrouping(null)} />}

      {received.length > 0 && (
        <details className="rounded-3xl border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer font-semibold text-slate-600">
            {t('friendList.received', { n: received.length })}
          </summary>
          <ul className="mt-3 space-y-1 text-slate-500">
            {received.map((g) => (
              <li key={g.id} className="flex items-center gap-2">
                <Icon icon={ICON.recibido} size={18} className="shrink-0 text-green-600" />
                {g.title}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

/**
 * «Pídele que apunte algo». Cuando alguien tiene la lista vacía no hay nada que hacer con ella,
 * y quedarse callado es lo que mata la app: esto le manda un aviso claro, pedido por una persona.
 * No insinúa nada sobre reservas —solo dice que un amigo quiere acertar— así que no toca la regla 1.
 */
function Toque({ user }: { user: { username: string; displayName: string } }) {
  const t = useT()
  const [estado, setEstado] = useState<'' | 'enviado' | string>('')

  return (
    <div className="card flex flex-wrap items-center gap-3 border-dashed">
      <Icon icon={ICON.idea} size={28} className="text-brand-600" />
      <p className="min-w-40 flex-1 text-sm text-slate-600">
        {t('friendList.nudgeText', { name: user.displayName.split(' ')[0] })}
      </p>
      {estado === 'enviado' ? (
        <span className="chip inline-flex items-center gap-1 bg-green-100 text-green-700">
          <Icon icon={ICON.check} size={14} />
          {t('friendList.nudgeSent')}
        </span>
      ) : (
        <button
          className="btn-ghost !py-2 !px-4 !text-sm"
          onClick={() =>
            api
              .nudge(user.username)
              .then(() => setEstado('enviado'))
              .catch((e) => setEstado(e.message))
          }
        >
          {t('friendList.nudgeButton')}
        </button>
      )}
      {estado && estado !== 'enviado' && <p className="w-full text-sm text-slate-500">{estado}</p>}
    </div>
  )
}

/**
 * Selector de cuántas unidades se lleva uno cuando el regalo pide varias.
 * El máximo son las libres más las que ya tenía cogidas esta persona.
 */
function Unidades({
  gift,
  onChange,
  soloElegir,
}: {
  gift: Gift
  onChange: (n: number) => void
  soloElegir?: boolean
}) {
  const t = useT()
  const mias = gift.myUnits ?? 0
  const max = (gift.remaining ?? 0) + mias
  const [n, setN] = useState(Math.max(1, mias || 1))

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1 rounded-2xl border border-slate-300 bg-white p-1">
        <button
          type="button"
          className="h-9 w-9 rounded-xl text-lg font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-40"
          disabled={n <= 1}
          onClick={() => setN(n - 1)}
          aria-label={t('friendList.lessUnits')}
        >
          −
        </button>
        <span className="min-w-8 text-center font-bold">{n}</span>
        <button
          type="button"
          className="h-9 w-9 rounded-xl text-lg font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-40"
          disabled={n >= max}
          onClick={() => setN(n + 1)}
          aria-label={t('friendList.moreUnits')}
        >
          +
        </button>
      </div>
      <button
        className={`${soloElegir ? 'btn-primary' : 'btn-ghost'} !py-2 !px-4 !text-sm`}
        disabled={!soloElegir && n === mias}
        onClick={() => onChange(n)}
      >
        {soloElegir ? (n === 1 ? t('friendList.takeOne') : t('friendList.takeN', { n })) : t('common.change')}
      </button>
    </div>
  )
}

/** Abrir una colecta: coste, reparto y una nota inicial. Quien la abre queda dentro. */
function NewGroup({ gift, onClose }: { gift: Gift; onClose: () => void }) {
  const t = useT()
  const nav = useNavigate()
  const [f, setF] = useState({
    target: gift.price === null ? '' : String(gift.price),
    splitMode: 'equal',
    note: '',
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const r = await api.createGroup(gift.id, f)
      nav(`/colecta/${r.group.id}`)
    } catch (err: any) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <form
        onSubmit={create}
        className="max-h-[92dvh] w-full max-w-lg space-y-4 overflow-y-auto rounded-t-3xl bg-white p-5 sm:rounded-3xl"
      >
        <div>
          <h2 className="text-xl font-extrabold">{t('newGroup.title')}</h2>
          <p className="text-slate-600">{t('newGroup.sub', { title: gift.title })}</p>
        </div>

        <div>
          <label className="label" htmlFor="gt">{t('newGroup.cost')}</label>
          <input id="gt" className="input" inputMode="decimal" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} required />
        </div>

        <div>
          <span className="label">{t('newGroup.split')}</span>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['equal', t('newGroup.splitEqual')],
                ['custom', t('newGroup.splitCustom')],
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                type="button"
                onClick={() => setF({ ...f, splitMode: v })}
                className={`rounded-2xl border py-3 font-semibold ${
                  f.splitMode === v ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-600'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label" htmlFor="gn">{t('newGroup.firstMessage')}</label>
          <input id="gn" className="input" placeholder={t('newGroup.firstMessagePlaceholder')} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </div>

        <ErrorBox>{error}</ErrorBox>

        <div className="flex gap-2">
          <button type="button" className="btn-ghost flex-1" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn-primary flex-1" disabled={busy}>
            {t('newGroup.create')}
          </button>
        </div>
      </form>
    </div>
  )
}
