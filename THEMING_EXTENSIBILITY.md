# ONEVibe Theming & Extensibility Plan

> **Handover document** — self-contained brief for an execution agent to implement multi-tenant white-labelling, admin theming, and custom content injection.
>
> **Author**: Planning session 2026-07-16. Execution target: Phase 7 (post Phase 6 MCP completion).
>
> **Scope**: Three interlocking systems — (1) a CSS token layer for no-code brand overrides, (2) a `theme.config.json` per tenant for component-level low-code customisation, (3) a source-fork path for full high-code control. Three initial customer profiles — EDB, DBS, and Temasek Trust — are fully specified.

---

## Strategic context

ONEVibe's multi-tenant cloud product must let enterprise customers experience the platform as their own tool, not a generic SaaS. The three launch customers are:

- **Economic Development Board (EDB)** — Singapore government economic agency. Represents the public-sector institutional voice: formal, internationally legible, government-trust signals mandatory.
- **DBS Bank** — Singapore's largest bank. Represents the enterprise digital-first consumer: bold red, confident whitespace, "Live more, Bank less" positioning.
- **Temasek Trust** — Singapore philanthropic organisation stewarding Temasek's endowment into generational impact. Represents the philanthropic-institutional voice: editorial serif gravitas, orchid-accented warmth, a distinctive asymmetric corner-radius brand signature, and a four-pillar (Planet/People/Peace/Progress) content architecture.

These three customers have meaningfully incompatible aesthetics. The theming system must serve all three from the same codebase without any polluting the others.

---

## Architecture: three-tier theming

```
Tier 1 — CSS custom properties       ← no-code admin palette UI
          (colors, fonts, radius, spacing)

Tier 2 — theme.config.json           ← low-code per-tenant config file
          (logo, page content, nav items, feature flags)

Tier 3 — ONEVIBE_THEME_PACKAGE       ← high-code npm package override
          (full component replacement, custom routes, custom pages)
```

All three tiers stack additively. A tenant that only sets Tier 1 values gets a recolored platform. A tenant that sets Tier 2 gets their logo, custom homepage copy, and feature configuration. A tenant that ships a Tier 3 package gets full white-label with their own components.

The base platform theme lives in `src/theme/default.css` (CSS custom properties). Every UI component references only `var(--color-*)`, `var(--font-*)`, `var(--radius-*)` tokens — never hardcoded hex or pixel values. This is the non-negotiable enforcement rule for all new components.

---

## File and directory structure

```
src/
  theme/
    default.css          ← base token definitions (Tier 1 source)
    edb.css              ← EDB token overrides (committed to repo as reference)
    dbs.css              ← DBS token overrides (committed to repo as reference)
    loader.ts            ← runtime token injection from DB or env
  components/
    ThemeProvider.tsx    ← wraps app, injects tenant tokens as CSS vars on <html>
    AdminThemePanel.tsx  ← Tier 1: color/font/radius pickers for admin UI
  pages/
    HomePage.tsx         ← reads Tier 2 homepage config, renders injected sections
server/
  theme-store.ts         ← CRUD for per-tenant theme config in DB
  theme-routes.ts        ← GET/PUT /api/theme/:tenantId
theme-packages/          ← (gitignored in prod, sample in repo)
  edb-theme/             ← sample Tier 3 package for EDB
  dbs-theme/             ← sample Tier 3 package for DBS
```

---

## Tier 1: CSS custom property token system

### Token schema

```css
/* src/theme/default.css */

:root {
  /* Brand */
  --color-brand-primary:        #5b65ea;   /* override per tenant */
  --color-brand-primary-hover:  #4750d4;
  --color-brand-secondary:      #1a1a2e;
  --color-brand-accent:         #5b65ea;

  /* Surfaces */
  --color-bg-page:              #ffffff;
  --color-bg-surface:           #f8f8f9;
  --color-bg-elevated:          #ffffff;
  --color-bg-overlay:           rgba(0, 0, 0, 0.5);

  /* Text */
  --color-text-primary:         #1a1a1a;
  --color-text-secondary:       #5a5a6a;
  --color-text-muted:           #9090a0;
  --color-text-inverse:         #ffffff;
  --color-text-brand:           var(--color-brand-primary);

  /* Borders */
  --color-border-default:       #e5e5ea;
  --color-border-strong:        #c0c0c8;
  --color-border-focus:         var(--color-brand-primary);

  /* Status */
  --color-status-success:       #16a34a;
  --color-status-warning:       #d97706;
  --color-status-error:         #dc2626;
  --color-status-info:          #2563eb;

  /* Navigation */
  --color-nav-bg:               #ffffff;
  --color-nav-border:           var(--color-border-default);
  --color-nav-text:             var(--color-text-primary);
  --color-nav-text-active:      var(--color-brand-primary);
  --color-nav-indicator:        var(--color-brand-primary);

  /* Typography */
  --font-ui:                    'Inter', system-ui, sans-serif;
  --font-display:               var(--font-ui);
  --font-mono:                  'JetBrains Mono', monospace;

  --font-size-xs:   11px;
  --font-size-sm:   13px;
  --font-size-base: 15px;
  --font-size-md:   17px;
  --font-size-lg:   20px;
  --font-size-xl:   24px;
  --font-size-2xl:  32px;
  --font-size-3xl:  42px;

  --font-weight-normal:   400;
  --font-weight-medium:   500;
  --font-weight-semibold: 600;
  --font-weight-bold:     700;

  /* Shape */
  --radius-sm:     4px;
  --radius-base:   8px;
  --radius-md:     12px;
  --radius-lg:     16px;
  --radius-xl:     24px;
  --radius-full:   9999px;

  /* Spacing scale */
  --space-1:  4px;
  --space-2:  8px;
  --space-3:  12px;
  --space-4:  16px;
  --space-5:  20px;
  --space-6:  24px;
  --space-8:  32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;

  /* Layout */
  --nav-height:       56px;
  --sidebar-width:    240px;
  --container-max:    1200px;

  /* Shadow */
  --shadow-sm:   0 1px 2px rgba(0,0,0,0.06);
  --shadow-base: 0 2px 8px rgba(0,0,0,0.08);
  --shadow-lg:   0 8px 24px rgba(0,0,0,0.12);
}
```

