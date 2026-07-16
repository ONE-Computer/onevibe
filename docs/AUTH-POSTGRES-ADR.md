# Auth and Postgres target architecture

Status: proposed; the feature-gated Better Auth SQLite foundation is implemented, while the authenticated data-plane owner contract remains open under P4-01, P4-02, P4-03, and P4-06.

## Decision

ONEVibe will use Better Auth for session and email-OTP lifecycle, Drizzle ORM as the application database contract, and PostgreSQL as the cloud deployment database. Better Auth’s Drizzle adapter supports PostgreSQL and SQLite, which lets local tests use an isolated SQLite fixture while production uses the same typed schema against Postgres. The auth tables and ONEVibe tables must live behind one database migration/versioning process; two independent stores would make user scoping and deletion semantics difficult to prove.

Reference implementation guidance:

- [Better Auth Drizzle adapter](https://better-auth.com/docs/adapters/drizzle)
- [Better Auth Email OTP plugin](https://better-auth.com/docs/plugins/email-otp)

## Non-negotiable boundaries

1. Auth middleware must run before every stateful `/api/*` route. Public exceptions are limited to auth endpoints, health/readiness, static assets, and explicitly share-scoped read-only artifact routes.
2. A session’s user ID is a server-derived ownership key, never a browser-supplied task field. Every task, project, schedule, library query, workspace file operation, evidence stream, and fork operation must enforce that ownership key.
3. OTP delivery must be a real email provider in production. A development-only transport may expose a test OTP through a server test seam, but production must fail closed when the email transport is absent; logging an OTP is not a production login flow.
4. Organization membership is a separate authorization decision from authentication. P4-06 adds `orgs` and `org_members`; it must not be inferred from an email domain or a client-side project selector.
5. Secrets remain server-only. Better Auth secrets, SMTP/Resend credentials, Postgres credentials, LiteLLM credentials, wallet credentials, and sandbox tokens must never enter task workspaces, SSE payloads, browser storage, or evidence bodies.
6. Auth does not change the model-routing policy: every Claude, Codex, AgentCore, and future model request still traverses the server-controlled LiteLLM boundary. A first-party Anthropic credential is not an accepted fallback.

## Migration sequence

1. Define Drizzle schemas for Better Auth tables plus `projects`, `tasks`, `turns`, `messages`, `runtime_events`, `native_events`, `schedules`, `workspace_versions`, and `org_members`. Add non-null `owner_user_id` to new rows; retain a nullable legacy migration column only during import.
2. Build a repository interface that preserves the current TaskStore contracts. Implement a SQLite test adapter first, then a Postgres adapter with the same transaction boundaries. No route should branch on database vendor.
3. Add a one-time migration/import command that maps existing local records to an explicit bootstrap owner. It must emit counts and hashes, refuse ambiguous ownership, and never silently assign production data to a default user.
4. Add Better Auth email-OTP endpoints and a session client. Protect API routes in one middleware boundary, then update every store query to receive an authorized owner/org scope.
5. Add ownership and cross-user negative tests before enabling auth by default in a deployed environment: task read, task fork, SSE, workspace file, project knowledge, schedules, library, share, retry, and wallet-approval routes must all reject foreign IDs.
6. Update Compose and the managed deployment config only after the Postgres adapter and migration smoke test pass. The API container must not claim multi-user production readiness while it is still using the SQLite volume.

## Local rollout policy

The current local demo remains available without auth so deterministic provider and UI tests stay runnable. That is a deliberate development mode, not a production bypass. `ONEVIBE_AUTH_ENABLED=true` should be required for deployed multi-user mode; when enabled, missing auth configuration or an unavailable session store must fail closed at startup rather than downgrade to a global local workspace.

## Acceptance gates

- OTP request and verify succeed with a test email transport and do not expose the OTP to the browser response.
- Refresh preserves the session and the user’s conversations.
- Two users cannot read, stream, fork, move, restore, download, share, or delete one another’s data.
- Organization membership and project scope are enforced server-side.
- Postgres restart/reconnect preserves conversations, event-chain validity, and idempotency records.
- The LiteLLM-only route remains enforced in every runtime adapter under authenticated and unauthenticated configuration tests.

Until these gates pass, `Dockerfile` and `docker-compose.yml` are only a hardened local container path backed by SQLite—not a cloud multi-tenant deployment.

## Current foundation slice

`server/auth.ts` now creates a Better Auth instance against the existing local SQLite handle when `ONEVIBE_AUTH_ENABLED=true`, runs the Better Auth schema migration, mounts the `/api/auth/*` handler, uses hashed email OTP storage, and requires a real `ONEVIBE_AUTH_OTP_WEBHOOK_URL`. Missing secret or delivery configuration fails at startup. The local unauthenticated mode remains available for deterministic tests.

The local authenticated data plane now scopes newly created tasks, projects, schedules, conversations, MCP declarations, task routes, and wallet lookups by the server-derived Better Auth user ID. Legacy records without an owner remain inaccessible in authenticated mode. The feature is still not production-ready: organization membership, Postgres/Drizzle ownership, migration/import, and complete route-by-route negative tests remain open. The implementation must not be changed back to a shared authenticated store while those gates are pending.

## Postgres/Drizzle contract slice

`server/db/schema.ts` and `server/db/migrations/0000_onevibe_initial_contract.sql` define the target relational contract. It includes Better Auth's `user`, `session`, `account`, and `verification` tables; `org`/`org_member`; owner- and org-scoped projects, tasks, schedules, MCP declarations, and idempotency; durable turns/messages; hashed runtime/native event projections; runtime leases; and workspace versions. `drizzle.config.ts` plus `npm run db:check`/`npm run db:generate` make the schema reviewable and migration generation reproducible.

This does not yet switch the application to Postgres. The current `TaskStore` still uses SQLite repositories and JSON task/project/schedule files. `scripts/postgres-import.ts` now provides an explicit owner-required migration path with `--dry-run`; it refuses ownerless records unless an operator supplies an owner, refuses mixed owners in the first migration, requires the Better Auth user to already exist, and imports task/project/schedule/MCP state plus durable messages/events/native events/workspace versions transactionally. The importer has been exercised against disposable PostgreSQL 18, including a container restart with row-count recovery. A transaction-compatible runtime repository switch and production idempotency/connection test are still required before `DATABASE_URL` can select the production path.
