# ONEVibe Roadmap — PM View
> Last updated 2026-07-17. Owner: PM/BA role.

---

## Product north star

ONEVibe is the **provider-neutral meta-layer above AI agent harnesses**. The harness (Claude SDK, Codex, AgentCore, any future runtime) is a pluggable detail. ONEVibe owns everything above it: task lifecycle, conversation, workspace files, artifact storage, approval governance, MCP routing, team management, multi-tenant theming, and professional UI. This is the moat. No harness owns this.

The core invariant: `server/runtime-adapter.ts` is the boundary. Nothing above it ever leaks harness-specific concepts.

---

## Release gates (in order)

| Gate | Status | Blocker |
|---|---|---|
| Local-first foundation | ✅ Done | — |
| Runtime abstraction (P2) | ✅ Done | — |
| Runtime routing layer (P3) | ✅ Done | — |
| Auth (P4-01) | 🔶 Local done | Real email delivery (Resend), production deploy |
| Database (P4-02) | 🔶 Local done | Non-atomic promotion boundary, production deploy |
| Containerise (P4-03) | 🔶 Spec done | Live container against managed Postgres |
| Deploy (P4-04) | 🔶 Spec done | Fly.io app with secrets + rollback drill |
| Cloud sandbox / e2b (P4-05) | ❌ Not started | E2B_API_KEY, full adapter build |
| Multi-tenancy (P4-06) | 🔶 Local scaffold | Postgres repo switch, org-backed authz |
| Professional UI (P5) | ✅ Done | — |
| MCP + Extensions (P6) | ✅ Done | — |
| Tenant theming (P7) | 🔶 95% done | Keyboard/a11y coverage, slot/CSP tests, manual responsive QA |
| UX gap closure (ONG-01) | 🔶 In progress | 50-issue audit; ~10–15h remaining |

---

## Current sprint focus (July–August 2026)

### Sprint 1 (now): P7 close-out + ONG-01 UX
**Goal:** Close all open P7 items. Work through the top UX gaps from the gap analysis that don't require cloud infra.

Kimi owns implementation. PM owns: acceptance criteria, QA sign-off, blocking the gate.

Open P7 items:
- Keyboard / reduced-motion / contrast / error state coverage on Appearance surface
- Slot fallback, package isolation, CSP, rollback tests for Tier 3 package loader
- Manual responsive QA (blocked until Playwright is available — flagged to ONEComputer)

ONG-01 items Kimi can close locally (no DATABASE_URL):
- Missing Settings panel (user preferences)
- Notifications panel (bell icon wired but panel not built)
- Mobile layout gaps (375px overflow checks)
- Empty-state copy for all pages
- Keyboard navigation (focus trapping, skip-link)

### Sprint 2: P4 local acceptance
**Goal:** Prove P4-01 and P4-02 with a local Postgres. Requires `docker compose up -d postgres` in the dev environment.

Blocker to unblock: ONEComputer must provide DATABASE_URL. See improvement plan.

### Sprint 3: Production deploy
**Goal:** Live Fly.io instance. P4-03 + P4-04. Requires: Resend API key, Fly.io secrets.

### Sprint 4: Cloud sandbox
**Goal:** E2bRuntimeAdapter. Requires E2B_API_KEY.

---

## Acceptance criteria per phase

### P7 done when:
- [ ] Appearance surface has keyboard navigation tests (Tab focus, Escape closes modal, Enter confirms)
- [ ] `prefers-reduced-motion` respected (no transition animation in CSS when set)
- [ ] Slot fallback test: missing slot in package → graceful default, no crash
- [ ] CSP header present on all main app routes (verify in server/index.ts)
- [ ] Rollback test: bad theme package integrity → base theme loads, no 500
- [ ] `npm run check` ≥ 311/63

### P4-01 done when:
- [ ] `npm run e2e:postgres-auth-http` passes against real Postgres
- [ ] Resend delivery proven (staging)
- [ ] Org-backed route policy closes org-member access gap

### ONG-04 done when:
- [ ] Screenshot evidence: 5 pages × desktop + mobile in both light/dark
- [ ] Automated via Playwright (not manual)

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| OpenRouter credits exhaust during Kimi sprint | High | Kills session mid-task | Top up credits; add direct Moonshot API key as non-OpenRouter path |
| Kimi uses wrong cwd | Low | One failed npm run | Brief includes explicit `cd` instruction |
| Non-atomic task/filesystem promotion boundary | Medium | Data loss under crash | P4-02 open item; requires explicit fix before production |
| DATABASE_URL not in local env | High | P4 e2e cannot run | ONEComputer infrastructure fix required |
| No Playwright | Medium | Can't close ONG-04 / P7-07 | ONEComputer browser automation must be enabled |
