# ONEVibe × ONEComputer — Autonomous 7-Day Roadmap
> Written: 2026-07-18. Horizon: 7 days (2026-07-25). PM: Claude Sonnet 4.6. Tech lead: Kimi K3.
> This document is the source of truth for autonomous sprint planning while the product owner is on holiday.
> Updated by the scheduled check-in task every 30 minutes.

---

## Platform vision (locked for this sprint)

**ONEVibe** is the Cowork frontend — the end-user face of the platform. A user opens it, writes a task, connects their tools, and an agent does the work.

**ONEComputer** is the governed cyber infrastructure beneath it — MITM gateway, connector broker, VTI identity, approval engine, CISO audit console, policy enforcement.

**OpenVTI/VTC** is the trust layer threading both together — every connector call, every agent action, every approval is a signed W3C Verifiable Credential rooted in the organisation's VTA (key custody) and VTC (membership + policy).

The platform is **not** three products. It is one platform with three concerns. Kimi should treat every PR as moving all three forward simultaneously.

---

## What is actually real today (honest audit)

| Component | Reality |
|---|---|
| Rust MITM gateway (TLS, forward, rule eval) | ✅ Production quality |
| `vti_signer.rs` — Ed25519 sign/verify via Affinidi TDK | ✅ Real, tested, fail-closed |
| `condition_match::matches()` | ⚠️ Partially real — body_json, mcp_tool, method/host/path evaluated; unknown condition targets fail-open (not closed). P10-03 = add VC eval via `verify_trust_task_proof` + fail closed on unknown |
| Cloud overlay (budget, partner, cloud_apps, KMS) | ❌ All 13 files are one-line stubs |
| `vta-mcp` MCP server (sign, vault, issue_vp, etc.) | ✅ All 10 tools implemented, stdio transport |
| `vti-consent-service.ts` — consent envelope builder | ✅ Real, fail-closed, but never called live |
| `authorizePersonalConnectorRetrievalWithVtiConsent` | ⚠️ Called with hardcoded fixture DIDs, not a live VTI round-trip |
| 48 OAuth connectors | ✅ OAuth flows real; ❌ VTI consent gate not wired for any of them |
| `kasm-local-provider.ts` sandbox | ✅ E2E verified 2026-07-05, loopback proxy + Claude Desktop working |
| `daytona-provider.ts` | ✅ Thin wrapper, API calls real |
| ONEComputer web dashboard | ✅ Comprehensive UI: overview, activity, approvals, rules, connections, sandboxes, audit, CISO console |
| ONEVibe → ONEComputer connection | ❌ Does not exist yet — this sprint builds it |

---

## Phase 21 — The 12 Core ERP Modules (the 80/20 product stack)
> Added 2026-07-18. Cross-referenced from APAC Top 20 ICP profiles (docs/ICP-APAC-TOP20.md). Each module is a manifest that runs on the Phase 20 ERP Core engine. ONEVibe ships the default; the customer's 20% is adjusting thresholds, field labels, routing rules, and branding — 30–45 minutes per module, no developer needed.
> Full module specs, ideal user journeys, and ICP coverage matrix: `docs/ERP-MODULES-80-20.md`.

| Module | ICP coverage | Incumbent replaced | Key UJ |
|---|---|---|---|
| M1 — Approvals Inbox | 20/20 | Email + WhatsApp | All decisions in one card stack, one tap to act |
| M2 — Expense & Reimbursement | 10/20 | SAP Concur | Photo receipt → 45 seconds → paid |
| M3 — Investment / IC Approval | 8/20 | Email + Word minutes | Deal card → fund-routed IC → AAL2 vote → legal trigger |
| M4 — Leave & Absence | 20/20 | Workday | NL request → team coverage check → push approve |
| M5 — Procurement & POs | 8/20 | SAP ME21N | NL description → AI fills PO → one-tap approve |
| M6 — Compliance & Regulatory | 9/20 | PDF forms + email | SAR / EUDR decision → AAL2 seal → regulator export |
| M7 — Contract & Document Sign-off | 10/20 | DocuSign + email chain | Internal approval chain → sealed → external e-sign |
| M8 — Shift Scheduling | 6/20 | WhatsApp + Excel rosters | Auto-fill week → publish → push schedules to staff |
| M9 — Audit & Workpaper | 8/20 | Shared drive + email | Workpaper → EQR → CFO AAL2 → sealed export |
| M10 — IT Service & Incident | 20/20 | ServiceNow portal | AI resolves first → structured ticket as fallback |
| M11 — Performance & Goals | 8/20 | SuccessFactors | SMART goal vibe → continuous feedback → pre-filled review |
| M12 — Grant & Fund Disbursement | 6/20 | Email + Excel trackers | Application → eligibility score → committee AAL2 → disbursement |

