# Claude Agent SDK live E2E evidence

## Scope

This is the controlled, opt-in proof for ONEVibe's `claude_sdk` provider. It creates one small document task followed by a persisted continuation against a real server-side Anthropic credential and may incur provider usage. It is never part of unit tests or the normal `npm run check` workflow.

## Preconditions

Configure the ONEVibe API process with a server-only `ANTHROPIC_API_KEY`. The browser receives only Claude-provider readiness; it never receives the credential or task runtime state directory.

Verify readiness before running:

```sh
curl -fsS http://127.0.0.1:4311/api/runtime
```

The `claude_sdk` provider must report `available: true`. If it does not, the harness exits before creating a task.

## Controlled proof

```sh
ONEVIBE_E2E_URL=https://onevibe.example \
npm run e2e:claude-sdk
```

The harness creates a Document-mode task that asks Claude to write one local `README.md`, then sends a governed follow-up on the same task. It verifies:

1. a completed task state;
2. the governed host-workspace execution boundary;
3. a recorded Claude SDK session ID and run lifecycle evidence;
4. two completed provider turns and durable user/assistant conversation history;
5. a non-empty local `README.md` updated by the continuation; and
6. a valid ONEVibe evidence chain.

This is proof of the configured SDK path, not a claim of microVM isolation, gateway enforcement, browser validation, OpenVTC approval, or production credential federation. Those require their own gated evidence.

## Local LiteLLM proof — 2026-07-16

The controlled proof was repeated locally without changing the existing UI or
proxy process. A clean LiteLLM listener was started on `127.0.0.1:4101` from
the protected ONEComputer runtime environment, and an isolated ONEVibe API was
started on port `4312` with `ONEVIBE_LITELLM_URL` and a server-only gateway
credential. The existing port-4100 LiteLLM process was not used because its
virtual-key database dependency was unhealthy (`No connected db`). No secret
values were printed or committed.

### Conversation result

- Task: `task_51d2e9b5405847`
- Provider: `Claude SDK · LiteLLM`
- Two turns completed through the native Claude Agent SDK.
- Persisted Claude session identity was present.
- Durable user/assistant history survived the continuation.
- Evidence chain returned `valid: true`.

### Slides result

- Task: `task_57b6475d57a04d`
- Claude invoked `mcp__onevibe__render_slide_deck` through the governed tool
  path. The first call was rejected for oversized summaries; Claude corrected
  the input and successfully retried, which confirms the tool validation/error
  loop is observable rather than silently accepting malformed data.
- The final artifact contained 8 structured slides, a signature-valid
  `deck.pptx` of 107,060 bytes, and a parseable `%PDF-` `deck.pdf` of 7,676
  bytes.
- Evidence chain returned `valid: true`.

This is a stronger local provider proof than the prior unit-only state, but it
still uses the governed host workspace boundary (`executionBoundary=host_process`).
It does not close the ONEComputer sandbox/microVM, gateway-attestation, or
Azure promotion gates tracked by ONE-217, ONE-221, ONE-225, and ONE-226.