### Enforcement rule (critical)

Every component CSS must use only these tokens. No hardcoded color, font, or radius values outside of `src/theme/default.css`. ESLint rule (add to `eslint.config.js`):

```js
// Disallow raw hex colors or px-based radius values in component CSS
// Enforce via stylelint: no-hardcoded-colors, custom-property-pattern
```

---

## Tier 2: theme.config.json schema

Stored per-tenant in the database (`tenant_theme_configs` table). Served via `GET /api/theme/:tenantId`. Applied client-side by `ThemeProvider.tsx`.

```ts
// src/types.ts — add TenantThemeConfig
export interface TenantThemeConfig {
  tenantId: string
  tenantName: string

  // Tier 1 token overrides (subset of CSS tokens)
  tokens?: Partial<{
    colorBrandPrimary: string
    colorBrandSecondary: string
    colorBgPage: string
    colorNavBg: string
    colorNavText: string
    fontUi: string
    fontDisplay: string
    radiusBase: string
    radiusButton: string
  }>

  // Branding assets
  logoUrl?: string           // shown in sidebar header
  logoAlt?: string
  logoMarkUrl?: string       // icon-only version for collapsed sidebar
  faviconUrl?: string
  brandName?: string         // replaces "ONEVibe" in page title

  // Homepage content sections (Tier 2 content injection)
  homePage?: {
    heroHeadline?: string
    heroSubheadline?: string
    heroCtaLabel?: string
    heroBgImageUrl?: string
    heroBgColor?: string
    announcementBannerText?: string
    announcementBannerUrl?: string
    announcementBannerVisible?: boolean
    featureCards?: Array<{
      icon: string           // FontAwesome icon name
      title: string
      description: string
    }>
    customSectionsHtml?: string   // sanitised HTML injected below cards (advanced)
  }

  // Navigation customisation
  nav?: {
    items?: Array<{
      label: string
      href: string
      icon?: string
      external?: boolean
    }>
    footerLinks?: Array<{ label: string; href: string }>
    supportUrl?: string
    docsUrl?: string
  }

  // Feature flags
  features?: {
    showComputerTab?: boolean
    showMcpMarketplace?: boolean
    showRuntimePicker?: boolean
    showDebugPanel?: boolean
    allowGuestAccess?: boolean
  }

  // Gov/enterprise compliance flags
  compliance?: {
    showGovTrustBanner?: boolean    // Singapore government trust banner
    govAgencyName?: string
    privacyPolicyUrl?: string
    termsUrl?: string
    sessionTimeoutMinutes?: number
  }
}
```

---

## Tier 3: ONEVIBE_THEME_PACKAGE

For customers who need complete control — custom routes, custom React components, full white-label with no ONEVibe branding.

**Environment variable**: `ONEVIBE_THEME_PACKAGE=@edb/onevibe-theme`

The package is an npm module with a defined export contract:

```ts
// Expected exports from the theme package
export interface ThemePackage {
  // Override specific route components (key = route path)
  pages?: Record<string, React.ComponentType>

  // Inject additional React components into named slots
  slots?: {
    'sidebar.header'?: React.ComponentType
    'sidebar.footer'?: React.ComponentType
    'home.hero'?: React.ComponentType
    'home.below-cards'?: React.ComponentType
    'nav.right'?: React.ComponentType
    'task.toolbar.right'?: React.ComponentType
  }

  // Additional CSS to inject (appended after default theme)
  css?: string

  // Additional routes
  routes?: Array<{ path: string; component: React.ComponentType }>

  // Token overrides (same shape as TenantThemeConfig.tokens)
  tokens?: Record<string, string>
}
```

**Loading mechanism** (server-side, `server/theme-loader.ts`):

```ts
export async function loadThemePackage(): Promise<ThemePackage | null> {
  const pkg = process.env.ONEVIBE_THEME_PACKAGE
  if (!pkg) return null
  // Dynamic import — the package must be installed in node_modules
  const mod = await import(pkg)
  return (mod.default ?? mod) as ThemePackage
}
```

The loaded package is serialised (slots serialised as component references) and injected via a React context at the app root.

---