**Total: 12 modules × ~5 tasks each = ~60 items. Delivery sequence starts with M1 (aggregator), then M2/M4/M10 (universal wedges), then M3/M6/M9 (high-compliance Tier 1 ICPs).**

---

## Phase 20 — ONEVibe ERP Core: the extensible engine all mini-apps are built on
> Added 2026-07-18. Every mini-app in P16–P19 needs the same four primitives: a typed entity, a state machine, an approval chain, and an immutable audit trail. Building them separately means writing that substrate 18 times. Phase 20 extracts those primitives into a single AI-native ERP Core engine. Each mini-app becomes a manifest (entity schema + workflow definition + form template + permission rules) that the engine runs. SAP/Oracle built the same engine — but in the 1970s around database transactions made visible. ONEVibe's version captures intent in NL, resolves structure invisibly, and treats the audit event bus as the primary store. P16–P19 mini-apps retroactively become the first-party reference apps that validate the engine.

**North star: an admin describes a new workflow in plain language. The engine generates the entity schema, state machine, form cards, and approval routing. No developer. No IT ticket.**

| Section | Items | What it unlocks |
|---|---|---|
| P20-0 Entity registry (P20-01/02/03) | 3 items | Typed entities, relationships, permissions — the data model primitive |
| P20-1 Workflow engine (P20-04/05/06) | 3 items | State machine, org-chart approval routing, SLA + escalation |
| P20-2 Form + card generator (P20-07/08/09) | 3 items | Auto-generated UI from schema, AI pre-fill, vibe-to-manifest builder |
| P20-3 Audit + connector layer (P20-10/11/12) | 3 items | Immutable event bus (primary store), connector bindings, NL query |
| P20-4 Manifest + marketplace (P20-13/14/15) | 3 items | Manifest format, migrate P16–P19 to manifests, vs SAP architecture doc |

**Total: 15 items. This phase makes P16–P19 mini-apps configuration, not code — and makes the marketplace (P17-15) technically meaningful.**

---

## Phase 19 — Enterprise app replacement: ONEVibe vs SAP / Workday / Concur / ServiceNow
> Added 2026-07-18. Root cause: six dominant enterprise platforms (SAP S/4HANA, Workday, SuccessFactors, Concur, ServiceNow, Oracle HCM) share six structural failures — buyer-user divorce, database-first design (T-codes, form-per-table, component hierarchies), compliance-owned workflows, acquisition archipelagos with incompatible data models, bespoke-customisation-as-strategy, and mobile/async never designed in. Result: employees escape to Excel, WhatsApp, and shadow SaaS for every real workflow. ONEVibe answers with mini-apps built for the job-to-be-done: intent captured, compliance executed invisibly by AI, push approvals on mobile, vibe-to-build for self-service.

**North star: an employee submits expenses, requests leave, reports an IT issue, and sets their goals without training, without a portal login, and without touching a form.**

| Section | Items | Enterprise target |
|---|---|---|
| P19-0 Foundation (P19-00) | 1 item | Enterprise pain-point audit doc — six-platform gap table |
| P19-A Expense (P19-01/02/03) | 3 items | SAP Concur: 14 steps → 3 steps + AI |
| P19-B HR self-service (P19-04/05/06) | 3 items | Workday: one-at-a-time bulk ops → scheduling canvas + self-service |
| P19-C IT service desk (P19-07/08/09) | 3 items | ServiceNow: every request is a ticket → agent resolves before ticket exists |
| P19-D Performance + learning (P19-10/11/12) | 3 items | SuccessFactors: 6-acquisition data silos → one connected development loop |
| P19-E Procurement (P19-13/14) | 2 items | SAP: T-code data model exposed → intent captured, structure resolved invisibly |
| P19-F Platform engine (P19-15/16) | 2 items | Intent-to-workflow engine + shadow IT migration kit |
| P19-G Sign-off (P19-17) | 1 item | vs. SAP/Workday/ServiceNow/SuccessFactors/Concur comparison doc |

**Total: 18 items. The six root causes apply to all five platforms — fixing them once in ONEVibe's mini-app engine fixes all five.**

---

## Phase 18 — ONEVibe Mobile: supercharged Okta + corporate super-app
> Added 2026-07-18. Security foundations already real in `verifiable-trust-infrastructure/vta-mobile-core`: UniFFI iOS/Android engine, Secure Enclave/StrongBox key custody, biometric-gated signing, WebAuthn via DID document (no server-side registry), DIDComm v2 push, AAL step-up approve-response Trust Tasks, APNs/FCM wake-up. This is not a greenfield mobile project — the crypto is done.

