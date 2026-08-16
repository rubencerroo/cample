import { Link } from 'react-router-dom'
import { Activity, api } from '../api'
import { useAuth } from '../App'
import { Avatar, Empty, ErrorBox, Spinner, birthdayLabel, daysUntilBirthday, money, useAsync } from '../ui'
import { localeOf, useT } from '../i18n'
import { ICON, Icon } from '../icons'

export default function Home() {
  const { user } = useAuth()
  const t = useT()
  const feed = useAsync(() => api.feed(), [])
  const activity = useAsync(() => api.activity(), [])
  const notifs = useAsync(() => api.notifications(), [])

  const unread = notifs.data?.notifications.filter((n) => !n.is_read) ?? []

  // Amigos que cumplen en los próximos dos meses, los más cercanos primero.
  const upcoming = (feed.data?.friends ?? [])
    .filter((f) => {
      const d = daysUntilBirthday(f.birthday)
      return d !== null && d <= 60
    })
    .sort((a, b) => daysUntilBirthday(a.birthday)! - daysUntilBirthday(b.birthday)!)
    .slice(0, 5)

  const sinAmigos = !feed.loading && feed.data?.friends.length === 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">{t('home.hello', { name: user.displayName.split(' ')[0] })}</h1>
        <p className="text-slate-600">{t('home.sub')}</p>
      </div>

      {unread.length > 0 && (
        <section className="card space-y-2 border-brand-200 bg-brand-50">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">{t('home.news')}</h2>
            <button
              className="text-sm font-semibold text-brand-600"
              onClick={() => api.readNotifications().then(notifs.reload)}
            >
              {t('home.markRead')}
            </button>
          </div>
          <ul className="space-y-1.5">
            {unread.slice(0, 6).map((n) => (
              <li key={n.id} className="text-slate-700">
                {n.link ? (
                  <Link className="underline decoration-brand-300" to={n.link}>
                    {n.body}
                  </Link>
                ) : (
                  n.body
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-bold text-slate-700">{t('home.birthdays')}</h2>
          <ul className="space-y-2">
            {upcoming.map((f) => {
              const d = daysUntilBirthday(f.birthday)!
              return (
                <li key={f.id}>
                  <Link to={`/lista/${f.username}`} className="card flex items-center gap-3 hover:border-brand-300">
                    <Icon icon={ICON.cumple} size={26} className="shrink-0 text-brand-600" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{f.displayName}</span>
                      <span className="block text-sm text-slate-500">{birthdayLabel(f.birthday)}</span>
                    </span>
                    <span className="shrink-0 text-sm font-bold text-brand-600">
                      {d === 0 ? t('home.today') : d === 1 ? t('home.tomorrow') : t('home.inDays', { n: d })}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <ErrorBox>{activity.error || feed.error}</ErrorBox>

      <section className="space-y-3">
        <h2 className="font-bold text-slate-700">{t('home.activity')}</h2>
        {activity.loading ? (
          <Spinner />
        ) : activity.data?.activity.length ? (
          <ul className="space-y-3">
            {activity.data.activity.map((a) => (
              <li key={`${a.kind}-${a.ref}`}>
                <ActivityCard item={a} />
              </li>
            ))}
          </ul>
        ) : sinAmigos ? (
          <Empty title={t('home.noFriendsTitle')} hint={t('home.noFriendsHint')} />
        ) : (
          <Empty title={t('home.quietTitle')} hint={t('home.quietHint')} />
        )}
      </section>
    </div>
  )
}

/** Cuánto hace, en palabras: «hoy», «ayer», «hace 3 días», y una fecha si es viejo. */
function cuando(at: number, t: (k: string, v?: Record<string, string | number>) => string) {
  const dias = Math.floor((Date.now() / 1000 - at) / 86400)
  if (dias <= 0) return t('home.whenToday')
  if (dias === 1) return t('home.whenYesterday')
  if (dias < 30) return t('home.whenDaysAgo', { n: dias })
  return new Date(at * 1000).toLocaleDateString(localeOf(), { day: 'numeric', month: 'short' })
}

/**
 * Una entrada del inicio. El enlace lleva a la lista del amigo, salvo en las colectas, que llevan
 * a la colecta: quien no está dentro ve que existe, que es justo lo que queremos enseñar aquí.
 */
function ActivityCard({ item }: { item: Activity }) {
  const t = useT()
  const nombre = item.user.displayName.split(' ')[0]

  const texto =
    item.kind === 'gift'
      ? t('home.actGift', { name: nombre })
      : item.kind === 'received'
        ? t('home.actReceived', { name: nombre })
        : t('home.actGroup', { name: nombre })

  const to = item.kind === 'group' ? `/colecta/${item.ref}` : `/lista/${item.user.username}`
  const icono =
    item.kind === 'gift' ? ICON.lista : item.kind === 'received' ? ICON.recibido : ICON.colecta

  return (
    <Link to={to} className="card block hover:border-brand-300">
      <div className="flex items-center gap-3">
        <Avatar user={item.user} size={44} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-slate-600">
            <span className="font-semibold text-slate-800">{item.user.displayName}</span>
          </p>
          <p className="truncate text-sm text-slate-500">
            {texto} · {cuando(item.at, t)}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover" loading="lazy" />
        ) : (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
            <Icon icon={icono} size={30} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className={`font-bold ${item.kind === 'received' ? 'text-slate-500 line-through' : ''}`}>
            {item.title}
          </p>
          <p className="text-sm text-slate-500">
            {item.kind === 'group'
              ? t('home.actGroupPeople', { n: item.members ?? 1 })
              : item.price !== null
                ? money(item.price)
                : ''}
          </p>
        </div>
      </div>
    </Link>
  )
}