## Admin settings palette (Tier 1 UI)

**Location**: Settings → Appearance (admin-only route, guarded by `user.role === 'admin'`)

**File**: `src/components/AdminThemePanel.tsx`

### UI design

```
Appearance
─────────────────────────────────────────────────────────

  Brand colour        [████] #5b65ea  ← colour swatch + hex input

  Secondary colour    [████] #1a1a2e

  Page background     [████] #ffffff

  Navigation bg       [████] #ffffff

  Button radius       ○─────────○  4px ← range slider 0–24px

  Font                [ Inter ▾ ]  ← dropdown: Inter, Source Sans Pro,
                                      Open Sans, DM Sans, custom URL

  Custom font URL     [__________________]  ← optional Google Fonts / self-hosted URL

  Logo               [Upload logo]  ← PNG/SVG, max 256×64px
  Logo mark          [Upload icon]  ← square mark for collapsed sidebar

─────────────────────────────────────────────────────────

  Preview
  ┌──────────────────────────────────────┐
  │ [LOGO]  ONEVibe         [Nav item]   │  ← live preview iframe
  │─────────────────────────────────────│
  │ Brand button  Secondary button       │
  │ Card with shadow                     │
  └──────────────────────────────────────┘

  [Save changes]  [Reset to default]
```

**Behaviour**:
- All changes apply to the live preview immediately (no save needed for preview)
- Save writes to `PUT /api/theme/:tenantId`
- Reset restores `default.css` base values
- Token mutations inject a `<style>` tag on `<html>` with overridden custom properties

---

## Homepage content injection (Tier 2 UI)

**Location**: Settings → Homepage (admin-only)

**File**: `src/components/AdminHomePageEditor.tsx`

Admins can configure:

1. **Hero section**: headline, subheadline, CTA label, background image/color
2. **Announcement banner**: optional dismissable banner at page top (e.g. "Welcome to EDB's AI Workspace — now in beta")
3. **Feature cards**: up to 6 cards with FontAwesome icon, title, description
4. **Custom HTML section**: a single sanitised HTML block (DOMPurify) injected below the cards — for iframe embeds, external dashboards, or agency-specific welcome content
5. **Nav links**: add/remove/reorder custom nav links and footer links

**Data flow**: `HomePage.tsx` fetches `GET /api/theme/current` on mount. If `homePage` config exists, renders it instead of the default ONEVibe welcome state.

---

## Customer profile: EDB

### Brand reference

| Token | Value | Source |
|---|---|---|
| Brand red | `#f4333d` | EDB logo SVG |
| Brand navy | `#132b66` | EDB wordmark |
| Dark neutral | `#222222` | Icon strokes |
| White | `#ffffff` | Backgrounds |
| Font | Source Sans Pro | Google Fonts CDN |
| Font weights | 300, 400, 600, 700 | |
| Button radius | 2–4px | Institutional convention |
| Card radius | 4px | |

### EDB theme.css (committed to `src/theme/edb.css`)

```css
/* src/theme/edb.css — apply when tenantId === 'edb' */
:root {
  --color-brand-primary:        #f4333d;
  --color-brand-primary-hover:  #d92030;
  --color-brand-secondary:      #132b66;
  --color-brand-accent:         #f4333d;

  --color-bg-page:              #ffffff;
  --color-bg-surface:           #f7f8fa;
  --color-nav-bg:               #132b66;
  --color-nav-text:             rgba(255, 255, 255, 0.85);
  --color-nav-text-active:      #ffffff;
  --color-nav-indicator:        #f4333d;

  --color-text-primary:         #222222;
  --color-text-secondary:       #4a4a5a;
  --color-text-brand:           #132b66;

  --font-ui:                    'Source Sans Pro', 'Helvetica Neue', sans-serif;
  --font-display:               'Source Sans Pro', 'Helvetica Neue', sans-serif;

  --radius-sm:     2px;
  --radius-base:   4px;
  --radius-md:     4px;
  --radius-lg:     8px;
  --radius-full:   4px;   /* EDB avoids pill shapes */
}
```

### EDB homepage config (seed data)

```json
{
  "tenantId": "edb",
  "tenantName": "Economic Development Board",
  "brandName": "EDB AI Workspace",
  "logoAlt": "EDB Singapore",
  "homePage": {
    "heroHeadline": "Singapore's investment intelligence platform",
    "heroSubheadline": "AI-assisted analysis and research for investment promotion professionals.",
    "heroCtaLabel": "Start a research task",
    "heroBgColor": "#132b66",
    "announcementBannerText": "EDB AI Workspace — Internal Beta",
    "announcementBannerVisible": true,
    "featureCards": [
      { "icon": "magnifying-glass", "title": "Market research", "description": "Deep analysis of industry trends and investment opportunities." },
      { "icon": "chart-line", "title": "Investment analytics", "description": "Data-driven insights on FDI flows, sector performance, and forecasts." },
      { "icon": "file-lines", "title": "Report generation", "description": "Generate structured briefings, memos, and presentations." },
      { "icon": "globe", "title": "Competitive intelligence", "description": "Track competitor economies and investment climates." }
    ]
  },
  "compliance": {
    "showGovTrustBanner": true,
    "govAgencyName": "Economic Development Board",
    "privacyPolicyUrl": "https://www.edb.gov.sg/en/privacy.html",
    "termsUrl": "https://www.edb.gov.sg/en/terms.html"
  },
  "features": {
    "showComputerTab": false,
    "showMcpMarketplace": false,
    "showRuntimePicker": false,
    "showDebugPanel": false
  }
}
```

