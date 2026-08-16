import { createContext, useContext, useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { api, User } from './api'
import { Avatar, Spinner } from './ui'
import { ICON, Icon } from './icons'
import Auth from './pages/Auth'
import Home from './pages/Home'
import MyList from './pages/MyList'
import FriendList from './pages/FriendList'
import Friends from './pages/Friends'
import Reservations from './pages/Reservations'
import Settings from './pages/Settings'
import Admin from './pages/Admin'
import GroupGift from './pages/GroupGift'
import Onboarding, { ONBOARDING_VERSION } from './pages/Onboarding'
import InstallPrompt, { instalarPendiente } from './InstallPrompt'
import AvisosPrompt from './AvisosPrompt'
import CompletarPerfil, { telefonoPendiente } from './CompletarPerfil'
import { desactivarPush } from './push'
import { useT } from './i18n'

type Ctx = { user: User; setUser: (u: User) => void; logout: () => void; showGuide: () => void }
const AuthCtx = createContext<Ctx>(null!)
export const useAuth = () => useContext(AuthCtx)

type Badges = { home: number; friends: number; reservations: number; admin: number }

const NAV = [
  { to: '/', label: 'nav.home', icon: ICON.inicio, badge: 'home' },
  { to: '/mi-lista', label: 'nav.myList', icon: ICON.lista, badge: null },
  { to: '/amigos', label: 'nav.friends', icon: ICON.amigos, badge: 'friends' },
  { to: '/reservas', label: 'nav.reservations', icon: ICON.reservas, badge: 'reservations' },
  { to: '/ajustes', label: 'nav.settings', icon: ICON.ajustes, badge: null },
] as const

/** Globito con el número de cosas pendientes de esa pestaña. */
function Badge({ n, className = '' }: { n: number; className?: string }) {
  const t = useT()
  if (!n) return null
  return (
    <span
      aria-label={t('nav.badge', { n })}
      className={`inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white ${className}`}
    >
      {n > 9 ? '9+' : n}
    </span>
  )
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const location = useLocation()
  const t = useT()

  const [badges, setBadges] = useState<Badges>({ home: 0, friends: 0, reservations: 0, admin: 0 })
  const [guide, setGuide] = useState(false)

  useEffect(() => {
    api
      .me()
      .then((r) => setUser(r.user))
      .finally(() => setReady(true))
  }, [])

  // Los avisos se refrescan al cambiar de pantalla y cada medio minuto.
  useEffect(() => {
    if (!user) return
    const load = () => api.badges().then((r) => setBadges(r.badges)).catch(() => {})
    load()
    const t = setInterval(() => document.visibilityState === 'visible' && load(), 30000)
    return () => clearInterval(t)
  }, [user, location.pathname])

  if (!ready) return <Spinner />
  if (!user) return <Auth onAuth={setUser} />

  // Al cerrar sesión se apagan los avisos de este aparato: en la tablet de casa, si no, seguirían
  // llegando los de la persona anterior.
  const logout = () => {
    desactivarPush().finally(() => api.logout().finally(() => setUser(null)))
  }

  // La guía sale sola la primera vez, y también a quien aún no la haya visto.
  const verGuia = guide || user.onboardingSeen < ONBOARDING_VERSION

  const nav = user.isAdmin
    ? [...NAV, { to: '/admin', label: 'nav.admin', icon: ICON.admin, badge: 'admin' } as const]
    : NAV

  return (
    <AuthCtx.Provider value={{ user, setUser, logout, showGuide: () => setGuide(true) }}>
      {verGuia && (
        <Onboarding
          onClose={() => {
            setGuide(false)
            setUser({ ...user, onboardingSeen: ONBOARDING_VERSION })
          }}
        />
      )}
      {/* Solo una ventana a la vez: guía, teléfono, instalar y por último los avisos. */}
      {!verGuia && <CompletarPerfil />}
      {!verGuia && !telefonoPendiente(user) && <InstallPrompt />}
      {!verGuia && !telefonoPendiente(user) && !instalarPendiente() && <AvisosPrompt />}

      <div className="flex min-h-dvh w-full flex-col">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3">
            <NavLink to="/" className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-brand-600">
              <img src="/icon.svg" alt="" className="h-8 w-8 rounded-lg" />
              Cample
            </NavLink>
            <NavLink to="/ajustes" className="flex items-center gap-2">
              <span className="hidden text-sm font-medium text-slate-600 sm:inline">{user.displayName}</span>
              <Avatar user={user} size={36} />
            </NavLink>
          </div>
        </header>

        {/* Navegación lateral en pantallas grandes */}
        <div className="mx-auto flex w-full max-w-6xl flex-1">
          <nav className="sticky top-16 hidden h-fit w-56 shrink-0 flex-col gap-1 p-4 md:flex">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-2xl px-4 py-3 font-semibold ${
                    isActive ? 'bg-brand-100 text-brand-700' : 'text-slate-600 hover:bg-slate-100'
                  }`
                }
              >
                <Icon icon={n.icon} size={22} />
                <span className="flex-1">{t(n.label)}</span>
                <Badge n={n.badge ? badges[n.badge] : 0} />
              </NavLink>
            ))}
          </nav>

          <main className="mx-auto min-w-0 w-full max-w-3xl px-4 py-5 pb-28 md:pb-10">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/mi-lista" element={<MyList />} />
              <Route path="/lista/:username" element={<FriendList />} />
              <Route path="/amigos" element={<Friends />} />
              <Route path="/reservas" element={<Reservations />} />
              <Route path="/colecta/:id" element={<GroupGift />} />
              <Route path="/ajustes" element={<Settings />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>

        {/* Barra inferior en móvil */}
        <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          {nav.map((n) => {
            const active = n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to)
            return (
              <NavLink
                key={n.to}
                to={n.to}
                className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 px-0.5 py-2.5 text-center text-[11px] leading-tight font-semibold ${
                  active ? 'text-brand-600' : 'text-slate-500'
                }`}
              >
                <span className="relative flex items-center justify-center">
                  <Icon icon={n.icon} size={24} />
                  <Badge
                    n={n.badge ? badges[n.badge] : 0}
                    className="absolute -right-2.5 -top-1 border-2 border-white"
                  />
                </span>
                {t(n.label)}
              </NavLink>
            )
          })}
        </nav>
      </div>
    </AuthCtx.Provider>
  )
}
