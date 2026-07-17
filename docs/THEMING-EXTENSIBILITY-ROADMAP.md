# ONEVibe theming and extensibility roadmap

`THEMING_EXTENSIBILITY.md` is the planning input for a future tenant white-label surface. It proposes three layers:

1. CSS custom-property tokens for palette, typography, shape, spacing, and layout.
2. A tenant-scoped configuration for brand assets, homepage content, navigation, feature flags, and compliance links.
3. A deployment-time extension package for controlled component, route, slot, and CSS overrides.

This is planning material, not evidence that the feature exists. The implementation backlog is P7-01 through P7-09 in `TODO.md`.

## Decisions and constraints

- Tenant configuration is untrusted data and must be validated server-side with bounded schemas, optimistic versions, tenant/org ownership, and append-only audit records.
- The theme layer is presentation-only. It cannot change model routing, the server-controlled LiteLLM boundary, provider credentials, Better Auth/session policy, OpenVTC/VTI approval authority, evidence redaction, sandbox policy, or runtime capabilities.
- The current ONEVibe visual contract is sans-serif UI typography only. The source brief contains serif and monospace examples for customer research, but they must not be introduced into the product without a separate approved design/accessibility decision.
- Arbitrary HTML is not an acceptable default content mechanism. Typed React sections are preferred; any future HTML escape hatch requires a reviewed sanitizer, unsafe-URL rejection, CSP coverage, and regression tests.
- Remote fonts and images are a supply-chain and egress boundary. Prefer self-hosted integrity-checked assets; otherwise use explicit allow-lists, bounded content, and safe URL schemes.
- Tier 3 theme packages are deployment-time code. Package names must come from an operator-controlled allow-list and packages must pass integrity/version checks. Requests or tenant rows must never control dynamic imports.

## Planned evidence

Before Phase 7 is considered complete, `npm run e2e:themes` must prove base-theme fallback, tenant isolation, admin authorization, safe token rejection, save/reset, sanitized content, asset validation, restart persistence, and no effect on LiteLLM/provider/approval/evidence behavior. Desktop/mobile, keyboard, reduced-motion, contrast, and no-overflow evidence is also required for each reference profile.

