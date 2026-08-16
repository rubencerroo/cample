import { useState } from 'react'
import { api } from '../api'
import { useAuth } from '../App'
import { Empty, ErrorBox, Spinner, useAsync, useDialogos } from '../ui'
import { localeOf, useT } from '../i18n'
import { ICON, Icon } from '../icons'

export default function Admin() {
  const { user } = useAuth()
  const t = useT()
  const [tab, setTab] = useState<'resets' | 'users' | 'feedback' | 'avisos'>('resets')

  if (!user.isAdmin) return <Empty title={t('admin.notForYou')} />

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">{t('admin.title')}</h1>
        <p className="text-slate-600">{t('admin.sub')}</p>
      </div>

      <Stats />

      {/* Cuatro pestañas no caben en una fila de móvil sin dejar los botones por debajo de 48px. */}
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1 sm:grid-cols-4">
        {(
          [
            ['resets', t('admin.tabResets')],
            ['users', t('admin.tabUsers')],
            ['feedback', t('admin.tabInbox')],
            ['avisos', t('admin.tabNotify')],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-xl py-2.5 font-semibold ${tab === k ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-600'}`}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === 'resets' ? (
        <Resets />
      ) : tab === 'users' ? (
        <Users me={user.username} />
      ) : tab === 'feedback' ? (
        <Buzon />
      ) : (
        <Avisos />
      )}
    </div>
  )
}

/** Fallos y sugerencias que manda la gente desde Ajustes. */
function Buzon() {
  const { confirmar } = useDialogos()
  const t = useT()
  const list = useAsync(() => api.adminFeedback(), [])
  const [error, setError] = useState('')
  const run = (p: Promise<unknown>) => p.then(list.reload).catch((e) => setError(e.message))

  if (list.loading) return <Spinner />

  return (
    <div className="space-y-3">
      <ErrorBox>{error || list.error}</ErrorBox>
      {list.data?.feedback.length ? (
        <ul className="space-y-3">
          {list.data.feedback.map((f) => (
            <li key={f.id} className={`card space-y-2 ${f.status === 'done' ? 'opacity-60' : ''}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`chip inline-flex items-center gap-1 ${f.kind === 'bug' ? 'bg-red-100 text-red-700' : 'bg-brand-100 text-brand-700'}`}>
                  <Icon icon={f.kind === 'bug' ? ICON.fallo : ICON.idea} size={14} />
                  {f.kind === 'bug' ? t('admin.bug') : t('admin.idea')}
                </span>
                {f.status === 'done' && (
                  <span className="chip bg-green-100 text-green-700">{t('admin.done')}</span>
                )}
                <span className="text-sm text-slate-500">
                  {f.from ? f.from.displayName : t('admin.deletedAccount')} ·{' '}
                  {new Date(f.createdAt * 1000).toLocaleDateString(localeOf())}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-slate-700">{f.body}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn-ghost !py-2 !px-4 !text-sm"
                  onClick={() => run(api.setFeedbackDone(f.id, f.status !== 'done'))}
                >
                  {f.status === 'done' ? t('admin.markPending') : t('admin.markDone')}
                </button>
                <button
                  className="btn-danger !py-2 !px-4 !text-sm"
                  onClick={async () => {
                    const ok = await confirmar({
                      title: t('admin.confirmDeleteFeedback'),
                      confirmLabel: t('common.delete'),
                      danger: true,
                    })
                    if (ok) run(api.deleteFeedback(f.id))
                  }}
                >
                  {t('common.delete')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <Empty title={t('admin.inboxEmpty')} hint={t('admin.inboxEmptyHint')} />
      )}
    </div>
  )
}

function size(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function Stats() {
  const t = useT()
  const s = useAsync(() => api.adminStats(), [])
  if (!s.data) return null
  const st = s.data.stats
  const items: [string, number][] = [
    [t('admin.statPeople'), st.usuarios],
    [t('admin.statGifts'), st.regalos],
    [t('admin.statFriendships'), st.amistades],
    [t('admin.statGroups'), st.colectas],
    [t('admin.statPush'), st.avisos],
  ]
  const pct = (st.db.used / st.db.limit) * 100

  return (
    <div className="space-y-3">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {items.map(([l, v]) => (
          <li key={l} className="card text-center">
            <p className="text-2xl font-extrabold text-brand-600">{v}</p>
            <p className="text-sm text-slate-500">{l}</p>
          </li>
        ))}
      </ul>

      <section className="card space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-bold">{t('admin.dbSpace')}</h2>
          <span className="text-sm font-semibold text-slate-500">
            {t('admin.dbOf', { used: size(st.db.used), limit: size(st.db.limit) })}
          </span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-slate-200">
          <div
            className={`h-full rounded-full transition-all ${
              pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-green-500'
            }`}
            style={{ width: `${Math.max(0.5, Math.min(100, pct))}%` }}
          />
        </div>
        <p className="text-sm text-slate-500">
          {pct < 1 ? t('admin.dbUnder1') : t('admin.dbUsed', { pct: pct.toFixed(1) })}
          {t('admin.dbPhotos', { size: size(st.db.photos) })}
        </p>
      </section>
    </div>
  )
}

function Resets() {
  const t = useT()
  const list = useAsync(() => api.adminResets(), [])
  const [codes, setCodes] = useState<Record<string, string>>({})
  const [error, setError] = useState('')

  const approve = (id: string) =>
    api
      .approveReset(id)
      .then((r) => {
        setCodes((c) => ({ ...c, [id]: r.code }))
        list.reload()
      })
      .catch((e) => setError(e.message))

  return (
    <div className="space-y-3">
      <p className="text-slate-600">{t('admin.resetsIntro')}</p>
      <ErrorBox>{error}</ErrorBox>
      {list.loading ? (
        <Spinner />
      ) : list.data?.resets.length ? (
        <ul className="space-y-3">
          {list.data.resets.map((r) => (
            <li key={r.id} className="card space-y-3">
              <div>
                <p className="font-bold">{r.displayName}</p>
                <p className="text-sm text-slate-500">
                  {t('admin.requestedOn', {
                    user: r.username,
                    date: new Date(r.createdAt * 1000).toLocaleString(localeOf()),
                  })}
                </p>
              </div>

              {codes[r.id] ? (
                <div className="rounded-2xl bg-green-50 border border-green-200 p-4 text-center">
                  <p className="text-sm text-green-800">{t('admin.codeOnce')}</p>
                  <p className="mt-1 text-3xl font-extrabold tracking-widest text-green-900">{codes[r.id]}</p>
                  <p className="mt-1 text-sm text-green-800">{t('admin.codeExpires')}</p>
                </div>
              ) : r.status === 'approved' ? (
                <p className="text-sm text-slate-500">
                  {t('admin.alreadyApproved')}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                {r.status === 'pending' && (
                  <button className="btn-primary !py-2 !px-4 !text-sm" onClick={() => approve(r.id)}>
                    {t('admin.approve')}
                  </button>
                )}
                <button
                  className="btn-danger !py-2 !px-4 !text-sm"
                  onClick={() => api.rejectReset(r.id).then(list.reload).catch((e) => setError(e.message))}
                >
                  {t('admin.reject')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <Empty title={t('admin.noResets')} />
      )}
    </div>
  )
}

/**
 * Mandar un aviso escrito a mano, a todo el mundo o a personas concretas.
 *
 * No hay email en Cample a propósito, así que esta es la única forma de contarle algo a la gente
 * («mañana no va a estar disponible», «ya se puede subir foto a los regalos»). Llega a una pantalla
 * de bloqueo, y de ahí el recordatorio de no hablar nunca de regalos ni de quién lleva qué: quien
 * esté al lado del móvil lo lee, y un aviso no se puede retirar.
 */
function Avisos() {
  const t = useT()
  const { confirmar, avisar } = useDialogos()
  const lista = useAsync(() => api.adminUsers(), [])
  const [texto, setTexto] = useState('')
  const [todos, setTodos] = useState(true)
  const [elegidos, setElegidos] = useState<string[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const activos = lista.data?.users.filter((u) => u.isActive) ?? []
  const cuantos = todos ? activos.length : elegidos.length

  async function enviar() {
    setError('')
    const ok = await confirmar({
      title: t('admin.notifyConfirm', { n: cuantos }),
      confirmLabel: t('common.send'),
    })
    if (!ok) return
    setBusy(true)
    try {
      const r = await api.adminNotify({
        body: texto.trim(),
        all: todos,
        usernames: todos ? undefined : elegidos,
      })
      setTexto('')
      setElegidos([])
      await avisar(t('admin.notifySent'), t('admin.notifySentText', { n: r.sent }))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-slate-600">{t('admin.notifyIntro')}</p>
      <p className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
        {t('admin.notifyWarning')}
      </p>

      <div>
        <label className="label" htmlFor="av">{t('admin.notifyLabel')}</label>
        <textarea
          id="av"
          className="input min-h-28"
          maxLength={200}
          placeholder={t('admin.notifyPlaceholder')}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <p className="mt-1.5 text-sm text-slate-500">{t('admin.notifyLeft', { n: 200 - texto.length })}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(
          [
            [true, t('admin.notifyAll')],
            [false, t('admin.notifySome')],
          ] as const
        ).map(([v, l]) => (
          <button
            key={String(v)}
            type="button"
            onClick={() => setTodos(v)}
            className={`rounded-2xl border py-3 font-semibold ${
              todos === v ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-600'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {!todos &&
        (lista.loading ? (
          <Spinner />
        ) : (
          <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200">
            {activos.map((u) => {
              const marcado = elegidos.includes(u.username)
              return (
                <li key={u.username}>
                  <button
                    type="button"
                    onClick={() =>
                      setElegidos(
                        marcado ? elegidos.filter((x) => x !== u.username) : [...elegidos, u.username],
                      )
                    }
                    className={`flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left ${
                      marcado ? 'bg-brand-50' : ''
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${
                        marcado ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-300'
                      }`}
                    >
                      {marcado && <Icon icon={ICON.check} size={16} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{u.displayName}</span>
                      <span className="block truncate text-sm text-slate-500">@{u.username}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        ))}

      <ErrorBox>{error}</ErrorBox>

      <button
        className="btn-primary w-full"
        disabled={busy || texto.trim().length < 3 || cuantos === 0}
        onClick={enviar}
      >
        {t('admin.notifySend', { n: cuantos })}
      </button>
    </div>
  )
}

function Users({ me }: { me: string }) {
  const { confirmar } = useDialogos()
  const t = useT()
  const list = useAsync(() => api.adminUsers(), [])
  const [error, setError] = useState('')
  const act = (p: Promise<unknown>) => p.then(list.reload).catch((e) => setError(e.message))

  return (
    <div className="space-y-3">
      <ErrorBox>{error}</ErrorBox>
      <p className="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
        {t('admin.trustHint')}
      </p>
      {list.loading ? (
        <Spinner />
      ) : (
        <ul className="space-y-3">
          {list.data?.users.map((u) => (
            <li key={u.username} className={`card space-y-3 ${u.isActive ? '' : 'opacity-60'}`}>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold">{u.displayName}</p>
                {u.isAdmin && <span className="chip bg-brand-100 text-brand-700">{t('admin.adminChip')}</span>}
                {!u.isActive && (
                  <span className="chip bg-slate-200 text-slate-600">{t('admin.disabledChip')}</span>
                )}
                {u.trusted && (
                  <span className="chip bg-green-100 text-green-700">{t('admin.trustedChip')}</span>
                )}
                {u.suspicious && (
                  <span className="chip bg-amber-100 text-amber-800">{t('admin.suspiciousChip')}</span>
                )}
              </div>
              <p className="text-sm text-slate-500">
                {t('admin.userLine', {
                  user: u.username,
                  gifts: u.gifts,
                  friends: u.friends,
                  date: new Date(u.createdAt * 1000).toLocaleDateString(localeOf()),
                })}
              </p>
              {u.username !== me && (
                <div className="flex flex-wrap gap-2">
                  {/* Es un juicio sobre la persona, no sobre la cuenta: por eso se puede retirar. */}
                  <button
                    className={u.trusted ? 'btn-ghost !py-2 !px-4 !text-sm' : 'btn-primary !py-2 !px-4 !text-sm'}
                    onClick={async () => {
                      if (!u.trusted) return act(api.setTrusted(u.username, true))
                      const ok = await confirmar({
                        title: t('admin.confirmUntrust', { name: u.displayName }),
                        confirmLabel: t('admin.untrust'),
                      })
                      if (ok) act(api.setTrusted(u.username, false))
                    }}
                  >
                    {u.trusted ? t('admin.untrust') : t('admin.trust')}
                  </button>
                  <button
                    className="btn-ghost !py-2 !px-4 !text-sm"
                    onClick={() => act(api.setUserActive(u.username, !u.isActive))}
                  >
                    {u.isActive ? t('admin.disable') : t('admin.enable')}
                  </button>
                  <button
                    className="btn-danger !py-2 !px-4 !text-sm"
                    onClick={async () => {
                      const ok = await confirmar({
                        title: t('admin.confirmDeleteUser', { name: u.displayName }),
                        confirmLabel: t('common.delete'),
                        danger: true,
                      })
                      if (ok) act(api.deleteUser(u.username))
                    }}
                  >
                    {t('common.delete')}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
