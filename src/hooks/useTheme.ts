import { useCallback, useEffect, useState } from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = Exclude<ThemePreference, 'system'>

export const THEME_STORAGE_KEY = 'onevibe-theme'

const isThemePreference = (value: string | null): value is ThemePreference =>
  value === 'light' || value === 'dark' || value === 'system'

export const getStoredTheme = (): ThemePreference => {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isThemePreference(stored) ? stored : 'system'
  } catch {
    return 'system'
  }
}

const systemTheme = (): ResolvedTheme =>
  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'

const applyTheme = (preference: ThemePreference) => {
  const resolved = preference === 'system' ? systemTheme() : preference
  const root = document.documentElement
  root.dataset.theme = resolved
  root.dataset.themePreference = preference
  root.style.colorScheme = resolved
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  const themeColor = getComputedStyle(root).getPropertyValue('--surface-canvas').trim()
  if (themeColor) meta?.setAttribute('content', themeColor)
  return resolved
}

export const useTheme = () => {
  const [preference, setPreferenceState] = useState<ThemePreference>(getStoredTheme)
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
  )

  useEffect(() => {
    setResolvedTheme(applyTheme(preference))
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onSystemChange = () => {
      if (preference === 'system') setResolvedTheme(applyTheme('system'))
    }
    media.addEventListener('change', onSystemChange)
    return () => media.removeEventListener('change', onSystemChange)
  }, [preference])

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next)
    try { window.localStorage.setItem(THEME_STORAGE_KEY, next) } catch { /* Storage may be disabled. */ }
  }, [])

  return { preference, resolvedTheme, setPreference }
}
