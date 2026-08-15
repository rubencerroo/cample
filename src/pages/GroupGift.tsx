import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, Group } from '../api'
import { Avatar, ErrorBox, Spinner, money, useAsync, useDialogos } from '../ui'
import { localeOf, useT } from '../i18n'

export default function GroupGift() {
  const t = useT()
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { confirmar } = useDialogos()
  const g = useAsync(() => api.group(id), [id])
  const [error, setError] = useState('')

  // Mientras la pestaña está abierta, refrescamos para ver mensajes nuevos.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') g.reload()
    }, 8000)
    return () => clearInterval(t)
  }, [g.reload])

  if (g.loading && !g.data) return <Spinner />
  if (g.error) return <ErrorBox>{g.error}</ErrorBox>
  if (!g.data) return null
  const group = g.data.group

  const act = (p: Promise<unknown>) => p.then(() => g.reload()).catch((e) => setError(e.message))

  return (
    <div className="space-y-5">
      <div>
        <Link to={`/lista/${group.for.username}`} className="text-sm font-semibold text-brand-600">
          {t('group.backToList', { name: group.for.displayName })}
        </Link>
        <h1 className="mt-1 text-2xl font-extrabold">{group.gift.title}</h1>
        <p className="text-slate-600">
          {t('group.for', {
            name: group.for.displayName,
            n: group.members.length,
            people: group.members.length === 1 ? t('common.person') : t('common.people'),
          })}
        </p>
      </div>

      {group.status === 'bought' && (
        <p className="rounded-2xl bg-green-50 border border-green-200 px-4 py-3 font-semibold text-green-800">
          {t('group.bought')}
        </p>
      )}
      {group.status === 'cancelled' && (
        <p className="rounded-2xl bg-slate-100 px-4 py-3 font-semibold text-slate-600">
          {t('group.cancelled')}
        </p>
      )}

      <ErrorBox>{error}</ErrorBox>

      <Money group={group} onChange={g.reload} setError={setError} />

      <Members group={group} onChange={g.reload} setError={setError} />

      {group.isMember ? (
        <Chat group={group} onSent={g.reload} />
      ) : (
        <div className="card space-y-3 text-center">
          <p className="font-semibold">{t('group.joinToSee')}</p>
          <button
            className="btn-primary w-full"
            disabled={group.status !== 'open'}
            onClick={() => act(api.joinGroup(group.id))}
          >
            {group.status === 'open' ? t('group.join') : t('group.closed')}
          </button>
        </div>
      )}

      {group.isMember && (
        <div className="flex flex-wrap gap-2">
          {group.isOrganizer && group.status === 'open' && (
            <>
              <button
                className="btn-primary !py-2 !px-4 !text-sm"
                onClick={() => act(api.updateGroup(group.id, { status: 'bought' }))}
              >
                {t('group.markBought')}
              </button>
              <button
                className="btn-danger !py-2 !px-4 !text-sm"
                onClick={async () => {
                  const ok = await confirmar({
                    title: t('group.confirmCancel'),
                    confirmLabel: t('group.cancel'),
                    danger: true,
                  })
                  if (ok) act(api.updateGroup(group.id, { status: 'cancelled' }))
                }}
              >
                {t('group.cancel')}
              </button>
            </>
          )}
          <button
            className="btn-ghost !py-2 !px-4 !text-sm"
            onClick={async () => {
              const ok = await confirmar({
                title: t('group.confirmLeave'),
                confirmLabel: t('group.leave'),
                danger: true,
              })
              if (ok)
                api
                  .leaveGroup(group.id)
                  .then((r) => (r.cancelled ? nav(`/lista/${group.for.username}`) : g.reload()))
                  .catch((e) => setError(e.message))
            }}
          >
            {t('group.leave')}
          </button>
        </div>
      )}
    </div>
  )
}

