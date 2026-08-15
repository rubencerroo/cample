import { useState } from 'react'
import { api } from './api'
import { useAuth } from './App'
import { ErrorBox } from './ui'
import { useT } from './i18n'

/**
 * Las cuentas creadas antes del teléfono se quedaron sin él, y sin teléfono no se les
 * encuentra desde la agenda. Este aviso lo pide una vez; si dicen «ahora no», no vuelve
 * en un mes. Nunca sale a quien ya lo tiene puesto.
 */
const OCULTO = 'cample_telefono_oculto'
const UN_MES = 30 * 24 * 60 * 60 * 1000

/** Para que App no apile dos ventanas encima de otra. */
export const telefonoPendiente = (u: { hasPhone?: boolean }) =>
  !u.hasPhone && Date.now() >= Number(localStorage.getItem(OCULTO) || 0)

export default function CompletarPerfil() {
  const { user, setUser } = useAuth()
  const t = useT()
  const [tel, setTel] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [cerrado, setCerrado] = useState(
    () => Date.now() < Number(localStorage.getItem(OCULTO) || 0),
  )

  if (user.hasPhone || cerrado) return null

  const luego = () => {
    localStorage.setItem(OCULTO, String(Date.now() + UN_MES))
    setCerrado(true)
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.setPhone(tel.trim())
      setUser({ ...user, hasPhone: true })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <form onSubmit={guardar} className="w-full max-w-md space-y-4 rounded-t-3xl bg-white p-5 sm:rounded-3xl">
        <h2 className="text-xl font-extrabold">{t('phonePrompt.title')}</h2>
        <p className="text-slate-600">{t('phonePrompt.text')}</p>

        <div>
          <label className="label" htmlFor="tel-nuevo">{t('settings.phone')}</label>
          <input
            id="tel-nuevo"
            className="input"
            type="tel"
            inputMode="tel"
            placeholder="600 123 456"
            value={tel}
            onChange={(e) => setTel(e.target.value)}
            autoFocus
          />
        </div>

        <ErrorBox>{error}</ErrorBox>

        <button className="btn-primary w-full" disabled={busy || !tel.trim()}>
          {t('common.save')}
        </button>
        <button type="button" className="btn-ghost w-full" onClick={luego}>
          {t('phonePrompt.later')}
        </button>
      </form>
    </div>
  )
}
