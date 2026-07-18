# ONEComputer ↔ ONEVibe middleware contract (v1)

> Status: **contract definition, nothing implemented end-to-end yet** (P11-12, 2026-07-18).
> This document defines the versioned HTTP API between **ONEVibe** (the Cowork frontend) and **ONEComputer** (the governed middleware). It is written so a backend developer can implement the ONEComputer side and a frontend developer can implement the ONEVibe client without talking to each other.
>
> ONEComputer implementation target: `onecomputer-integration` repository, `packages/api` (Hono). The routes below do **not** exist there today; per-endpoint honesty notes list the closest existing file. The ONEVibe client stub for this contract is `src/lib/onecomputer-client.ts` (P11-11).

## Scope and non-goals

- This contract covers **service-to-service governance traffic** only: capability discovery, VTI-gated connector consent, sandbox provisioning, approval callbacks, and the governance audit stream.
- It does **not** cover ONEVibe's own task/chat/SSE API (`/api/*`), which stays authoritative for the conversation ledger. Governance events from this contract are *projections into* ONEVibe surfaces, never a second authoritative transcript.
- Per ONEVibe boundary rules, ONEComputer is reached **only** through this versioned HTTP contract — never through sibling imports.
- The ONEComputer deployment this contract targets runs on Azure behind TLS. Local ONEVibe development must label any fixture of these endpoints as a demo; a fixture is not governance evidence.

## Versioning

Every request MUST carry the header:

```
X-ONEComputer-API-Version: 1
```

- Missing header → `400` with code `missing_api_version`.
- Unsupported version → `400` with code `unsupported_api_version`.
- Version `1` responses are additive-only: new optional fields may appear; existing fields never change type or meaning. Breaking changes require version `2` on a parallel path.

## Authentication

All five endpoints require:

```
Authorization: Bearer <ONEVibe service-account token>
```

- The token is a ONEComputer-issued service credential (minted via `packages/api/src/services/api-key-service.ts`), scoped to the ONEVibe integration. It is **not** an end-user credential.
- The token must be configurable on the ONEVibe side via server environment (planned: `ONEVIBE_ONECOMPUTER_BASE_URL` / `ONEVIBE_ONECOMPUTER_SERVICE_TOKEN`). It must never be shipped to the browser, committed, logged, or written into task workspaces or evidence.
- Missing/invalid token → `401` `unauthorized`. Valid token without the required scope → `403` `forbidden`.
- Because of the token rule, browser code must reach these endpoints through a same-origin ONEVibe server proxy (planned `server/onecomputer-bridge.ts`, not built). The client module in `src/lib/onecomputer-client.ts` takes `baseUrl` + `serviceToken` as constructor inputs so the same typed surface works for the proxy and for server-side callers.

## Common error shape

Every non-2xx response from every endpoint returns:

```ts
interface OneComputerError {
  error: string; // human-readable, safe to log, no secrets
  code: string;  // machine-readable, stable within a contract version
}
```

Common codes (endpoint-specific codes are listed per endpoint):

| HTTP | code | Meaning |
|---|---|---|
| 400 | `invalid_request` | Body/params failed schema validation |
| 400 | `missing_api_version` / `unsupported_api_version` | Version header absent or unknown |
| 401 | `unauthorized` | Missing/invalid bearer token |
| 403 | `forbidden` | Token lacks the required scope |
| 404 | `not_found` | Referenced resource does not exist |
| 409 | `conflict` | State conflict (details per endpoint) |
| 500 | `internal_error` | Unhandled ONEComputer failure |
| 503 | `vti_unavailable` | VTI/OpenVTC dependency unreachable — **fail closed** |
| 503 | `sandbox_backend_unavailable` | Requested sandbox backend down — **fail closed** |

Fail-closed rule (non-negotiable, mirrors `failClosedIfUnavailable: true` in `vti-consent-service.ts`): when a trust dependency (VTI consent service, VTA identity minting, gateway) is unreachable, the endpoint MUST return the `503` above and MUST NOT fall back to an ungoverned path.