function Money({
  group,
  onChange,
  setError,
}: {
  group: Group
  onChange: () => void
  setError: (s: string) => void
}) {
  const t = useT()
  const [target, setTarget] = useState(group.target === null ? '' : String(group.target))
  const [editing, setEditing] = useState(false)
  const mine = group.members.find((m) => m.isMe)
  const pending = (group.target ?? 0) - group.collected

  return (
    <section className="card space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-bold">{t('group.money')}</h2>
        {group.isOrganizer && group.status === 'open' && (
          <button className="text-sm font-semibold text-brand-600" onClick={() => setEditing(!editing)}>
            {editing ? t('common.close') : t('common.change')}
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="tg">{t('group.totalCost')}</label>
            <input id="tg" className="input" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
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
                  onClick={() => api.updateGroup(group.id, { splitMode: v }).then(onChange).catch((e) => setError(e.message))}
                  className={`rounded-2xl border py-3 font-semibold ${
                    group.splitMode === v ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-600'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <button
            className="btn-primary w-full"
            onClick={() => {
              api
                .updateGroup(group.id, { target })
                .then(() => {
                  setEditing(false)
                  onChange()
                })
                .catch((e) => setError(e.message))
            }}
          >
            {t('common.save')}
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-xl font-extrabold">{money(group.target)}</p>
              <p className="text-sm text-slate-500">{t('group.cost')}</p>
            </div>
            <div>
              <p className="text-xl font-extrabold text-brand-600">{money(mine?.share ?? null) ?? '—'}</p>
              <p className="text-sm text-slate-500">{t('group.yourShare')}</p>
            </div>
            <div>
              <p className="text-xl font-extrabold text-green-600">{money(group.collected)}</p>
              <p className="text-sm text-slate-500">{t('group.collected')}</p>
            </div>
          </div>
          {group.target ? (
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-green-500 transition-all"
                style={{ width: `${Math.min(100, (group.collected / group.target) * 100)}%` }}
              />
            </div>
          ) : null}
          {pending > 0 && (
            <p className="text-center text-sm text-slate-500">
              {t('group.missing', { amount: money(pending)! })}
            </p>
          )}

          {group.splitMode === 'custom' && group.isMember && (
            <PledgeBox group={group} onChange={onChange} setError={setError} />
          )}

          {group.isMember && (
            <button
              className={mine?.hasPaid ? 'btn-ghost w-full' : 'btn-primary w-full'}
              onClick={() => api.setPaid(group.id, !mine?.hasPaid).then(onChange).catch((e) => setError(e.message))}
            >
              {mine?.hasPaid ? t('group.paidDone') : t('group.markPaid')}
            </button>
          )}
        </>
      )}
    </section>
  )
}

function PledgeBox({ group, onChange, setError }: { group: Group; onChange: () => void; setError: (s: string) => void }) {
  const t = useT()
  const mine = group.members.find((m) => m.isMe)
  const [v, setV] = useState(mine?.share === null || mine?.share === undefined ? '' : String(mine.share))
  return (
    <div className="flex items-end gap-2">
      <div className="flex-1">
        <label className="label" htmlFor="pl">{t('group.yourPledge')}</label>
        <input id="pl" className="input" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} />
      </div>
      <button
        className="btn-ghost"
        onClick={() => api.setPledge(group.id, v).then(onChange).catch((e) => setError(e.message))}
      >
        {t('common.save')}
      </button>
    </div>
  )
}

function Members({ group, onChange, setError }: { group: Group; onChange: () => void; setError: (s: string) => void }) {
  const t = useT()
  return (
    <section className="card space-y-3">
      <h2 className="font-bold">{t('group.members')}</h2>
      <ul className="space-y-2">
        {group.members.map((m) => (
          <li key={m.username} className="flex items-center gap-3">
            <Avatar user={m} size={38} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">
                {m.displayName}
                {m.isMe && <span className="text-slate-400"> ({t('common.you')})</span>}
              </p>
              {m.isOrganizer && <p className="text-sm text-slate-500">{t('group.organizer')}</p>}
            </div>
            <div className="shrink-0 text-right">
              <p className="font-semibold">{money(m.share) ?? '—'}</p>
              <p className={`text-sm ${m.hasPaid ? 'text-green-600' : 'text-slate-400'}`}>
                {m.hasPaid ? t('group.paid') : t('group.pending')}
              </p>
            </div>
          </li>
        ))}
      </ul>
      {!group.isMember && group.status === 'open' && (
        <button
          className="btn-primary w-full"
          onClick={() => api.joinGroup(group.id).then(onChange).catch((e) => setError(e.message))}
        >
          {t('friendList.groupJoin')}
        </button>
      )}
    </section>
  )
}

function Chat({ group, onSent }: { group: Group; onSent: () => void }) {
  const t = useT()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [group.messages.length])

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    setBusy(true)
    try {
      await api.sendMessage(group.id, text)
      setText('')
      onSent()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card space-y-3">
      <h2 className="font-bold">{t('group.chat')}</h2>
      <div className="max-h-96 space-y-3 overflow-y-auto">
        {group.messages.length === 0 && (
          <p className="py-6 text-center text-slate-500">
            {t('group.chatEmpty', { name: group.for.displayName })}
          </p>
        )}
        {group.messages.map((m) => (
          <div key={m.id} className="flex items-start gap-2">
            <Avatar user={m.author} size={34} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-600">
                {m.author.displayName}{' '}
                <span className="font-normal text-slate-400">
                  {new Date(m.createdAt * 1000).toLocaleString(localeOf(), {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </p>
              <p className="whitespace-pre-wrap break-words rounded-2xl rounded-tl-sm bg-slate-100 px-3 py-2">
                {m.body}
              </p>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="flex gap-2">
        <input
          className="input flex-1"
          placeholder={t('group.messagePlaceholder')}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="btn-primary !px-4" disabled={busy || !text.trim()}>
          {t('common.send')}
        </button>
      </form>
    </section>
  )
}