**North star: every employee carries this app. It is their company identity, their authenticator, their intranet, their approval device, and their VC wallet — all in one. Okta Verify replacement with hardware-rooted DID identity instead of shared-secret OTP.**

| Section | Items | What it unlocks |
|---|---|---|
| P18-A Foundation (P18-01/02/03) | 3 items | RN shell + UniFFI bridge, biometric DID setup, admin customisation layer |
| P18-B Authenticator (P18-04/05/06/07) | 4 items | Push approvals, passkey SSO, AAL2 step-up, VC wallet |
| P18-C Mobile portal (P18-08/09/10) | 3 items | Mobile canvas, mini-app runtime, offline-first secure storage |
| P18-D Device management (P18-11/12) | 2 items | MDM integration + remote revocation, CISO audit trail for mobile |
| P18-E Sign-off (P18-13) | 1 item | vs. Okta/Microsoft Authenticator/Duo comparison doc |

**Total: 13 items. The security crypto is already written — the work is the mobile UX and the ONEVibe integration.**

## Phase 17 — ONEVibe as the world's best intranet: AI-powered super-app for every employee
> Added 2026-07-18. Business objective: replace SharePoint/Confluence/fragmented intranets with a single AI-native super-app every employee actually uses. Model: WeChat mini-programs × Salesforce Experience Builder × Framer AI. Key structural fixes over SharePoint: task-based nav (not IT storage hierarchy), semantic search with typo tolerance, role-based defaults with user override, AI vibe-to-build for any widget.

| Section | Items | What it unlocks |
|---|---|---|
| P17-A Portal canvas + vibe builder (P17-01/02/03/04) | 4 items | Drag-drop canvas, NL vibe builder, persona defaults, brand theming — 5 inputs, done |
| P17-B Navigation + search (P17-05/06/07) | 3 items | Task-based nav, unified semantic search, content freshness / no digital landfill |
| P17-C Employee personalisation (P17-08/09/10) | 3 items | Widget gallery, personal vibe, mobile-first portal for frontline workers |
| P17-D Knowledge base + announcements (P17-11/12) | 2 items | AI-powered policy Q&A, targeted announcements with read receipts |
| P17-E Integrations + extensibility (P17-13/14/15) | 3 items | Connected data widgets, custom mini-app vibe (no-code), mini-app marketplace |
| P17-F Sign-off (P17-16) | 1 item | vs. SharePoint/Confluence/Viva comparison doc |

**Total: 16 items. The admin who "just vibes" is the north star.**

## Phase 16 — Vertical mini-apps: governed AI workflows for knowledge-work sectors
> Added 2026-07-18. Business objective: unlock AI adoption in Accounting/Audit, Law, Finance/IB, Compliance — sectors blocked not by AI capability but by missing human-in-the-loop controls. Model: WeChat/Alipay mini-programs for enterprise B2B. Key insight: **the audit trail IS the product** — every sector's human-in-the-loop requirement is legally attached to a named individual with personal liability.

**White space:** No existing tool combines cross-team kanban + AI agent execution + named approval cards + shared audit trail across org boundaries. Harvey has no workflow. Workiva has no AI agents. GRC platforms have no AI layer. ONEVibe can be all three.

| Section | Items | What it unlocks |
|---|---|---|
| P16-0 Mini-app platform (P16-01/02/03) | Foundation | Auth contract, data isolation, audit event bus, WorkflowAgent template |
| P16-A Legal (P16-04/05/06) | 3 items | Redlining, court filing certification, conflict check |
| P16-B Accounting/Audit (P16-07/08/09) | 3 items | Workpaper review chain, EQR gate, SOX 302/906 certification |
| P16-C Finance/IB (P16-10/11/12) | 3 items | Deal kanban, credit committee, FINRA-supervised comms |
| P16-D Compliance/RegTech (P16-13/14/15) | 3 items | SAR decisions, policy exceptions, KYC re-certification |
| P16-E Cross-vertical (P16-16/17/18) | 3 items | Multi-org workspaces, regulator export, workflow template library |

**Total: 18 items across 6 sections**

## Phase 15 — OpenCowork feature parity
> Added 2026-07-18. Reference: AIDotNet/OpenCowork (563★, Apache-2.0, Electron+React19). Study → gap → implement → screenshot evidence per item.

