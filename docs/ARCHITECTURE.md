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

The Compose path intentionally does not pretend to use Postgres yet. `DATABASE_URL`, `better-auth`, user scoping, and a Postgres service belong to the still-open Phase 4 persistence/auth slices. Until those contracts land, cloud promotion must treat the SQLite volume as a single-instance local deployment boundary rather than a multi-user production database.

The proposed auth/database contract is recorded in [`AUTH-POSTGRES-ADR.md`](AUTH-POSTGRES-ADR.md). It is intentionally a migration design, not evidence that auth, Postgres, or multi-user isolation already exist.

## Implemented production adapters

- `RemoteRuntimeAdapter` consumes the AgentCore/backend typed SSE contract. Its optional bearer token remains server-side.
- `OneComputerClient` calls the real authenticated `/v1/sandboxes` route and exposes the real `/trigger-governed-action` seam. It intentionally has no approval-decision method.
- When `ONEVIBE_RUNTIME_URL`, `ONECOMPUTER_API_URL`, and their server-side credentials are configured, a remote task provisions its ONEComputer sandbox before runtime execution and records the sandbox/provider boundary on the event timeline.
- Workspace download emits a ZIP containing portable source plus `ONEVIBE-EVIDENCE.json` with task metadata, ordered events, and chain-verification status.
