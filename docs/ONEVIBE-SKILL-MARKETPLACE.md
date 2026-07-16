# ONEVibe skill marketplace

ONEVibe has two classes of task skills:

- Built-in packs are versioned in `server/skill-packs.ts` and are always available.
- Marketplace packs are discovered from the GitHub-backed `catalog.json`, installed into owner-scoped SQLite state, and selectable only after installation.

The default catalog is:

`https://raw.githubusercontent.com/ONE-Computer/onevibe/main/skills/catalog.json`

Operators can override it with `ONEVIBE_SKILL_CATALOG_URL`. Catalog and content URLs must be HTTPS GitHub URLs in production. The local E2E harness permits only loopback HTTP fixtures under `NODE_ENV=test`.

Each catalog entry contains an ID, version, title, summary, `contentUrl`, `sourceUrl`, and SHA-256 digest. Installation downloads at most 256 KiB, requires the exact digest, and verifies `SKILL.md` frontmatter names the requested skill. The server stores the verified content and provenance in the `skill_installations` table.

Installed content is owner-scoped. A marketplace skill is not selectable in a task until installation succeeds; an uninstalled catalog entry is only a discovery result. Removal is rejected while a pending/running/waiting task depends on the skill. Demo tasks record selection as `not_executed_demo` and never materialize marketplace files. Provider adapters materialize only the pinned selected packs under the task workspace and do not widen tools, network, credentials, or approval policy.

Relevant routes:

```text
GET    /api/skills
POST   /api/skills/install       { "skillId": "meeting-brief" }
DELETE /api/skills/:skillId
```

The local acceptance proof is `npm run e2e:skill-marketplace`. It uses a loopback GitHub-shaped catalog fixture to prove install, digest verification, task selection, truthful demo evidence, and removal. It does not claim external GitHub availability or provider execution.
