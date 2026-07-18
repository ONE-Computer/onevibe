# ONEVibe — Acceptance Criteria Reference
> One-stop reference for what "done" means for every feature and fix.
> Kimi: read this before implementing any TODO item. PM: update this when requirements change.
>
> Last updated: 2026-07-18

---

## Universal definition of done

Every feature is **done** only when ALL of the following pass:

| Gate | Requirement |
|---|---|
| **Gate** | `npm run check` ≥ 394 tests / 72 files (lint + vitest + tsc + vite build) |
| **Self-QA** | Playwright MCP exercises the golden path + at least one edge case |
| **Screenshots** | Evidence saved to `docs/browser-screenshots/qa-<feature>-<ISO>.png` |
| **CHANGELOG** | Entry added to `CHANGELOG.md [Unreleased]` |
| **Pushed** | `git push private main` (Session A) or `git push private fix/session-d-stabilization` (Session D) |
| **No regressions** | Existing features exercised — nothing broken |

---

## P10-02 — Wire VTI consent gate into live connector retrieval

**Business objective:** Every connector call an agent makes must be explicitly consented to by the user via a signed VTI trust task. Currently the consent gate exists (`vti-consent-service.ts`) but is bypassed in production — the agent silently gets tokens without any consent check. This is a security gap: users have no visibility into what the agent is accessing.

**Acceptance criteria:**
1. `authorizePersonalConnectorRetrievalWithVtiConsent` is called on the live connector retrieval path — not just from workflow fixtures.
2. If the VTI consent service is unavailable, the retrieval **fails closed** (returns an error, never returns tokens). `failClosedIfUnavailable: true` is enforced.
3. A retrieval attempted without a valid prior consent decision returns `{ error: 'consent_required', consentRequest: VtiTrustTaskEnvelope }`.
4. An integration test proves scenario 3 — a retrieval with no prior decision returns `consent_required`.
5. Gate passes.

**Key files:**
- `vti-consent-service.ts` — the consent envelope builder (already real and well-designed)
- `personal-connector-broker-service.ts` — wires it for personal connectors; the gap is the live retrieval path
- Search `authorizePersonalConnectorRetrievalWithVtiConsent` to find where it's currently called

**What not to do:** Do not add a new consent service. The existing one is production-quality — wire it in.

---

## P10-03 — condition_match.rs fail-closed (Rust gateway)

**Business objective:** The MITM gateway's policy evaluator currently returns `true` for all requests, meaning every outbound connector call is allowed unconditionally. This makes the governance layer decorative. Fix it to actually evaluate the injected VC before forwarding.

**Acceptance criteria:**
1. `condition_match::matches()` parses the `x-onecomputer-vp` header and verifies the trust-task proof for `vti_vc:<did>` targets.
2. Returns `false` (deny) on: missing header, bad signature, wrong issuer DID, or connectorId mismatch.
3. A cargo integration test with a known-bad VC proves deny fires.
4. Unknown condition targets fail closed (deny), never fail open.
5. `cargo check` passes.

**Key files:**
- `onecomputer-integration/apps/gateway/src/condition_match.rs` — the stub to fix
- `onecomputer-integration/apps/gateway/src/vti_signer.rs` — real verify function to call

---

## P12-05 — Inline status and priority chip pickers

**Business objective:** Users managing multiple agent tasks need to update status/priority without opening a modal or navigating away. Linear-style — click the chip, pick from a dropdown, done.

**Acceptance criteria:**
1. In the board Kanban card and List row: the status chip and priority chip are clickable.
2. Clicking opens an inline dropdown (not a modal, not a navigation). Dropdown closes on outside click or Escape.
3. Status options: Todo / In Progress / Done / Blocked / Cancelled — with colour-coded dots.
4. Priority options: Urgent / High / Medium / Low — with priority icons.
5. Selection fires `PATCH /api/tasks/:id` (add `status` and `priority` fields if not already present).
6. The chip updates immediately (optimistic UI) and reverts on server error with a toast.
7. Keyboard accessible: Tab to chip, Enter/Space to open dropdown, arrow keys to navigate, Enter to select.
8. Gate passes, Playwright QA confirms chip interaction.

**Key files:**
- `src/components/BoardView.tsx` — task cards; look for where priority/status are currently rendered
- `src/lib/api.ts` — add `patchTask(id, { status?, priority? })` if it doesn't exist
- `server/index.ts` — `PATCH /api/tasks/:id` route

---

## P12-06 — "Active now" cross-project panel

**Business objective:** Investment professionals run multiple parallel agent tasks. They need a single glance to see "what are my agents doing right now" without opening each project individually.

**Acceptance criteria:**
1. A persistent "Active now" section appears on the ONEVibe home view and in the sidebar (below the project list).
2. Shows all currently-running agent tasks across all projects — any task with `status === 'running'` and `assignedAgent !== null`.
3. Each entry: `● live` red pulsing indicator, agent name chip, truncated task title, project tag, elapsed time since task started.
4. Clicking an entry navigates to that task's detail view.
5. Maximum 5 entries visible; "View all N →" link expands to show all.
6. Updates live — when a task completes, it disappears from the strip without a page reload (polling or SSE).
7. Empty state: "No agents running" — not blank.
8. Gate passes, Playwright QA confirms strip appears and task links work.

**Key files:**
- `src/App.tsx` and `src/components/HomeHero.tsx` — home view (an "Active now" strip was partially added in P12-03 — check if it exists)
- `src/components/Sidebar.tsx` — sidebar panel
- `src/lib/api.ts` — `getTasks()` or a new `getActiveTasks()` endpoint

---

## P9-20 — Artefacts gallery page