### EDB implementation notes

**Singapore Government trust banner**: Mandatory for .gov.sg deployments. Render as first element in `<body>` before the nav:

```tsx
{config.compliance?.showGovTrustBanner && (
  <div className="sgds-masthead">
    <img src="/assets/singapore-gov-logo.svg" alt="Singapore Government" />
    <span>A Singapore Government Agency Website</span>
    <a href="#" className="sgds-masthead__how-to-identify">
      How to identify <span aria-hidden>↗</span>
    </a>
  </div>
)}
```

Masthead CSS: `background: #f0f0f0; font-size: 12px; padding: 4px 16px; display: flex; align-items: center; gap: 8px;`

**Navy navigation**: When `--color-nav-bg` is dark, the sidebar must invert icon and text contrast. `ThemeProvider.tsx` should auto-detect `nav-bg` luminance and set a `data-nav-theme="dark"` attribute on `<nav>`, allowing CSS selectors to adjust icon fills and text without explicit configuration.

**Source Sans Pro**: Must be loaded from Google Fonts. Add to `ThemeProvider.tsx`:
```ts
if (tokens?.fontUi?.includes('Source Sans Pro')) {
  injectGoogleFont('Source+Sans+Pro:wght@300;400;600;700')
}
```

---

## Customer profile: DBS

### Brand reference

| Token | Value | Source |
|---|---|---|
| Brand red | `#FF3333` | DBS logo SVG |
| Brand red hover | `#EE1818` | CSS |
| Editorial red | `#CC0000` | CSS |
| Dark tile | `#BD2126` | CSS |
| Brand black | `#000000` | Wordmark |
| Near-black | `#2E2E2E` | Body text |
| Page bg | `#FFFFFF` | |
| Surface | `#F3F3F3` | |
| Subtle bg | `#ECECEC` | |
| Border | `#E5E4E4` | |
| Muted text | `#909090` | |
| Font | Open Sans (self-hosted) | DBS WOFF2 |
| Button radius | 4px | CSS confirmed |
| Card radius | 20px | CSS confirmed |
| Nav height | 80px | CSS confirmed |
| Container max | 1140px | CSS confirmed |

### DBS theme.css (committed to `src/theme/dbs.css`)

```css
/* src/theme/dbs.css — apply when tenantId === 'dbs' */
:root {
  --color-brand-primary:        #FF3333;
  --color-brand-primary-hover:  #EE1818;
  --color-brand-secondary:      #000000;
  --color-brand-accent:         #CC0000;
  --color-brand-dark-tile:      #BD2126;

  --color-bg-page:              #FFFFFF;
  --color-bg-surface:           #F3F3F3;
  --color-bg-elevated:          #FFFFFF;
  --color-bg-subtle:            #ECECEC;

  --color-nav-bg:               rgba(255, 255, 255, 0.95);
  --color-nav-text:             #333333;
  --color-nav-text-active:      #FF3333;
  --color-nav-indicator:        #FF3333;   /* 4px solid bottom border */

  --color-text-primary:         #2E2E2E;
  --color-text-secondary:       #555555;
  --color-text-muted:           #909090;
  --color-border-default:       #E5E4E4;
  --color-border-input:         #C0C0C0;

  --font-ui:                    'Open Sans', 'OpenSans', system-ui, sans-serif;
  --font-display:               'Open Sans', system-ui, sans-serif;

  --radius-sm:     0px;
  --radius-base:   4px;
  --radius-md:     4px;
  --radius-lg:     20px;   /* DBS content cards */
  --radius-full:   4px;    /* DBS avoids pill shapes */

  --nav-height:       80px;
  --container-max:    1140px;
}
```

### DBS homepage config (seed data)

```json
{
  "tenantId": "dbs",
  "tenantName": "DBS Bank",
  "brandName": "DBS AI Workspace",
  "logoAlt": "DBS",
  "homePage": {
    "heroHeadline": "Live more. Work less.",
    "heroSubheadline": "AI-powered workspace for DBS teams. Research, write, analyse, build — faster.",
    "heroCtaLabel": "Start working",
    "heroBgColor": "#000000",
    "announcementBannerVisible": false,
    "featureCards": [
      { "icon": "bolt", "title": "Instant analysis", "description": "Financial research and data analysis at the speed of thought." },
      { "icon": "pen-to-square", "title": "Document drafting", "description": "Proposals, reports, and presentations generated in minutes." },
      { "icon": "code", "title": "App development", "description": "Internal tools and dashboards built with AI assistance." },
      { "icon": "shield-check", "title": "Governed AI", "description": "All model traffic routes through DBS-controlled infrastructure." }
    ]
  },
  "features": {
    "showComputerTab": true,
    "showMcpMarketplace": true,
    "showRuntimePicker": true,
    "showDebugPanel": false
  }
}
```

### DBS implementation notes

