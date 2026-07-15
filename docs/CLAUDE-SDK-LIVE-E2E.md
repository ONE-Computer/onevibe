# Claude Agent SDK live E2E evidence

## Scope

This is the controlled, opt-in proof for ONEVibe's `claude_sdk` provider. It creates one small document task against a real server-side Anthropic credential and may incur provider usage. It is never part of unit tests or the normal `npm run check` workflow.

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

The harness creates a Document-mode task that asks Claude to write one local `README.md`. It then verifies:

1. a completed task state;
2. the governed host-workspace execution boundary;
3. a recorded Claude SDK session ID and run lifecycle evidence;
4. a non-empty local `README.md`; and
5. a valid ONEVibe evidence chain.

This is proof of the configured SDK path, not a claim of microVM isolation, gateway enforcement, browser validation, OpenVTC approval, or production credential federation. Those require their own gated evidence.