| ID | Title | Gap vs ONEVibe |
|---|---|---|
| P15-01 | Deep feature audit | Full gap list with screenshots |
| P15-02 | Agent modes (clarify/cowork/code/acp) | Missing — ONEVibe has no mode selector |
| P15-03 | Plan Mode | Missing — agents execute without review step |
| P15-04 | Global memory (SOUL/USER/MEMORY) | Partial — memory page not wired to agent |
| P15-05 | Per-project memory override | Missing |
| P15-06 | Team tools (sub-agent delegation) | Missing |
| P15-07 | Messaging integrations (Slack/Teams/Telegram) | Missing |
| P15-08 | Built-in browser tool for agents | Partial — MCP only, not native tool |
| P15-09 | SSH remote host management | Missing |
| P15-10 | Cron agent (full agent runtime on schedule) | Partial — scheduler exists, no agentic run |
| P15-11 | Goal tracking + token budget | Missing |
| P15-12 | Custom plugin tools (declarative HTTP) | Missing |
| P15-13 | i18n parity (13+ languages) | Partial — en/zh only |
| P15-14 | Parity sign-off doc | Deliverable |

## Phase 14 — Univer SDK: agent-native spreadsheets and slides
> Added 2026-07-18. Apache-2.0, React 18, `@univerjs/*`. `univer-mcp` for natural-language sheet control. Headless Node.js runtime for server-side agent workflows. Slides OSS tier still maturing — spike first.

| ID | Title | What we learn |
|---|---|---|
| P14-01 | Sheets spike | Live interactive sheet as a task artefact (not a download) |
| P14-02 | Agent → sheet output | Agents emit `univer_sheet` events; panel renders live |
| P14-03 | univer-mcp wiring | Agents write sheets via natural language MCP tool calls |
| P14-04 | Slides spike | Is the OSS slides tier usable yet? Honest verdict. |
| P14-05 | Git-style sheet history | Every agent edit diffable + reversible in the artefact panel |

## Phase 13 — Wild exploration (precedes P8 sandbox hardening)
> Added 2026-07-18. Runs on Azure VM only. Learn first, harden second.

| ID | Title | What we learn |
|---|---|---|
| P13-01 | GBrain spike | Can Postgres + TS knowledge graph give agents durable memory? |
| P13-02 | GBrain × ONEVibe | "Remembered context" chips in composer from prior sessions |
| P13-03 | GBrain Minions | Async agent jobs without a sandbox — does it hold? |
| P13-04 | Graphiti spike | Temporal fact invalidation — what did the agent used to know? |
| P13-05 | Graphiti MCP | Agents querying a temporal knowledge graph live during a task |
| P13-06 | A2A protocol | Vendor-neutral agent dispatch over JSON-RPC — viable? |
| P13-07 | Hermes on Azure | vLLM-hosted fine-tune as a named A2A agent in ONEVibe |
| P13-08 | NanoClaw A2A | Your existing NanoClaw agent gets an Agent Card + board assignment |
| P13-09 | Agent ensemble | 2–3 agents debate the same task — parallel branches in task view |
| P13-10 | Agent marketplace | "Summon Agent" page — registry of all runnable agents |
| P13-11 | Synthesis doc | What's production-viable → feeds Phase 8 scoping |

---

## Sprint priorities (Day 1–7)

### Day 1–2: P5-14 + foundation fixes
**Kimi current task:** P5-14 execution trace overhaul (in progress, imminent commit)
After that lands:
- P10-02: Wire VTI consent into live connector retrieval path
- P10-03: Fix `condition_match.rs` always-true stub

### Day 2–3: P10 connector VTI wiring
- P10-01: Connector VTI audit doc
- P10-04: Extend VTI envelopes to all 48 connectors
- P10-05: App-permissions + risk classification for top 10 connectors

### Day 3–4: P9 sandbox backends + ONEVibe bridge
- P9-01: Daytona OSS install on Azure
- P9-05/P9-06: Connector discovery endpoint + OAuth flow in ONEVibe
- P9-07: Connector context in runtime tasks

### Day 4–5: P4 production stack
- P4-04: `docker-compose.prod.yml`
- P4-01: Auth production delivery (email OTP)

### Day 5–6: P8 sandbox identity
- P8-09: VTA device identity per sandbox
- P8-10: Gateway VC injection for sandbox traffic
- P8-11: `vta-mcp` sidecar for sandbox agents

### Day 6–7: P9 ONEVibe governance surfaces + UX uplift
- P9-08: Approval notifications in ONEVibe
- P9-10: Live activity feed (governance events in task view)
- P9-12: VTI identity badge per task
- P9-19: StepTrace — collapse execution trace + plain-English step labels (highest impact for non-technical users)
- P9-20: Artefacts gallery page
- P9-21: Capabilities/Skills discovery page (ties to P11-05)
- P9-22: Memory management page
- P9-23: Light mode as default

