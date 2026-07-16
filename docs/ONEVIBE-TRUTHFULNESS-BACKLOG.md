# ONEVibe truthfulness and fake-runtime backlog

Status: **P0 release blocker**  
Observed: 2026-07-16  
Scope: local ONEVibe product path before broader Manus parity work

## Implementation update — 2026-07-16

The first backend/runtime slice is now implemented and live-tested locally:

- New conversations default to the configured Claude Agent SDK provider in the API and to `chat` mode in the UI; the deterministic provider is explicitly labelled `Simulation · no model call`.
- `chat` bypasses plans, artifact generation, validation, and wallet publication flows. A real LiteLLM-routed greeting produced durable SSE deltas, one completed assistant message, no files, and a completed task.
- General artifact mode now accepts portable outputs such as Markdown without forcing `index.html`.
- Claude SDK tool execution has a pre-tool enforcement hook. Bash is allowlisted to one workspace-relative local command and denies shell composition, network commands, credentials, and path escapes. Host paths are redacted from persisted native evidence and the UI.
- The assistant thread now shows a compact, turn-scoped operational trace while preserving the explicit rule that hidden chain-of-thought is not exposed. The Computer rail opens for tool-backed tasks and displays the Bash command/result and artifact evidence.

The repeatable acceptance gate is now also in place:

- `npm run e2e:chat` proves a real Claude/LiteLLM chat stream, follow-up persistence, demo labeling, a generated Markdown artifact, bounded Bash terminal evidence, and API restart recovery from a temporary data root.
- Passing run on 2026-07-16: 8 live SSE frames, 36 replay frames, 2 chat turns, 2 Bash calls, and a valid evidence chain.
- This remains host-process local proof. It must not be described as a microVM, ONEComputer, OpenVTC, or production network-containment proof.

Browser QA also closed an evidence-surface defect in this slice: internal `.claude/skills` files no longer count as portable artifacts, provider thinking-token telemetry is no longer rendered as a reasoning trace, and deterministic history entries carry an explicit `Simulation · no model call` label.

Remaining release work: browser acceptance automation, the true microVM/ONEComputer runtime proof, richer assistant-ui-native composer primitives, and the full sans-serif visual-system pass.

## Why this exists

The browser currently makes the deterministic local demo path too easy to enter and too easy to mistake for a real agent conversation. A plain greeting therefore becomes an artifact task, and the user can see a canned response, generated preview, five-step plan, validation, and wallet approval instead of a normal assistant reply.

This is not a claim that every frontend message is fabricated. The frontend reads durable messages and task-bound SSE. The failure is that the product defaults to a deterministic demo adapter and applies artifact-task orchestration to conversational prompts.

## Reproduced evidence

### Demo path — current screenshot

Request: `Hello - how are you today`

- Task: `task_869e454fe3b140`
- Provider: `demo`
- Mode: `general`
- Assistant content: deterministic `I’ll turn this into a working artifact...`
- Files: `README.md`, `index.html`, `manifest.json`, `validation-report.json`
- Events: source writing, artifact validation, external publication approval
- Runtime boundary: `host_process` / local demo, not Claude and not a microVM

### Explicit Claude path — second reproduction

Request: `Hello - how are you today` with `provider=claude_sdk`, `mode=general`, and no skills.

- Task: `task_0a4206809d3d4c` in an isolated temporary API/data directory
- Claude produced a provider-backed greeting
- The task was nevertheless marked `failed` with `artifact_validation_failed`
- The backend required `index.html` and a task artifact contract even though the user requested no artifact

The model alias and LiteLLM route are evidence of the configured provider path, not proof of Anthropic model identity.

## Prioritized TODOs

### `[BUG][TRUTHFULNESS][P0]` Do not silently default new conversations to the demo provider

Evidence: `src/components/PromptComposer.tsx`, `src/App.tsx`, and `server/index.ts` default to `demo`; starter prompts explicitly call `startTask(..., 'demo')`.

Acceptance criteria:

- When a real Claude provider is configured, new prompts default to that provider or require an explicit, conspicuous demo choice.
- Demo mode is labelled `SIMULATION — NO MODEL CALL` at the composer, task header, timeline, and conversation history.
- Starter prompts use the selected provider and cannot silently create demo tasks.
- The create-task API records the selected runtime and refuses ambiguous provider claims.

### `[BUG][TRUTHFULNESS][P0]` Add conversational intent/mode separate from artifact tasks

Evidence: `general` still receives a five-step artifact plan; `DemoRuntimeAdapter` always writes files and requests publication approval.

Acceptance criteria:

- A `chat` intent/mode exists for ordinary conversation.
- A greeting produces one assistant response, no workspace files, no plan, no artifact validation, and no wallet approval.
- Artifact modes remain explicit for document, slides, website, research, and data creation.
- Follow-up chat messages remain in the same durable conversation and SSE stream.

### `[BUG][TRUTHFULNESS][P0]` Do not fail a successful chat turn because artifact validation is missing

Evidence: `server/claude-sdk-runner.ts` always invokes `validateModeArtifacts` after a successful Claude result and converts missing artifact outputs into `artifact_validation_failed`.

Acceptance criteria:

- Chat success is determined by the provider terminal result and durable assistant message.
- Artifact validation runs only for artifact intents/modes.
- A provider-backed `Hello - how are you today` task ends `completed` with no generated files.
- Artifact-mode failures remain fail-closed and retain the validation report.

### `[BUG][TRUTHFULNESS][P1]` Make skill execution status truthful in demo mode

Evidence: selected skills persist in browser local storage and are attached to demo tasks, but `DemoRuntimeAdapter` does not materialize or execute skill packs.

Acceptance criteria:

- Demo tasks display skills as `selected for simulation`, never as materialized or executed.
- Claude and ONEComputer tasks emit materialization evidence only after the files exist in the provider workspace.
- Skill selection remains task-scoped and does not imply permission expansion.
- Add a regression test proving demo and provider skill evidence cannot be confused.

### `[BUG][TRUTHFULNESS][P1]` Add a release-blocking “hello” acceptance matrix

Acceptance criteria:

- Browser test: submit a greeting with the default configured provider.
- API test: verify provider, intent, files, events, status, and assistant content.
- Demo test: verify the simulation banner and explicit non-production boundary.
- Claude/LiteLLM test: verify durable SSE deltas, one assistant message, and no artifact pipeline.
- Restart/reload test: verify the greeting remains in conversation history without fabricated task artifacts.

## Release rule

ONEVibe is **not** ready for broader Manus parity claims until the P0 truthfulness tickets pass. A green demo-mode artifact test is not evidence that chat works, and a visually convincing timeline must not imply a provider call that did not occur.
