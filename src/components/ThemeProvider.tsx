import { useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getCurrentTenantTheme } from '../lib/api'
import { sanitizeSvg } from '../lib/svg-sanitize'
import type { TenantThemeConfig } from '../types'
import { ThemeContext, themeQueryKey, type ThemeContextValue } from '../lib/theme'
import { themeContrastAttributes } from '../lib/theme'
import { useTenantTheme } from '../hooks/useTenantTheme'

const safeThemeValue = (value: unknown, pattern: RegExp) => typeof value === 'string' && value.length <= 128 && pattern.test(value) ? value : undefined

const themeVariableMap = (config: TenantThemeConfig): Record<string, string> => {
  const tokens = config.tokens ?? {}
  const color = /^#[0-9a-f]{6,8}$/i
  const radius = /^(?:0|[0-9]{1,3}px)$/
  const font = /^(?:Inter|ui-sans-serif|system-ui|sans-serif)$/
  const variables: Record<string, string | undefined> = {
    '--surface-canvas': safeThemeValue(tokens.colorBgPage, color),
    '--surface-panel': safeThemeValue(tokens.colorBgSurface, color),
    '--surface-sidebar': safeThemeValue(tokens.colorNavBg, color),
    '--surface-raised': safeThemeValue(tokens.colorBgSurface, color),
    '--text-primary': safeThemeValue(tokens.colorTextPrimary, color),
    '--text-secondary': safeThemeValue(tokens.colorTextSecondary, color),
    '--text-muted': safeThemeValue(tokens.colorTextSecondary, color),
    '--text-faint': safeThemeValue(tokens.colorTextSecondary, color),
    '--accent': safeThemeValue(tokens.colorBrandPrimary, color),
    '--accent-strong': safeThemeValue(tokens.colorBrandSecondary ?? tokens.colorBrandPrimary, color),
    '--border-default': safeThemeValue(tokens.colorBorderDefault, color),
    '--border-subtle': safeThemeValue(tokens.colorBorderDefault, color),
    '--font-ui': safeThemeValue(tokens.fontUi, font),
    '--radius-asymmetric': safeThemeValue(tokens.radiusBase, radius),
    '--radius-14px': safeThemeValue(tokens.radiusButton, radius),
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
    const contrast = themeContrastAttributes(config)
    root.dataset.tenantNavContrast = contrast.navContrast
    root.dataset.tenantPageContrast = contrast.pageContrast
  } else {
    delete root.dataset.tenantTheme
    delete root.dataset.tenantThemeCustomized
    delete root.dataset.tenantNavContrast
    delete root.dataset.tenantPageContrast
  }
  return () => {
    for (const name of applied) root.style.removeProperty(name)
    delete root.dataset.tenantTheme
    delete root.dataset.tenantThemeCustomized
  }
}

const isSafeThemeAssetUrl = (value: string) => value.startsWith('/') && !value.startsWith('//') || /^https:\/\//i.test(value)

const loadThemeImage = async (url: string, integrity: string | undefined, signal: AbortSignal) => {
  const parsed = new URL(url, window.location.origin)
  if (!isSafeThemeAssetUrl(url) || parsed.protocol !== 'https:' && parsed.origin !== window.location.origin) throw new Error('Theme asset URL is not allowed')
  const response = await fetch(parsed.href, { credentials: 'omit', redirect: 'error', signal })
  if (!response.ok) throw new Error(`Theme asset returned HTTP ${response.status}`)
  const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
  if (!contentType?.startsWith('image/')) throw new Error('Theme asset must be an image')
  const declaredLength = Number(response.headers.get('content-length') ?? 0)
  if (declaredLength > 2 * 1024 * 1024) throw new Error('Theme asset exceeds the 2 MiB limit')
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > 2 * 1024 * 1024) throw new Error('Theme asset exceeds the 2 MiB limit')
  if (integrity) {
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    const actual = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
    if (actual.toLowerCase() !== integrity.toLowerCase()) throw new Error('Theme asset integrity check failed')
  }
  if (contentType === 'image/svg+xml') {
    const sanitized = sanitizeSvg(new TextDecoder().decode(bytes))
    return URL.createObjectURL(new Blob([sanitized], { type: contentType }))
  }
  return URL.createObjectURL(new Blob([bytes], { type: contentType }))
}

export const ThemeSlot = ({ name, children }: PropsWithChildren<{ name: string }>) => {
  const { config } = useTenantTheme()
  const url = name === 'brand-logo' ? config?.brand?.logoUrl : undefined
  const [assetUrl, setAssetUrl] = useState<string>()
  useEffect(() => {
    if (!url || !isSafeThemeAssetUrl(url)) { setAssetUrl(undefined); return }
    const controller = new AbortController()
    let objectUrl: string | undefined
    void loadThemeImage(url, config?.brand?.logoSha256, controller.signal).then((loadedUrl) => { objectUrl = loadedUrl; setAssetUrl(loadedUrl) }).catch(() => setAssetUrl(undefined))
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [config?.brand?.logoSha256, url])
  if (!assetUrl) return <>{children}</>
  return <img className="tenant-brand-logo" src={assetUrl} alt={config?.brand?.logoAlt ?? config?.brand?.brandName ?? config?.tenantName ?? 'Tenant'} />
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
