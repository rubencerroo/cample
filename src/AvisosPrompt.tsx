import { useEffect, useState } from 'react'
import { activarPush, esIphone, estadoPush, instalada, pushSoportado } from './push'
import { api } from './api'
import { useT } from './i18n'

/**
 * La pantalla propia que explica los avisos **antes** de que salga el cuadro del navegador.
 *
 * El cuadro del sistema es feo y no explica nada, y solo se puede enseñar una vez: quien le dé a
 * «Bloquear» ahí se queda sin avisos para siempre. Así que primero se cuenta qué va a recibir.
 *
 * En iPhone no aparece si la app no está instalada, porque allí el push no existe fuera de la
 * pantalla de inicio. Si dicen «ahora no», no vuelve en un mes.
 */
const OCULTO = 'cample_avisos_oculto'
const UN_MES = 30 * 24 * 60 * 60 * 1000

/** Para que App no apile dos ventanas encima de otra. */
export const avisosPendientes = () =>
  pushSoportado() &&
  Notification.permission === 'default' &&
  (!esIphone() || instalada()) &&
  Date.now() >= Number(localStorage.getItem(OCULTO) || 0)

export default function AvisosPrompt() {
  const t = useT()
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!avisosPendientes()) return
    // Sin claves en el servidor no hay nada que ofrecer.
    let vivo = true
    api
      .pushKey()
      .then(({ key }) => key && vivo && setVisible(true))
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [])

  if (!visible) return null

  const luego = () => {
    localStorage.setItem(OCULTO, String(Date.now() + UN_MES))
    setVisible(false)
  }

  const activar = async () => {
    setBusy(true)
    try {
      await activarPush()
    } finally {
      // Salga como salga, esta ventana no vuelve a insistir: el navegador ya no preguntará más.
      localStorage.setItem(OCULTO, String(Date.now() + UN_MES))
      setVisible(false)
      setBusy(false)
      void estadoPush()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <div className="w-full max-w-md space-y-4 rounded-t-3xl bg-white p-5 sm:rounded-3xl">
        <h2 className="text-xl font-extrabold">{t('push.title')}</h2>
        <p className="text-slate-600">{t('push.text')}</p>
        <ul className="space-y-2 rounded-2xl bg-slate-50 px-4 py-3 text-slate-700">
          <li>{t('push.item1')}</li>
          <li>{t('push.item2')}</li>
          <li>{t('push.item3')}</li>
        </ul>
        <p className="text-sm text-slate-500">{t('push.calm')}</p>
        <button className="btn-primary w-full" disabled={busy} onClick={activar}>
          {t('push.enable')}
        </button>
        <button type="button" className="btn-ghost w-full" onClick={luego}>
          {t('push.later')}
        </button>
      </div>
    </div>
  )
}
