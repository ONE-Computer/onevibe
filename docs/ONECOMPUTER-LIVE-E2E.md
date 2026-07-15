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
```

The API must provide authenticated `POST/GET/DELETE /v1/sandboxes`, `POST /exec`, and the headless visual runtime endpoints. Browser clients must never receive this key, the project header, X11, CDP, or VNC access.

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

## Blocking gap: asynchronous provisioning lifecycle

This is an integration blocker, not a reason to weaken the ONEVibe boundary:

1. **Provider API:** create/persist the sandbox identity before optional desktop/Claude bootstrap, then return a stable `provisioning` state immediately.
2. **Provider API:** expose a pollable state/progress contract and make `DELETE /v1/sandboxes/:id` terminate bootstrap work idempotently.
3. **ONEVibe:** keep polling state, surface progress as typed evidence, and delete the known sandbox on cancellation, timeout, or post-run cleanup.
4. **Security gate:** attest default-deny gateway egress before setting `ONECOMPUTER_GATEWAY_ENFORCED=true`; local API reachability is not proof of gateway enforcement.

Until (1) and (2) are implemented, a caller can cancel before it receives an ID, leaving the provider unable to participate in reliable automatic cleanup. That is unacceptable for production ephemeral-workspace guarantees.

The ONEVibe runner now persists the provider-returned sandbox ID/state immediately and emits typed state-transition evidence while polling. This client-side prerequisite is covered by tests; the live gate remains the Azure deployment of the corresponding provider repair and its fresh provenance response.

## Required successful proof

Run the following after the provider lifecycle change:

1. Start an ephemeral ONEVibe Website task with `provider=onecomputer`.
2. Capture evidence for sandbox ID, `provisioning` → `started`, gateway-attestation state, and X11 visual frame.
3. Run the controlled agent command, extract an `index.html`, and verify the resulting evidence chain.
4. Cancel a separate task during bootstrap and prove provider-side deletion with no surviving container or sandbox row.
5. Complete a normal task and prove automatic destruction within the lifecycle SLO.
6. Verify the browser has only server-proxied PNG frames and never has runtime, VNC, CDP, API-key, or project-header access.

## Repeatable harness

Once the provider lifecycle repair is deployed and ONEVibe has its server-only ONEComputer configuration, run the controlled Website proof from the ONEVibe repository:

```sh
ONEVIBE_E2E_URL=https://onevibe.example \
ONEVIBE_E2E_REQUIRE_GATEWAY=true \
npm run e2e:onecomputer
```

The harness refuses to run if the ONEComputer provider is unavailable. It creates one disposable Website task, waits for a terminal result, and verifies the recorded sandbox boundary, optional gateway attestation, ephemeral destruction, readiness evidence, optional X11 frame, extracted `index.html`, and evidence-chain validity. It intentionally does not send credentials to the browser or attempt a provider-side cancellation stress test; retain that as the separate controlled proof in the required-success list.
