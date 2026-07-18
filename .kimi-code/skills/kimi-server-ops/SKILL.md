---
name: kimi-server-ops
description: Diagnose and recover the Kimi Code server when it appears dead or unresponsive.
whenToUse: When the Kimi server is not responding, connection is refused on :58627, or a session shows 0 turns despite a brief being sent.
---

# Kimi server operations runbook

## Architecture

- Kimi server: REST + WebSocket at `http://127.0.0.1:58627`
- LiteLLM router: `http://127.0.0.1:4100/v1` — all model traffic must go through here
- Config: `~/.kimi-code/config.toml` — `default_model = "openai/kimi-k3"`, `default_permission_mode = "yolo"`
- Server token: printed at startup, stored at `~/.kimi-code/server.token` (changes each restart)

## Known failure modes

### 1. Server process has exited
Symptom: `curl http://127.0.0.1:58627` → connection refused.
Fix: `kimi server kill && kimi server run &`
Then wait ~3 seconds before checking.

### 2. Session corruption (dangling step_uuid)
Symptom: Resuming a session with `-S <id>` prints "Received content_part for unknown step_uuid … (no open step_begin)".
Cause: A sub-agent was killed mid-turn, leaving an open step in the session journal.
Fix: **Never resume that session.** Start fresh: `kimi -c` (continue for cwd = new session) or omit `-S`.
The corrupted session can be identified in `~/.kimi-code/sessions/` but do not attempt repair.

### 3. Prompts queued but not processed (busy=false, turns=0)
Symptom: `POST /sessions/{id}/prompts` returns 200 but session stays idle.
Cause: The Kimi server requires an active WebSocket (browser UI) to process queued prompts. The REST API alone does not drive the agent loop.
Fix: Open the Kimi web UI (`kimi web` or visit the URL printed at startup with the token) to establish the WebSocket. Then re-send the brief.

### 4. `-p` flag does not execute tools
Symptom: `kimi -p "..."` prints a text response but no file edits, git commits, or commands run.
Cause: Non-interactive `-p` mode runs a single completion without the tool-execution loop.
Fix: For implementation tasks, use interactive mode with piped stdin (`echo "..." | kimi --yolo`) or the web UI. Reserve `-p` only for status queries.

### 5. LiteLLM router is down
Symptom: Kimi server is up but all tasks fail with model errors.
Check: `curl http://127.0.0.1:4100/health`
Fix: Restart LiteLLM — find the process via `ps aux | grep litellm` and restart from the project's litellm startup script.

## Health check sequence

```bash
# 1. Is the server process alive?
curl -s http://127.0.0.1:58627 | head -c 100

# 2. Is LiteLLM alive?
curl -s http://127.0.0.1:4100/health | python3 -c "import json,sys; print(json.load(sys.stdin))"

# 3. Restart server if needed
kimi server kill && kimi server run &
sleep 3
```

## Sending a brief that actually runs tools

The only reliable way to get Kimi to execute tool-calling work:
1. Start server: `kimi server run &`
2. Open web UI: `kimi web` — copy the URL+token
3. Open the URL in a browser — this establishes the WebSocket
4. In the browser session, type or paste the brief
5. Kimi will now execute tools, edit files, run git

Alternatively for short non-tool tasks: `kimi -p "status check question"`

## Security invariant
All model traffic must traverse LiteLLM at `http://127.0.0.1:4100`.
Direct first-party Anthropic API calls are prohibited.
`KIMI_API_KEY` lives only in `litellm-runtime.env`, never in `litellm_config.yaml`.
