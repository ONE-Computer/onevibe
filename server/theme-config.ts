import { z } from 'zod'

const safeCssToken = (label: string, max = 96) => z.string().trim().min(1).max(max).refine((value) => {
  const lower = value.toLowerCase()
  return !/[<>;{}]/.test(value) && !lower.includes('url(') && !lower.includes('expression(') && !lower.includes('javascript:') && !lower.includes('!important') && !lower.includes('/*') && !lower.includes('*/')
}, `${label} contains unsafe CSS syntax`)

const safeColor = safeCssToken('Color', 24).refine((value) => /^#[0-9a-f]{6,8}$/i.test(value), 'Colors must be #RRGGBB or #RRGGBBAA')
const safeRadius = safeCssToken('Radius', 12).refine((value) => /^(?:0|[0-9]{1,3}px)$/.test(value), 'Radius must be 0 or a bounded pixel value')
const safeUrl = z.string().trim().max(512).refine((value) => value.startsWith('/') && !value.startsWith('//') || /^https:\/\//i.test(value), 'URL must be same-origin or HTTPS')
const boundedLabel = z.string().trim().min(1).max(120)

const tokenOverrides = z.object({
  colorBrandPrimary: safeColor.optional(),
  colorBrandSecondary: safeColor.optional(),
  colorBgPage: safeColor.optional(),
  colorBgSurface: safeColor.optional(),
  colorNavBg: safeColor.optional(),
  colorNavText: safeColor.optional(),
  colorTextPrimary: safeColor.optional(),
  colorTextSecondary: safeColor.optional(),
  colorBorderDefault: safeColor.optional(),
  fontUi: z.enum(['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']).optional(),
  radiusBase: safeRadius.optional(),
  radiusButton: safeRadius.optional(),
}).strict()

const featureCard = z.object({
  title: boundedLabel,
  description: z.string().trim().min(1).max(360),
  accent: z.enum(['brand', 'neutral', 'success', 'warning']).default('brand'),
}).strict()

const navigationItem = z.object({
  label: boundedLabel,
  href: safeUrl,
  external: z.boolean().default(false),
}).strict()

export const tenantThemeConfigSchema = z.object({
  schemaVersion: z.literal(1),
  tenantId: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
  tenantName: boundedLabel,
  tokens: tokenOverrides.default({}),
  brand: z.object({
    logoUrl: safeUrl.optional(),
    logoAlt: z.string().trim().max(160).optional(),
    brandName: boundedLabel.optional(),
  }).strict().default({}),
  homePage: z.object({
    heroHeadline: z.string().trim().max(180).optional(),
    heroSubheadline: z.string().trim().max(600).optional(),
    heroCtaLabel: boundedLabel.optional(),
    announcementBannerText: z.string().trim().max(240).optional(),
    announcementBannerUrl: safeUrl.optional(),
    announcementBannerVisible: z.boolean().default(false),
    featureCards: z.array(featureCard).max(12).default([]),
  }).strict().default({ announcementBannerVisible: false, featureCards: [] }),
  navigation: z.object({
    items: z.array(navigationItem).max(20).default([]),
    docsUrl: safeUrl.optional(),
    supportUrl: safeUrl.optional(),
  }).strict().default({ items: [] }),
  features: z.object({
    showComputerTab: z.boolean().default(true),
    showMcpMarketplace: z.boolean().default(true),
    showRuntimePicker: z.boolean().default(true),
    showDebugPanel: z.boolean().default(false),
  }).strict().default({ showComputerTab: true, showMcpMarketplace: true, showRuntimePicker: true, showDebugPanel: false }),
  compliance: z.object({
    privacyPolicyUrl: safeUrl.optional(),
    termsUrl: safeUrl.optional(),
  }).strict().default({}),
}).strict()

export type TenantThemeConfig = z.infer<typeof tenantThemeConfigSchema>

export type ThemeResolutionInput = {
  /** Server-derived organization/session scope; never a browser-supplied tenant id. */
  sessionTenantId?: string
  /** Explicit operator-selected deployment scope. */
  deploymentTenantId?: string
  /** Validated host-to-tenant allow-list, not arbitrary request data. */
  hostTenantAllowList?: Readonly<Record<string, string>>
  host?: string
  configs: Readonly<Record<string, TenantThemeConfig>>
  base: TenantThemeConfig
}

export type ThemeResolution = { config: TenantThemeConfig; source: 'session' | 'deployment' | 'host' | 'base' }

const configured = (configs: Readonly<Record<string, TenantThemeConfig>>, tenantId: string | undefined) => {
  if (!tenantId) return undefined
  const config = configs[tenantId]
  return config?.tenantId === tenantId ? config : undefined
}

export const resolveTenantTheme = (input: ThemeResolutionInput): ThemeResolution => {
  const session = configured(input.configs, input.sessionTenantId)
  if (session) return { config: session, source: 'session' }
  const deployment = configured(input.configs, input.deploymentTenantId)
  if (deployment) return { config: deployment, source: 'deployment' }
  const host = input.host?.trim().toLowerCase()
  const hostTenantId = host && input.hostTenantAllowList?.[host]
  const hostConfig = configured(input.configs, hostTenantId)
  if (hostConfig) return { config: hostConfig, source: 'host' }
  return { config: input.base, source: 'base' }
}
