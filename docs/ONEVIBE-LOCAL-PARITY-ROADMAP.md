# ONEVibe local parity delivery plan

Updated: 2026-07-16

## Operating decision

The active product is ONEVibe: a reliable local-first agent workspace with Manus-level interaction quality. ONEComputer, Azure, OpenVTC/VTI approvals, attested microVMs, and enterprise identity are later enforcement and platform tracks. They remain in Linear, but they do not compete with the local release gate.

The main agent owns product sequencing, shared contracts, integration, security boundaries, Linear, and final release evidence. Sub-agents receive one bounded workstream, a disjoint write scope, and an explicit acceptance artifact. They may not change shared API/event contracts or mark tickets Done.

## Release gates

### Gate 0 — local runtime reliability

- Clean local data directory and protected LiteLLM route.
- Real Claude Agent SDK turn reaches a terminal state.
- Follow-up turn preserves conversation/session/workspace identity.
- SQLite transcript and event chain survive API restart.
- SSE reconnect with `Last-Event-ID` is suffix-only and deduplicated.
- Cancel, provider failure, retry, and partial-output states are durable and actionable.

### Gate 1 — Manus workspace parity

- Conversation remains the primary surface, with the agent narrative and user turns visible.
- Live plan, tool calls, terminal results, screenshots/browser frames, files, and artifacts appear in one chronological evidence model.
- The right-side activity/artifact surface is usable without leaving the conversation.
- History/search/reload, keyboard navigation, responsive mobile layout, dark/light mode, and reduced motion pass browser QA.

### Gate 2 — creation parity

- Slides: outline, visual review, speaker notes, PPTX, PDF, download, and provenance.
- Documents: editable source, structured metadata, preview/export.
- Data stories: CSV, analysis metadata, bounded table/filter, visual preview.
- Websites/apps/games: portable source, validation, preview, responsive/a11y evidence.

### Gate 3 — platform promotion (later)

- ONEComputer provider and microVM attestation.
- External OpenVTC/VTI Wallet approvals.
- Default-deny egress, short-lived credentials, enterprise identity, connectors, and Azure deployment.

## Parallel workstreams

| Workstream | Owner | Output | Write scope | Dependency |
|---|---|---|---|---|
| Product lead | Main agent | roadmap, Linear, contracts, integration, release decision | shared interfaces/docs | none |
| Manus parity audit | explorer | ranked behavior gaps and acceptance tests | none | none |
| Backend reliability | explorer/worker | failure matrix and focused fixes | server/tests only, assigned files | Gate 0 |
| Conversation UX | explorer/worker | assistant-ui and browser QA plan | AssistantThread/sidebar tests only | Gate 0 contracts |
| Activity/artifact rail | main agent + worker | chronological run review, causal evidence navigation | Workspace/Computer rail only | native event model |
| Creation parity | explorer/worker | golden tasks and artifact acceptance matrix | mode-artifacts/tests/docs only | Gate 0 |
| Platform follow-up | parked | ONEComputer/OpenVTC/Azure hardening | separate repositories | Gate 3 |

## Active delegation queue — 2026-07-16

| Queue item | Owner | Scope | Acceptance | State |
|---|---|---|---|---|
| Local runtime reliability | Main agent + bounded backend workers | cancellation quiescence, restart reconciliation, SSE handoff, retry identity | focused tests plus local Claude/LiteLLM proof | Gate 0 slice green; platform limitations documented |
| Conversation-first composition | Main agent + UI worker | inline server-derived plan and compact runtime checkpoints | lint/build, desktop and 390px browser review | implementation committed in `c34d6c6`; browser review next |
| Creation parity | Main agent + next worker | rendered slide/document/data/website output and manifest provenance | mode-specific golden tasks, artifact validation, preview review | queued after browser review |

Delegation rule: one worker owns one disjoint file boundary; workers do not change shared runtime contracts, approvals, Linear, or release status. The main agent reviews every diff, runs the full local gate, records evidence, and decides whether the corresponding Linear workstream advances.

## Delegation protocol

Every delegated task must include:

1. the Linear issue or workstream;
2. exact files or read-only boundary;
3. inputs and assumptions;
4. acceptance tests and evidence expected;
5. explicit non-goals and security limits.

Agents work in parallel only when write scopes are disjoint. The main agent reviews the diff, runs the full local gate, updates the implementation log, and posts the evidence to Linear. Research findings are saved under `docs/` before they become implementation assumptions.

## Immediate sequence

1. Finish the local Claude/LiteLLM reliability matrix and restart/reconnect proof, including the HTTP retry idempotency path.
2. Make the default task screen conversation-first with a durable activity/artifact rail.
3. Browser-check the inline plan/execution composition at desktop and 390px mobile widths, then add golden flows for new task → streaming → artifact → follow-up → reload → search. The first desktop/mobile inspection is complete; the golden-flow automation remains open.
4. Run creation golden tasks for document, slides, data, and website modes.
5. Recalculate the parity ledger from observed behavior, not scaffolding presence.
6. Only after Gates 0–2 pass, resume ONEComputer/OpenVTC work.

The cancellation worker is complete in `2fe6a84`; its evidence is deliberately fail-closed because the current remote exec abstraction cannot guarantee that an already-accepted remote command is interrupted by client-side abort.

The local Claude/LiteLLM creation gate is now green for the current contract: two durable turns, persisted session identity, valid evidence, and an eight-slide PPTX/PDF artifact run. The gate remains host-process/local-router evidence; it does not promote ONEComputer, microVM isolation, external wallet approval, or production egress claims.

