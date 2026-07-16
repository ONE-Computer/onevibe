# ONEVibe Linear board

## Canonical project

[ONEVibe — Backend E2E & Manus Parity](https://linear.app/onecomputer/project/onevibe-backend-e2e-and-manus-parity-ff4554221471) is the execution source of truth for ONEVibe. The broader ONEComputer × OpenVTC project owns platform identity, policy, wallet, and gateway work; it is not the ONEVibe product backlog.

Linear also serves as the management and architecture review hub:

- [Architecture, North Star, and Management Overview](https://linear.app/onecomputer/document/onevibe-architecture-north-star-and-management-overview-27ae12db08ed)
- [Backend System Architecture and Data Contracts](https://linear.app/onecomputer/document/onevibe-backend-system-architecture-and-data-contracts-87f16ad25cfa)
- [ADR-001 — One Durable Conversation Owns One MicroVM](https://linear.app/onecomputer/document/adr-001-one-durable-conversation-owns-one-microvm-7f16afddf894)
- [Release Gates and Evidence Matrix](https://linear.app/onecomputer/document/onevibe-release-gates-and-evidence-matrix-57f4789dc493)
- [Risks, Decisions, and Open Questions](https://linear.app/onecomputer/document/onevibe-risks-decisions-and-open-questions-528b7de05f59)
- [Engineering Workstreams and Agent Delegation Model](https://linear.app/onecomputer/document/onevibe-engineering-workstreams-and-agent-delegation-model-2b0ec99f18c5)
- [ADR-002 — Local Transactional Persistence Driver](https://linear.app/onecomputer/document/adr-002-local-transactional-persistence-driver-ec63c2a70f6c)
- [Backend Contract Freeze v1](https://linear.app/onecomputer/document/onevibe-backend-contract-freeze-v1-ef85a800f29d)
- [POC E2E Scope and Exit Criteria](https://linear.app/onecomputer/document/onevibe-poc-e2e-scope-and-exit-criteria-b8cb69cb2ba9)

The current release gate is [ONE-230](https://linear.app/onecomputer/issue/ONE-230/p0-local-onevibe-reliability-and-manus-parity-release-gate). ONEVibe is now explicitly local-first: the product must be a reliable Manus-style workspace powered by the local Claude Agent SDK/LiteLLM path before platform integration work resumes.

The deferred ONEComputer/OpenVTC work remains tracked, but is not on the critical path:

1. `ONE-216` — transactional conversation, turn, and message service.
2. `ONE-217` — one independently provisioned ONEComputer microVM lease per conversation.
3. `ONE-218` — Claude Agent SDK inside that microVM, exclusively through LiteLLM.
4. `ONE-219` — durable native events, resumable streaming, and history projection.
5. `ONE-220` — real PPTX/PDF generation and bounded extraction inside the microVM.
6. `ONE-221` — real-provider E2E with restart, failure injection, and teardown proof.
7. `ONE-222` — isolation, short-lived credentials, quotas, egress, and reconciliation.
8. `ONE-223` — bind the Manus-style UX to the proven backend.
9. `ONE-224` — add ONEComputer policy and external OpenVTC approvals after backend stabilization.
10. `ONE-225` — make ONEComputer allocation idempotent and provider operations recoverable; blocks safe lease creation.
11. `ONE-226` — integrate and attest a real microVM boundary without host Docker-socket exposure; blocks the final production gate.

## Status snapshot — 2026-07-16 (local ONEVibe parity pivot)

The board contains 16 scoped issues: 1 Done, 7 In Progress, and 8 Backlog. That is **6% strict ticket completion** (1/16), or **28% weighted delivery progress** when an In Progress ticket counts as half (1 + 7×0.5 = 4.5/16, rounded). The new ONE-230 release gate is intentionally conservative: it measures the local product path, not the deferred platform path. The broader 102-row parity ledger remains 42 Implemented, 56 Partial, and 4 Missing: **41% strict implementation** and **69% weighted implementation** (Implemented + half of Partial). These are different denominators: the first measures Linear deliverables; the second measures feature breadth.

### Current phase — ONEVibe local reliability and Manus parity

ONE-230 is the active P0. Its release gate is a real local Claude/LiteLLM E2E run with durable history, reconnectable SSE, follow-up turns, cancellation/retry/error states, assistant-ui conversation rendering, plan/tool/activity evidence, screenshots/terminal cards, artifact rail, and responsive browser QA. PPTX/PDF generation remains part of the local creation path. The UI must never imply that local mode is a production network-containment boundary.

ONE-223 and ONE-229 are the active UX workstream. ONE-216 through ONE-220 remain the backend foundation. ONE-221, ONE-225, and ONE-226 are deliberately back in Backlog: their Azure/provider recovery and attested microVM work will resume only after ONE-230 is green. ONE-224, ONE-227, and ONE-228 remain deferred platform/security work.

ONEComputer is not being deleted or bypassed; it is being treated as the later enforcement plane. The current goal is to make the product contract, local runtime, event model, artifact model, and Manus-style interaction reliable enough that platform integration has a stable consumer.

The backend is ahead of the board's raw status: ONE-216 through ONE-220 have substantial implementation slices, and ONE-220 remains Done from real sandbox-origin artifact evidence. The next proof is local, not Azure: ONE-230 must establish a repeatable Claude/LiteLLM conversation, durable history, resumable SSE, error/retry/cancel behavior, artifact projection, and browser-visible evidence. The Azure recovery work on ONE-221/225 and the attested isolation work on ONE-226 remain documented platform follow-up, but are no longer presented as current progress.

No mandatory Linear ticket is missing from the current POC chain. The previously observed credential blocker is resolved through the pre-provisioned server-side project-key path; the key remains outside the repository, browser, evidence, and task workspace. Provider timeout/replay evidence remains in ONE-225; durable native SSE/projection remains in ONE-219; isolation and secret injection remain in ONE-226/ONE-227. The Azure deployment-wrapper PATH/toolchain issue is a follow-up engineering improvement, not a reason to create a duplicate POC ticket. The board does not yet contain a separate ticket for the local Cargo/toolchain prerequisite because that is an environment/setup issue, not a product acceptance gate.

### Latest development-provider POC evidence

The final authenticated run used a temporary ONEVibe data directory and `npm run e2e:onecomputer` with the VM-supported `claude-granola-5-2` alias. It passed with primary task `task_30236182861f43` / sandbox `onevibe-82861f43` and separate task `task_9e70682f63eb40` / sandbox `onevibe-2f63eb40`: same-conversation reuse, distinct-conversation isolation, `sdkRuntime=true`, `litellmRouted=true`, 4 live SSE frames, 31 suffix-only replay frames, 6 visual frames, valid evidence, and `released/released` cleanup. The sandbox produced a 105,984-byte PPTX (`PK`) and 5,461-byte PDF (`%PDF-`). An authenticated provider reconciliation afterward returned zero sandbox rows. `gatewayEnforced=false` remains explicit: this is a development Kasm POC, not production microVM or egress-attestation evidence.

## Product invariant

The correctness-first model is **one durable conversation → one microVM lease**. Follow-up turns reuse the same lease, workspace, and Claude session; different conversations must never share a lease. Pooling, snapshots, and warm reuse are deferred until the real-provider E2E proves isolation, restart recovery, artifact extraction, cancellation, and teardown.

Current ONEComputer Kasm/Daytona adapters are development sandbox providers, not yet accepted microVM evidence. In particular, the Kasm implementation adds `NET_ADMIN` and mounts the host Docker socket. `ONE-226` now has an explicit fail-closed production switch, but still owns the replacement/attestation gate: a real Firecracker/Kata/Cloud Hypervisor-class boundary, signed attestation verification, and live isolation evidence are required before production acceptance. `ONE-225` owns the provider-side idempotent allocation-operation API required to recover safely when provider creation times out after remote acceptance; ONEVibe now has the consuming client seam and fail-closed reconciler, but that does not substitute for provider persistence.

Neither platform enhancement blocks the immediate POC. The POC may use the current provider to prove one conversation reuses one development sandbox across turns, another conversation receives a different sandbox, Claude runs there through LiteLLM, history survives reload, and PPTX/PDF artifacts originate inside and extract from that sandbox. The evidence and UI must say `development sandbox`; production microVM/isolation claims remain blocked by `ONE-226`, and create-timeout ambiguity remains an explicit `ONE-225` limitation.

## API access

Read the credential at `../handover/onecomputer-handover-secrets-lean/mac/linear-api-key.txt` only into `LINEAR_API_KEY` for the duration of a command. Send GraphQL requests to `https://api.linear.app/graphql` with the key in the `Authorization` header. Never print the key, use `set -x`, include it in a URL or issue, write it into `.env`, or commit it.

## Repository-local helper

Use the checked-in CLI instead of hand-written GraphQL snippets:

```bash
npm run linear -- help
npm run linear -- issues
npm run linear -- issue ONE-223 --json
npm run linear -- comment ONE-223 --file /tmp/evidence.md --confirm
npm run linear -- state ONE-223 --name "In Progress" --confirm
npm run linear -- state ONE-223 --name "Done" --dry-run
npm run linear -- create-issue --title "New work" --description-file /tmp/issue.md --confirm
```

The helper lives at `scripts/linear-cli.ts` and uses the canonical project/team IDs by default. Issue listing follows Relay cursors until complete and supports `--state`/`--priority` filters. Credential precedence is `LINEAR_API_KEY`, `LINEAR_API_KEY_FILE`, then the handover key file relative to the repository. It never accepts a credential flag, prints an authorization header, or supports arbitrary GraphQL. Read commands are safe to repeat; mutations require explicit `--confirm` or can be inspected with `--dry-run`. Add new board workflows as typed commands with focused tests rather than copying curl payloads into agent instructions.

### Helper scope and next hardening

The current CLI is sufficient for evidence-driven delivery updates: project/issue reads, cursor-complete project issue listing, comments attached to an issue, named team-state transitions, and confirmed issue creation. It is not a full Linear client yet. The next safe extensions are:

1. `issue update` with an allowlisted set of fields and team-state validation.
2. Standalone cursor-paginated comment listing.
3. GraphQL-side filters for larger projects rather than downloading all issues.
4. Typed transport errors, strict environment-key validation, and read-only retry behavior.
5. Explicit mutation ambiguity/deduplication policy before adding automatic retries.

Do not invent these commands in agent prompts or fall back to ad hoc GraphQL. Until implemented and tested, use the existing narrow commands and record any manual limitation in the Linear comment.

## Hygiene

- Keep one canonical ticket per deliverable and preserve old history with a successor comment before closing a superseded issue.
- `Urgent` means the current backend release gate; `High` means a direct next dependency; UI parity and deferred security integrations remain Medium until the backend spine is green.
- Descriptions must include the backend contract, lifecycle/state model, failure behavior, security invariants, acceptance tests, evidence, dependencies, and non-goals.
- Do not mark a task Done from demo mode, a host-process fallback, mocked provider IDs, fixture-only artifacts, or a passing unit test that never reaches the real provider.
- After implementation, comment with commit SHA, commands, live provider/runtime IDs (non-secret), evidence-chain result, artifact validation, teardown receipt, and remaining limitations.

## Delegation

The main agent remains product manager, architecture owner, integration reviewer, and release-evidence owner. Specialist agents receive bounded tickets only after shared interfaces are approved. Persistence (`ONE-216`) lands its repository/schema contract before runtime lifecycle (`ONE-217`) and event ingestion (`ONE-219`) implement against it. At most two mutating workstreams run concurrently until those foundations stabilize; read-only research and design audits may run wider.

A specialist cannot change another workstream's public contract, introduce frontend-authoritative state, downgrade a real-provider acceptance test to a fixture, or mark an issue Done. Each handoff must identify its issue, changed files/interfaces, migrations/configuration, focused tests, failure/security analysis, limitations, and reproduction commands. The main agent runs the full gate, integrates, commits, and updates Linear.

Contract Freeze v1 establishes the initial implementation order and ownership. `ONE-216` owns the database driver, migrations, Unit of Work, conversation/turn/message authority, and JSON importer. `ONE-217` adds runtime leases and provider operations through the same transaction boundary. `ONE-218` produces fenced Claude/LiteLLM native envelopes. `ONE-219` owns native ingestion, versioned projection, message deltas, quarantine, and cursor-based SSE. `ONE-220` owns the in-microVM renderer and artifact manifest. Shared identifiers or transaction semantics change only through main-agent review and an ADR when cross-cutting.
