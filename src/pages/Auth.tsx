import { useState } from 'react'
import { api, User } from '../api'
import { ErrorBox } from '../ui'
import { useT } from '../i18n'

export default function Auth({ onAuth }: { onAuth: (u: User) => void }) {
  const t = useT()
  const [forgot, setForgot] = useState(false)
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [form, setForm] = useState({ username: '', password: '', displayName: '', document: '', phone: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const r =
        mode === 'login'
          ? await api.login(form.username, form.password)
          : await api.register(form)
      onAuth(r.user)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-5 py-10">
      <div className="text-center">
        <img src="/icon.svg" alt="" className="mx-auto mb-3 h-20 w-20 rounded-3xl shadow-lg shadow-brand-100" />
        <h1 className="text-4xl font-extrabold tracking-tight text-brand-600">Cample</h1>
        <p className="mt-2 text-slate-600">{t('auth.tagline')}</p>
      </div>

      {forgot && <Forgot onDone={() => setForgot(false)} />}

      <form onSubmit={submit} className={`card space-y-4 ${forgot ? 'hidden' : ''}`}>
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m)
                setError('')
              }}
              className={`rounded-xl py-2.5 font-semibold ${
                mode === m ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-600'
              }`}
            >
              {m === 'login' ? t('auth.login') : t('auth.register')}
            </button>
          ))}
        </div>

        {mode === 'register' && (
          <div>
            <label className="label" htmlFor="displayName">
              {t('auth.yourName')}
            </label>
            <input id="displayName" className="input" value={form.displayName} onChange={set('displayName')} autoComplete="name" required />
          </div>
        )}

        <div>
          <label className="label" htmlFor="username">
            {t('auth.username')}
          </label>
          <input
            id="username"
            className="input"
            value={form.username}
            onChange={set('username')}
            autoCapitalize="none"
            autoComplete="username"
            placeholder={t('auth.usernamePlaceholder')}
            required
          />
        </div>

        <div>
          <label className="label" htmlFor="password">
            {t('auth.password')}
          </label>
          <input
            id="password"
            type="password"
            className="input"
            value={form.password}
            onChange={set('password')}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
          />
        </div>

        {mode === 'register' && (
          <div>
            <label className="label" htmlFor="document">
              {t('auth.document')}
            </label>
            <input
              id="document"
              className="input"
              value={form.document}
              onChange={set('document')}
              autoCapitalize="characters"
              placeholder="12345678Z"
              required
            />
            <p className="mt-1.5 text-sm text-slate-500">{t('auth.documentHint')}</p>
          </div>
        )}

        {mode === 'register' && (
          <div>
            <label className="label" htmlFor="phone">
              {t('auth.phone')}
            </label>
            <input
              id="phone"
              className="input"
              type="tel"
              inputMode="tel"
              value={form.phone}
              onChange={set('phone')}
              placeholder="600 123 456"
            />
            <p className="mt-1.5 text-sm text-slate-500">{t('auth.phoneHint')}</p>
          </div>
        )}

        <ErrorBox>{error}</ErrorBox>

        <button className="btn-primary w-full" disabled={busy}>
          {busy ? t('common.wait') : mode === 'login' ? t('auth.login') : t('auth.createAccount')}
        </button>

        {mode === 'login' && (
          <button
            type="button"
            className="w-full text-center text-sm font-semibold text-brand-600 underline"
            onClick={() => setForgot(true)}
          >
            {t('auth.forgot')}
          </button>
        )}
      </form>
    </div>
  )
}

/** Recuperación en dos pasos: se pide, alguien de la familia lo aprueba y te dicta el código. */
function Forgot({ onDone }: { onDone: () => void }) {
  const t = useT()
  const [step, setStep] = useState<'ask' | 'code'>('ask')
  const [f, setF] = useState({ username: '', document: '', code: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value })

  async function run(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (step === 'ask') {
        await api.requestReset(f.username, f.document)
        setStep('code')
      } else {
        await api.confirmReset(f.username, f.code, f.password)
        setDone(true)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (done)
    return (
      <div className="card space-y-4 text-center">
        <p className="text-lg font-bold">{t('auth.reset.doneTitle')}</p>
        <p className="text-slate-600">{t('auth.reset.doneText')}</p>
        <button className="btn-primary w-full" onClick={onDone}>
          {t('auth.reset.goLogin')}
        </button>
      </div>
    )

  return (
    <form onSubmit={run} className="card space-y-4">
      <h2 className="text-xl font-extrabold">{t('auth.reset.title')}</h2>

      {step === 'ask' ? (
        <>
          <p className="text-slate-600">{t('auth.reset.intro')}</p>
          <div>
            <label className="label" htmlFor="fu">{t('auth.reset.username')}</label>
            <input id="fu" className="input" value={f.username} onChange={set('username')} autoCapitalize="none" required />
          </div>
          <div>
            <label className="label" htmlFor="fd">{t('auth.reset.document')}</label>
            <input id="fd" className="input" value={f.document} onChange={set('document')} autoCapitalize="characters" required />
          </div>
        </>
      ) : (
        <>
          <p className="rounded-2xl bg-brand-50 border border-brand-200 px-4 py-3 text-brand-900">
            {t('auth.reset.sent')}
          </p>
          <div>
            <label className="label" htmlFor="fc">{t('auth.reset.code')}</label>
            <input id="fc" className="input text-center text-xl tracking-widest" placeholder="ABCD-EFGH" value={f.code} onChange={set('code')} autoCapitalize="characters" required />
          </div>
          <div>
            <label className="label" htmlFor="fp">{t('auth.reset.newPassword')}</label>
            <input id="fp" type="password" className="input" value={f.password} onChange={set('password')} autoComplete="new-password" required />
          </div>
        </>
      )}

      <ErrorBox>{error}</ErrorBox>

      <button className="btn-primary w-full" disabled={busy}>
        {busy ? t('common.wait') : step === 'ask' ? t('auth.reset.ask') : t('auth.reset.confirm')}
      </button>
      <div className="flex justify-between text-sm font-semibold">
        <button type="button" className="text-slate-500 underline" onClick={onDone}>
          {t('common.back')}
        </button>
        {step === 'ask' && (
          <button type="button" className="text-brand-600 underline" onClick={() => setStep('code')}>
            {t('auth.reset.haveCode')}
          </button>
        )}
      </div>
    </form>
  )
}
