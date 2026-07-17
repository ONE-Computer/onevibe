import { useState, useCallback } from 'react'
import type { Locale } from '../lib/i18n'
import { t } from '../lib/i18n'
import type { I18nKey } from '../lib/i18n'

const STORAGE_KEY = 'onevibe_locale'

function readLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'zh' || stored === 'en') return stored
  } catch {}
  return 'en'
}

export function useLocale() {
  const [locale, setLocaleState] = useState<Locale>(readLocale)

  const setLocale = useCallback((next: Locale) => {
    try { localStorage.setItem(STORAGE_KEY, next) } catch {}
    setLocaleState(next)
  }, [])

  const translate = useCallback((key: I18nKey) => t(key, locale), [locale])

  return { locale, setLocale, t: translate }
}