**Frosted nav**: The DBS nav uses `rgba(255, 255, 255, 0.95)` with a subtle backdrop blur, not a solid white nav. CSS:
```css
nav {
  background: var(--color-nav-bg);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--color-border-default);
}
```

**Active nav indicator**: DBS uses a `4px solid` bottom border on active tabs, not a background highlight. Implement as:
```css
nav a[data-active="true"] {
  border-bottom: 4px solid var(--color-nav-indicator);
  color: var(--color-nav-text-active);
  padding-bottom: calc(var(--nav-item-padding-bottom) - 4px);
}
```

**Open Sans**: Available via Google Fonts as `'Open Sans'`. Note DBS self-hosts it as `'OpenSans'` (no space). Load both:
```ts
if (tokens?.fontUi?.includes('Open Sans')) {
  injectGoogleFont('Open+Sans:wght@300;400;600;700')
}
```

**Card radius anomaly**: DBS uses `20px` radius for content tiles but `4px` for buttons and inputs. Map this to `--radius-lg: 20px` and `--radius-base: 4px` in the token schema. Content card components must explicitly reference `var(--radius-lg)`.

**Hero background**: DBS hero is full-bleed black. When `heroBgColor === '#000000'`, ensure hero text uses `--color-text-inverse` (`#ffffff`) regardless of the page background token.

---

## Customer profile: Temasek Trust

### Brand reference

| Token | Value | Source |
|---|---|---|
| Trust Blue (primary) | `#05006d` | CSS `:root` — `--primary-trust-blue` |
| Ecosystem Blue (CTA) | `#0019ff` | CSS `:root` — `--secondary-ecosystem-blue` |
| Temasek Orchid (accent) | `#9280f7` | CSS `:root` — `--primary-temasek-orchid` |
| Dark mode background | `#030042` | CSS `:root` — `--primary-dark-mode-blue` |
| Connection White (surface) | `#fafffa` | CSS `:root` — `--primary-connection-white` |
| Error red | `#b71c1c` | CSS `:root` — `--primart-temasek-error` |
| Section alt | `#f2f1ef` | Warm light grey, section backgrounds |
| Planet pillar | `#488c5b` | Programme accent |
| People pillar | `#ba7fa6` | Programme accent |
| Peace pillar | `#558ac9` | Programme accent |
| Progress pillar | `#dd6f31` | Programme accent |
| Heading font | Domaine Text Bold (Klim) | Self-hosted WOFF2 |
| Body/UI font | Rund (humanist sans) | Self-hosted WOFF |
| Button radius | 20–25px (pill) or 3px (form) | CSS confirmed |
| **Brand signature** | `border-radius: Xpx 0 0 0` | Asymmetric single-corner — see below |

### The asymmetric corner signature (critical)

Temasek Trust's most distinctive and non-negotiable brand element is a single large swept top-left corner radius applied to cards, heroes, and containers — the other three corners are always sharp:

```css
/* Applied at different scales throughout their UI */
border-radius: 140px 0px 0px 0px;  /* hero banners */
border-radius: 80px 0px 0px 0px;   /* large feature cards */
border-radius: 48px 0px 0px 0px;   /* section modules */
border-radius: 40px 0px 0px 0px;   /* content blocks */
border-radius: 25px 0px 0px 0px;   /* smaller elements */
border-radius: 16px 0px 0px 0px;   /* compact elements */
```

This "opening bracket" or architectural sweep shape is the brand's visual fingerprint — instantly recognisable at any size. The theming system must support an asymmetric radius token to carry it correctly. This requires adding `--radius-tl` (top-left only) as an additional token beyond the standard symmetric `--radius-*` tokens.

### Temasek Trust theme.css (committed to `src/theme/temasek-trust.css`)

```css
/* src/theme/temasek-trust.css — apply when tenantId === 'temasek-trust' */
:root {
  --color-brand-primary:        #05006d;   /* Trust Blue */
  --color-brand-primary-hover:  #030052;
  --color-brand-secondary:      #0019ff;   /* Ecosystem Blue — CTAs */
  --color-brand-accent:         #9280f7;   /* Temasek Orchid */
  --color-brand-dark-bg:        #030042;

  --color-bg-page:              #fafffa;   /* Connection White */
  --color-bg-surface:           #f2f1ef;   /* warm light grey */
  --color-bg-elevated:          #ffffff;
  --color-bg-periwinkle:        #e1e8fb;   /* info highlights */

  --color-nav-bg:               #05006d;   /* Trust Blue nav */
  --color-nav-text:             rgba(255, 255, 255, 0.80);
  --color-nav-text-active:      #ffffff;
  --color-nav-indicator:        #9280f7;   /* orchid underline */

  --color-text-primary:         #05006d;   /* headings and body both trust blue */
  --color-text-secondary:       #444466;
  --color-text-muted:           #7070a0;
  --color-border-default:       #dfe1e3;
  --color-border-focus:         #0019ff;
  --color-status-error:         #b71c1c;

  /* Four-pillar accents */
  --color-pillar-planet:        #488c5b;
  --color-pillar-people:        #ba7fa6;
  --color-pillar-peace:         #558ac9;
  --color-pillar-progress:      #dd6f31;

  --font-ui:                    'Rund', 'Nunito', system-ui, sans-serif;
  --font-display:               'Domaine-Text-Bold', 'Freight Text Pro', Georgia, serif;

  /* Standard symmetric radii (for generic UI) */
  --radius-sm:     4px;
  --radius-base:   8px;
  --radius-md:     12px;
  --radius-lg:     20px;
  --radius-full:   9999px;

  /* Asymmetric brand signature — top-left only */
  --radius-brand-hero:  140px 0px 0px 0px;
  --radius-brand-card:  40px 0px 0px 0px;
  --radius-brand-sm:    16px 0px 0px 0px;
}
```