The `VtiTrustTaskType` values referenced below are the real ones from `onecomputer-integration/packages/api/src/services/vti-consent-service.ts`: `consent/request`, `consent/decision`, `auth/step-up/approve-request`, `auth/step-up/approve-response`, `auth/step-up/verify-actor`. Envelopes use schema `onecomputer.vti-trust-task-envelope.v1` with `proofMode: "external_vti_required"`.

---

## 1. `GET /onevibe/capabilities`

ONEVibe's home page calls this to discover which sandbox backends and connectors are live, so it never renders an option the middleware cannot actually fulfil.

- **Headers:** `Authorization`, `X-ONEComputer-API-Version: 1`
- **Request body:** none

**Response `200`:**

```ts
interface OneComputerCapabilities {
  version: string; // contract version served, e.g. "1"
  sandboxBackends: Array<{
    id: string;                              // stable id, e.g. "kasm", "daytona"
    name: string;                            // display name
    status: 'available' | 'degraded' | 'unavailable';
  }>;
  connectors: Array<{
    id: string;                              // stable connector id
    name: string;                            // display name
    category: string;                        // e.g. "email", "files", "crm"
    oauthReady: boolean;                     // OAuth app configured and healthy
    vtiEnabled: boolean;                     // VTI consent gate wired for this connector
  }>;
  features: {
    vtiConsentGate: boolean;   // VTI consent service reachable right now
    approvalWebhook: boolean;  // approval webhook receiver is wired
  };
}
```

Endpoint-specific codes: none beyond the common table.

```
ONEVibe                     ONEComputer                Gateway/Providers
   |  GET /onevibe/capabilities  |                          |
   |---------------------------->|                          |
   |                             | probe backend + connector|
   |                             | registry health          |
   |                             |------------------------->|
   |                             |      status rollup       |
   |                             |<-------------------------|
   |  200 OneComputerCapabilities|                          |
   |<----------------------------|                          |
```

- **ONEComputer implementation (honest):** does not exist. No `/onevibe/*` route is registered in `onecomputer-integration/packages/api`. Closest internals: `routes/apps.ts` + `services/connection-service.ts` (connector registry) and `services/sandbox-providers/kasm-local-provider.ts` / `daytona-provider.ts` (backends). The endpoint is an aggregation read over those.
- **ONEVibe consumer (planned, not built):** `src/components/HomeConnectorGallery.tsx` (P9-05), rendered from the home view.
- **Security notes:** read-only; no `VtiTrustTaskType` involved. Still service-auth gated — the connector inventory is tenant information. `status`/`vtiEnabled` must reflect a real health probe, never a hardcoded `true`; an endpoint that always reports `available` is a truthfulness bug.

---

## 2. `POST /onevibe/connector/authorize`

Starts (or short-circuits) the VTI-gated OAuth flow for a connector. ONEComputer builds a `VtiTrustTaskEnvelope` pair (`consent/request` + `auth/step-up/approve-request`) and returns either a consent URL the user must visit, or an immediate approval when a live, unexpired consent grant already covers the request.

- **Headers:** `Authorization`, `X-ONEComputer-API-Version: 1`, `Content-Type: application/json`

**Request:**

```ts
interface AuthorizeConnectorRequest {
  connectorId: string;        // id from GET /onevibe/capabilities
  userDid: string;            // DID of the end user granting consent
  taskId: string;             // ONEVibe task this consent is bound to
  requestedScopes: string[];  // OAuth scopes being requested
}
```

**Response `200` — exactly one of two shapes (discriminate on `approved`):**

```ts
// Consent still required — send the user to consentUrl.
interface ConnectorConsentPending {
  envelopeId: string;   // VtiTrustTaskEnvelope id for tracking/audit
  consentUrl: string;   // VTI consent surface URL, bound to envelopeId
  expiresAt: string;    // ISO-8601; after this the envelope is void
}

// Existing grant covers the request.
interface ConnectorApproved {
  approved: true;
  accessToken: string;  // short-lived, scope-bounded token
}

type AuthorizeConnectorResponse = ConnectorConsentPending | ConnectorApproved;
```

