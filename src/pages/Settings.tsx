import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../App'
import { Avatar, ErrorBox, birthdayLabel, fileToAvatarDataUrl, mascaraCumple, useDialogos } from '../ui'
import { LANGS, useI18n, useT } from '../i18n'
import { ICON, Icon } from '../icons'

export default function Settings() {
  const { user, setUser, logout, showGuide } = useAuth()
  const { lang, setLang } = useI18n()
  const t = useT()
  const { confirmar } = useDialogos()
  const [f, setF] = useState({ displayName: user.displayName, bio: user.bio, birthday: user.birthday ?? '' })
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [pw, setPw] = useState({ current: '', next: '' })
  const [photoBusy, setPhotoBusy] = useState(false)
  const [feedback, setFeedback] = useState(false)
  const [tel, setTel] = useState('')
  const [abierto, setAbierto] = useState<string | null>(null)

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      const r = await api.updateMe({ ...f, birthday: f.birthday || null })
      setUser(r.user)
      setMsg(t('settings.saved'))
      setTimeout(() => setMsg(''), 2000)
    } catch (err: any) {
      setError(err.message)
    }
  }

  /** El número no se puede leer de vuelta (solo se guarda su hash), así que el campo va vacío. */
  async function guardarTel(valor: string) {
    setError('')
    try {
      const r = await api.setPhone(valor)
      setUser({ ...user, hasPhone: r.hasPhone })
      setTel('')
      setMsg(valor ? t('settings.phoneSaved') : t('settings.phoneRemoved'))
      setTimeout(() => setMsg(''), 2000)
    } catch (err: any) {
      setError(err.message)
    }
  }

  const savePhone = (e: React.FormEvent) => {
    e.preventDefault()
    guardarTel(tel.trim())
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await api.changePassword(pw.current, pw.next)
      setPw({ current: '', next: '' })
      setMsg(t('settings.passwordChanged'))
      setTimeout(() => setMsg(''), 2000)
    } catch (err: any) {
      setError(err.message)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <Avatar user={user} size={72} />
          {photoBusy && (
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/55">
              <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-white/40 border-t-white" />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold">{user.displayName}</h1>
          <p className="text-slate-500">@{user.username}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <label
              className={`btn-ghost !py-1.5 !px-3 !text-sm ${
                photoBusy ? 'pointer-events-none opacity-60' : 'cursor-pointer'
              }`}
            >
              {photoBusy && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-500" />
              )}
              {photoBusy
                ? t('settings.uploadingPhoto')
                : user.hasAvatar
                  ? t('settings.changePhoto')
                  : t('settings.setPhoto')}
              <input
                type="file"
                accept="image/*,.heic,.heif"
                className="hidden"
                disabled={photoBusy}
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (!file) return
                  setPhotoBusy(true)
                  setError('')
                  try {
                    const r = await api.setAvatar(await fileToAvatarDataUrl(file))
                    setUser(r.user)
                    setMsg(t('settings.photoUpdated'))
                    setTimeout(() => setMsg(''), 2500)
                  } catch (err: any) {
                    setError(err.message ?? t('settings.photoError'))
                  } finally {
                    setPhotoBusy(false)
                  }
                }}
              />
            </label>
            {user.hasAvatar && !photoBusy && (
              <button
                className="btn-ghost !py-1.5 !px-3 !text-sm"
                onClick={() =>
                  api
                    .removeAvatar()
                    .then((r) => setUser(r.user))
                    .catch((e) => setError(e.message))
                }
              >
                {t('common.remove')}
              </button>
            )}
          </div>
        </div>
      </div>

      <ErrorBox>{error}</ErrorBox>
      {msg && <div className="rounded-2xl bg-green-50 border border-green-200 px-4 py-3 text-green-700">{msg}</div>}

      <Grupo titulo={t('settings.groupAccount')}>
        <Fila
          id="datos"
          abierto={abierto}
          setAbierto={setAbierto}
          icono={ICON.persona}
          titulo={t('settings.yourData')}
          resumen={t('settings.dataSummary')}
        >
          <form onSubmit={saveProfile} className="space-y-4">
            <div>
              <label className="label" htmlFor="dn">{t('settings.name')}</label>
              <input id="dn" className="input" value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="bio">{t('settings.bio')}</label>
              <input id="bio" className="input" value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="bd">{t('settings.birthday')}</label>
              <input
                id="bd"
                className="input"
                inputMode="numeric"
                placeholder={t('settings.birthdayPlaceholder')}
                value={f.birthday}
                onChange={(e) => setF({ ...f, birthday: mascaraCumple(e.target.value) })}
              />
              <p className="mt-1.5 text-sm text-slate-500">
                {birthdayLabel(f.birthday)
                  ? t('settings.birthdayHintSet', { date: birthdayLabel(f.birthday)! })
                  : t('settings.birthdayHint')}
              </p>
            </div>
            <button className="btn-primary w-full">{t('common.save')}</button>
          </form>
        </Fila>

        <Fila
          id="telefono"
          abierto={abierto}
          setAbierto={setAbierto}
          icono={ICON.telefono}
          titulo={t('settings.phoneTitle')}
          resumen={user.hasPhone ? t('settings.phoneOn') : t('settings.phoneOff')}
        >
          <form onSubmit={savePhone} className="space-y-4">
            <p className="text-slate-600">{t('settings.phoneIntro')}</p>
            {user.hasPhone && (
              <p className="rounded-2xl bg-green-50 border border-green-200 px-4 py-3 text-green-700">
                {t('settings.phoneSet')}
              </p>
            )}
            <div>
              <label className="label" htmlFor="tel">{t('settings.phone')}</label>
              <input
                id="tel"
                className="input"
                type="tel"
                inputMode="tel"
                placeholder="600 123 456"
                value={tel}
                onChange={(e) => setTel(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <button className="btn-primary flex-1" disabled={!tel.trim()}>
                {t('settings.savePhone')}
              </button>
              {user.hasPhone && (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={async () => {
                    const ok = await confirmar({
                      title: t('settings.confirmRemovePhone'),
                      confirmLabel: t('common.remove'),
                      danger: true,
                    })
                    if (ok) guardarTel('')
                  }}
                >
                  {t('common.remove')}
                </button>
              )}
            </div>
          </form>
        </Fila>

        <Fila
          id="clave"
          abierto={abierto}
          setAbierto={setAbierto}
          icono={ICON.llave}
          titulo={t('settings.passwordTitle')}
          resumen={t('settings.passwordSummary')}
        >
          <form onSubmit={savePassword} className="space-y-4">
            <div>
              <label className="label" htmlFor="cp">{t('settings.currentPassword')}</label>
              <input id="cp" type="password" className="input" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" />
            </div>
            <div>
              <label className="label" htmlFor="np">{t('settings.newPassword')}</label>
              <input id="np" type="password" className="input" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" />
            </div>
            <button className="btn-primary w-full">{t('common.change')}</button>
          </form>
        </Fila>
      </Grupo>

      <Grupo titulo={t('settings.groupApp')}>
        <Fila
          id="idioma"
          abierto={abierto}
          setAbierto={setAbierto}
          icono={ICON.idioma}
          titulo={t('settings.language')}
          resumen={LANGS.find((l) => l.code === lang)?.label ?? ''}
        >
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {LANGS.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => setLang(l.code)}
                  className={`rounded-2xl border py-3 font-semibold ${
                    lang === l.code ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-600'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <p className="text-sm text-slate-500">{t('settings.languageHint')}</p>
          </div>
        </Fila>

        <Fila
          id="guia"
          abierto={abierto}
          setAbierto={setAbierto}
          icono={ICON.ayuda}
          titulo={t('settings.guideTitle')}
          resumen={t('settings.guideSummary')}
        >
          <div className="space-y-3">
            <p className="text-slate-600">{t('settings.guideText')}</p>
            <button className="btn-primary w-full" onClick={showGuide}>
              {t('settings.guideButton')}
            </button>
          </div>
        </Fila>
      </Grupo>

      <Grupo titulo={t('settings.groupHelp')}>
        <Fila
          id="buzon"
          abierto={abierto}
          setAbierto={setAbierto}
          icono={ICON.buzon}
          titulo={t('settings.feedbackTitle')}
          resumen={t('settings.feedbackSummary')}
        >
          <div className="space-y-3">
            <p className="text-slate-600">{t('settings.feedbackText')}</p>
            <button
              className="btn-primary w-full inline-flex items-center justify-center gap-2"
              onClick={() => setFeedback(true)}
            >
              <Icon icon={ICON.buzon} size={20} />
              {t('settings.feedbackButton')}
            </button>
          </div>
        </Fila>

        <Fila
          id="privacidad"
          abierto={abierto}
          setAbierto={setAbierto}
          icono={ICON.privacidad}
          titulo={t('settings.privacyTitle')}
          resumen={t('settings.privacySummary')}
        >
          <p className="text-slate-600">{t('settings.privacyText')}</p>
        </Fila>
      </Grupo>

      {feedback && <FeedbackDialog onClose={() => setFeedback(false)} />}

      {user.isAdmin && (
        <Link to="/admin" className="btn-ghost w-full">
          {t('settings.resets')}
        </Link>
      )}

      <button className="btn-danger w-full" onClick={logout}>
        {t('settings.logout')}
      </button>
    </div>
  )
}

/** Un bloque con su rótulo, como las secciones de los ajustes del móvil. */
function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-sm font-bold uppercase tracking-wide text-slate-500">{titulo}</h2>
      <div className="divide-y divide-slate-200 overflow-hidden rounded-3xl border border-slate-200 bg-white">
        {children}
      </div>
    </section>
  )
}

/**
 * Fila plegable. Solo una abierta a la vez: la pantalla se queda corta y se ve de un vistazo
 * todo lo que hay, en vez de una lista infinita de formularios abiertos.
 */
function Fila({
  id,
  abierto,
  setAbierto,
  icono,
  titulo,
  resumen,
  children,
}: {
  id: string
  abierto: string | null
  setAbierto: (v: string | null) => void
  icono: (typeof ICON)[keyof typeof ICON]
  titulo: string
  resumen?: string
  children: React.ReactNode
}) {
  const activo = abierto === id
  return (
    <div>
      <button
        type="button"
        aria-expanded={activo}
        onClick={() => setAbierto(activo ? null : id)}
        className={`flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left ${
          activo ? 'bg-brand-50' : 'hover:bg-slate-50'
        }`}
      >
        <Icon icon={icono} size={26} className="shrink-0 text-slate-500" />
        <span className="min-w-0 flex-1">
          <span className={`block font-bold ${activo ? 'text-brand-700' : ''}`}>{titulo}</span>
          {resumen && <span className="block truncate text-sm text-slate-500">{resumen}</span>}
        </span>
        {/* Abrir/cerrar: el icono cambia y morphicons anima la transición él solo. */}
        <Icon icon={activo ? ICON.arriba : ICON.abajo} size={22} className="shrink-0 text-slate-400" />
      </button>
      {activo && <div className="border-t border-slate-100 px-4 py-4">{children}</div>}
    </div>
  )
}

/**
 * Buzón de fallos y sugerencias. Lo leen los administradores, así que el aviso recuerda no
 * contar aquí qué regalo lleva uno a quién: sería la única forma de que se colara por esta vía.
 */
function FeedbackDialog({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<'bug' | 'idea'>('bug')
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const t = useT()

  async function send(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.sendFeedback(kind, text)
      setEnviado(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <form
        onSubmit={send}
        className="max-h-[92dvh] w-full max-w-lg space-y-4 overflow-y-auto rounded-t-3xl bg-white p-5 sm:rounded-3xl"
      >
        {enviado ? (
          <>
            <h2 className="text-xl font-extrabold">{t('feedback.thanks')}</h2>
            <p className="text-slate-600">{t('feedback.thanksText')}</p>
            <button type="button" className="btn-primary w-full" onClick={onClose}>
              {t('common.close')}
            </button>
          </>
        ) : (
          <>
            <h2 className="text-xl font-extrabold">{t('feedback.title')}</h2>

            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ['bug', t('feedback.bug'), ICON.fallo],
                  ['idea', t('feedback.idea'), ICON.idea],
                ] as const
              ).map(([k, l, ico]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`flex items-center justify-center gap-2 rounded-2xl border py-3 font-semibold ${
                    kind === k ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-600'
                  }`}
                >
                  <Icon icon={ico} size={20} />
                  {l}
                </button>
              ))}
            </div>

            <div>
              <label className="label" htmlFor="fb">
                {kind === 'bug' ? t('feedback.bugLabel') : t('feedback.ideaLabel')}
              </label>
              <textarea
                id="fb"
                className="input min-h-32"
                placeholder={
                  kind === 'bug' ? t('feedback.bugPlaceholder') : t('feedback.ideaPlaceholder')
                }
                value={text}
                onChange={(e) => setText(e.target.value)}
                required
                autoFocus
              />
            </div>

            <p className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
              {t('feedback.warning')}
            </p>

            <ErrorBox>{error}</ErrorBox>

            <div className="flex gap-2 pt-1">
              <button type="button" className="btn-ghost flex-1" onClick={onClose}>
                {t('common.cancel')}
              </button>
              <button className="btn-primary flex-1" disabled={busy}>
                {t('common.send')}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  )
}
