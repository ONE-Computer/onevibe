# ONEComputer → ONEVibe: Infrastructure Improvement Plan
> Author: PM/BA role. Date: 2026-07-17.
> Purpose: ONEComputer is the host environment for ONEVibe development and agent orchestration. These are the gaps blocking ONEVibe progress.

---

## Priority 1 — Unblock local Postgres e2e (P4-02, P4-01)

**Current state:** `DATABASE_URL` is not set in the local dev environment. Every Postgres e2e script (`e2e:postgres-auth-http`, `e2e:postgres-http-sse`, `e2e:postgres-taskstore`, etc.) exits immediately with `DATABASE_URL is required`.

**Impact:** Kimi cannot prove P4-01 (auth) or P4-02 (database) in any session. These are the two biggest remaining release blockers for ONEVibe.

**Fix:** Two options:
1. Add `docker compose up -d postgres` to the ONEComputer session bootstrap (auto-start Postgres alongside LiteLLM on dev session init)
2. Provide a persistent Postgres URL in `.env` at `onevibe/.env`

Recommended: option 1. The `docker-compose.litellm-db.yml` already exists at `/Users/gini/onecomputer-litellm-router/`. Extend it to include a Postgres 18 service bound to `localhost:5432` with a stable password, then write `DATABASE_URL=postgresql://...` into `.env`. Then Kimi can run all Postgres e2e suites without human intervention.

---

## Priority 2 — Stable LiteLLM relay for Kimi sessions

**Current state:** Kimi Code routes all inference through LiteLLM → OpenRouter. When OpenRouter credits hit zero, every model call returns 402 and the Kimi session terminates mid-task. No working fallback existed (all fallback groups also hit 402 from the same account).

**Impact:** Sprint productivity drops to zero unpredictably. Three mid-task session kills in the July 17 sprint.

**Fixes implemented:** Fallback chain is now `kimi-k3 → kimi-k2.6 → kimi-k2 → deepseek-v4-flash`. This helps when K3 specifically is rate-limited but doesn't help when the whole OpenRouter account is exhausted.

**Additional fix needed:** Add a **direct Moonshot API route** (non-OpenRouter) as the final fallback. Moonshot's API base URL is `https://api.moonshot.cn/v1`. A direct key there bypasses OpenRouter entirely and provides a separate credit pool. Configure it as `openrouter-kimi-direct-fallback` in the LiteLLM config.

Also: set up a credit alert on the OpenRouter account (webhook or email at 20% remaining) so top-up happens before sessions die.

---

## Priority 3 — Playwright / browser automation for Kimi sessions

**Current state:** No Playwright installed in the onevibe dev environment. `npx playwright --version` returns not found. This blocks:
- P7-07 manual QA (responsive + dark/light matrix)
- ONG-04 evidence screenshots
- Any automated visual regression

**Fix:** Install Playwright as a dev dependency in onevibe:
```bash
npm install --save-dev @playwright/test
npx playwright install chromium
```
Then add a `test:e2e:visual` npm script. Kimi can then write screenshot tests autonomously as part of QA.

ONEComputer should also ensure that `DISPLAY` / headed browser access is available in Kimi sessions (or configure headless Chromium explicitly).

---

## Priority 4 — Kimi session persistence across 402 kills

**Current state:** When a Kimi session is killed by a 402, the work in progress is lost. The session object in the REST API shows `turn_count: 0` regardless of how much work was done (this is a known quirk of `kimi -p` subprocess sessions).

**Fix at the ONEComputer/orchestrator level:**
1. The orchestrator should detect 402 errors in the log and auto-pause (write partial session state to disk)
2. On credit top-up (or after a delay), auto-resume from the last checkpoint using `kimi -r <session_id>`
3. The orchestrator should also expose a `resume` command: `node kimi-orchestrator.mjs resume <session_id>`

The Kimi REST API supports `kimi -r session_id` for resuming a session. This is the right mechanism.

---

## Priority 5 — API keys for P4-05 and production gates

These are required to close specific open items but are not blocking current sprint work:

| Key | Unblocks | Where to put it |
|---|---|---|
| `RESEND_API_KEY` | P4-01 real email delivery | `.env` → server env |
| `E2B_API_KEY` | P4-05 cloud sandbox adapter | `.env` → server env |
| `FLY_API_TOKEN` | P4-04 deploy | CI secrets |

---

## Summary table

| Improvement | Unblocks | Effort | Priority |
|---|---|---|---|
| Local Postgres via docker-compose | P4-01, P4-02, all postgres e2e | 1h setup | **P1** |
| Direct Moonshot API key fallback | Kimi session stability | 30min config | **P1** |
| OpenRouter credit alerts | Session kill prevention | 15min | **P1** |
| Playwright in onevibe dev | P7-07, ONG-04, visual QA | 30min install | **P2** |
| Orchestrator resume-on-402 | Sprint continuity | 2h dev | **P2** |
| RESEND_API_KEY | P4-01 production | 30min | **P3** |
| E2B_API_KEY | P4-05 cloud sandbox | 30min | **P3** |
