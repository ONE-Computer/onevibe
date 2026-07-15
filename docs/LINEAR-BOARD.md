# ONEVibe Linear board

## Canonical project

[ONEVibe — Backend E2E & Manus Parity](https://linear.app/onecomputer/project/onevibe-backend-e2e-and-manus-parity-ff4554221471) is the execution source of truth for ONEVibe. The broader ONEComputer × OpenVTC project owns platform identity, policy, wallet, and gateway work; it is not the ONEVibe product backlog.

The current release gate is [ONE-215](https://linear.app/onecomputer/issue/ONE-215):

1. `ONE-216` — transactional conversation, turn, and message service.
2. `ONE-217` — one independently provisioned ONEComputer microVM lease per conversation.
3. `ONE-218` — Claude Agent SDK inside that microVM, exclusively through LiteLLM.
4. `ONE-219` — durable native events, resumable streaming, and history projection.
5. `ONE-220` — real PPTX/PDF generation and bounded extraction inside the microVM.
6. `ONE-221` — real-provider E2E with restart, failure injection, and teardown proof.
7. `ONE-222` — isolation, short-lived credentials, quotas, egress, and reconciliation.
8. `ONE-223` — bind the Manus-style UX to the proven backend.
9. `ONE-224` — add ONEComputer policy and external OpenVTC approvals after backend stabilization.

## Product invariant

The correctness-first model is **one durable conversation → one microVM lease**. Follow-up turns reuse the same lease, workspace, and Claude session; different conversations must never share a lease. Pooling, snapshots, and warm reuse are deferred until the real-provider E2E proves isolation, restart recovery, artifact extraction, cancellation, and teardown.

## API access

Read the credential at `../handover/onecomputer-handover-secrets-lean/mac/linear-api-key.txt` only into `LINEAR_API_KEY` for the duration of a command. Send GraphQL requests to `https://api.linear.app/graphql` with the key in the `Authorization` header. Never print the key, use `set -x`, include it in a URL or issue, write it into `.env`, or commit it.

## Hygiene

- Keep one canonical ticket per deliverable and preserve old history with a successor comment before closing a superseded issue.
- `Urgent` means the current backend release gate; `High` means a direct next dependency; UI parity and deferred security integrations remain Medium until the backend spine is green.
- Descriptions must include the backend contract, lifecycle/state model, failure behavior, security invariants, acceptance tests, evidence, dependencies, and non-goals.
- Do not mark a task Done from demo mode, a host-process fallback, mocked provider IDs, fixture-only artifacts, or a passing unit test that never reaches the real provider.
- After implementation, comment with commit SHA, commands, live provider/runtime IDs (non-secret), evidence-chain result, artifact validation, teardown receipt, and remaining limitations.