Creation outputs now have a deterministic provenance manifest for local deterministic mode writers, successful native Claude turns, and the ONEComputer extraction path. The manifest is intentionally metadata-only and hashes actual extracted bytes; runtime validation/build reports remain separate evidence artifacts.

The default local LiteLLM slide gate is now green for the current route: task `task_e1a9c636a57a45` passed with the encoded 12-turn/$2 policy, eight-slide PPTX/PDF outputs, seven hashed manifest outputs, and valid evidence. The coordinator retains its 15-minute turn deadline and bounded cleanup grace; future model/gateway changes must rerun this gate.

The slide review surface now includes page-like responsive previews, notes, navigation, and thumbnails. Because the renderer prompt changed after the last passing live run, the next acceptance run must re-prove the default LiteLLM slide gate against this exact commit.

That re-proof passed as `task_78b67b47a5f346`; the default local slide gate is green against the current renderer/prompt commit.

The same task passed rendered browser QA at desktop and 390px mobile widths, including a real Next interaction and responsive overflow/sidebar checks. Remaining creation parity is now centered on website/data/document preview depth and automated golden-flow coverage, not basic slide rendering.

## Delegated audit synthesis — 2026-07-16

The original audits identified a local release **NO-GO** until the runtime closed these reliability gaps: cancellation/process quiescence, restart reconciliation, the SSE replay/subscription race, provider early-EOF handling, crash recovery between native events and transcript projection, and durable retry identity. Those reliability slices are now implemented and covered by the current local check; the historical findings remain useful regression criteria in `ONE-231`, but should not be read as the current release status.

The largest Manus interaction gap is composition: ONEVibe has a strong Computer rail and durable assistant-ui primitives, but the plan, execution narrative, tool trace, and evidence rail are split across separate surfaces. The default task view must make the evidence surface visible beside the conversation and move the relevant execution blocks into the chronological conversation model.

The largest creation gaps are rendered slide-page parity, speaker-note round-trip, a common artifact manifest, source-derived document preview/PDF, quoted-CSV parsing and lineage, and real local website build/browser review. These are tracked in `ONE-232`; they stay local-first and do not require ONEComputer/Azure/OpenVTC.

The audits were read-only and independently checked the repository, stored Manus evidence, and existing tests. Their findings are inputs to engineering work, not completion evidence.

## Product-lead execution queue — 2026-07-16

The next phase is deliberately split into small, independently reviewable slices. The main agent owns sequencing, shared contracts, integration, Linear, and release evidence. A delegated worker may only take a slice with a disjoint write scope; read-only explorers return findings and acceptance tests without changing product contracts.

| Priority | Slice | Proposed owner | Write scope | Exit evidence |
|---|---|---|---|---|
| P0 | Local golden flow: create task → stream → terminal artifact → follow-up → reload → server-side search/open | main agent (worker handoff remains possible) | `scripts/onevibe-golden-e2e.ts`, `package.json`, focused docs | passed with `task_b6b320da756747` + `task_e81422d4ca1541`: two durable turns, live/replay SSE, restart recovery, searchable transcript, distinct task identity |
| P1 | Document round-trip: source Markdown → preview/PDF → edit → restore | creation worker | document writer/preview module and focused tests only | source-derived preview hash changes, PDF exists, restore returns prior source/preview |
| P1 | Data story parser/lineage: quoted CSV → table/filter/chart metadata | data worker | data parser/writer and focused tests only | quoted fields preserved, malformed input fails clearly, one parsed dataset feeds all views |
| P1 | Website review: local build + desktop/390px preview + validation evidence | web-output worker | website mode writer/validation tests only | build failure is terminal, successful build has preview and responsive/a11y evidence |
| P2 | Conversation golden browser flow and visual regression capture | UI worker | browser QA harness/docs or isolated UI test files | no overflow at 390px, history reload/search, follow-up, activity/artifact rail review |

Delegation is capacity-aware: the current worker pool is saturated by earlier completed/lingering threads, so no redundant agents are spawned. Once a slot is available, the P0 golden-flow slice is the first implementation assignment. This is an execution constraint, not a product blocker; the main agent can continue documentation, integration review, and release-gate work while workers run.

Each slice must report: issue identifier, exact files touched, tests run, evidence IDs/paths safe to retain, security limits, and remaining uncertainty. No slice may mark a Linear issue Done or claim Manus parity from a fixture, cosmetic mock, or generated scaffold alone.

The document slice is now implemented locally: deterministic and native Claude document tasks derive `index.html` and `document.pdf` from `document.md`, and the server regenerates those outputs after guarded source edits and version restores. Focused mode/validation tests, the HTTP round-trip (`task_9c72a7cd51ee4f`), and the full local check pass. Native-provider live document evidence and richer layout/Markdown semantics remain open; this is not a claim that all document authoring features are complete.

The data slice now has a shared bounded CSV parser, visible malformed-input handling, and deterministic source-lineage metadata. The remaining data acceptance work is a provider-backed quoted-CSV golden task plus richer table/chart review; connector and live-source work remains out of scope for the local POC.

## Metrics for the local POC

- ≥95% of golden tasks complete without manual server intervention.
- 100% of acknowledged SSE events survive reload/reconnect without duplication.
- 100% of displayed tool/artifact cards resolve to a durable event ID.
- 0 browser-owned authoritative transcript records.
- 0 secrets or hidden chain-of-thought in browser payloads/evidence.
- Desktop and 390px mobile browser screenshots reviewed for every release candidate.
