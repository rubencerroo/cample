import { createContext, useContext, useEffect, useState } from 'react'
import { es } from './locales/es'
import { en } from './locales/en'
import { fr } from './locales/fr'

export type Lang = 'es' | 'en' | 'fr'
export const LANGS: { code: Lang; label: string }[] = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
]

const DICTS: Record<Lang, Record<string, string>> = { es, en, fr }
const GUARDADO = 'cample_lang'

/** El idioma preferido del navegador o del sistema; español salvo que pidan otra cosa. */
function detectar(): Lang {
  const guardado = localStorage.getItem(GUARDADO) as Lang | null
  if (guardado && LANGS.some((l) => l.code === guardado)) return guardado
  for (const l of navigator.languages ?? [navigator.language]) {
    const base = (l ?? '').slice(0, 2).toLowerCase()
    const encontrado = LANGS.find((x) => x.code === base)
    if (encontrado) return encontrado.code
  }
  return 'es'
}

/**
 * El idioma también se guarda fuera de React: `money`, `birthdayLabel` y el cliente HTTP
 * (que manda `Accept-Language` para que los errores del servidor vengan traducidos) lo
 * necesitan sin tener contexto a mano.
 */
let actual: Lang = 'es'
export const getLang = (): Lang => actual
const LOCALES: Record<Lang, string> = { es: 'es-ES', en: 'en-GB', fr: 'fr-FR' }
export const localeOf = (l: Lang = actual) => LOCALES[l]

type Vars = Record<string, string | number>

/** Traduce una clave. Los huecos van como {nombre}. Si falta, se devuelve la clave: se ve. */
export function translate(lang: Lang, key: string, vars?: Vars): string {
  const plantilla = DICTS[lang][key] ?? DICTS.es[key] ?? key
  if (!vars) return plantilla
  return plantilla.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m))
}

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (key: string, vars?: Vars) => string }
const I18nCtx = createContext<Ctx>(null!)

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    actual = detectar()
    return actual
  })

  useEffect(() => {
    actual = lang
    document.documentElement.lang = lang
  }, [lang])

  const setLang = (l: Lang) => {
    localStorage.setItem(GUARDADO, l)
    actual = l
    setLangState(l)
  }

  const t = (key: string, vars?: Vars) => translate(lang, key, vars)
  return <I18nCtx.Provider value={{ lang, setLang, t }}>{children}</I18nCtx.Provider>
}

export const useI18n = () => useContext(I18nCtx)
export const useT = () => useContext(I18nCtx).t