### Token system extension for asymmetric radius

The standard token schema uses `--radius-*` for symmetric values. Add two new tokens for the Temasek Trust signature and any future customer that needs asymmetric shapes:

```css
/* src/theme/default.css — extend with */
--radius-brand-hero:  0px;   /* default: no asymmetry; Temasek Trust overrides */
--radius-brand-card:  0px;
--radius-brand-sm:    0px;
```

Components that render feature cards, hero sections, and programme banners must reference `var(--radius-brand-card)` so that applying the Temasek Trust theme automatically sweeps the corner without any code changes.

### Temasek Trust homepage config (seed data)

```json
{
  "tenantId": "temasek-trust",
  "tenantName": "Temasek Trust",
  "brandName": "Temasek Trust AI Workspace",
  "logoAlt": "Temasek Trust",
  "homePage": {
    "heroHeadline": "For a better world, built together",
    "heroSubheadline": "AI-assisted research, reporting, and programme management for the Temasek Trust team.",
    "heroCtaLabel": "Start a task",
    "heroBgColor": "#05006d",
    "announcementBannerVisible": false,
    "featureCards": [
      { "icon": "leaf", "title": "Planet", "description": "Research and reporting for environmental and climate initiatives." },
      { "icon": "people-group", "title": "People", "description": "Programme analysis and impact measurement across community grants." },
      { "icon": "dove", "title": "Peace", "description": "Policy research, stakeholder briefings, and cross-sector dialogue support." },
      { "icon": "rocket", "title": "Progress", "description": "Innovation programme tracking, grant reports, and ecosystem analysis." }
    ]
  },
  "features": {
    "showComputerTab": false,
    "showMcpMarketplace": false,
    "showRuntimePicker": false,
    "showDebugPanel": false
  },
  "compliance": {
    "showGovTrustBanner": false,
    "privacyPolicyUrl": "https://www.temasektrust.org.sg/privacy-policy",
    "termsUrl": "https://www.temasektrust.org.sg/terms-of-use"
  }
}
```

### Temasek Trust implementation notes

**Asymmetric radius on cards**: The feature cards on the homepage, task cards in the sidebar, and any modal/panel with a featured header must use `var(--radius-brand-card)` on the outer container. For all other tenants this resolves to `0px` (standard box). For Temasek Trust it renders as `40px 0 0 0`.

**Buttons carry the asymmetric signature too**: Temasek Trust buttons use `border-radius: 16px 1px 1px 1px` — top-left swept, other corners near-square. The standard `--radius-base` token controls all four corners equally, so button radius must be overridden separately. Add `--radius-button` to `TenantThemeConfig.tokens` and wire it into button components:

```css
/* In button component */
border-radius: var(--radius-button, var(--radius-base));
```

For Temasek Trust, seed `--radius-button: 16px 1px 1px 1px`.

```tsx
// In feature card component:
<div style={{ borderRadius: 'var(--radius-brand-card)' }} className="feature-card">
```

**Dark navy nav**: Same pattern as EDB — when `--color-nav-bg` is dark, `ThemeProvider` sets `data-theme="dark"` on `<nav>`. Nav text and icons must be white.

**Orchid hover states**: The orchid `#9280f7` is used for link hover, nav indicator, and card right-border highlights. Map to `--color-brand-accent` and wire hover states to `var(--color-brand-accent)` rather than `var(--color-brand-primary-hover)`.

```css
a:hover, .card:hover {
  color: var(--color-brand-accent);
  border-right: 3px solid var(--color-brand-accent);
}
```

**Typography fallbacks**: Domaine Text and Rund are proprietary licensed fonts. The execution agent must not bundle them without a license. Use these open-source fallbacks in `--font-display` and `--font-ui`:
- Domaine Text → `'Libre Baskerville'` or `'Freight Text Pro'` (if licensed) or `Georgia`
- Rund → `'Nunito'` (Google Fonts — closest humanist rounded sans) or `'DM Sans'`

If Temasek Trust provides a self-hosted font CDN URL, support it via `fontUrl` in `TenantThemeConfig.tokens`:
```json
{ "fontDisplayUrl": "https://assets.temasektrust.org.sg/fonts/domaine-text.css" }
```

**Pillar feature cards with individual accent colors**: Temasek Trust's four-pillar system means each homepage card should be tinted by its pillar color. Extend the homepage config `featureCards` schema to support an optional `accentColor` field:

```ts
featureCards?: Array<{
  icon: string
  title: string
  description: string
  accentColor?: string   // e.g. "#488c5b" for Planet — overrides card border/icon tint
}>
```