**Business objective:** Artefacts are the primary deliverable of agent work. Currently buried in the task detail sidebar. Promote them to a top-level page so users can browse, filter, and reuse outputs across all tasks.

**Acceptance criteria:**
1. New top-level nav item "Artefacts" links to `/artefacts` (already exists as a route — check `src/App.tsx`).
2. Layout: thumbnail grid (3 columns desktop, 2 tablet, 1 mobile). Each card shows: content thumbnail (renders actual content type — image preview, code snippet, document icon), title, artifact type icon, task it came from, creation date, version badge if > v1.
3. Filter tabs: All / Documents / Images / Code / Links.
4. Search: client-side filter on title.
5. Clicking a card opens the artefact detail (existing workspace preview panel, or a new full-page view).
6. Empty state: "No artefacts yet — complete a task to see your outputs here."
7. Gate passes, Playwright QA confirms grid renders and filters work.

**Key files:**
- `src/components/Artefacts.tsx` — existing artefacts view (may need a rework from list → grid)
- `server/index.ts` — `GET /api/library` or similar endpoint returning artefacts

---

## P9-22 — Memory management page

**Business objective:** For investment and compliance users, the agent's understanding of their context is a professional asset. Users must be able to see what the agent "knows", verify it is accurate, and remove stale entries. This is table-stakes trust-building.

**Acceptance criteria:**
1. New top-level nav item "Memory" links to a dedicated page.
2. Shows a list of memory entries — each from prior task context, user corrections, or explicitly saved facts. Fields: `fact` (the remembered string), `source` (which task it came from), `learnedOn` (date), `category` (firm / role / preference / entity / other).
3. Each entry has an edit button (inline edit of the `fact` string) and a delete button (with confirm).
4. "Clear all" button with a confirmation modal.
5. Audit trail: a small count "N entries · last updated X days ago" in the page header.
6. If memory is empty: informative empty state explaining what types of things get remembered.
7. Backend: `GET /api/memory`, `DELETE /api/memory/:id`, `PATCH /api/memory/:id`, `DELETE /api/memory` (clear all). For now, memory entries can be stored in SQLite in a `memory_entries` table.
8. Gate passes, Playwright QA confirms CRUD works.

---

## P13-05 — Graphiti MCP server wiring

**Business objective:** Graphiti is a temporal knowledge graph (facts with validity windows — when a company's CEO changes, the old fact is invalidated but preserved). Wire it as an MCP server so agents can query and update the knowledge graph during task runs, giving them long-range memory across sessions.

**Acceptance criteria:**
1. The Graphiti MCP server (already running on Azure VM after P13-04 spike — see `docs/GRAPHITI-SPIKE.md`) is registered in ONEVibe's MCP config.
2. An agent can call these tools during a task: `graphiti_search(query)`, `graphiti_add_episode(content, source)`, `graphiti_get_entity(name)`.
3. The MCP health check in the Computers view reports Graphiti as reachable with its tool count.
4. A test task that asks "what do we know about SoftBank's portfolio?" successfully invokes `graphiti_search` and returns a result (or a clean empty-result if no data is seeded).
5. Document the wiring steps in `docs/GRAPHITI-MCP.md`.
6. Gate passes.

**Key files:**
- MCP config in the server/DB (see `runtime_mcp_configs` table)
- `src/components/Computers.tsx` — MCP health display
- `docs/GRAPHITI-SPIKE.md` — Azure install details and connection string

---

## Session D — Bug fix acceptance criteria

Every bug fix from Session D must meet:

1. **Root cause identified** — the fix addresses the root cause, not a symptom. Document in the commit body.
2. **Test written** if the bug is testable via vitest (any state/API/server bug should have a test).
3. **No new behaviour** — fixes only. If a fix requires a new feature to work correctly, flag it to the PM instead of building it.
4. **Gate passes** — `npm run check` ≥ 394 / 72 after every commit.
5. **Commit message** explains the bug and the fix: `fix(state): followUpMutation missing onSuccess caused silent task re-queue failure`.

**Merge-back protocol:** Session D commits to `fix/session-d-stabilization`. The PM cherry-picks or merges them into Session A's `main` at each 30-min check-in, so Session A always has all bug fixes as a stable base.

---

## iOS Session C — P18 acceptance criteria

### P18-10 — Offline approval queue
1. When device is offline, approve/deny actions are queued locally (encrypted, in app sandbox).
2. Queue entry: `{ id: UUID, pendingApprovalId, decision: "approved"|"denied", timestamp: ISO8601 }`.
3. On foreground / network reachability change: drain queue, POST each to backend. Retry with backoff on failure.
4. ApprovalsTab shows a badge count when queue is non-empty.
5. Code-review self-QA (Xcode pending): read every modified file, verify no force-unwraps on non-nil-guaranteed optionals, no missing imports, correct Swift syntax.

### P18-03 — Admin-driven branding
1. `GET /api/workspace/branding` → `{ logoUrl?, accentColor?, workspaceName? }` — fetched on app launch.
2. Cached in UserDefaults for offline use. Graceful degradation: 404 or unreachable → use defaults silently.
3. `accentColor` applied to ThemeManager if provided.
4. `workspaceName` applied to top-level title if provided.
5. Code-review self-QA.

---

## Gate history reference

| Date | Tests | Files | Notes |
|---|---|---|---|
| 2026-07-15 baseline | 288 | 61 | Pre-sprint |
| 2026-07-18 morning | 343 | 66 | After P5-14, P9-series |
| 2026-07-18 check-in 17 | 385 | 70 | After P10-02 partial, P12-03 |
| 2026-07-18 check-in 19 | 394 | 72 | After P12-03/04, UI fixes |
| **Current target** | **≥ 394** | **≥ 72** | Never drop |
