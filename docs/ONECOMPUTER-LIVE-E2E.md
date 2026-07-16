# ONEComputer live E2E evidence

## Scope

This runbook records real integration evidence for ONEVibe's `onecomputer` runtime. It is deliberately separate from local-demo and mock-provider tests. Do not mark the production sandbox gate complete until every success criterion below has evidence from the deployed environment.

## Preflight contract

ONEVibe connects to the ONEComputer API through these server-only variables:

```text
ONECOMPUTER_API_URL=http://onecomputer-api.example
ONECOMPUTER_SERVICE_TOKEN=oc_...
ONECOMPUTER_PROJECT_ID=... # mandatory with an oc_org_ organization key
ONECOMPUTER_GATEWAY_ENFORCED=true # only after independent egress attestation
ONEVIBE_LITELLM_URL=https://litellm.internal.example # server route
ONEVIBE_SANDBOX_LITELLM_URL=https://litellm.sandbox.internal.example # sandbox-reachable route, when different
ONEVIBE_SANDBOX_LITELLM_AUTH_TOKEN=... # optional bearer-token override for the sandbox route
ONEVIBE_LITELLM_API_KEY=... # server-only; never returned to the browser or evidence
ONEVIBE_LITELLM_MODEL=claude-sonnet-5
```

The API must provide authenticated `POST/GET/DELETE /v1/sandboxes`, `POST /exec`, and the headless visual runtime endpoints. Browser clients must never receive this key, the project header, X11, CDP, or VNC access.

For the POC, ONEVibe injects the configured LiteLLM route, model alias, and credential into the sandbox Claude process environment and records only the safe transport/model labels. The credential is not written into the workspace, prompt, Claude journal projection, task state, or browser payload. The ONEComputer control plane necessarily receives the exec request in the current API; production requires a short-lived in-sandbox credential broker or provider-native secret injection so a static gateway key is not present in command transport or provider request logs.

## Live execution attempt

The Azure portal/API service was reachable over an authenticated SSH-forwarded loopback connection:

- `GET /v1/health` returned `200`.
- `GET /v1/sandboxes` returned `200` and an empty list before the test.
- A ONEVibe `onecomputer` task successfully reached `POST /v1/sandboxes`; its evidence recorded the real `run_started` boundary and lifecycle transition.

The provider began a Kasm container for the task, but did not return a sandbox record before the task was cancelled. Investigation showed the create path performing lengthy desktop/Claude installation work synchronously before returning or persisting ownership. Cancellation reached ONEVibe; the test container was explicitly removed and the remote sandbox list was again empty.

## Azure runtime audit — 2026-07-15

A subsequent read-only audit of `onecomputer-openvtc.eastus2.cloudapp.azure.com` confirmed that the public `/api/health` and `/v1/health` endpoints return `200` through nginx. The runtime is not an orphaned compose deployment: `onecomputer-web.service`, `onecomputer-gateway.service`, the Gitea CI bridge, and the OpenVTC DIDComm/VTA/wallet services are active under systemd.

The audit also found three long-lived Kasm containers whose names identify prior E2E experiments, plus several days-old one-off `tsx` desktop inspection/restart commands. These must be reconciled through the provider's sandbox records and idempotent `DELETE` path before cleanup; blindly calling Docker would risk leaving the control-plane ownership record inconsistent. This is a lifecycle-hygiene finding, not proof that the active API can satisfy the required successful proof below.

## Public endpoint recheck — 2026-07-16 (read-only)

The public `https://onecomputer-openvtc.eastus2.cloudapp.azure.com/api/health` and `/v1/health` endpoints both returned `200` with `{"status":"ok"}`. An unauthenticated `GET /v1/sandboxes` returned `200` and `[]`, so no publicly visible sandbox record was present during the recheck.

Both health JSON payloads and nginx `Date` headers reported `Wed, 15 Jul 2026 17:12`, while the workspace conducting the review was dated 16 Jul 2026 (Asia/Singapore). Treat this as a clock/freshness anomaly until the Azure host or edge clock is reconciled and a new observation proves normal time progression. This is not evidence of sandbox lifecycle, authentication, gateway enforcement, or visual-runtime correctness.

## Repeat preflight — 2026-07-16 (read-only)

A subsequent local ONEVibe preflight again reached public `GET /v1/health` with `200`, reporting `{"status":"ok","version":"unknown","timestamp":"2026-07-15T17:54:16.207Z"}`. The nginx `Date` header was likewise `Wed, 15 Jul 2026 17:54:21 GMT`, confirming that the freshness anomaly persisted rather than proving a live-time response.

The local process had no `ONECOMPUTER_API_URL`, `ONECOMPUTER_SERVICE_TOKEN`, or `ONECOMPUTER_PROJECT_ID` configured, and both gateway attestation and browser automation were disabled. No sandbox request was attempted. This is intentionally not a production E2E result: credentials plus the lifecycle and gateway gates above are required before a controlled task may be started.

## Source contract re-verification — 2026-07-16

The ONEComputer integration source contains the lifecycle repair at `d0438e0` (`fix: persist sandbox before asynchronous bootstrap`). Its `POST /v1/sandboxes` route now creates a provider resource in `provisioning`, persists its ownership record, returns `201`, then starts long bootstrap work asynchronously. The associated package test `src/routes/sandboxes.test.ts` passed two cases: persistence-before-bootstrap and cleanup/status update after bootstrap failure.

