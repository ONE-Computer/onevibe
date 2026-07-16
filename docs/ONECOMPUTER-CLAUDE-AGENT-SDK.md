# Claude Agent SDK inside ONEComputer

## Contract

The release-critical ONEVibe runtime is:

```text
ONEVibe API
  -> conversation-owned ONEComputer sandbox
  -> sandbox-resident Node 22 Claude Agent SDK worker
  -> server-controlled LiteLLM / Anthropic-compatible route
  -> durable JSONL journal in the sandbox
  -> ONEVibe projection loop
  -> durable RuntimeEvent ledger
  -> task-bound SSE (`runtime_event` frames)
```

The SDK process, Claude session state, prompt execution, tool calls, and raw
journal must remain inside the sandbox. The browser receives only redacted,
durable projections. It must never receive a sandbox token, API key, X11/VNC
credential, raw SDK journal, or direct provider connection.

## Image requirement

The ONEComputer Kasm bootstrap must install the exact SDK version used by the
ONEVibe worker alongside Claude Code:

```text
@anthropic-ai/claude-agent-sdk@0.3.210
```

The bootstrap must verify both the CLI and SDK module resolution before it
marks the sandbox `bootstrapped=true`. Installing the SDK during an agent turn
is not acceptable: it adds network dependency to task execution and can
silently change the agent runtime. The provider source fix is in
`onecomputer-integration/packages/api/src/services/sandbox-providers/kasm-local-provider.ts`;
it requires deployment to the Azure ONEComputer service before the combined
cloud gate can pass.

## Worker behavior

ONEVibe transfers a versioned `.onevibe-agent-sdk.mjs` worker into the
conversation workspace. The worker:

- resolves `@anthropic-ai/claude-agent-sdk` through the sandbox global Node path;
- calls the SDK `query()` API directly, not `claude --print`;
- uses the server-selected model and sandbox-reachable LiteLLM route;
- limits the SDK tool list to the task mode's governed capabilities;
- persists the SDK session under the retained conversation sandbox;
- resumes a follow-up with the prior session ID and lease generation;
- appends every native SDK message to `.onevibe-events.jsonl`;
- writes a terminal exit code even when the worker fails.

The ONEVibe poller reads only appended journal bytes, projects bounded
assistant/tool/result events, and continues to publish them through the normal
task SSE stream. This is the E2E stream contract: it is live enough for the
UI while the agent runs, replayable after reconnect, and still backed by the
append-only evidence chain.

## Current live finding

On 2026-07-16, the first fresh Azure-backed run reached a real started sandbox
and headless X11 runtime, then failed closed at SDK preflight because the
deployed image contained Claude Code but not `@anthropic-ai/claude-agent-sdk`.
The image bootstrap was then promoted at commit `6dfaa3b`, and the strict
repeat passed: the provider installed/verified the SDK, the worker executed
through LiteLLM, and ONEVibe observed live/replayable SSE plus continuation and
isolation evidence. The proof remains a development Kasm-provider result with
gateway attestation disabled; it is not yet a production microVM or default-
deny egress attestation.

## Acceptance gate

The combined gate is not complete until a fresh sandbox, created after the
provider deployment, proves all of the following in one run:

1. provider reports `bootstrapped=true` only after SDK module verification;
2. `run_started.payload.agentRuntime` is `claude_agent_sdk`;
3. at least one live SSE `runtime_event` arrives before task completion;
4. the event journal contains SDK session/tool/transcript evidence;
5. the follow-up resumes the same sandbox lease and SDK session;
6. a second conversation receives a different sandbox identity;
7. the sandbox is explicitly released and provider deletion is observed.

The repeatable command remains:

```sh
ONEVIBE_E2E_URL=http://127.0.0.1:4322 \
ONEVIBE_E2E_REQUIRE_GATEWAY=false \
ONEVIBE_E2E_REQUIRE_VISUAL=true \
ONEVIBE_E2E_REQUIRE_LITELLM=true \
npm run e2e:onecomputer
```

For production promotion, change the endpoint and require gateway attestation;
do not treat the current development `kasm-local` provider as a microVM or as
proof of default-deny egress.
