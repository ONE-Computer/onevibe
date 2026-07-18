# P13-03 — A2A Protocol Spike (agent-to-agent interoperability)

- **Date:** 2026-07-18
- **Target:** [a2aproject/A2A](https://github.com/a2aproject/A2A) — Linux Foundation agent-to-agent protocol; Python SDK `a2a-sdk` **0.2.16** (protocol version `0.2.6`)
- **Environment:** Azure VM `onecomputer-sandbox03` (Ubuntu 22.04, Python 3.10.12), reached over SSH as `azureuser` (`ssh onecomputer-azure` host alias; the key path in the brief, `/Users/ttwj/.ssh/...`, does not exist on this Mac). All compute remote under `~/a2a-spike/`; server bound to `127.0.0.1:8100` (brief's 8100–8110 range). The parallel graphiti spike's resources (`~/brain-spike`, `gbrain-pg`, etc.) were not touched.
- **Outcome:** Full end-to-end exchange worked — Agent Card discovery, blocking `message/send`, and SSE `message/stream` with the `submitted → working → completed` lifecycle and `TaskStatusUpdateEvent` / `TaskArtifactUpdateEvent` frames, backed by a real LiteLLM model call. Verdict and integration design at the bottom.

## What was built

- `~/a2a-spike/server_agent.py` — A2A server agent (`a2a-sdk` 0.2.16, Starlette/uvicorn on `127.0.0.1:8100`). Serves an Agent Card and runs one LiteLLM chat completion per request, streaming model chunks as A2A artifact events.
- `~/a2a-spike/client_agent.py` — A2A client agent (raw `httpx`, no SDK — deliberately, to prove the wire format is implementable by hand, exactly like ONEVibe's TypeScript adapter does).
- `~/a2a-spike/captures/` — verbatim wire captures quoted below (`agent_card.json`, `send_request.json`, `send_response.json`, `stream_request.json`, `stream_events_raw.txt`).

Setup that worked:

```bash
ssh onecomputer-azure
mkdir -p ~/a2a-spike && cd ~/a2a-spike
python3 -m venv .venv && .venv/bin/pip install --upgrade pip
.venv/bin/pip install "a2a-sdk==0.2.16" fastapi "uvicorn[standard]" httpx
.venv/bin/python server_agent.py &   # then: .venv/bin/python client_agent.py
```

## Agent Card format (verbatim capture, annotated)

`GET http://127.0.0.1:8100/.well-known/agent.json` → HTTP 200:

```json
{
  "capabilities": {                     // what this agent can do
    "pushNotifications": false,
    "streaming": true                   // supports message/stream (SSE)
  },
  "defaultInputModes": ["text"],        // MIME-ish modality declarations
  "defaultOutputModes": ["text"],
  "description": "Minimal P13-03 spike agent: streams a LiteLLM chat completion as A2A task artifacts.",
  "name": "ONEVibe A2A Spike Agent",
  "protocolVersion": "0.2.6",           // A2A spec revision this server speaks
  "skills": [                           // capability catalog — the discovery payload
    {
      "description": "Answers a prompt with one streamed LiteLLM completion.",
      "examples": ["In one short sentence: what is the A2A protocol?"],
      "id": "chat",
      "name": "Chat completion",
      "tags": ["chat", "llm", "spike"]
    }
  ],
  "url": "http://127.0.0.1:8100/",      // the JSON-RPC 2.0 endpoint (POST here)
  "version": "0.1.0"                    // the agent's own version, not the protocol's
}
```

Notes:

- Discovery is a single unauthenticated GET; the card points at the RPC URL. This is exactly what ONEVibe's `A2aRuntimeAdapter.health()` already consumes (`server/a2a-adapter.ts:126-137`).
- Optional fields not shown: `provider`, `documentationUrl`, `iconUrl`, `securitySchemes` + `security` (auth requirements — bearer/OAuth2), `supportsAuthenticatedExtendedCard`.
- All wire keys are camelCase; message/artifact parts are discriminated by `kind` (`"text"`, `"file"`, `"data"`).

## Task lifecycle — captured request/response

### Blocking exchange: `message/send`

Request (verbatim `captures/send_request.json`):

```json
{
  "jsonrpc": "2.0",
  "id": "req-send-1",
  "method": "message/send",
  "params": {
    "message": {
      "role": "user",
      "parts": [{ "kind": "text", "text": "In one short sentence: what is the A2A protocol?" }],
      "messageId": "3c7e74a168204d5f975fc4d9ae20c5aa"
    }
  }
}
```

Response (verbatim `captures/send_response.json`; 11 repetitive one-token artifact parts elided and marked — full file remains on the VM):

```json
{
  "id": "req-send-1",
  "jsonrpc": "2.0",
  "result": {
    "kind": "task",
    "id": "b8c0d19c-e2a6-4817-be89-16febbea3204",        // server-assigned task id
    "contextId": "20a74ca3-bce5-4109-9272-c5cb6e167634",  // conversation id
    "artifacts": [
      {
        "artifactId": "llm-response",
        "name": "llm-response",
        "parts": [
          { "kind": "text", "text": "The" },
          { "kind": "text", "text": " A2" },
          /* ... 12 more streamed text parts; last one is the empty
             last-chunk marker ("text": "") ... */
          { "kind": "text", "text": " each other." },
          { "kind": "text", "text": "" }
        ]
      }
    ],
    "history": [
      { "kind": "message", "role": "user",  "messageId": "86fe04efc0fb4754ad965e9a37503177",
        "parts": [{ "kind": "text", "text": "In one short sentence: what is the A2A protocol?" }],
        "contextId": "20a74ca3-bce5-4109-9272-c5cb6e167634",
        "taskId": "b8c0d19c-e2a6-4817-be89-16febbea3204" },
      { "kind": "message", "role": "agent", "messageId": "866f74d6fb5244d7a28b29ed5ed5b725",
        "parts": [{ "kind": "text", "text": "Calling LiteLLM model claude-sonnet-5..." }],
        "contextId": "20a74ca3-bce5-4109-9272-c5cb6e167634",
        "taskId": "b8c0d19c-e2a6-4817-be89-16febbea3204" }
    ],
    "status": {
      "state": "completed",
      "timestamp": "2026-07-18T08:09:34.324338+00:00",
      "message": {
        "kind": "message", "role": "agent", "messageId": "820906b4e43e4c4c9c74e966d53898fb",
        "contextId": "20a74ca3-bce5-4109-9272-c5cb6e167634",
        "taskId": "b8c0d19c-e2a6-4817-be89-16febbea3204",
        "parts": [{ "kind": "text", "text": "The A2A (Agent2Agent) protocol is an open standard that enables AI agents built on different frameworks and by different vendors to securely communicate and collaborate with each other." }]
      }
    }
  }
}
```

Lifecycle observed: the server creates a `Task` (`submitted`), flips it to `working` while the model runs, then to the terminal `completed` state carrying the final agent message. Full state enum in SDK 0.2.16: `submitted, working, input-required, completed, canceled, failed, rejected, auth-required, unknown`.

Aggregation quirk worth knowing: in the blocking response, every streamed chunk becomes a **separate text part** inside the artifact (including an empty part from the last-chunk marker). Clients must concatenate parts — ONEVibe's `textFromA2aParts` (`server/a2a-adapter.ts:32-41`) already does exactly that.

### Streaming exchange: `message/stream` (SSE)

Request is identical in shape, method `message/stream`. Response is `Content-Type: text/event-stream`, one JSON-RPC response object per `data:` line (no `event:` lines are emitted by the SDK — ONEVibe's `parseSseBlock` handles this). Verbatim `captures/stream_events_raw.txt`, all six frames:

```text
data: {"id":"req-stream-1","jsonrpc":"2.0","result":{"contextId":"f3d0aeb9-31ef-4be5-bd69-63c1f2714352","history":[{"contextId":"f3d0aeb9-31ef-4be5-bd69-63c1f2714352","kind":"message","messageId":"2afb5ca7476445c48e53beb43ce85c1b","parts":[{"kind":"text","text":"Count from one to five, separating the words with spaces."}],"role":"user","taskId":"716f3b44-2534-4575-9c47-a6b3d1daeaf5"}],"id":"716f3b44-2534-4575-9c47-a6b3d1daeaf5","kind":"task","status":{"state":"submitted"}}}

data: {"id":"req-stream-1","jsonrpc":"2.0","result":{"contextId":"f3d0aeb9-31ef-4be5-bd69-63c1f2714352","final":false,"kind":"status-update","status":{"message":{"contextId":"f3d0aeb9-31ef-4be5-bd69-63c1f2714352","kind":"message","messageId":"893c93e83d914004939029cb589024d3","parts":[{"kind":"text","text":"Calling LiteLLM model claude-sonnet-5..."}],"role":"agent","taskId":"716f3b44-2534-4575-9c47-a6b3d1daeaf5"},"state":"working","timestamp":"2026-07-18T08:09:34.330968+00:00"},"taskId":"716f3b44-2534-4575-9c47-a6b3d1daeaf5"}}

data: {"id":"req-stream-1","jsonrpc":"2.0","result":{"append":false,"artifact":{"artifactId":"llm-response","name":"llm-response","parts":[{"kind":"text","text":"one two"}]},"contextId":"f3d0aeb9-31ef-4be5-bd69-63c1f2714352","kind":"artifact-update","lastChunk":false,"taskId":"716f3b44-2534-4575-9c47-a6b3d1daeaf5"}}

data: {"id":"req-stream-1","jsonrpc":"2.0","result":{"append":true,"artifact":{"artifactId":"llm-response","name":"llm-response","parts":[{"kind":"text","text":" three four five"}]},"contextId":"f3d0aeb9-31ef-4be5-bd69-63c1f2714352","kind":"artifact-update","lastChunk":false,"taskId":"716f3b44-2534-4575-9c47-a6b3d1daeaf5"}}

data: {"id":"req-stream-1","jsonrpc":"2.0","result":{"append":true,"artifact":{"artifactId":"llm-response","name":"llm-response","parts":[{"kind":"text","text":""}]},"contextId":"f3d0aeb9-31ef-4be5-bd69-63c1f2714352","kind":"artifact-update","lastChunk":true,"taskId":"716f3b44-2534-4575-9c47-a6b3d1daeaf5"}}

data: {"id":"req-stream-1","jsonrpc":"2.0","result":{"contextId":"f3d0aeb9-31ef-4be5-bd69-63c1f2714352","final":true,"kind":"status-update","status":{"message":{"contextId":"f3d0aeb9-31ef-4be5-bd69-63c1f2714352","kind":"message","messageId":"89509b2727bc4ef8b743af20fec675b7","parts":[{"kind":"text","text":"one two three four five"}],"role":"agent","taskId":"716f3b44-2534-4575-9c47-a6b3d1daeaf5"},"state":"completed","timestamp":"2026-07-18T08:09:39.928094+00:00"},"taskId":"716f3b44-2534-4575-9c47-a6b3d1daeaf5"}}
```

Frame sequence (6 events): `task`(`submitted`) → `status-update`(`working`, `final:false`) → `artifact-update` ×3 (`append:false` creates the artifact, `append:true` extends it, `lastChunk:true` closes it) → `status-update`(`completed`, `final:true`, full text). These are precisely the shapes ONEVibe's `mapA2aStreamEvent` parses: `kind` discriminator, camelCase `taskId`/`contextId`/`lastChunk`/`final`, `status.state`, `status.message.parts`.

## Minimal client/server exchange (code)

Server (condensed from `~/a2a-spike/server_agent.py`, a2a-sdk 0.2.16):

```python
from a2a.server.agent_execution import AgentExecutor, RequestContext
from a2a.server.apps import A2AStarletteApplication
from a2a.server.events import EventQueue
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.tasks import InMemoryTaskStore, TaskUpdater
from a2a.types import AgentCapabilities, AgentCard, AgentSkill, Part, TextPart, TaskState
from a2a.utils import new_task

class LiteLLMChatExecutor(AgentExecutor):
    async def execute(self, context: RequestContext, event_queue: EventQueue) -> None:
        task = context.current_task or new_task(context.message)
        if context.current_task is None:
            await event_queue.enqueue_event(task)          # frame 1: Task(submitted)
        updater = TaskUpdater(event_queue, task.id, task.context_id)
        await updater.update_status(TaskState.working)     # frame 2: status-update
        async for delta in call_litellm_stream(context.get_user_input()):
            await updater.add_artifact(                    # frames 3..n: artifact-update
                [Part(root=TextPart(text=delta))],
                artifact_id="llm-response", name="llm-response",
                append=True, last_chunk=False)
        await updater.update_status(TaskState.completed, final=True)  # terminal frame

    async def cancel(self, context, event_queue): ...

agent_card = AgentCard(
    name="ONEVibe A2A Spike Agent", url="http://127.0.0.1:8100/", version="0.1.0",
    description="...", default_input_modes=["text"], default_output_modes=["text"],
    capabilities=AgentCapabilities(streaming=True),
    skills=[AgentSkill(id="chat", name="Chat completion", description="...",
                       tags=["chat"], examples=["..."])],
)
app = A2AStarletteApplication(
    agent_card=agent_card,
    http_handler=DefaultRequestHandler(LiteLLMChatExecutor(), InMemoryTaskStore()),
).build()   # Starlette app; serves /.well-known/agent.json + JSON-RPC POST
```

Client (condensed from `~/a2a-spike/client_agent.py`, raw httpx — no SDK):

```python
import httpx, json, uuid

card = httpx.get("http://127.0.0.1:8100/.well-known/agent.json").json()
rpc_url = card["url"]
req = {
    "jsonrpc": "2.0", "id": "req-stream-1", "method": "message/stream",
    "params": {"message": {"role": "user", "messageId": uuid.uuid4().hex,
                           "parts": [{"kind": "text", "text": "Count from one to five."}]}},
}
with httpx.stream("POST", rpc_url, json=req,
                  headers={"Accept": "text/event-stream"}) as resp:
    for line in resp.iter_lines():
        if line.startswith("data:"):
            event = json.loads(line[5:])["result"]   # task | status-update | artifact-update
```

The whole server is ~150 lines including the LiteLLM call; the client ~90. The protocol surface for a minimal interop peer is genuinely small.

## Design note: ONEVibe ↔ A2A

### Finding 0 — the existing client adapter speaks a dead method name (must-fix)

The brief (and ONEVibe's `server/a2a-adapter.ts:186`) describe the wire method as `tasks/sendSubscribe` with `params: {id, message}`. That naming only existed in the earliest google/A2A drafts. I installed and inspected `a2a-sdk` 0.2.4, 0.2.5, 0.2.16, 0.3.26 and 1.1.1 — **every published SDK dispatches `message/send` and `message/stream`**, and a server built on any of them will answer `tasks/sendSubscribe` with JSON-RPC `-32601 Method not found`. Against any real current A2A server, ONEVibe's adapter fails at the first frame.

The good news: everything *else* in the adapter matches the live 0.2.6-protocol wire I captured — `mapA2aStreamEvent`'s `kind` discrimination (`status-update` / `artifact-update` / `task`), the state names, `final`/`lastChunk` semantics, part concatenation, and `parseSseBlock`'s `data:`-only frame handling all line up 1:1 with the captures above. The repair is small:

1. `pump()` (`server/a2a-adapter.ts:180-190`): method → `message/stream`; params → `{message: {messageId: <uuid>, role: "user", parts: [{kind: "text", text}]}}`.
2. Task identity: the server now assigns the A2A `taskId` (first `kind:"task"` frame) instead of the client supplying `params.id`. ONEVibe currently passes its own `task.id` as the A2A id and reuses it for `input-required` continuation — switch to capturing the server `taskId` from the first frame and continuing with `message.taskId` on follow-up rounds.
3. No changes needed in `mapA2aStreamEvent`, `textFromA2aParts`, or the SSE parsing.

### Exposing a WorkflowAgent as an A2A server

Feasible and cheap — the spike server proves the whole server side is one file. Sketch:

- **Card per agent.** One A2A endpoint per WorkflowAgent (A2A convention is one card per agent): `GET /a2a/<workflowId>/.well-known/agent.json`, JSON-RPC POST on `/a2a/<workflowId>`. Map workflow capabilities → `skills[]`; declare `securitySchemes` bearer auth (matches the adapter's existing `bearerToken` constructor param, `server/a2a-adapter.ts:121`).
- **Executor = inverse of `mapA2aStreamEvent`.** Run the prompt through the existing ONEVibe runtime and project the durable RuntimeEvent ledger back onto A2A frames: task accepted → `Task(submitted)`; run started → `working`; `assistant_text_delta` → `artifact-update` chunks (`append`/`lastChunk`); `artifact_created` → artifact boundary; `user_input_requested` → `input-required` status (A2A's native HITL state — symmetric to the adapter's UserInputBroker path); `run_completed` → `completed` + `final:true`; `run_failed`/`run_cancelled` → `failed`/`canceled`.
- **No new dependency.** In Node this is a small JSON-RPC dispatcher plus an SSE writer; `parseSseBlock` already in the repo demonstrates the frame format is trivial. The Python SDK was only needed for the spike because we had no ONEVibe runtime on the VM.

### Invoking external A2A agents as connectors

With Finding 0 fixed, the existing adapter *is* the connector: any A2A-compatible agent (Linux Foundation ecosystem — official SDKs for Python, JS, Java, .NET; a growing public registry) becomes a ONEVibe runtime target with discovery (`health()` via the card), streaming, artifacts, and human-in-the-loop via `input-required`, with zero per-vendor code. The two directions compose: ONEVibe can consume a third-party A2A agent as a connector while exposing its own WorkflowAgents to third-party A2A clients — the same wire contract both ways, validated live in this spike.

One forward-looking caveat: SDK 1.x (protocol `1.0`, observed in `a2a-sdk` 1.1.1) rebases the types on protobuf with `TASK_STATE_*` state names and a restructured server API, and adds card fields like `preferredTransport` (JSON-RPC / gRPC / HTTP+JSON REST). The JSON-RPC event *shapes* ONEVibe parses remain conceptually the same, but before betting on 1.0 servers we should re-run this spike against a 1.x SDK and extend the adapter's transport/method selection accordingly.

## Deviations from the brief (and why)

1. **LiteLLM endpoint moved.** `http://127.0.0.1:4100/v1` has nothing listening on the VM (verified: `ss -tln`, curl → connection refused). The `litellm` container on `:4000` answers but has no DB (`/v1/models` → `{"error":"No connected db."}`). Used the **`litellm-vm` container at `http://127.0.0.1:47821/v1`** (OpenAI-compatible, healthy) instead — still the VM's shared LiteLLM router, no provider called directly. Its master key was read from the container's own env into `~/a2a-spike/.litellm_key` (mode 0600, VM only, never printed, never committed).
2. **Model name changed.** Neither `kimi-k3` nor `claude-sonnet-4-6` is registered on any reachable router (`kimi-k3` → HTTP 400 "Invalid model name"). Used **`claude-sonnet-5`**, which this router maps to `openrouter/z-ai/glm-5.2`.
3. **Method names modernized.** `tasks/send` / `tasks/sendSubscribe` are pre-publication draft names; no published `a2a-sdk` dispatches them (checked 0.2.4 → 1.1.1). Used `message/send` / `message/stream` and documented the consequence for ONEVibe's adapter (Finding 0).
4. **SDK pinned to 0.2.16, not latest.** Latest (1.1.1) speaks protocol v1.0 with a restructured, protobuf-based API. 0.2.16 speaks the 0.2.6 revision that the brief's lifecycle (`submitted → working → completed`) and ONEVibe's adapter event parsing match.
5. **Reasoning-model quirk handled.** This router's model streams `delta.reasoning_content` before `delta.content`; with `max_tokens=256` the first blocking capture exhausted the budget on reasoning and completed with empty content (visible as `artifacts: []`). The server forwards only `delta.content` and the spike ran with `max_tokens=1024`. Relevant if ONEVibe ever relays reasoning models through A2A artifacts.

## Verdict

A2A interop is real, small, and a good fit for ONEVibe: discovery, task lifecycle, SSE streaming, and HITL states all worked end-to-end on the first try against a LiteLLM-backed agent. The protocol surface ONEVibe must speak is ~150 lines of server code and a ~30-line client fix to the existing adapter (Finding 0). Recommended next steps: (1) patch `server/a2a-adapter.ts` per Finding 0 and re-point its contract tests at a live 0.2.6 server like the one in this spike; (2) prototype the WorkflowAgent-as-A2A-server projection (inverse `mapA2aStreamEvent`) behind `/a2a/<workflowId>/`.
