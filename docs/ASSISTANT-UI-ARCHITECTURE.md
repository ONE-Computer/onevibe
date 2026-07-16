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

## Failure and migration rules

- Never introduce browser-local conversation arrays as a fallback.
- Never treat assistant-ui thread state as evidence or persistence.
- A UI adapter failure must not alter the server transcript.
- Add future capabilities such as attachments, tool parts, message actions, and thread navigation by extending the API-backed adapter, not by bypassing it.
- Keep assistant-ui lazy-loaded so the conversation framework does not increase the initial home-page bundle.

## Verification

The first integration gate covers conversion unit tests, the full repository check, and browser inspection in light and dark themes. Later gates should exercise persisted thread navigation, reconnect during streaming, queued guidance, error/cancellation rendering, mobile layout, and attachment/tool-part contracts.