The seed data above maps Planet → `var(--color-pillar-planet)`, etc. If `accentColor` is set on a card, use it as the card's left-border or icon fill.

**Accessibility toolbar**: Temasek Trust's live site includes a font-resize + contrast toggle bar. For their tenant deployment, consider adding an `accessibilityToolbar: true` feature flag to `TenantThemeConfig.features` that renders a floating `A- A A+` bar. Lower priority — add to the open questions section.

---

## Multi-tenancy database schema

Add to `server/store.ts` (or Drizzle schema once P4-02 lands):

```sql
CREATE TABLE tenant_theme_configs (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  tenant_id     TEXT NOT NULL UNIQUE,
  config_json   TEXT NOT NULL,     -- serialised TenantThemeConfig
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### API routes (`server/theme-routes.ts`)

```
GET  /api/theme/current          → resolves tenant from session, returns TenantThemeConfig
GET  /api/theme/:tenantId        → admin only, returns TenantThemeConfig
PUT  /api/theme/:tenantId        → admin only, validates and writes config
POST /api/theme/:tenantId/reset  → admin only, deletes custom config (restores default)
```

### Tenant resolution order

1. `req.session.tenantId` (from auth, when P4-01 auth is live)
2. `ONEVIBE_TENANT_ID` env var (single-tenant deployments)
3. Subdomain: `edb.onevibe.app` → `tenantId = 'edb'`
4. Default: return null (renders base ONEVibe theme)

---

## ThemeProvider implementation

**File**: `src/components/ThemeProvider.tsx`

```tsx
import { createContext, useContext, useEffect } from 'react'
import type { TenantThemeConfig } from '../types'

const ThemeContext = createContext<TenantThemeConfig | null>(null)

