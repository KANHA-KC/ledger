import i18n from 'i18next'
import ICU from 'i18next-icu'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import hi from './hi.json'

// All UI strings live in these files (ICU message format). Adding Chhattisgarhi = adding a file.
export const LANGS = { hi: 'हिंदी', en: 'English' } as const

const saved = (() => {
  try {
    return typeof window !== 'undefined' ? localStorage.getItem('lang') : null
  } catch {
    return null
  }
})()

i18n
  .use(ICU)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, hi: { translation: hi } },
    lng: saved === 'en' || saved === 'hi' ? saved : 'hi',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  })

export function setLanguage(lang: 'hi' | 'en') {
  i18n.changeLanguage(lang)
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('lang', lang)
    }
  } catch {
    /* private mode */
  }
}

if (typeof document !== 'undefined') {
  document.documentElement.lang = i18n.language
}

export default i18n
