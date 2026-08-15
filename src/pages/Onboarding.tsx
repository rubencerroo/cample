import { useState } from 'react'
import { api } from '../api'
import { LANGS, useI18n, useT } from '../i18n'

/** Súbela solo si la guía cambia de verdad: quien tenga un número menor la volverá a ver. */
export const ONBOARDING_VERSION = 5

type Paso = { icono: string; clave: string; puntos: number; idiomas?: boolean }

/** Los textos viven en los diccionarios (`onboarding.N.*`); aquí solo el orden y los iconos. */
const PASOS: Paso[] = [
  // El primero es el de idioma: si alguien abre la app en un idioma que no es el suyo, lo
  // primero que ve es cómo arreglarlo, no nueve pantallas que no entiende.
  { icono: '\u{1F310}', clave: '0', puntos: 1, idiomas: true },
  { icono: '\u{1F381}', clave: '1', puntos: 2 },
  { icono: '\u{1F4DD}', clave: '2', puntos: 3 },
  { icono: '\u{1F512}', clave: '3', puntos: 3 },
  { icono: '4\uFE0F\u20E3', clave: '4', puntos: 2 },
  { icono: '\u{1F92B}', clave: '5', puntos: 2 },
  { icono: '\u{1F64C}', clave: '6', puntos: 3 },
  { icono: '\u{1F91D}', clave: '7', puntos: 2 },
  { icono: '\u{1F465}', clave: '8', puntos: 2 },
  { icono: '\u{1F4AC}', clave: '9', puntos: 2 },
]

export default function Onboarding({ onClose }: { onClose: () => void }) {
  const t = useT()
  const { lang, setLang } = useI18n()
  const [i, setI] = useState(0)
  const paso = PASOS[i]
  const ultimo = i === PASOS.length - 1
  const puntos = Array.from({ length: paso.puntos }, (_, n) => t(`onboarding.${paso.clave}.p${n + 1}`))

  function cerrar() {
    api.seenOnboarding(ONBOARDING_VERSION).catch(() => {})
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[94dvh] w-full max-w-lg flex-col rounded-t-3xl bg-white sm:rounded-3xl">
        <div className="flex-1 overflow-y-auto p-6 text-center">
          <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-brand-50 text-5xl">
            <span aria-hidden>{paso.icono}</span>
          </div>
          <h2 className="text-2xl font-extrabold">{t(`onboarding.${paso.clave}.title`)}</h2>
          <p className="mt-2 text-lg leading-relaxed text-slate-600">
            {t(`onboarding.${paso.clave}.text`)}
          </p>

          {paso.idiomas && (
            <div className="mt-4 grid grid-cols-3 gap-2">
              {LANGS.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => setLang(l.code)}
                  className={`rounded-2xl border py-3 font-semibold ${
                    lang === l.code
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-slate-300 text-slate-600'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          )}

          {puntos.length > 0 && (
            <ul className="mt-4 space-y-2 text-left">
              {puntos.map((p) => (
                <li key={p} className="flex items-start gap-2 rounded-2xl bg-slate-50 px-4 py-3">
                  <span className="text-brand-500" aria-hidden>
                    ✓
                  </span>
                  <span className="text-slate-700">{p}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3 border-t border-slate-100 p-5">
          <div className="flex justify-center gap-1.5" aria-hidden>
            {PASOS.map((_, n) => (
              <span
                key={n}
                className={`h-2 rounded-full transition-all ${
                  n === i ? 'w-6 bg-brand-500' : 'w-2 bg-slate-300'
                }`}
              />
            ))}
          </div>

          <div className="flex gap-2">
            {i > 0 && (
              <button className="btn-ghost flex-1" onClick={() => setI(i - 1)}>
                {t('onboarding.back')}
              </button>
            )}
            <button className="btn-primary flex-[2]" onClick={() => (ultimo ? cerrar() : setI(i + 1))}>
              {ultimo ? t('onboarding.start') : t('onboarding.next')}
            </button>
          </div>

          {!ultimo && (
            <button className="w-full text-sm font-semibold text-slate-500 underline" onClick={cerrar}>
              {t('onboarding.skip')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
