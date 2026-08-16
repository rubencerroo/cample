import { Link } from 'react-router-dom'
import { api } from '../api'
import { Empty, ErrorBox, Spinner, money, useAsync } from '../ui'
import { useT } from '../i18n'
import { ICON, Icon } from '../icons'

export default function Reservations() {
  const list = useAsync(() => api.reservations(), [])
  const groups = useAsync(() => api.groups(), [])
  const t = useT()

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">{t('reservations.title')}</h1>
        <p className="text-slate-600">{t('reservations.sub')}</p>
      </div>

      {groups.data?.groups.length ? (
        <section className="space-y-3">
          <h2 className="font-bold text-slate-700">{t('reservations.inGroup')}</h2>
          <ul className="space-y-3">
            {groups.data.groups.map((g) => (
              <li key={g.id}>
                <Link to={`/colecta/${g.id}`} className="card flex items-center gap-3 hover:border-brand-300">
                  <Icon icon={ICON.colecta} size={28} className="shrink-0 text-brand-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{g.title}</span>
                    <span className="block text-sm text-slate-500">
                      {t('reservations.for', { name: g.for.displayName })} · {g.members}{' '}
                      {g.members === 1 ? t('common.person') : t('common.people')}
                      {g.status === 'bought' ? t('reservations.groupBought') : ''}
                    </span>
                  </span>
                  {g.target !== null && <span className="shrink-0 font-semibold">{money(g.target)}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {groups.data?.groups.length ? (
        <h2 className="font-bold text-slate-700">{t('reservations.alone')}</h2>
      ) : null}

      <ErrorBox>{list.error}</ErrorBox>
      {list.loading ? (
        <Spinner />
      ) : list.data?.reservations.length ? (
        <ul className="space-y-3">
          {list.data.reservations.map((g) => (
            <li key={g.id} className="card">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-500">
                    {t('reservations.for', { name: '' })}
                    <Link className="font-semibold text-brand-600" to={`/lista/${g.for!.username}`}>
                      {g.for!.displayName}
                    </Link>
                  </p>
                  <h3 className="font-bold">
                    {g.title}
                    {(g.myUnits ?? 1) > 1 && (
                      <span className="ml-2 chip bg-brand-100 text-brand-700">
                        {t('reservations.takingN', { n: g.myUnits!, total: g.quantity })}
                      </span>
                    )}
                  </h3>
                  {g.notes && <p className="mt-1 whitespace-pre-wrap text-slate-600">{g.notes}</p>}
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-sm">
                    {g.price !== null && <span className="font-semibold text-slate-700">{money(g.price)}</span>}
                    {g.url && (
                      <a className="text-brand-600 underline" href={g.url} target="_blank" rel="noreferrer noopener">
                        {t('myList.seeProduct')}
                      </a>
                    )}
                    {g.isReceived && (
                      <span className="chip bg-green-100 text-green-700">
                        {t('reservations.alreadyReceived')}
                      </span>
                    )}
                  </div>
                  <button
                    className="btn-ghost mt-3 !py-2 !px-4 !text-sm"
                    onClick={() => api.unreserve(g.id).then(list.reload)}
                  >
                    {t('friendList.dropIt')}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <Empty
          title={t('reservations.emptyTitle')}
          hint={t('reservations.emptyHint')}
        />
      )}
    </div>
  )
}
