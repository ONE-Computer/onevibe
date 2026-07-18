---
name: kimi-server-ops
description: Diagnose and recover the Kimi Code server. Use when Kimi appears dead, idle, or not executing tools.
whenToUse: When the 30-min check-in finds Kimi idle with 0 turns, or when the user says "Kimi died" / "Kimi not working".
---

# Kimi server operations (Claude PM perspective)

## Quick health check

```bash
# Server alive?
curl -s http://127.0.0.1:58627 | head -c 50

# LiteLLM alive?
curl -s http://127.0.0.1:4100/health

# Server token (changes on each restart — needed for API auth)
cat ~/.kimi-code/server.token
```

## Restart sequence

```bash
kimi server kill
sleep 1
kimi server run &
sleep 3
# Token is printed at startup — capture it for API calls
```

## Sending a new brief after restart

After restarting, Kimi needs the WebSocket (browser UI) to execute tools. The reliable brief path:

1. Get the server URL+token from startup output or `kimi web --no-open`
2. Open the URL in a browser (this is the only way to maintain the WebSocket)
3. Paste the brief text directly in the browser UI

**Alternative for status queries only** (no tool execution):
```bash
kimi -p "What is the current state of X?" 2>&1 &
# Kill after ~15s — it will print a text response
```

**Do NOT use** `-p` for implementation tasks — tools don't execute.

## Known permanent failures

| Symptom | Cause | Fix |
|---|---|---|
| "Received content_part for unknown step_uuid" on `-S <id>` | Session corrupted by killed sub-agent | Abandon session, use `kimi -c` or new session |
| `busy=false`, turns=0 after POST /prompts | No active WebSocket client | Open browser UI to establish WebSocket |
| All tasks fail with model errors | LiteLLM down | Restart LiteLLM, check `:4100/health` |
| `-p` produces text but no file edits | `-p` is text-only, no tool loop | Use interactive mode or browser UI |

## The corrupted session

`session_c90ce2bb` is permanently corrupted (dangling step_uuid from a killed swarm sub-agent in the 2026-07-18 sprint). Never resume it. It is left in `~/.kimi-code/sessions/` for reference.

## 30-min check-in protocol

When the cron fires:
1. Check server health (curl :58627 and :4100)
2. If server dead → restart it
3. Check latest git commits (`git log --oneline -3`) — did Kimi ship anything?
4. If no new commits in last 30 min AND server was alive → Kimi is idle/stuck
5. If idle → send a fresh brief (don't just restart — a brief is required to unblock)
6. Update `docs/AUTONOMOUS-ROADMAP.md` check-in log
7. If Kimi can't be reliably briefed (WebSocket issue) → implement the next item directly

## Security invariant
All model traffic must go through LiteLLM at `http://127.0.0.1:4100`.
`KIMI_API_KEY` in `litellm-runtime.env` only — never in `litellm_config.yaml`.