export function ThemeProvider({ config, children }: {
  config: TenantThemeConfig | null
  children: React.ReactNode
}) {
  useEffect(() => {
    if (!config?.tokens) return

    const style = document.createElement('style')
    style.id = 'tenant-theme-overrides'
    const tokens = config.tokens

    // Map camelCase token names to CSS custom properties
    const lines = Object.entries(tokens).map(([key, val]) => {
      const prop = '--' + key.replace(/([A-Z])/g, '-$1').toLowerCase()
      return `  ${prop}: ${val};`
    })

    style.textContent = `:root {\n${lines.join('\n')}\n}`
    document.head.appendChild(style)

    // Luminance check for nav theme
    const navBg = tokens.colorNavBg ?? '#ffffff'
    const isNavDark = getLuminance(navBg) < 0.35
    document.querySelector('nav')?.setAttribute('data-theme', isNavDark ? 'dark' : 'light')

    return () => style.remove()
  }, [config])

  return (
    <ThemeContext.Provider value={config}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTenantTheme = () => useContext(ThemeContext)
```

**App.tsx integration**:
```tsx
const { data: themeConfig } = useQuery({
  queryKey: ['theme', 'current'],
  queryFn: () => api.get<TenantThemeConfig>('/api/theme/current'),
  staleTime: 5 * 60 * 1000,
})

return (
  <ThemeProvider config={themeConfig ?? null}>
    {/* existing app tree */}
  </ThemeProvider>
)
```

---

## Google Fonts loader utility

**File**: `src/theme/loader.ts`

```ts
const loadedFonts = new Set<string>()

export function injectGoogleFont(family: string) {
  if (loadedFonts.has(family)) return
  loadedFonts.add(family)

  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${family}&display=swap`
  document.head.appendChild(link)
}
```

Called by `ThemeProvider` when a font token references a known Google Font family.

---

## Slot injection system (Tier 3)

React context-based named slot rendering. Allows theme packages to replace specific UI regions without forking the entire component tree.

**File**: `src/components/ThemeSlot.tsx`

```tsx
import { useTenantTheme } from './ThemeProvider'

interface ThemeSlotProps {
  name: string
  fallback?: React.ReactNode
  props?: Record<string, unknown>
}

export function ThemeSlot({ name, fallback, props = {} }: ThemeSlotProps) {
  const pkg = useThemePackage()   // from ThemePackageContext
  const SlotComponent = pkg?.slots?.[name as keyof typeof pkg.slots]
  if (!SlotComponent) return <>{fallback}</>
  return <SlotComponent {...props} />
}
```

Usage in existing components:
```tsx
// In Sidebar.tsx, replace hardcoded header:
<ThemeSlot name="sidebar.header" fallback={<DefaultSidebarHeader />} />

// In HomePage.tsx:
<ThemeSlot name="home.hero" fallback={<DefaultHero config={themeConfig?.homePage} />} />
<ThemeSlot name="home.below-cards" />
```

---

## Implementation order for execution agent

### Step 1 — Token foundation (no visible change)
1. Create `src/theme/default.css` with the full token schema above
2. Replace all hardcoded colors, fonts, radius values in existing components with `var(--token-name)` references
3. Add stylelint rule to enforce no-hardcoded values
4. `npm run check` must stay green

### Step 2 — Tier 1 token loading
5. Create `src/components/ThemeProvider.tsx`
6. Add `GET /api/theme/current` stub returning null (base theme)
7. Wrap app in `ThemeProvider` — no visible change
8. Test: verify `--color-brand-primary` is `#5b65ea` in DevTools

### Step 3 — Customer CSS files and seed data
9. Create `src/theme/edb.css`, `src/theme/dbs.css`, and `src/theme/temasek-trust.css` as reference implementations
10. Create `tenant_theme_configs` table migration
11. Seed EDB, DBS, and Temasek Trust configs
12. Test: `ONEVIBE_TENANT_ID=edb npm run dev` → navy nav, Source Sans Pro, red brand color
13. Test: `ONEVIBE_TENANT_ID=temasek-trust npm run dev` → trust blue nav, orchid accents, asymmetric corners on cards

### Step 4 — Admin theme panel (Tier 1 UI)
13. Create `src/components/AdminThemePanel.tsx`
14. Add `/settings/appearance` route (admin-gated)
15. Wire `PUT /api/theme/:tenantId`
16. Live preview iframe
17. Test: change brand color in panel → preview updates without reload

### Step 5 — Homepage content editor (Tier 2 UI)
18. Create `src/components/AdminHomePageEditor.tsx`
19. Update `src/pages/HomePage.tsx` to render from `themeConfig.homePage`
20. Render government trust banner when `compliance.showGovTrustBanner` is true
21. Test: add EDB feature cards → appear on homepage → DBS homepage shows different cards

### Step 6 — Slot system (Tier 3 foundation)
22. Create `src/components/ThemeSlot.tsx`
23. Add `ThemePackageContext`
24. Insert `ThemeSlot` at key injection points: sidebar header, home hero, nav right, task toolbar right
25. Document the `ThemePackage` interface in `ARCHITECTURE.md`

### Step 7 — Font loading
26. Create `src/theme/loader.ts` with `injectGoogleFont`
27. Wire into `ThemeProvider` for Source Sans Pro (EDB) and Open Sans (DBS)
28. Test: EDB tenant → Source Sans Pro loads via Google Fonts

---

## Security constraints

- **Custom HTML injection** (`homePage.customSectionsHtml`): sanitise with DOMPurify before render. Whitelist: `p`, `h2`, `h3`, `ul`, `li`, `a`, `strong`, `em`, `img` (no `<script>`, `<iframe>`, `<style>`). Admins who need `<iframe>` use the Tier 3 slot system instead.
- **Logo upload**: validate MIME type server-side (PNG or SVG only), max 512KB. SVGs must be sanitised (strip `<script>` and event handlers).
- **Theme package loading** (Tier 3): only load packages from an allow-list of npm package prefixes configured in `ONEVIBE_ALLOWED_THEME_PACKAGES`. Never load arbitrary package names from the database.
- **Admin route guard**: `/settings/appearance` and `/api/theme/*` PUT routes require `user.role === 'admin'` check before P4-01 full auth lands. Add a placeholder guard now.
- **CSS injection**: token values injected into `<style>` must be sanitised — reject values containing `url(`, `expression(`, `javascript:`, or `;` outside the expected value position.

---

## Open questions for execution agent

1. **Font hosting**: EDB and DBS both have self-hosted fonts in production. Should ONEVibe support `fontUrl` pointing to a custom WOFF2, or always proxy through Google Fonts? Recommendation: support both — check if value is a URL (starts with `https://`), load as `@font-face` import; otherwise treat as a Google Fonts family name.

2. **Subdomain routing**: For `edb.onevibe.app` to resolve to tenantId `edb`, the server needs subdomain parsing. Defer until P4-04 deploy lands — for now use `ONEVIBE_TENANT_ID` env var.

3. **Dark mode + tenant theme**: The current system has light/dark mode. If a tenant overrides `--color-bg-page` to navy (EDB nav), does that conflict with dark mode? Recommendation: tenant token overrides take precedence over dark mode overrides. Tenants that need dark mode integration must include dark-mode variants in their `tokens` object (future extension).

4. **Government trust banner asset**: The SGDS masthead requires the Singapore Government logo and lion head mark. These are publicly available assets. Commit them to `public/assets/sgds/`. Reference: `https://www.designsystem.gov.sg/`.

---

## Acceptance criteria

- [ ] `ONEVIBE_TENANT_ID=edb npm run dev` → navy sidebar, EDB red CTA buttons, Source Sans Pro, government trust banner visible
- [ ] `ONEVIBE_TENANT_ID=dbs npm run dev` → white frosted nav, DBS red CTAs, Open Sans, 80px nav height, 20px card radius
- [ ] `ONEVIBE_TENANT_ID=temasek-trust npm run dev` → trust blue nav, orchid hover accents, `40px 0 0 0` card corners, `16px 1px 1px 1px` button corners, Connection White page background
- [ ] Temasek Trust homepage → four pillar cards (Planet/People/Peace/Progress) each tinted by their pillar accent color
- [ ] Admin changes brand color via settings panel → live preview updates instantly without page reload
- [ ] Admin sets homepage hero headline → homepage renders custom text
- [ ] Custom HTML with `<script>` tag → stripped by DOMPurify, not executed
- [ ] Logo upload with >512KB file → rejected with error
- [ ] Base (no tenant) → renders default ONEVibe theme unchanged
- [ ] `npm run check` stays green throughout
