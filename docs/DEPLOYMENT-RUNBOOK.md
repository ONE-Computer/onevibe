# ONEVibe deployment runbook (P4 release-safety contract)

This runbook describes the currently testable Postgres-backed deployment contract. It is not evidence that a Railway, Fly.io, Azure, or other managed deployment has been provisioned.

## Release invariants

- All model traffic goes through the server-controlled LiteLLM relay. Direct first-party Anthropic/OpenAI/Bedrock credentials are not valid substitutes.
- Apply the reviewed Drizzle migration ledger before starting an API configured with `ONEVIBE_PERSISTENCE_DRIVER=postgres` and `DATABASE_URL`.
- The API container never runs migrations implicitly. A missing or stale Postgres ledger makes `/api/health/ready` return `503`.
- `/api/health/live` is process liveness. `/api/health/ready` is application/database/migration readiness. Provider availability is reported separately by `/api/runtime` and diagnostics.
- Better Auth production mode requires a random `BETTER_AUTH_SECRET`, a real OTP delivery webhook, and trusted origins. Do not enable a console OTP fallback.

## Migration-before-start procedure

1. Provision the database and inject `DATABASE_URL` through the platform secret manager.
2. Run the reviewed migration command from a release job, using the same application revision:

   ```bash
   DATABASE_URL="$DATABASE_URL" npm run db:migrate
   DATABASE_URL="$DATABASE_URL" npm run db:check
   ```

3. Take a database backup before destructive or long-running migration work.
4. Start the new API image with `ONEVIBE_PERSISTENCE_DRIVER=postgres`.
5. Verify both health contracts:

   ```bash
   curl --fail --silent "$ONEVIBE_BASE_URL/api/health/live"
   curl --fail --silent "$ONEVIBE_BASE_URL/api/health/ready"
   ```

6. Verify diagnostics from an authenticated operator session. It must report `persistence.active=postgres`, `runtimeSwitchReady=true`, `directFirstPartyAllowed=false`, and no secret values.

## Backup and restore drill

The local acceptance harness exercises a full custom-format dump and restore, including migration rows, task/event rows, workspace bytes, project-file bytes, and SHA-256 fingerprints:

```bash
DATABASE_URL="$DATABASE_URL" \
ONEVIBE_BACKUP_E2E_ALLOW_MUTATION=true \
npm run e2e:postgres-backup-restore
```

The mutation flag is mandatory because the disposable proof inserts and removes a namespaced fixture. Never run it against a production database. The harness passes credentials to PostgreSQL client tools through environment variables rather than command-line arguments. `PG_DUMP_DOCKER_CONTAINER` may be used when the matching PostgreSQL client is available inside a disposable local Postgres container.

Managed production operations still require encrypted snapshots/PITR, retention, restore authorization, object-storage coverage for any external artifact store, and a scheduled restore drill. Those controls are not represented by the local harness.

## Rollout and rollback

- Use immutable image tags/digests. Do not deploy `latest` as the rollback identifier.
- Keep schema changes forward-compatible with the previous application revision during a rolling deployment. Migrations are forward-only; do not attempt an ad-hoc down migration in production.
- Promote the new image only after migration and readiness checks pass.
- On application failure, roll back to the previous immutable image while preserving the forward-compatible schema. If data must be restored, stop writes, select an approved backup, restore into a controlled database, verify fingerprints/health, and record the incident.
- `SIGTERM` stops accepting new HTTP connections, waits briefly for existing connections, closes the TaskStore database handles, and exits. Long-lived SSE clients are bounded by the shutdown grace period.

## Current external gates

This repository still does not claim managed deployment, secret-manager rotation, production email delivery, PITR, incident automation, egress isolation, microVM attestation, or external OpenVTC/VTI approval. Those require platform credentials and an explicit operational acceptance run.
