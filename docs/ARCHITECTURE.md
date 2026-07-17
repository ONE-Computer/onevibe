# ONEVibe architecture

## Product intent

ONEVibe copies the high-leverage Manus interaction model—persistent tasks, visible plans, streaming work, code/files/preview, and portable artifacts—while making the security boundary explicit and delegating trust to ONEComputer and OpenVTC.

```text
Browser (task UX only)
  -> ONEVibe API / durable event timeline
      -> Runtime adapter
          -> Local demo runner OR provider-neutral AgentCore backend
      -> Workspace adapter
          -> Local confined directory OR ONEComputer sandbox API
      -> Policy adapter
          -> ONEComputer Rust gateway / policy service
      -> Approval adapter
          -> OpenVTC Trust Task -> separate VTI Wallet
      -> Evidence adapter
          -> local hash chain OR OpenVTC evidence service / SIEM
```

## Contract borrowed from the AgentCore harness

ONEVibe preserves the harness's provider-neutral run statuses, event lanes, and event types. A run has exactly one ordered event stream. Provider-native messages are retained in payload metadata where permitted, while the UI consumes normalized events such as `assistant_text_delta`, `tool_call_started`, `artifact_created`, and `approval_requested`.

## Security reuse from ONEComputer

Production adapters are intentionally external seams:

- sandbox lifecycle and desktop access from ONEComputer's sandbox service;
- outbound HTTP/tool enforcement from the real Rust gateway;
- strictest-wins organization/project/personal/runtime policy;
- broker-custodied short-lived credentials;
- OpenVTC Trust Tasks and external VTI Wallet proof;
- tamper-evident evidence export.

No sibling source tree is imported at runtime. This keeps the OSS repo buildable and forces explicit versioned contracts.

## Current vertical slice

The local slice proves the UX and contract:

1. create a task;
2. stream a generated five-step plan;
3. show activity/tool events;
4. write a small website into a confined workspace;
5. preview and inspect files;
6. request external approval for publication;
7. withhold publication and complete safely;
8. verify the event hash chain.

It does not claim VM isolation, egress enforcement, real wallet signatures, or cloud runtime execution.

## Container boundary

`Dockerfile` and `docker-compose.yml` provide a local production-shaped image for the current API. The image builds the Vite SPA, runs the hand-rolled API as a non-root UID, exposes only port 4311, persists the current SQLite store on a named volume, and applies `read_only`, `no-new-privileges`, dropped Linux capabilities, and a bounded `/tmp` tmpfs in Compose. The image is not a sandbox for agent execution: provider tools remain governed by the selected `RuntimeAdapter`, and no container claim substitutes for ONEComputer microVM attestation or egress enforcement.

Compose remains SQLite-first for local convenience, while its operator-controlled environment contract can explicitly select Postgres with `ONEVIBE_PERSISTENCE_DRIVER=postgres` and `DATABASE_URL`, and can enable Better Auth with the reviewed secret/webhook variables. The application container never runs migrations implicitly; operators apply the reviewed ledger before rollout. The opt-in coordinator stores task workspace bytes, immutable snapshots, current project files, and project revisions in Postgres and hydrates the local filesystem as a materialized cache. Separate liveness/readiness endpoints, graceful shutdown, and local backup/restore evidence are now present. Private attachment export policy/round trips, crash-safe full workflow transactionality, production broker tuning, secret delivery, PITR/retention, and managed deployment operations remain open; do not treat the local Compose image as production Postgres or sandbox evidence.

The GitHub Actions container gate builds this same image and starts it with an immutable root, bounded writable data/tmp mounts, dropped capabilities, and no-new-privileges. It verifies the health endpoint and non-root UID; this is a packaging/runtime contract, not evidence of cloud deployment or sandbox isolation.

The presentation layer now has a checked-in token boundary at `src/theme/default.css`. Production CSS consumes canonical variables for colors/effects, font family, and pixel radii; a Vitest static gate rejects those raw literals from `src/index.css` and `src/timeline.css`. The token layer preserves the current light/dark visual baseline and exposes neutral asymmetric-radius tokens for future tenant overrides. This is a tenant-free foundation only: there is no tenant config API, admin mutation, remote asset loader, or runtime theme authority yet.

