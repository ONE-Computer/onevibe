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

const hexToRgb = (value: string): [number, number, number] | null => {
  const match = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(value.trim())
  if (!match) return null
  return [0, 1, 2].map((index) => Number.parseInt(match[1].slice(index * 2, index * 2 + 2), 16)) as [number, number, number]
}

export const relativeLuminance = (value: string): number | null => {
  const rgb = hexToRgb(value)
  if (!rgb) return null
  const channels = rgb.map((channel) => {
    const normalized = channel / 255
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

export const contrastRatio = (foreground: string, background: string): number | null => {
  const foregroundLuminance = relativeLuminance(foreground)
  const backgroundLuminance = relativeLuminance(background)
  if (foregroundLuminance === null || backgroundLuminance === null) return null
  const lighter = Math.max(foregroundLuminance, backgroundLuminance)
  const darker = Math.min(foregroundLuminance, backgroundLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

export const themeContrastAttributes = (config: TenantThemeConfig) => {
  const tokens = config.tokens ?? {}
  const navRatio = tokens.colorNavText && tokens.colorNavBg ? contrastRatio(tokens.colorNavText, tokens.colorNavBg) : null
  const pageRatio = tokens.colorTextPrimary && tokens.colorBgPage ? contrastRatio(tokens.colorTextPrimary, tokens.colorBgPage) : null
  return {
    navContrast: navRatio !== null && navRatio >= 4.5 ? (relativeLuminance(tokens.colorNavText!)! < relativeLuminance(tokens.colorNavBg!)! ? 'light' : 'dark') : 'unknown',
    pageContrast: pageRatio !== null && pageRatio >= 4.5 ? (relativeLuminance(tokens.colorTextPrimary!)! < relativeLuminance(tokens.colorBgPage!)! ? 'light' : 'dark') : 'unknown',
    navRatio,
    pageRatio,
  } as const
}
