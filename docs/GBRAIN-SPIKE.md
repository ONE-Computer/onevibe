# P13-01 — GBrain Spike (knowledge-graph memory layer for ONEVibe agents)

- **Date:** 2026-07-18
- **Target:** [garrytan/gbrain](https://github.com/garrytan/gbrain) v0.42.62.0
- **Environment:** Azure VM `onecomputer-sandbox03` (Ubuntu 22.04, x86_64, 15.6 GiB RAM), reached over SSH as `azureuser`. All installs remote; nothing installed on the local Mac.
- **Outcome:** Ran end-to-end. Postgres-backed brain, 14-page corpus ingested, relationship graph populated and queried, measurements taken. Verdict at the bottom.

## Setup steps that actually worked

```bash
# 1. SSH access (the key path in the brief was stale; ~/.ssh/config alias works)
ssh onecomputer-azure        # HostName 23.102.117.5, user azureuser, key onecomputer_azure_ed25519

# 2. Bun (required — gbrain is a Bun + TypeScript runtime; apt unzip was a prerequisite)
sudo apt-get install -y unzip
curl -fsSL https://bun.sh/install | bash        # bun 1.3.14
export PATH="$HOME/.bun/bin:$PATH"

# 3. GBrain itself (deterministic source install, per INSTALL_FOR_AGENTS.md fallback)
git clone https://github.com/garrytan/gbrain ~/gbrain
cd ~/gbrain && bun install && bun link          # gbrain 0.42.62.0 on PATH

# 4. Postgres 16 + pgvector in Docker
#    - Host port 5432 was ALREADY taken by the pre-existing onecomputer-postgres-1
#      container (do not touch it) -> used 127.0.0.1:5433.
#    - Used pgvector/pgvector:pg16 instead of plain postgres:16-alpine because
#      gbrain's schema needs the vector extension; it ships prebuilt.
docker run -d --name gbrain-pg \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=gbrain \
  -p 127.0.0.1:5433:5432 pgvector/pgvector:pg16
docker exec gbrain-pg psql -U postgres -d gbrain -c "CREATE EXTENSION IF NOT EXISTS vector;"

# 5. Point gbrain at Postgres (PGLite also exists, but the brief asked for server Postgres)
mkdir -p ~/.gbrain && cat > ~/.gbrain/config.json <<'EOF'
{
  "engine": "postgres",
  "database_url": "postgresql://postgres:postgres@127.0.0.1:5433/gbrain",
  "schema_pack": "gbrain-base-v2"
}
EOF
gbrain apply-migrations --yes    # all migrations applied, incl. v0.32.2
gbrain doctor                    # 80/100 health; only warnings = missing API keys
```

Snags hit (all bounded, none fatal):

1. `bun.sh/install` aborts without `unzip` — one apt install fixes it.
2. Host port 5432 already bound by `onecomputer-postgres-1` (pre-existing project container) — moved to 5433.
3. First `docker run` left a created-but-dead container when the port bind failed; `docker rm -f` + re-run on the free port fixed it.

No LLM/embedding API keys were available for this spike. That is a supported
degraded mode: keyword (tsvector) search and the entire graph layer work;
vector search, query expansion, synthesis (`think`), and the dream cycle do not.

## Test corpus and ingestion

14 markdown pages under `~/brain-spike/` (frontmatter `type:` + `[[wikilinks]]` in body):

- `people/` — analysts Sarah Chen, Marcus Webb, Priya Nair (each `company: Meridian Research Partners`)
- `companies/` — Acme Corp, NovaDyne Systems, Helios Biotech, Quantumleaf Analytics, BlueRiver Logistics, Meridian Research Partners
- `analysis/` — 5 fictional research notes (Chen→Acme, Chen→NovaDyne, Webb→Helios, Nair→Acme follow-up, Webb→Quantumleaf), each wikilinking its analyst and companies

```bash
gbrain import ~/brain-spike --no-embed   # 14 pages, 14 chunks, 0.5 s
gbrain extract links --source db         # 22 edges auto-extracted, 1.1 s
# typed ground-truth edges (extraction has no built-in "researched" relation):
gbrain link people/sarah-chen   companies/acme-corp          --link-type researched
gbrain link people/sarah-chen   companies/novadyne-systems   --link-type researched
gbrain link people/marcus-webb  companies/helios-biotech     --link-type researched
gbrain link people/marcus-webb  companies/quantumleaf-analytics --link-type researched
gbrain link people/priya-nair   companies/acme-corp          --link-type researched
```

Note: `gbrain import` does **not** extract edges by itself — `gbrain extract links`
must run afterwards (or rely on `put`/capture-time extraction). Edge type inference
is deterministic regex over the sentence around each wikilink (`works_at`,
`invested_in`, `founded`, `advises`, else `mentions`) — zero LLM calls. In our
corpus it produced 21 `mentions` + 1 `works_at` ("senior analyst at" is not a
recognized pattern), so anything beyond those four relation types needs explicit
`gbrain link` calls or frontmatter fields (`company`, `key_people`, `investors`,
`attendees`, …).

## What the knowledge-graph output looks like (real output)

Query: "what companies has analyst Sarah Chen researched?"

```
$ gbrain graph-query people/sarah-chen --type researched --direction out
[depth 0] people/sarah-chen
  --researched-> companies/acme-corp (depth 1)
  --researched-> companies/novadyne-systems (depth 1)
```

Auto-extracted (no manual edges) view of the same neighbourhood:

```
$ gbrain graph-query people/sarah-chen --direction in
[depth 0] people/sarah-chen
  <-mentions-- analysis/2026-07-06-acme-datacenter-chen (depth 1)
  <-mentions-- analysis/2026-07-08-novadyne-chen (depth 1)
  <-mentions-- analysis/2026-07-11-acme-nair (depth 1)
```

Postgres `links` table after ingest + manual edges (27 total):

```
 link_type  | count
------------+-------
 mentions   |    21      -- auto from [[wikilinks]]
 researched |     5      -- manual typed edges
 works_at   |     1      -- auto-inferred from prose
```

Each edge carries provenance (`link_source` = markdown | frontmatter | manual),
a context excerpt, and origin page/field — visible via `gbrain backlinks <slug>`.

## Measurements (all taken on the VM, this corpus)

Cold start — `gbrain serve --http --port 8391`, launch → HTTP responding:

- Run 1: **1231 ms**; Run 2: **1237 ms** (`/health` → `{"status":"ok","engine":"postgres"}`)

Memory (steady state, idle after traffic):

- `gbrain serve --http` bun process RSS: **~107 MB** (106,928 KB via `ps`)
- Postgres 16 container: **34.8 MiB** (`docker stats --no-stream`)

Query latency — CLI wall time, 3 runs each (includes Bun boot + DB connect):

| Command | Run 1 | Run 2 | Run 3 |
|---|---|---|---|
| `graph-query --type researched` | 1078 | 1119 | 1100 ms |
| `graph <slug> --depth 2` | 1021 | 1033 | 1105 ms |
| `search "datacenter expansion"` (keyword) | 1305 | 1327 | 1303 ms |
| `query "…" --no-expand` (hybrid, degraded) | 1309 | 1295 | 1374 ms |
| `get companies/acme-corp` | 1115 | 1104 | 1095 ms |
| baseline `list -n 1` | 1057 | 1072 | 1069 ms |

The ~1.05 s floor on every CLI call is Bun startup + DB connection; marginal
cost of a graph traversal above baseline is ~30 ms, of full-text search ~250 ms.
DB-side latency (`psql \timing`): graph join **5.1 ms**, tsvector search
**4.3 ms**. I.e. the engine itself is fast; agents should talk to the warm
`serve --http` MCP endpoint rather than shell out to the CLI per call.

Behaviour without API keys: `gbrain think` exits 0 with retrieval results but
`synthesis skipped — NO_ANTHROPIC_API_KEY`; `gbrain query` silently falls back
to the keyword leg only; `gbrain doctor` warns about the unset embedding
provider. Nothing crashes.

## Verdict

**Production-viable as ONEVibe's agent memory layer, with two preconditions —
worth a keyed pilot; not a zero-config drop-in.**

For:

- Real, working knowledge graph on boring infrastructure: plain Postgres 16 +
  pgvector, ~140 MB total RAM for server + DB, ~1.2 s cold start, single-digit-ms
  graph/FTS queries. Easy to run beside our existing stack.
- Typed edges with provenance (`link_source`, context excerpt, origin field) —
  exactly what "what companies has analyst X researched?" needs, and auditable.
- MCP server (`serve --http`, OAuth-scoped, 30+ tools) is the right integration
  surface for ONEVibe agents; CLI/MCP/API all expose the same operations.
- Schema is markdown-on-disk + Postgres, so agent memory stays inspectable and
  git-able; migrations and `doctor` health checks are mature (100+ migrations,
  95–100/100 check suites).

Against / risks:

- **Needs paid keys to be useful semantically.** Without an embedding provider
  (ZeroEntropy default, OpenAI/Voyage fallbacks) and an Anthropic key, you get
  keyword search only — no vector recall, no query expansion, no `think`
  synthesis, no dream-cycle consolidation. Budget this before any pilot.
- **Auto relation-typing is shallow.** Regex inference covers
  works_at/invested_in/founded/advises and fell back to `mentions` for 21/22 of
  our auto edges. Domain relations ("researched", "covers") need manual
  `gbrain link` calls or agent discipline at write time. Their own benchmark
  claims ~70–94% type accuracy on prose — expect to maintain explicit edges.
- **CLI is not the query path.** ~1.05 s fixed overhead per invocation; agents
  must use the warm MCP/HTTP server or the TS library API.
- Operationally young (v0.42.x, single-author project); team/multi-tenant
  scoping is new. Fine for a single-tenant ONEVibe deployment, worth pinning
  versions.

Suggested next step: a keyed pilot (P13-02?) — rerun this corpus with
OpenAI/Anthropic keys, measure `think` quality and vector recall on ~100 real
research notes, and prototype one ONEVibe agent reading/writing memory over
`serve --http` MCP.

## Artifacts left on the VM

- `~/gbrain` (source checkout, `bun link`ed CLI), `~/brain-spike/` (corpus),
  `~/.gbrain/config.json`
- Docker container `gbrain-pg` (Postgres 16 + pgvector, `127.0.0.1:5433`, db
  `gbrain`, password `postgres`) — left running for inspection; `docker rm -f
  gbrain-pg` removes it. The HTTP server was stopped after measurement.