This proves the source contract, not Azure promotion. The stale public timestamp above means the deployed runtime cannot yet be assumed to include `d0438e0`; deployment provenance, fresh health time, server-side credentials, and gateway attestation remain required before the controlled ONEVibe E2E can run.

## Upgraded harness attempt — 2026-07-16

The backend-first harness was run locally against the public Azure ONEComputer development provider with the sandbox-reachable LiteLLM relay configured and visual capture disabled. Preflight reported both `claude_sdk` and `onecomputer` available. Task `task_0e49cda2385b44` recorded `claudeTransport=litellm`, entered allocation, then received HTTP 504 from `POST /v1/sandboxes` after approximately one minute without a provider sandbox ID.

ONEVibe persisted the allocation lease as `unknown` with no `provider_sandbox_id` and did not retry, preserving the one-conversation/one-sandbox invariant under an ambiguous create result. A read-only authenticated provider listing immediately afterward returned no sandbox rows, so no visible orphan could be identified; this is not equivalent to a provider operation receipt. The required two-turn/deck proof therefore remains incomplete.

The attempt also found that the client propagated the provider's HTML error body into the task failure event. That observability leak was removed immediately: provider errors now expose only the bounded operation path and HTTP status, with a regression test proving response bodies and credentials cannot appear in the caller-visible error.

## Blocking gap: asynchronous provisioning lifecycle

### Consumer-side recovery contract — 2026-07-16

ONEVibe now sends the durable lease's `Idempotency-Key` and `X-Allocation-Operation-Id` on sandbox creation and exposes an authenticated `GET /v1/sandboxes` client path for reconciliation. If creation times out, the lease remains `unknown`; a later acquire/list operation adopts a sandbox only when the provider returns the exact allocation key or operation ID in its typed metadata. Matching by generated sandbox name is deliberately forbidden, and no blind retry is made. This closes the consumer-side safety seam but does not claim provider support: the ONEComputer API must persist the key/operation before dispatch, replay the same request, and return those labels in list/get responses before automatic recovery can pass production acceptance.

This is an integration blocker, not a reason to weaken the ONEVibe boundary:

1. **Provider API:** create/persist the sandbox identity before optional desktop/Claude bootstrap, then return a stable `provisioning` state immediately.
2. **Provider API:** expose a pollable state/progress contract and make `DELETE /v1/sandboxes/:id` terminate bootstrap work idempotently.
3. **ONEVibe:** keep polling state, surface progress as typed evidence, retain the sandbox for the owning conversation across turns, and release it only through an explicit fenced lifecycle action.
4. **Security gate:** attest default-deny gateway egress before setting `ONECOMPUTER_GATEWAY_ENFORCED=true`; local API reachability is not proof of gateway enforcement.

Until (1) and (2) are implemented, a caller can cancel before it receives an ID, leaving the provider unable to participate in reliable automatic cleanup. That is unacceptable for production ephemeral-workspace guarantees.

The ONEVibe runner now persists the provider-returned sandbox ID/state immediately and emits typed state-transition evidence while polling. This client-side prerequisite is covered by tests; the live gate remains the Azure deployment of the corresponding provider repair and its fresh provenance response.

## Required successful proof

Run the following after the provider lifecycle change:

1. Start a ONEVibe Slides conversation with `provider=onecomputer`.
2. Capture evidence for sandbox ID, `provisioning` → `started`, gateway-attestation state, and X11 visual frame.
3. Verify `run_started.payload.agentRuntime=claude_agent_sdk`; a CLI-only launch is not a passing proof.
4. Observe live task-bound SSE `runtime_event` frames before completion, then verify suffix-only `Last-Event-ID` replay.
5. Run the controlled agent command, extract real `deck.pptx` and `deck.pdf` outputs, verify their magic bytes, and verify the resulting evidence chain.
6. Send a follow-up turn and prove it reuses the same lease generation, sandbox identity, workspace, and Claude session.
7. Start a second conversation and prove it receives a distinct sandbox identity.
8. Explicitly release both conversation leases and prove provider-side deletion with no surviving container or sandbox row.
9. Verify the browser has only server-proxied PNG frames and never has runtime, VNC, CDP, API-key, or project-header access.

## Repeatable harness

Once the provider lifecycle repair is deployed and ONEVibe has its server-only ONEComputer configuration, run the controlled Slides proof from the ONEVibe repository:

```sh
ONEVIBE_E2E_URL=https://onevibe.example \
ONEVIBE_E2E_REQUIRE_GATEWAY=true \
npm run e2e:onecomputer
```

The harness refuses to run if the ONEComputer provider is unavailable. It creates a Slides conversation, verifies real PPTX/PDF bytes, sends a follow-up through the same retained sandbox, creates a separate conversation with a distinct sandbox, validates evidence/X11 expectations, then explicitly releases both leases. Set `ONEVIBE_E2E_MODE=website` only when exercising the older website path. It intentionally does not send credentials to the browser or attempt an ambiguous-create reconciliation stress test; retain that as a separate controlled proof.