---

## Completion snapshot at sprint start

```
P1–P3 + P6    100%  ████████████  Shipped
P5             92%  ███████████░  P5-14 in-flight
P7             90%  ██████████░░  2 small items
P4             42%  █████░░░░░░░  Auth/Postgres/Docker
P8              0%  ░░░░░░░░░░░░  Starts Day 4
P9              0%  ░░░░░░░░░░░░  Starts Day 2
P10             0%  ░░░░░░░░░░░░  Starts Day 1

TARGET at Day 7: P5 100%, P10 60%, P9 40%, P4 70%, P8 30%
OVERALL: ~73% → ~82%
```

---

## Autonomous operating rules (PM directives)

1. **Gate must stay green.** `npm run check` in ONEVibe (334 tests). `cargo check` in the Rust gateway. If either breaks, fix it before anything else.

2. **Document every finding.** Any architectural insight, stub discovered, or integration seam identified goes into `docs/` before the PR closes. Docs are a first-class deliverable.

3. **Security invariants — never violate:**
   - All ONEVibe model traffic through LiteLLM at `http://127.0.0.1:4100`
   - No direct provider API keys in any config file
   - `store_prompts_in_spend_logs: false` stays in LiteLLM
   - `condition_match.rs` fix must fail closed (deny on missing/invalid VC), never fail open
   - Consent gate: `failClosedIfUnavailable: true` is not negotiable

4. **VTI/VTC integration rule:** every connector call an agent makes must eventually produce a signed `VtiTrustTaskEnvelope`. Work toward that state incrementally — don't block on it, but don't move away from it either.

5. **Kimi brief structure:** always include working directory, exact file paths, what to read first, what to write, and what the commit message should be. Kimi works best with concrete targets.

6. **Never claim production acceptance** for something only proven locally. Label all local evidence as `local-only`.

---

## Scheduled check-in log
> Appended by the automated 30-minute task

