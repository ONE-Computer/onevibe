# Self-hosting ONEVibe (Docker)

`docker-compose.prod.yml` is the docker-first production stack: the ONEVibe app image (built from the repo `Dockerfile`) plus a bundled `postgres:16-alpine` service with named volumes and healthchecks. Model traffic still routes exclusively through the operator-configured LiteLLM relay, and the app container never runs database migrations implicitly.

## 1. Prerequisites

- Docker Engine with the Compose v2 plugin (`docker compose version`). No local Node.js, npm, or Postgres installs are required; the image build needs network access to npm.
- A reachable LiteLLM relay endpoint and key (the mandatory model boundary).

## 2. Configure the environment

```bash
cp .env.example .env
```

Fill in `.env`:

- `POSTGRES_PASSWORD` — strong random password for the bundled Postgres service. Keep the password embedded in `DATABASE_URL` in sync with it.
- `DATABASE_URL` — defaults to the internal `postgres` service host, reachable only on the stack network. Change it only for an external database.
- `ONEVIBE_LITELLM_URL` / `ONEVIBE_LITELLM_API_KEY` / `ONEVIBE_LITELLM_MODEL` — mandatory model boundary.
- `ONECOMPUTER_URL` / `ONECOMPUTER_HMAC_SECRET` — optional ONEComputer governance boundary; leave unset for standalone mode.

## 3. Build and start the stack

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

This builds the app image, starts Postgres, waits for its `pg_isready` healthcheck, then starts the app on `http://localhost:4311` (override the published port with `ONEVIBE_PUBLISH_PORT`).

## 4. Apply migrations and verify readiness

The app never migrates implicitly; `/api/health/ready` returns `503` until the reviewed Drizzle ledger is current, so the app container reports `unhealthy` on first boot. Apply the ledger once per deploy (and after upgrades that add migrations):

```bash
docker compose -f docker-compose.prod.yml run --rm app node --import=tsx/esm scripts/postgres-ops.ts migrate
docker compose -f docker-compose.prod.yml run --rm app node --import=tsx/esm scripts/postgres-ops.ts verify
```

Then verify both health contracts:

```bash
curl --fail http://localhost:4311/api/health/live
curl --fail http://localhost:4311/api/health/ready
```

`docker compose -f docker-compose.prod.yml ps` should report both services `healthy`.

## 5. Data, backups, and upgrades

- Data lives in two named volumes: `postgres-data` (database) and `onevibe-data` (app data directory). List them with `docker volume ls`.
- Back up the database from inside the service, e.g. `docker compose -f docker-compose.prod.yml exec postgres pg_dump -U onevibe onevibe > backup.sql`. Take a backup before destructive or long-running migration work.
- Upgrade: `git pull`, then `docker compose -f docker-compose.prod.yml up -d --build`, then re-run the `migrate`/`verify` commands from step 4. Migrations are forward-only; see `docs/DEPLOYMENT-RUNBOOK.md` for the full release and rollback contract.
