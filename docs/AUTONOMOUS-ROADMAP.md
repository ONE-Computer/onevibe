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
| 2026-07-18 check-in 9 (30-min cron) | 201f1dd fix(P12-01) icon fix | ✅ 371/69 | Both sessions busy=true. Session A self-fixed P12-01 (LayoutKanban → Kanban icon). Both sessions active — no intervention needed. |

