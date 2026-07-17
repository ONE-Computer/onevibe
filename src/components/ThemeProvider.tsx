import { useEffect, useMemo, type PropsWithChildren } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getCurrentTenantTheme } from '../lib/api'
import type { TenantThemeConfig } from '../types'
import { ThemeContext, themeQueryKey, type ThemeContextValue } from '../lib/theme'
import { useTenantTheme } from '../hooks/useTenantTheme'

const themeVariableMap = (config: TenantThemeConfig): Record<string, string> => {
  const tokens = config.tokens ?? {}
  const variables: Record<string, string | undefined> = {
    '--onevibe-theme-color-brand-primary': tokens.colorBrandPrimary,
    '--onevibe-theme-color-brand-secondary': tokens.colorBrandSecondary,
    '--onevibe-theme-color-bg-page': tokens.colorBgPage,
    '--onevibe-theme-color-bg-surface': tokens.colorBgSurface,
    '--onevibe-theme-color-nav-bg': tokens.colorNavBg,
    '--onevibe-theme-color-nav-text': tokens.colorNavText,
    '--onevibe-theme-color-text-primary': tokens.colorTextPrimary,
    '--onevibe-theme-color-text-secondary': tokens.colorTextSecondary,
    '--onevibe-theme-color-border-default': tokens.colorBorderDefault,
    '--onevibe-theme-font-ui': tokens.fontUi,
    '--onevibe-theme-radius-base': tokens.radiusBase,
    '--onevibe-theme-radius-button': tokens.radiusButton,
  }
  return Object.fromEntries(Object.entries(variables).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
}

const applyThemeConfig = (config: TenantThemeConfig | null, customized: boolean) => {
  const root = document.documentElement
  const applied = new Set<string>()
  if (config) {
    for (const [name, value] of Object.entries(themeVariableMap(config))) {
      root.style.setProperty(name, value)
      applied.add(name)
    }
    root.dataset.tenantTheme = config.tenantId
    root.dataset.tenantThemeCustomized = String(customized)
  } else {
    delete root.dataset.tenantTheme
    delete root.dataset.tenantThemeCustomized
  }
  return () => {
    for (const name of applied) root.style.removeProperty(name)
    delete root.dataset.tenantTheme
    delete root.dataset.tenantThemeCustomized
  }
}

const isSafeThemeAssetUrl = (value: string) => value.startsWith('/') && !value.startsWith('//') || /^https:\/\//i.test(value)

export const ThemeSlot = ({ name, children }: PropsWithChildren<{ name: string }>) => {
  const { config } = useTenantTheme()
  if (name !== 'brand-logo' || !config?.brand?.logoUrl || !isSafeThemeAssetUrl(config.brand.logoUrl)) return <>{children}</>
  return <img className="tenant-brand-logo" src={config.brand.logoUrl} alt={config.brand.logoAlt ?? config.brand.brandName ?? config.tenantName} referrerPolicy="no-referrer" />
}

export const ThemeProvider = ({ children, scopeKey = 'local' }: PropsWithChildren<{ scopeKey?: string }>) => {
  const query = useQuery({ queryKey: themeQueryKey(scopeKey), queryFn: getCurrentTenantTheme, retry: false, staleTime: 60_000, refetchOnWindowFocus: false })
  const config = query.data?.config ?? null
  useEffect(() => applyThemeConfig(config, query.data?.customized ?? false), [config, query.data?.customized])
  const value = useMemo<ThemeContextValue>(() => ({
    config, source: query.data?.source ?? 'base', customized: query.data?.customized ?? false,
    isLoading: query.isLoading, error: query.error instanceof Error ? query.error : null, refresh: query.refetch,
  }), [config, query.data?.customized, query.data?.source, query.error, query.isLoading, query.refetch])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
