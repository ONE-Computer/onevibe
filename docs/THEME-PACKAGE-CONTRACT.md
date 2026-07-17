# ONEVibe ThemePackage contract

This is the safe P7-08 boundary for deployment-time extensions. A tenant row, browser query, or API request must never choose or dynamically import code.

## Operator-controlled inputs

The loader reads only these deployment environment values:

- `ONEVIBE_ALLOWED_THEME_PACKAGES`: comma-separated exact package names.
- `ONEVIBE_THEME_PACKAGE`: one selected name from that allow-list.
- `ONEVIBE_THEME_PACKAGE_VERSION`: the operator-pinned semver version.
- `ONEVIBE_THEME_PACKAGE_INTEGRITY`: the operator-pinned SHA-256 digest of the entry artifact.
- `ONEVIBE_THEME_PACKAGE_ROOT`: operator-owned package directory.
- `ONEVIBE_THEME_PACKAGE_MANIFEST`: operator-owned manifest path under the package root.

If no package is selected, the loader returns `null`. If a package is selected but is not allow-listed, the manifest is missing, the name/version is invalid, a path traverses outside the package root, or an artifact digest fails, startup/loading fails closed.

## Manifest shape

```json
{
  "contractVersion": 1,
  "packageName": "@onevibe/reference-theme",
  "packageVersion": "1.2.3",
  "entryPath": "dist/theme.js",
  "entrySha256": "<64 lowercase hex characters; must match the operator pin>",
  "slots": ["home.hero", "sidebar.header"],
  "routes": ["home"],
  "tokenDefaults": { "colorBrandPrimary": "#123456", "fontUi": "Inter" }
}
```

Slots and routes are bounded host-owned metadata. Token defaults reuse the tenant presentation schema and remain sans-serif-only. CSS artifacts, arbitrary paths, and request-controlled style strings are deliberately not part of this contract.

The current loader verifies the manifest and declared entry bytes but deliberately does not execute extension code or inject CSS. The package digest is accepted only when it matches the operator-provided integrity pin; a package cannot self-attest its provenance. Static bundling, CSP, slot fallback, rollback, and package isolation must be implemented and reviewed before a package can affect the React tree. This prevents a manifest check from being mistaken for a production extension runtime.

## Security invariants

- Package code receives no raw credentials, model keys, approval authority, evidence redaction authority, sandbox control, or LiteLLM routing control.
- Package selection is deployment-time only; tenant theme JSON contains no package name or import path.
- Integrity is SHA-256 over the declared bytes, cross-checked against an operator-provided pin, and must be checked before any future execution step.
- Package files are bounded regular files and resolved through real paths; symlink escapes and traversal are rejected.
- A package cannot widen navigation or server routes by writing to the database; route IDs are host-owned metadata for a future static-build integration.
- Package CSS, middleware, server handlers, arbitrary URL paths, and runtime imports are excluded from this contract.

Verification: `npm run test -- --run server/theme-package.test.ts`, `npm run lint`, and `npm run check:e2e-harness`.
