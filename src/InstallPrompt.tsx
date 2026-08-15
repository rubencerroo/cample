import { useEffect, useState } from 'react'
import { useT } from './i18n'

/**
 * Invitación a instalar Cample en el móvil. En Android el navegador nos deja lanzar el
 * instalador de verdad (`beforeinstallprompt`); en iPhone no existe esa API, así que
 * solo se puede explicar el gesto (Compartir → Añadir a pantalla de inicio).
 * Si ya está instalada no aparece nunca, y al cerrarla no vuelve en un mes.
 */

const OCULTO = 'cample_instalar_oculto'
const UN_MES = 30 * 24 * 60 * 60 * 1000

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<unknown> }

const yaInstalada = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true

const esIphone = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
const esMovil = () => esIphone() || /android/i.test(navigator.userAgent)

export default function InstallPrompt() {
  const t = useT()
  const [evento, setEvento] = useState<PromptEvent | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (yaInstalada() || !esMovil()) return
    const hasta = Number(localStorage.getItem(OCULTO) || 0)
    if (Date.now() < hasta) return

    const onPrompt = (e: Event) => {
      e.preventDefault()
      setEvento(e as PromptEvent)
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)

    // En iPhone no llega ningún evento: se enseña el aviso pasados unos segundos.
    const t = esIphone() ? setTimeout(() => setVisible(true), 4000) : undefined
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      if (t) clearTimeout(t)
    }
  }, [])

  if (!visible) return null

  const cerrar = () => {
    localStorage.setItem(OCULTO, String(Date.now() + UN_MES))
    setVisible(false)
  }

  const instalar = async () => {
    if (!evento) return
    await evento.prompt()
    localStorage.setItem(OCULTO, String(Date.now() + UN_MES))
    setVisible(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <div className="w-full max-w-md space-y-4 rounded-t-3xl bg-white p-5 sm:rounded-3xl">
        <div className="flex items-center gap-3">
          <img src="/icon.svg" alt="" className="h-12 w-12 rounded-2xl" />
          <div>
            <h2 className="text-xl font-extrabold">{t('install.title')}</h2>
            <p className="text-slate-600">{t('install.text')}</p>
          </div>
        </div>

        {evento ? (
          <button className="btn-primary w-full" onClick={instalar}>
            {t('install.button')}
          </button>
        ) : (
          <ol className="space-y-2 rounded-2xl bg-slate-50 px-4 py-3 text-slate-700">
            <li>{t('install.ios1')}</li>
            <li>{t('install.ios2')}</li>
          </ol>
        )}

        <button className="btn-ghost w-full" onClick={cerrar}>
          {t('install.later')}
        </button>
      </div>
    </div>
  )
}
