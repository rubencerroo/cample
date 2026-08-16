import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, User } from '../api'
import { Avatar, Empty, ErrorBox, Spinner, useAsync, useDialogos } from '../ui'
import { useT } from '../i18n'
import { ICON, Icon } from '../icons'

export default function Friends() {
  const t = useT()
  const { confirmar } = useDialogos()
  const friends = useAsync(() => api.friends(), [])
  const reqs = useAsync(() => api.requests(), [])
  const sugerencias = useAsync(() => api.suggestions(), [])
  const [q, setQ] = useState('')
  const [results, setResults] = useState<User[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(null)
      return
    }
    const timer = setTimeout(() => {
      api
        .search(q)
        .then((r) => setResults(r.users))
        .catch((e) => setError(e.message))
    }, 300)
    return () => clearTimeout(timer)
  }, [q])

  const reload = () => {
    friends.reload()
    reqs.reload()
    sugerencias.reload()
    if (q) api.search(q).then((r) => setResults(r.users))
  }

  const act = (p: Promise<unknown>) => p.then(reload).catch((e) => setError(e.message))

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">{t('friends.title')}</h1>

      <div>
        <label className="label" htmlFor="q">{t('friends.search')}</label>
        <input
          id="q"
          className="input"
          placeholder={t('friends.searchPlaceholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoCapitalize="none"
        />
      </div>

      <DesdeLaAgenda onAdd={(username) => act(api.addFriend(username))} />

      <ErrorBox>{error}</ErrorBox>

      {results && (
        <section className="space-y-2">
          <h2 className="font-bold text-slate-700">{t('friends.results')}</h2>
          {results.length === 0 && <Empty title={t('friends.noResults')} />}
          {results.map((u) => (
            <Row key={u.id} user={u}>
              <button className="btn-primary !py-2 !px-4 !text-sm" onClick={() => act(api.addFriend(u.username))}>
                {t('friends.add')}
              </button>
            </Row>
          ))}
        </section>
      )}

      {!results && sugerencias.data?.suggestions.length ? (
        <section className="space-y-2">
          <h2 className="font-bold text-slate-700">{t('friends.maybeKnow')}</h2>
          {sugerencias.data.suggestions.map((u) => (
            <Row
              key={u.id}
              user={u}
              hint={
                u.mutual > 1
                  ? t('friends.mutual', { n: u.mutual })
                  : u.mutual === 1
                    ? t('friends.mutualOne')
                    : undefined
              }
            >
              <button className="btn-primary !py-2 !px-4 !text-sm" onClick={() => act(api.addFriend(u.username))}>
                {t('friends.add')}
              </button>
            </Row>
          ))}
        </section>
      ) : null}

      {reqs.data?.incoming.length ? (
        <section className="space-y-2">
          <h2 className="font-bold text-slate-700">{t('friends.incoming')}</h2>
          {reqs.data.incoming.map((u) => (
            <Row key={u.id} user={u}>
              <button className="btn-primary !py-2 !px-4 !text-sm" onClick={() => act(api.acceptFriend(u.username))}>
                {t('friends.accept')}
              </button>
              <button className="btn-ghost !py-2 !px-4 !text-sm" onClick={() => act(api.removeFriend(u.username))}>
                {t('friends.reject')}
              </button>
            </Row>
          ))}
        </section>
      ) : null}

      {reqs.data?.outgoing.length ? (
        <section className="space-y-2">
          <h2 className="font-bold text-slate-700">{t('friends.outgoing')}</h2>
          {reqs.data.outgoing.map((u) => (
            <Row key={u.id} user={u}>
              <button className="btn-ghost !py-2 !px-4 !text-sm" onClick={() => act(api.removeFriend(u.username))}>
                {t('friends.cancelRequest')}
              </button>
            </Row>
          ))}
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="font-bold text-slate-700">{t('friends.yours')}</h2>
        {friends.loading ? (
          <Spinner />
        ) : friends.data?.friends.length ? (
          friends.data.friends.map((u) => (
            <Row key={u.id} user={u} to={`/lista/${u.username}`}>
              <button
                className="btn-danger !py-2 !px-4 !text-sm"
                onClick={async (e) => {
                  e.preventDefault()
                  const ok = await confirmar({
                    title: t('friends.confirmRemove', { name: u.displayName }),
                    confirmLabel: t('common.remove'),
                    danger: true,
                  })
                  if (ok) act(api.removeFriend(u.username))
                }}
              >
                {t('common.remove')}
              </button>
            </Row>
          ))
        ) : (
          <Empty title={t('friends.emptyTitle')} hint={t('friends.emptyHint')} />
        )}
      </section>
    </div>
  )
}

/**
 * Buscar amigos en la agenda del móvil. Usa el Contact Picker: lo abre el sistema, la persona
 * elige a mano a quién compartir y el navegador nos da solo esos contactos — no hay forma de
 * leer la agenda entera, ni falta. Solo existe en Chrome de Android; en iPhone no aparece el
 * botón. Los teléfonos se mandan al servidor para cruzarlos y no se guardan en ningún sitio.
 */
function DesdeLaAgenda({ onAdd }: { onAdd: (username: string) => void }) {
  const t = useT()
  const [matches, setMatches] = useState<User[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const soportado =
    typeof navigator !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window
  if (!soportado) return null

  async function abrir() {
    setError('')
    try {
      const contactos = await (navigator as any).contacts.select(['tel'], { multiple: true })
      const tels: string[] = contactos.flatMap((c: any) => c.tel ?? [])
      if (!tels.length) return
      setBusy(true)
      const r = await api.fromContacts(tels)
      setMatches(r.matches)
    } catch (e: any) {
      if (e?.name !== 'AbortError') setError(e.message ?? t('friends.contactsError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-2">
      <button
        className="btn-ghost w-full inline-flex items-center justify-center gap-2"
        onClick={abrir}
        disabled={busy}
      >
        <Icon icon={ICON.agenda} size={20} />
        {t('friends.fromContacts')}
      </button>
      <ErrorBox>{error}</ErrorBox>

      {matches?.length === 0 && (
        <p className="text-sm text-slate-500">
          {t('friends.fromContactsNone')}
        </p>
      )}
      {matches?.map((u) => (
        <Row key={u.id} user={u} hint={t('friends.inContacts')}>
          <button className="btn-primary !py-2 !px-4 !text-sm" onClick={() => onAdd(u.username)}>
            {t('friends.add')}
          </button>
        </Row>
      ))}
    </section>
  )
}

function Row({
  user,
  children,
  to,
  hint,
}: {
  user: User
  children: React.ReactNode
  to?: string
  hint?: string
}) {
  const inner = (
    <>
      <Avatar user={user} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{user.displayName}</p>
        <p className="truncate text-sm text-slate-500">{hint ?? `@${user.username}`}</p>
      </div>
      <div className="flex shrink-0 gap-2">{children}</div>
    </>
  )
  return to ? (
    <Link to={to} className="card flex items-center gap-3 hover:border-brand-300">
      {inner}
    </Link>
  ) : (
    <div className="card flex items-center gap-3">{inner}</div>
  )
}
