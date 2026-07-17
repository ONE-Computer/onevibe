import { createContext } from 'react'
import type { TenantThemeConfig } from '../types'

export type ThemeContextValue = {
  config: TenantThemeConfig | null
  source: 'base' | 'tenant'
  customized: boolean
  isLoading: boolean
  error: Error | null
  refresh: () => Promise<unknown>
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)
export const themeQueryKey = (scopeKey: string = 'local') => ['theme', 'current', scopeKey] as const