| Time | Commits shipped | Gate | Brief sent |
|---|---|---|---|
| 2026-07-18 (sprint start) | cb7abc5 (CHANGELOG) | ✅ 334 | P5-14 scrubber overhaul (in progress) |
| 2026-07-18 check-in 1 | 55dbf13 (P5-14 checkpoint rail) | ✅ 343 | P11-12 middleware contract + P10-01 VTI audit |
| 2026-07-18 check-in 2 (post-reboot) | 143af93 (roadmap + Kimi config) | ✅ 343 | P11-12 middleware contract (next brief) |
| 2026-07-18 swarm activated | ad20cae P11-12, e650b9d P11-11, 53ee665 AGENTS, 3ab4ba8 design study | ✅ 343 | Swarm+auto enabled via prompts API — 5 sub-agents dispatched (P10-03, P11-05, P4-04, P9-15, P9-16) |
| 2026-07-18 check-in 3 (context resumed) | LiteLLM 27 routes confirmed incl kimi-for-coding direct | ✅ 343 | Kimi swarm active: 4 sub-agents (3 running, 1 completed). Audit correction: condition_match is partial, not always-true. P10-03 scope updated. |
| 2026-07-18 design study: Perplexity Computer | PERPLEXITY-COMPUTER-DESIGN-STUDY.md created + 6 screenshots saved | ✅ 343 | Correction: Perplexity DOES have a right rail (narrow, persistent: artefacts+usage). Manus right rail = Manus-style live workspace panel is the gold standard for P9-15. P9-19 (StepTrace) confirmed as #1 priority. |
| 2026-07-18 design study: Manus Computer | MANUS-COMPUTER-DESIGN-STUDY.md + 7 screenshots + P9-25/26/27 added to TODO | ✅ 343 | Key Manus patterns: live agent desktop (P9-15 revised), DVR scrubber (P9-25), task milestones (P9-26), task completion + follow-up suggestions (P9-27). P9 backlog now P9-15 through P9-27. |
| 2026-07-18 swarm complete | P9-15, P9-16, P11-05, P4-04, P10-03 all shipped | ✅ 344/67 | Gate up 343→344. P10-03: condition_match now parses x-onecomputer-vp, verifies VC, fails closed. P9-15: slide-in reasoning panel + ThinkingBlock + boot.js. P9-16: ToolGroup grid-rows/inert collapse. P4-04: docker-compose.prod.yml + SELF-HOSTING.md. P11-05: /onevibe/capabilities endpoint. |
| 2026-07-18 design study: Symphony/Linear project board | SYMPHONY-IDEAS-DESIGN-STUDY.md created + 4 screenshots saved + P12-01 through P12-06 added to TODO | ✅ 344/67 | Key insight: AI agents are first-class assignees in Linear (Agent + Agent Session filter dimensions). P12 = project board where humans + agents share a task queue. Priority: P12-01 (board view) + P12-03 (agent assignment) are the core. P12 is independent of P9 swarm and can start after P9-19/25/26/27 land. |
| 2026-07-18 context resumed + Kimi server restarted | Kimi server was stopped, restarted, P9-19/25/26/27 brief re-sent | ✅ 344/67 | Kimi swarm running on P9-19 (StepTrace), P9-25 (DVR scrubber), P9-26 (task milestones), P9-27 (task completion). Gate green. Symphony design study committed. |
| 2026-07-18 check-in 4 (30-min cron) | No new commits — swarm still running | ✅ 344/67 (last verified) | Kimi busy=true, main_turn_active=true. P9-19/25/26/27 in progress. No action needed. |
| 2026-07-18 check-in 5 (30-min cron) | No new commits — Kimi server had died again | ✅ 344/67 (last verified) | Server restarted. Session was idle (no work done). Re-sent P9-19/25/26/27 swarm brief. Kimi now busy=true. |
| 2026-07-18 context resumed (post-compaction) | 9a7fa32 P9-19, 4e27cd0 P9-25/P9-26, dca2983 P9-27 | ✅ 371/69 | P9-19/25/26/27 all shipped. Gate 344→371 (+27 tests, +2 files). Kimi server alive (:58627). Next: P9-20 (Artefacts gallery), P9-21 (Capabilities/Skills page), P12-01 (project board). |
| 2026-07-18 P9-20/P9-21 + skills | fa3e116 P9-20/P9-21, 6cff0fb skills runbooks | ✅ 371/69 | Artefacts gallery + Capabilities pages shipped (Claude direct — Kimi tool execution unreliable outside browser UI). Five Kimi ops/PM skills committed to skills/ and .kimi-code/skills/ for future agents. |
| 2026-07-18 check-in 6 (30-min cron) | No new commits since skills commit | ✅ 371/69 | Kimi idle (busy=false). PM role clarified: Claude directs only, no coding. Brief sent for P12-02 (task metadata: priority+labels) then P12-01 (project board kanban+list). Kimi status: running. |
| 2026-07-18 QA gap identified | 3cc1ca1 skills update | ✅ 371/69 | User flagged: Kimi was only running `npm run check` (compilation) not verifying features in the browser before committing. Skills updated: all brief templates now require `npm run dev → browser verify → kill server → commit`. QA addendum sent to Kimi for P12-01/02 in-flight work. |
| 2026-07-18 check-in 7 (30-min cron) | No new feature commits — Kimi actively running | ✅ 371/69 | Kimi busy=true, main_turn_active=true. Working on P12-01/02 brief (task priority/labels + board view). No action needed. |
| 2026-07-18 P12-02 landed + dual-session QA activated | 60436af P12-02 (priority chips + labels) | ✅ 371/69 | Session A shipped P12-02. User set up Session B (d95dd0b3) as dedicated QA engineer. Two-session architecture locked in: A=coding, B=visual QA. Session B briefed to QA P12-02 now. Skills + memory updated. |
| 2026-07-18 check-in 8 (30-min cron) | 4b2ece4 P12-01 (kanban board + list toggle) | ✅ 371/69 | Session A busy=true (likely P12-03 agent assignment). Session B busy=true (QA-ing P12-02). P12-01 shipped. No intervention needed. |
| 2026-07-18 Playwright MCP wired | ea32234 .kimi-code/mcp.json | ✅ 371/69 | User request: give Session B real browser control. @playwright/mcp wired into project. Chromium installed. Session B re-briefed to use mcp__playwright__browser_* tools directly — no more puppeteer scripts. QA queue: P12-01 + P12-02. |
| 2026-07-18 check-in 10 (30-min cron) | No new feature commits — Session A was idle | ✅ 371/69 | Session A idle (busy=false). Session B busy=true (QA running). Brief sent to A: P12-03 (agent assignment + live indicator + active-now strip) + P13-01 (GBrain spike on Azure VM). P13 wild exploration phase added to roadmap. |
| 2026-07-18 check-in 11 (30-min cron) | 39ad0e4 P13-01 GBrain spike (Azure) | ✅ 372/69 | Both sessions busy=true. P13-01 complete: GBrain ran end-to-end on Azure VM (Ubuntu 22.04, pgvector/pg16, Bun), 14-page corpus ingested, relationship graph queried, measurements taken. Gate up 371→372. Session A running P12-03. No intervention needed. |
| 2026-07-18 check-in 9 (30-min cron) | 201f1dd fix(P12-01) icon fix | ✅ 371/69 | Both sessions busy=true. Session A self-fixed P12-01 (LayoutKanban → Kanban icon). Both sessions active — no intervention needed. |
| 2026-07-18 QA: P12-01 (Session B) | PASS — 4b2ece4 + 201f1dd verified in MCP browser | — (visual QA only) | Board nav item renders; click → `?view=board`; 4 kanban columns with task cards (priority chips on cards); Kanban↔List toggle round-trip verified (list table renders all tasks; board restored byte-identical). screenshots: docs/browser-screenshots/qa-P12-01-2026-07-18T14-41-41-board.png, -list.png, -board-back.png |
| 2026-07-18 QA: P12-02 (Session B) | PASS — 60436af verified in MCP browser | — (visual QA only) | Sidebar priority chips exact colours: urgent=red rgb(167,47,47), high=amber rgb(138,87,0), medium=accent rgb(201,100,66), low=grey rgb(168,168,162); labels grey; plain tasks chip-free, no layout break; 375px chips intact (pre-existing 21px doc-overflow at 375px unrelated to P12-02). screenshots: docs/browser-screenshots/qa-P12-02-2026-07-18T14-48-04-desktop.png, -matrix-seeded.png, -mobile375.png |
| 2026-07-18 check-in 12 (30-min cron) | 990ce97 P20 ERP Core, f847884 P19 enterprise replacement (PM roadmap docs) | ✅ 372/69 | Kimi idle (busy=false). P19 (enterprise app replacement — SAP/Workday/Concur/ServiceNow, 18 items) + P20 (ONEVibe ERP Core engine, 15 items) added to roadmap by PM. Brief sent: P13-02 (Graphiti spike on Azure — temporal knowledge graph) + P13-03 (A2A protocol spike on Azure — agent-to-agent). Both run in parallel on Azure VM. |
| 2026-07-18 check-in 13 (30-min cron) | d22c25b AGENTS.md Gitea push, 22578ee P21 ERP modules, e2b6082 APAC ICP Top 20 (PM docs) | ✅ 372/69 (last verified) | Kimi busy=true, main_turn_active=true — working on P13-02/03 spikes on Azure VM. No intervention needed. PM added P21 (12 core ERP modules, 80/20 stack), APAC ICP Top 20 doc, ERP-MODULES-80-20.md. Overall completion: 78/319 tasks = 24% (foundation layers P1–P7 ≈85% done; production hardening + platform vision phases are the remaining 76%). |
| 2026-07-18 check-in 14 (30-min cron) | 2cf84c7 P13-02 Graphiti spike, cf1ac78 P13-03 A2A spike | ✅ 372/69 | Kimi idle (busy=false). Both Azure spikes shipped. Key findings: (1) Graphiti bi-temporal invalidation verified — ~15s/episode ingest cost, stub embedder used (router has no embedding alias — must add for real pilot). (2) A2A spike found critical bug in server/a2a-adapter.ts: method tasks/sendSubscribe is a dead pre-publication name — all published SDKs use message/stream. Fix is ~30 lines. Brief sent: P13-03b (A2A adapter fix in src) + P13-04 (Hermes-3 tool-call spike on Azure VM). Private GitHub remote added: github.com/ONE-Computer/onevibe-private. |
| 2026-07-18 check-in 15 (30-min cron) | 8ec7739 P13-03b A2A adapter fix, 0261319 P13-04 Hermes spike via LiteLLM | ✅ 372/69 | Kimi idle (busy=false). A2A adapter fixed (message/stream + server-assigned taskId). Hermes spike: 5/5 tool-call accuracy via native prompt format (OpenAI tools array rejected by OpenRouter Hermes providers). Hermes-3-70B + Hermes-4-70B routes added to VM LiteLLM router. Note: ollama was installed mid-run before no-local-models rule landed — left on VM, never benchmarked. No-local-models rule now in AGENTS.md and memory. Brief sent: P10-02 (VTI consent wiring — critical security) + P12-03 (agent assignment + live indicator + active-now strip). |
| 2026-07-18 Session C launched | — | — | User requested a dedicated iOS Kimi session. Session C (session_560510e2) created, cwd=openvtc/vta-mobile-agent-ios. Briefed: Outcome A (codebase audit → docs/MOBILE-CODEBASE-AUDIT.md) + Outcome B (tab/screen map → docs/MOBILE-UX-MAP.md). Private iOS repo created: github.com/ONE-Computer/onevibe-ios-private. Three-session architecture now active: A=ONEVibe web, B=QA, C=iOS. |
| 2026-07-18 check-in 16 (30-min cron) | A: 3e3adac (Session C launch docs) — no new feature commits. C: iOS repo baseline (710c8d6 wallet test) | ✅ 372/69 | Session A busy=true (working on P10-02/P12-03). Session B busy=true (completed last turn). Session C failed — last_turn_reason=failed, no docs/ dir written. Recovery brief sent to C: Outcome A (codebase audit → MOBILE-CODEBASE-AUDIT.md) + Outcome B (tab/screen UX map → MOBILE-UX-MAP.md), parallel run, LiteLLM-only, no ollama. Root cause: iOS workspace created without default model — fixed by passing model in prompt payload. |
| 2026-07-18 check-in 17 (30-min cron) | A: working (uncommitted P10-02/P12-03 in progress — gate up 372→385, +13 tests). C: 51d4215 codebase audit, 2711194 UX map | ✅ 385/70 | Session A busy=true (swarm running P10-02/P12-03). Session B busy=true (QA active). Session C completed audit+UX map — thorough: full file inventory, UniFFI surface, 5 gaps, tab design, ASCII mockups, screen priority rationale. Briefed C: P18-01 tab bar (Home/Approvals/Identity/Portal/Me) + P18-04 approval decision screen, both in parallel. |
| 2026-07-18 check-in 18 (30-min cron) | A: 78f0cee P12-03 (agent assignment + live indicator + active-now strip, QA screenshots included). C: iOS working on P18-01/P18-04 | ✅ 385/70 | Session A idle (completed). Session B busy=true (QA active). Session C busy=true, main_turn_active=true (P18-01 tab bar + P18-04 approval screen in progress). P10-02 (VTI consent) not yet committed — briefed A: P10-02 (VTI consent live wiring, fail-closed) + P12-04 (epic/breadcrumb hierarchy). |
| 2026-07-18 PM UI QA audit | docs/UI-QA-REPORT-2026-07-18.md created | ✅ 385/70 | PM ran full browser audit at 1280x800 + 375px mobile across all views. 6 structural defects found: UI-01 board body-scroll (CRITICAL), UI-02 inconsistent padding (HIGH), UI-03 dark void on short views (HIGH), UI-04 missing eyebrow labels (MEDIUM), UI-05 mobile no backdrop (MEDIUM), UI-06 board max-width (LOW). Session A briefed with exact CSS fixes + self-QA steps. Session A currently busy on P10-02/P12-04 — UI brief queued, will run next. |
| 2026-07-18 Session D launched (stabilization) | session_7ea6663f (new session, no active turns yet) | ✅ 385/70 | User flagged: follow-up messages on completed tasks silently fail (POST returns 202 but task never re-runs — followUpMutation has no onSuccess). Session D spun up for dedicated feature stabilization on branch fix/feature-stabilization. Kimi -p run (session_2a11432d / 4bf1a1de) is actively reading src/App.tsx and UI-QA-REPORT. Kimi has identified: UI-05 already fixed (backdrop exists), UI-04 partially covered (task-kicker eyebrows already in JSX). Priority 1: fix followUpMutation onSuccess in App.tsx. Priority 2: board contained scroll. Priority 3-6: remaining UI fixes. |
| 2026-07-18 check-in 19 (30-min cron) | A: 64b6fec P12-04 (epic/breadcrumbs). C: iOS P18-02/08/11 (Identity, Portal, Me tabs) | ✅ 394/72 | Gate up 385→394 (+9 tests, +2 files). A idle, C idle. Two briefs sent: A = P10-02 (VTI consent wiring, failClosedIfUnavailable:true, SECURITY CRITICAL) + fix(followUpMutation onSuccess) + UI-01..06 layout stabilization from UI-QA-REPORT-2026-07-18.md. C = P18-10 (offline approval queue, encrypt+sync) + P18-03 (admin-driven branding via workspace config endpoint). P10-02 remains the outstanding security critical item. |
| 2026-07-18 Session D worktree launched | git worktree: onevibe-session-d, branch: fix/session-d-stabilization, Kimi session: session_c1bba0b5 | ✅ 394/72 | User requested dedicated bug-hunt session. Created isolated worktree at ../onevibe-session-d on branch fix/session-d-stabilization. Session D briefed: 7-sweep parallel bug discovery (crashes, state, API contracts, UI rendering, CSS/layout, server stability, a11y) → triage → fix → self-QA → push to fix/session-d-stabilization. Session D is live (PID 55543, actively planning swarm). |

