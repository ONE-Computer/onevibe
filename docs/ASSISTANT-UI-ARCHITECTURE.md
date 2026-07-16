# Assistant UI architecture

ONEVibe uses `@assistant-ui/react` as a presentation and interaction layer over the existing durable conversation system. It is not a second chat service.

## Authority model

- SQLite remains authoritative for conversations, turns, messages, run state, and evidence.
- The ONEVibe API and SSE stream remain authoritative for writes and live updates.
- `useExternalStoreRuntime` projects the server-owned `TaskSnapshot.messages` into assistant-ui.
- Sending through the assistant-ui composer calls the existing task continuation endpoint. The browser does not append an optimistic durable message or own a queue.
- While a provider turn is running, guidance is accepted by the existing backend queue. `isRunning` therefore stays false in the external runtime; the task header and evidence stream communicate actual provider state.
- ONEComputer execution, OpenVTC approvals, and the append-only evidence chain remain outside assistant-ui.

## Surface ownership

Assistant-ui owns transcript rendering, accessible message semantics, and the composer. ONEVibe retains the task plan, operational timeline, sandbox evidence, screenshots, and artifact rail. `TaskTimeline` deliberately excludes user and assistant transcript events so the conversation is not rendered twice.

## Message conversion

The adapter preserves durable message ID, role, content, creation time, task ID, turn ID, and provider metadata. Only assistant messages receive assistant-ui completion status; assigning status to user messages is invalid in assistant-ui and fails rendering.

## Conversation history

`GET /api/conversations` is the sidebar history contract. It merges persisted task metadata with the SQLite-backed message stream and returns stable, reverse-chronological summaries containing message count, last-message preview/status, provider, mode, project, and timestamps. Pages use an opaque cursor bound to the final `(updatedAt, id)` ordering pair; malformed or out-of-range requests fail closed with HTTP 400. Full-text sidebar search executes on the server so conversations outside the currently loaded page remain discoverable.

The browser may optimistically reorder a summary only from a newer authoritative `TaskSnapshot` received through the existing task API/SSE path. Reload always reconstructs the list from the server. Loading older pages deduplicates by conversation ID, and URL navigation remains the durable selection mechanism so browser back/forward restores the selected conversation.

## Stream continuity

Each `runtime_event` SSE frame carries its durable event ID. On automatic EventSource reconnect, the browser sends `Last-Event-ID`; the server validates that the cursor belongs to the requested task and replays only events with a greater sequence. A malformed or cross-task cursor returns HTTP 400. Heartbeats keep intermediaries from silently expiring an otherwise idle stream, and the server advertises a bounded 1.5-second reconnect interval.

The client still deduplicates by event ID and reconciles with a full authoritative snapshot when a stream opens. Event-caused snapshot reads pass through a coalescing scheduler: overlapping requests produce at most one trailing reconciliation instead of racing one request per delta. Reconnection clears the warning only after the SSE connection opens; terminal history never masquerades as a broken live run.

## Tool activity projection

Assistant messages may include assistant-ui tool-call parts projected from durable evidence. Projection pairs `tool_call_started` and `tool_call_completed` by `(runId, toolUseId)` and attaches the result only to the assistant message whose `turnId` matches that run. Operational wrapper events without a provider invocation ID remain in the evidence rail and are not misrepresented as model tool calls.

Inline cards expose the tool name, execution boundary, input field names, timing, completion state, and a bounded result summary. Raw input values are deliberately excluded from chat projection. The append-only task timeline remains the source of truth; assistant-ui cards are a convenient view over that evidence, never an independent execution state.

## Failure and migration rules

- Never introduce browser-local conversation arrays as a fallback.
- Never treat assistant-ui thread state as evidence or persistence.
- A UI adapter failure must not alter the server transcript.
- Add future capabilities such as attachments, tool parts, message actions, and thread navigation by extending the API-backed adapter, not by bypassing it.
- Keep assistant-ui lazy-loaded so the conversation framework does not increase the initial home-page bundle.

## Verification

The first integration gate covers conversion unit tests, cursor/search/restart history tests, the full repository check, and browser inspection in light and dark themes. Later gates should exercise reconnect during streaming, queued guidance, error/cancellation rendering, mobile layout, and attachment/tool-part contracts.