`server/theme-config.ts` adds the next pure boundary: a versioned, bounded `TenantThemeConfig` schema and a server-controlled resolver with session/org, deployment, validated-host, then base-theme precedence. It accepts only presentation/content fields; CSS injection primitives, unsafe URLs, unapproved fonts, unbounded strings, and arbitrary HTML are rejected. The schema is not a persistence or admin API and cannot alter model routing, credentials, approvals, evidence, auth, or sandbox policy.

`fly.toml` is the current managed-deployment contract. Its release command runs `npm run db:ops -- migrate` before the `/api/health/ready` check can pass, and the manifest carries no credentials. It is statically validated but not evidence of a provisioned Fly.io application, production secret delivery, PITR, or rollback.

The proposed auth/database contract is recorded in [`AUTH-POSTGRES-ADR.md`](AUTH-POSTGRES-ADR.md). The running server now has a controlled, authenticated Postgres path and local two-process owner/SSE proofs; this is still not production deployment, organization-policy authorization, or managed secret-delivery evidence.

## Execution-path diagnostics

`GET /api/diagnostics` is an authenticated, bounded status contract for the Computers view. It reports whether the server-controlled LiteLLM boundary is configured, whether the current request is session-scoped, which local persistence driver is active, provider readiness, the configured sandbox boundary, the count of secret-free MCP declarations, and owner-scoped theme audit counters (`tenantCount`, `eventCount`, latest operation/time). Theme diagnostics never return theme JSON, actor IDs, prompts, credentials, or raw provider payloads. `GET /api/mcp/:id/health` independently probes one owner-scoped declaration through initialization and `tools/list`, returning only bounded status, latency, tool count, and generic failure detail. Neither route returns credentials, prompts, raw provider payloads, or production attestation claims. Local organization membership is a separate identity scaffold backed by the shared repository/transaction boundary: it provides owner/member records and owner-only membership mutations, but it does not grant access to tasks, projects, runtimes, or MCP data. The Postgres contract and cloud/microVM boundaries remain explicit follow-up work until their runtime proofs exist.

For visual QA only, `ONEVIBE_TENANT_ID=reference-institutional|reference-financial|reference-philanthropic` makes `GET /api/theme/current` return a checked-in presentation fixture with `persistent=false` and `previewOnly=true` when `NODE_ENV` is not `production`. The loader accepts no arbitrary ID, is read-only, and is not used by mutation routes or runtime/policy selection. Production ignores this variable.

Skill selection is also provider-owned: Claude-backed adapters materialize the selected, hashed packs in the task workspace; the deterministic demo records selection as `not_executed_demo` and never writes skill files. The UI and event ledger must not collapse these states into a generic "skill applied" label.

## Client error surfaces

The SPA mounts Sonner once at the application shell and routes recoverable request failures through user-visible toasts while retaining page-local states for task streams and validation reports. Toasts are notification surfaces only: they do not imply that a request succeeded, replace durable server evidence, or suppress the backend-offline banner.

The current state boundary has three Zustand stores: `useUiStore` owns navigation, inspector, and connection presentation state; `useComposerStore` owns selected skill guides and submission state; `useSessionStore` owns the authenticated session probe. TanStack Query is mounted at the root and owns the cached Skills catalog, runtime-readiness, MCP declaration, Projects, Schedules, Library, paginated Conversations, and task inventory queries; their mutations/cache updates are explicit. Active task snapshots and task mutations intentionally remain on the `App`/`useTask` boundary because the durable task SSE stream is an append-only event projection, not generic Query state.

## Implemented production adapters

- `RemoteRuntimeAdapter` consumes the AgentCore/backend typed SSE contract. Its optional bearer token remains server-side.
- `OneComputerClient` calls the real authenticated `/v1/sandboxes` route and exposes the real `/trigger-governed-action` seam. It intentionally has no approval-decision method.
- When `ONEVIBE_RUNTIME_URL`, `ONECOMPUTER_API_URL`, and their server-side credentials are configured, a remote task provisions its ONEComputer sandbox before runtime execution and records the sandbox/provider boundary on the event timeline.
- Workspace download emits a ZIP containing portable source plus `ONEVIBE-EVIDENCE.json` with task metadata, ordered events, and chain-verification status.