Endpoint-specific codes: `404 connector_not_found`, `400 invalid_scopes` (requested scopes outside the connector's declared set), `410 consent_expired` (envelope exists but lapsed — start a new request), `503 vti_unavailable` (fail closed).

```
ONEVibe                     ONEComputer                     VTI
   | POST /onevibe/connector/authorize |                    |
   |---------------------------------->|                    |
   |                                  | build consent/request|
   |                                  | + step-up/approve-   |
   |                                  | request envelopes    |
   |                                  |--------------------->|
   |                                  |   consentUrl / grant |
   |                                  |<---------------------|
   | 200 ConsentPending or Approved   |                    |
   |<----------------------------------|                    |
```

- **ONEComputer implementation (honest):** no route. The envelope machinery is real: `packages/api/src/services/vti-consent-service.ts` (`VtiTrustTaskEnvelope`, fail-closed verification) and `packages/api/src/services/personal-connector-broker-service.ts`; `routes/personal-connectors.ts` exposes the dashboard-session flavour. Gap recorded in the sprint audit: `authorizePersonalConnectorRetrievalWithVtiConsent` is currently invoked with **fixture DIDs**, not a live VTI round-trip — P10-02 closes that.
- **ONEVibe consumer (planned, not built):** `src/components/ConnectorConsentDialog.tsx` (P9-06), launched from the connector gallery; completed grants feed connector context into runtime tasks (P9-07).
- **Security notes:** maps to `VtiTrustTaskType` `consent/request` + `auth/step-up/approve-request` (the decision later arrives as `consent/decision` — see endpoint 4). Fail closed on VTI unavailability. `accessToken` is server-side material: ONEVibe must hold it in server memory only — never in browser state, task workspaces, evidence events, or logs. Preferred evolution (noted, not required by v1): return a broker-held grant reference instead of a raw token, keeping credential custody inside ONEComputer's broker.

---

## 3. `POST /onevibe/sandbox/run`

Provisions a governed sandbox for an agent task. ONEComputer assigns a VTA device identity to the sandbox so its subsequent gateway traffic is attributable to the exact `agentDid` + `taskId` pair.

- **Headers:** `Authorization`, `X-ONEComputer-API-Version: 1`, `Content-Type: application/json`

**Request:**

```ts
interface RunSandboxRequest {
  backend: 'kasm' | 'daytona';
  image?: string;     // backend-specific image ref; omitted = backend default
  taskId: string;     // ONEVibe task the sandbox serves
  agentDid: string;   // DID of the agent identity operating the sandbox
}
```

**Response `200`:**

```ts
interface RunSandboxResponse {
  sandboxId: string;
  sessionUrl: string;  // operator/viewer URL for the sandbox session
  vncPort?: number;    // present for kasm-style VNC backends
  expiresAt: string;   // ISO-8601 lease expiry; sandbox is torn down after this
}
```

Endpoint-specific codes: `400 unknown_backend`, `404 image_not_found`, `409 sandbox_limit_reached`, `503 sandbox_backend_unavailable` (fail closed).

```
ONEVibe                ONEComputer                 VTA              Kasm/Daytona
   | POST /onevibe/sandbox/run |                   |                    |
   |-------------------------->|                   |                    |
   |                           | mint device identity                   |
   |                           | for agentDid+taskId|                   |
   |                           |------------------>|                    |
   |                           |   device DID/VC   |                    |
   |                           |<------------------|                    |
   |                           | create sandbox with identity injected  |
   |                           |--------------------------------------->|
   |                           |        sandboxId + sessionUrl          |
   |                           |<---------------------------------------|
   | 200 RunSandboxResponse    |                   |                    |
   |<--------------------------|                   |                    |
```

- **ONEComputer implementation (honest):** no route. Real internals: `services/sandbox-providers/kasm-local-provider.ts` (E2E-verified 2026-07-05, loopback) and `services/sandbox-providers/daytona-provider.ts` (thin but real API wrapper), plus session-authenticated `routes/sandboxes.ts` for the dashboard. Missing for this contract: a service-account route, and VTA device-identity assignment (P8-09 — does not exist anywhere yet).
- **ONEVibe consumer (planned, not built):** `src/components/TaskSandboxView.tsx` — task-view surface showing the live sandbox session.
- **Security notes:** no `VtiTrustTaskType` covers sandbox provisioning today; the honest statement is that P8-09/P8-10 must extend the envelope family with a device-identity binding before this endpoint can be called governed. Until then every `RunSandboxResponse` is **ungoverned capacity** and must be labelled as such in ONEVibe UI. Fail closed: if device identity cannot be minted (VTA unreachable), the endpoint MUST return `503` and MUST NOT create an anonymous sandbox. `sessionUrl` is capability-bearing — treat like a credential (no logs, no evidence events).

---

## 4. `POST /onevibe/approval/webhook`

ONEVibe notifies ONEComputer of a human approval decision, unblocking a pending gateway action (a paused connector call, a step-up request, a sandbox policy exception). ONEVibe renders the decision UI; ONEComputer remains the approval authority that releases the action.

- **Headers:** `Authorization`, `X-ONEComputer-API-Version: 1`, `Content-Type: application/json`

**Request:**

```ts
interface ApprovalWebhookRequest {
  requestId: string;              // pending approval id (from the audit stream)
  taskId: string;                 // ONEVibe task the decision belongs to
  decision: 'approve' | 'reject';
  actorDid: string;               // DID of the human deciding
  reason?: string;                // optional free-text rationale
}
```

**Response `200`:**

```ts
interface ApprovalWebhookResponse {
  received: true;
}
```

The endpoint is idempotent on `requestId`: a duplicate delivery of the same decision returns `200` `{received: true}` again. A decision for an unknown or already-terminal `requestId` returns `409 approval_not_pending`.

Endpoint-specific codes: `404 approval_not_found` (unknown requestId), `409 approval_not_pending` (already decided/expired), `403 actor_not_authorized` (actorDid is not an entitled approver for the request's org).

```
ONEVibe                     ONEComputer                   Gateway
   | POST /onevibe/approval/webhook  |                     |
   |-------------------------------->|                     |
   |                                 | verify requestId     |
   |                                 | pending + actorDid   |
   |                                 | entitled             |
   |                                 |--------------------->|
   |                                 |   release / deny     |
   |                                 |   pending action     |
   |                                 |<---------------------|
   | 200 {received: true}            |                     |
   |<--------------------------------|                     |
```

- **ONEComputer implementation (honest):** no route. Real internals: `services/approval-service.ts` + `routes/approvals.ts` (dashboard-driven approvals), `routes/openvtc-approvals.ts`, and the Rust gateway's pending-action flow in `apps/gateway/src/approval.rs`. Missing: a service-to-service webhook receiver and a shared `requestId` namespace between ONEVibe tasks and gateway approval requests.
- **ONEVibe consumer (planned, not built):** `server/onecomputer-approval-relay.ts` — server-side relay invoked by the approval UI after a human decision (P9-08); the browser never posts to ONEComputer directly.
- **Security notes:** maps to `VtiTrustTaskType` `auth/step-up/approve-response` (and `consent/decision` when the pending request is a connector consent). ONEComputer MUST re-verify entitlement server-side (`actorDid` is a claim, not proof) and MUST record the decision as a signed envelope before releasing the gateway action. Fail closed: any verification failure → `403`/`409`, and the pending action stays blocked. Never treat ONEVibe's webhook as the approval proof itself; it is the transport carrying the human's decision to the authority.

---

## 5. `GET /onevibe/audit/stream` (Server-Sent Events)

ONEVibe task views subscribe to real-time governance events: connector calls the middleware brokered, approvals now pending, sandbox lifecycle events, and VTI violations. This stream is observability only — it must never be treated as the authoritative enforcement record (that lives in ONEComputer's audit ledger).

- **Headers:** `Authorization`, `X-ONEComputer-API-Version: 1`, `Accept: text/event-stream`
- **Optional:** `Last-Event-ID: <eventId>` to resume after disconnect.

**Wire format (SSE):**

```
id: evt_01J…
event: approval_required
data: {"type":"approval_required","payload":{…}}

```

- `id:` — durable, monotonic event id; used with `Last-Event-ID` for replay.
- `event:` — mirrors `type` for native `EventSource` filtering.
- `data:` — JSON of:

```ts
interface OneComputerAuditEvent {
  type: 'connector_call' | 'approval_required' | 'sandbox_event' | 'vti_violation';
  payload: Record<string, unknown>;
  // payload always carries: occurredAt (ISO-8601), and taskId when the
  // event is attributable to a ONEVibe task. payload must be pre-redacted:
  // no tokens, no secrets, no raw provider bodies, no chain-of-thought.
}
```

Endpoint-specific codes: none beyond the common table. Reconnect policy is client-owned (exponential backoff, resume via `Last-Event-ID`); the server must tolerate reconnect storms without duplicating already-acknowledged events when a cursor is supplied.

```
ONEVibe                     ONEComputer              Gateway/VTI
   | GET /onevibe/audit/stream     |                   |
   | (Last-Event-ID optional)      |                   |
   |------------------------------>|                   |
   |                               | subscribe to      |
   |                               | governance topics |
   |                               |<----------------->|
   |  event: approval_required     |                   |
   |<------------------------------|                   |
   |  event: connector_call        |                   |
   |<------------------------------|                   |
   |        … stream stays open …  |                   |
```

- **ONEComputer implementation (honest):** no route. Real internals: `services/audit-service.ts` and `routes/audit.ts` (durable audit records for the dashboard), `services/audit-timeline-service.ts`, and `routes/console-live.ts` (dashboard live console). Missing: a service-account SSE endpoint with the four-type taxonomy above and a documented redaction boundary.
- **ONEVibe consumer (planned, not built):** `src/components/GovernanceFeed.tsx` (P9-10) — live governance lane in the task view; the `approval_required` events also feed the approval-notification surface (P9-08) and the VTI identity badge (P9-12).
- **Security notes:** the stream itself mints no trust tasks; it *carries* references to envelopes (e.g. `approval_required` payloads include the pending `requestId` used by endpoint 4). Fail closed on the redaction boundary: an event that cannot be safely redacted must be dropped (and the drop counted), never streamed raw. ONEVibe renders these as governance projections; `vti_violation` events must surface as blocking UI, not dismissible toast.

---

## Status

| Endpoint | Implementation state | P-item that wires it | Blocking dependency |
|---|---|---|---|
| `GET /onevibe/capabilities` | **Not started** — no route; registry/backend reads exist internally | P9-05 | Service-account auth middleware on `packages/api` |
| `POST /onevibe/connector/authorize` | **Partial internals** — `vti-consent-service.ts` real but fixture-DID only; no route | P9-06 (+ P10-02 for the live VTI round-trip) | Live VTI consent path (P10-02); real DID issuance for users/agents |
| `POST /onevibe/sandbox/run` | **Partial internals** — kasm/daytona providers real; no service route; no device identity | P9-01, P8-09 | Daytona OSS on Azure (P9-01); VTA device identity (P8-09) |
| `POST /onevibe/approval/webhook` | **Partial internals** — approval service + gateway pending actions real; no webhook receiver | P9-08 | Shared `requestId` namespace between ONEVibe tasks and gateway approvals |
| `GET /onevibe/audit/stream` | **Partial internals** — audit ledger real; no SSE, no four-type taxonomy | P9-10 | Event taxonomy + redaction-boundary sign-off |

The ONEVibe typed client (`src/lib/onecomputer-client.ts`, P11-11) implements this contract as a stub — it typechecks against these schemas but has no live server to call until the rows above move.
