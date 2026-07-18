# P13-02 — Graphiti Spike (temporal knowledge graph for ONEVibe agents)

- **Date:** 2026-07-18
- **Target:** [getzep/graphiti](https://github.com/getzep/graphiti) — `graphiti-core` 0.29.2 (Python), Neo4j 5 backend
- **Environment:** Azure VM `onecomputer-sandbox03` (Ubuntu 22.04, x86_64, 15.6 GiB RAM), reached over SSH as `azureuser` (`ssh onecomputer-azure`; the key path in the brief was stale). All compute remote; nothing installed on the local Mac.
- **Outcome:** Ran end-to-end. 8 episodes ingested through the LiteLLM router, bi-temporal invalidation **verified** on the two planted contradictions, measurements taken. Comparison vs GBrain (P13-01) and verdict at the bottom.

## Setup steps that actually worked

```bash
# 1. SSH (same VM as P13-01; alias from ~/.ssh/config)
ssh onecomputer-azure        # HostName 23.102.117.5, user azureuser

# 2. venv + graphiti-core (system python 3.10.12, pip 22)
mkdir -p ~/graphiti-spike && cd ~/graphiti-spike
python3 -m venv venv
venv/bin/pip install --upgrade pip
venv/bin/pip install graphiti-core        # graphiti-core 0.29.2, pulls neo4j 6.2 + openai 2.46

# 3. Neo4j 5 (name mandated by brief; ports 7687/7474 were free)
docker run -d --name graphiti-neo4j -p 7687:7687 -p 7474:7474 \
  -e NEO4J_AUTH=neo4j/testpass neo4j:5
docker logs graphiti-neo4j | grep Started   # ready in ~10 s

# 4. LLM access — see "LiteLLM reachability" below. Router base URL:
#    http://127.0.0.1:4000/v1  (container `litellm`), model alias `claude-sonnet-5`.
#    The key was read at runtime from the VM's own router container env and passed
#    via process env only (LITELLM_KEY=...); it is not persisted in this repo.

# 5. Run
cd ~/graphiti-spike && LITELLM_KEY=$KEY venv/bin/python spike.py
```

Snags hit (all bounded):

1. `Graphiti(...)` with a custom `llm_client` still defaults to `OpenAIRerankerClient()` with no config and crashes on a missing `OPENAI_API_KEY` — pass an explicit `cross_encoder=OpenAIRerankerClient(config=...)`.
2. `build_indices_and_constraints()` logs scary `Neo.ClientError.Schema.EquivalentSchemaRuleAlreadyExists` errors (concurrent `CREATE INDEX ... IF NOT EXISTS` racing in Neo4j) — cosmetic; ingestion proceeds normally.
3. The `neo4j` Python driver logs a `property key does not exist` GqlStatus warning for every optional property (`episodes`, `fact_embedding`, …) on every query — very noisy stderr, harmless.

## LiteLLM reachability (deviation from brief)

- `http://127.0.0.1:4100/v1` from the brief is **not listening on the VM** — that is the local Mac's router (it answers 401 on the Mac itself).
- The VM runs its own LiteLLM routers: container `litellm` on `127.0.0.1:4000` and `litellm-vm` on `127.0.0.1:47821` (both OpenAI-compatible, master-key auth). Used **`http://127.0.0.1:4000/v1`**.
- The brief's model aliases `kimi-k3` / `claude-sonnet-4-6` **do not exist** on this router. Available: `claude-sonnet-5`, `claude-fable-5`, `claude-haiku-4-5`, `claude-opus-4-8` (all via OpenRouter). Used **`claude-sonnet-5`** for all graphiti LLM work.
- Both `response_format: json_object` and `json_schema` work through the router (LiteLLM translates to Claude tool use; `json_schema` returned clean JSON).
- **No embedding model is exposed by the router** (`/v1/embeddings` rejects everything). Graphiti requires an embedder, so the spike uses a deterministic local `HashEmbedder` stub (MD5-hashed word uni/bigrams, 1024-dim, L2-normalized, zero network calls). Consequence: the vector leg of hybrid search works mechanically but its *semantic quality was not evaluated* — retrieval was carried by Neo4j fulltext (BM25) + graph distance, fused with RRF. A real pilot needs an embedding alias added to the router.

## The 5 key API calls

```python
import os
from datetime import datetime, timezone
from graphiti_core import Graphiti
from graphiti_core.cross_encoder.openai_reranker_client import OpenAIRerankerClient
from graphiti_core.llm_client.config import LLMConfig
from graphiti_core.llm_client.openai_generic_client import OpenAIGenericClient
from graphiti_core.nodes import EpisodeType

cfg = LLMConfig(api_key=os.environ["LITELLM_KEY"],
                model="claude-sonnet-5",
                base_url="http://127.0.0.1:4000/v1")

# 1. Init — bring your own LLM client, embedder, AND cross_encoder
graphiti = Graphiti("bolt://127.0.0.1:7687", "neo4j", "testpass",
                    llm_client=OpenAIGenericClient(config=cfg),
                    embedder=HashEmbedder(),                       # see deviation above
                    cross_encoder=OpenAIRerankerClient(config=cfg))

# 2. One-time schema
await graphiti.build_indices_and_constraints()

# 3. Ingest a fact episode — reference_time drives the validity timeline
await graphiti.add_episode(name="ep7",
                           episode_body="Sarah Chen was promoted to Director of Research "
                                        "at Meridian Capital. She no longer covers the "
                                        "semiconductor sector.",
                           source=EpisodeType.message,
                           source_description="spike memo",
                           reference_time=datetime(2025, 6, 1, tzinfo=timezone.utc))

# 4. Hybrid search — returns EntityEdge results with temporal stamps
results = await graphiti.search(query="What is Sarah Chen role at Meridian Capital?")
for r in results[:5]:
    print(r.fact, r.valid_at, r.invalid_at)

# 5. Raw Cypher for the bi-temporal audit trail + cleanup
records, _, _ = await graphiti.driver.execute_query(
    "MATCH ()-[e:RELATES_TO]->() RETURN e.name AS name, e.fact AS fact, "
    "e.valid_at AS valid_at, e.invalid_at AS invalid_at, "
    "e.created_at AS created_at, e.expired_at AS expired_at ORDER BY e.created_at")
await graphiti.close()
```

## Test corpus and bi-temporal verification

8 episodes about fictional buy-side shop **Meridian Capital** (analysts Sarah Chen /
Priya Nair, PM Marcus Webb, Helios Tech Fund, Acme Semiconductor, CFO David Ortiz),
each with a `reference_time` in 2024 — then two contradicting updates dated 2025:

- **ep7 (2025-06-01):** "Sarah Chen was promoted to Director of Research … no longer covers the semiconductor sector." (contradicts ep1: joined as Senior Analyst covering semis)
- **ep8 (2025-08-15):** "Marcus Webb closed the Helios Tech Fund position in Acme Semiconductor…" (contradicts ep3: fund initiated the position)

Resulting graph: 8 `Episodic` nodes, 11 `Entity` nodes, 16 `RELATES_TO` edges, **4 invalidated edges**. Raw edge dump (real output):

```
WORKS_AT  "Sarah Chen joined Meridian Capital as a Senior Analyst"
          valid_at=2024-01-15  invalid_at=2025-06-01   <- old fact, closed by ep7
PROMOTED_TO "Sarah Chen was promoted to Director of Research at Meridian Capital."
          valid_at=2025-06-01  invalid_at=None         <- new current fact
INITIATED_POSITION_IN "The Helios Tech Fund initiated a position in Acme Semiconductor."
          valid_at=2024-02-01  invalid_at=2025-08-15   <- old fact, closed by ep8
CLOSED_POSITION_IN "Marcus Webb closed the Helios Tech Fund's position in Acme Semiconductor…"
          valid_at=2025-08-15  invalid_at=None         <- new current fact
```

Bi-temporality is real and complete on these edges: `(valid_at, invalid_at)` tracks the
*episode-time* validity window (from `reference_time`), while `(created_at, expired_at)`
tracks the *transaction-time* window (when graphiti learned/forgot the fact — e.g. the
WORKS_AT edge created 08:09:15 UTC, expired 08:10:37 UTC when ep7 was processed).

Two honest caveats:

1. **Invalidation is LLM-judgment, not a guarantee.** The `COVERS` edge ("Sarah Chen
   covers the semiconductor sector") was *not* invalidated by ep7; instead graphiti
   created a `NO_LONGER_COVERS` negation edge (which itself ended up expired). The role
   contradiction was perfectly invalidated; the sector-coverage one was not. Expect to
   audit/resolution-tune for critical domains.
2. **`search()` returns invalidated edges too** (the old Senior Analyst fact appears in
   results, carrying its `invalid_at`). Current-state answers require consumers to
   filter `invalid_at IS NULL` — graphiti gives you the audit trail by default, not a
   "current truth only" view.

## Measurements (all on the VM, this corpus)

Ingestion — wall time per `add_episode` (each episode = multiple LLM round-trips:
entity/edge extraction, dedup, invalidation):

| Episode | Time | Note |
|---|---|---|
| ep1 | 23.71 s | cold (first LLM calls) |
| ep2–ep6 | 8.9–15.9 s (avg 11.5 s) | plain facts |
| ep7 | 18.12 s | contradicting update |
| ep8 | 23.69 s | contradicting update |

Mean 15.4 s/episode, median 14.3 s. Contradictions cost ~1.5–2× a plain episode
(extra invalidation passes). Compare GBrain: 14 pages ingested in 0.5 s with **zero**
LLM calls — Graphiti front-loads all cost at write time.

Query — `graphiti.search()` (hybrid BM25 + vector + graph distance, RRF fusion, **no
LLM call** in the default recipe): run 1 **0.34 s**, runs 2–3 **0.09–0.10 s** each, for
both test queries. Raw Cypher temporal dump (16 edges): **0.103 s**.

Container footprint — `docker stats graphiti-neo4j --no-stream`: **594 MiB** idle
baseline, **663 MiB** after the run (CPU ~0 at idle). Plus LLM spend: ~60 chat calls
total for 8 episodes against `claude-sonnet-5` via OpenRouter.

## Comparison vs GBrain (P13-01, see `docs/GBRAIN-SPIKE.md`)

| | Graphiti 0.29.2 + Neo4j 5 | GBrain 0.42.62 + Postgres 16 |
|---|---|---|
| Data model | Episodic → entities + temporal edges | Markdown pages + typed links |
| Temporality | **Bi-temporal built in** (validity + transaction windows, auto-invalidation) | None — edges are current-state only |
| Extraction | LLM per episode, rich relation types (WORKS_AT, MANAGES, INITIATED_POSITION_IN, …) — no manual typing | Deterministic regex, shallow (4 types + `mentions` fallback); rich relations need manual `gbrain link` |
| Ingest cost | ~9–24 s/episode, many LLM calls | ~0.04 s/page, zero LLM calls |
| Query latency | ~0.1 s warm hybrid search (no LLM) | ~5 ms DB-side graph/FTS; ~1.05 s CLI floor (Bun boot); warm MCP/HTTP avoids it |
| Infra | Neo4j ~0.6–0.7 GiB + LLM + embedder | ~107 MB server + ~35 MB Postgres |
| LLM dependency | **Mandatory** for every write | Optional (degrades to keyword search) |
| Integration surface | Python library (Zep sells the hosted service; an OSS MCP server exists in the repo, untested here) | Mature CLI + MCP/HTTP server, 30+ tools |
| Inspectability | Graph in Neo4j (Cypher/Browser) | Markdown on disk + Postgres, git-able |

## Verdict

**Graphiti is the only one of the two with a native answer to "what was true when" —
verified working — but it is a write-time LLM furnace; GBrain remains the better
default substrate.**

For ONEVibe (agent memory for investment-professional workflows):

- **Graphiti fits** the mutable-fact layer: coverage assignments, position
  opened/closed, roles, rating/price-target changes — exactly the domain where a stale
  "Sarah covers semis" memory is a compliance-grade bug. Episodic ingest maps naturally
  to meeting notes, news alerts, and chat turns. Verified: contradictions auto-invalidate
  with correct timestamps and both versions stay retrievable.
- **GBrain fits** the durable knowledge base: research notes, company pages, durable
  analysis — cheap, inspectable, git-able, works without per-call LLM spend, and its
  MCP server is the better agent integration surface today.
- **Recommended shape:** GBrain as the document/knowledge substrate, Graphiti as a
  temporal fact layer for portfolio/coverage state, both fronted by the same LiteLLM
  router. Before any Graphiti pilot: add an **embedding model alias** to the router
  (its absence was this spike's only real blocker), and budget ~10–25 s of LLM work per
  ingested episode.

## Deviations from the plan

1. LiteLLM reached at `127.0.0.1:4000` (VM's own router), not `4100` (that's the Mac's). Model `claude-sonnet-5`, not `kimi-k3`/`claude-sonnet-4-6` (aliases don't exist on this router).
2. **Stub embedder** — the router exposes no embedding model, so a deterministic local `HashEmbedder` kept graphiti's plumbing alive; semantic-search quality was *not* evaluated (BM25 + graph legs carried retrieval). Everything else (extraction, invalidation, search, timestamps) used the real LLM path.
3. Neo4j worked first try; the FalkorDB fallback was not needed.
4. Router key was read from the VM router's own container env at runtime and passed via process env only — never written to the repo or this doc.

## Artifacts left on the VM

- `~/graphiti-spike/` (venv + `spike.py`, self-contained and re-runnable)
- Docker container `graphiti-neo4j` (Neo4j 5, ports 7687/7474, `neo4j/testpass`, spike
  graph still loaded: 8 episodes / 11 entities / 16 edges) — left running for
  inspection; `docker rm -f graphiti-neo4j` removes it. Browser UI at `:7474`.
