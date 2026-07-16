# Assistant UI architecture

ONEVibe uses `@assistant-ui/react` as a presentation and interaction layer over the existing durable conversation system. It is not a second chat service.

## Authority model

- SQLite remains authoritative for conversations, turns, messages, run state, and evidence. Runtime events live in the versioned `runtime_events` ledger; per-task `events.json` files are legacy migration input only.
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

Each `runtime_event` SSE frame carries its durable event ID. On automatic EventSource reconnect, the browser sends `Last-Event-ID`; the server validates that the cursor belongs to the requested task and replays only events with a greater sequence from the SQLite runtime-event ledger. A malformed or cross-task cursor returns HTTP 400. Heartbeats keep intermediaries from silently expiring an otherwise idle stream, and the server advertises a bounded 1.5-second reconnect interval.

The client still deduplicates by event ID and reconciles with a full authoritative snapshot when a stream opens. Event-caused snapshot reads pass through a coalescing scheduler: overlapping requests produce at most one trailing reconciliation instead of racing one request per delta. Reconnection clears the warning only after the SSE connection opens; terminal history never masquerades as a broken live run.

## Tool activity projection

Assistant messages may include assistant-ui tool-call parts projected from durable evidence. Projection pairs `tool_call_started` and `tool_call_completed` by `(runId, toolUseId)` and attaches the result only to the assistant message whose `turnId` matches that run. Operational wrapper events without a provider invocation ID remain in the evidence rail and are not misrepresented as model tool calls.

Inline cards expose the tool name, execution boundary, input field names, timing, completion state, and a bounded result summary. Raw input values are deliberately excluded from chat projection. The append-only task timeline remains the source of truth; assistant-ui cards are a convenient view over that evidence, never an independent execution state.

## Follow-up attachments and message actions

The assistant-ui composer accepts up to four files per turn, with a 256 KiB per-file and 1 MiB aggregate limit. The API repeats every size, count, filename, and total-byte check; browser validation is only an early usability aid. Filenames are reduced to safe basenames, files receive monotonically numbered `inputs/` paths, and the task metadata update occurs only after workspace writes complete. Conversations retain at most 32 input files.

Immediate follow-up files are added only to that turn's provider context. Files attached to guidance during an active run are stored with the durable queued-guidance record and applied when that exact guidance starts its next turn. Cancelling queued guidance removes its staged files and metadata before provider execution, while preserving a cancellation evidence event with counts but no file content.

An `artifact_created` event binds the normalized file descriptors to the new `runId`; assistant-ui projects those descriptors onto the matching user message. File bytes and base64 payloads never enter chat metadata or evidence. Message copy uses assistant-ui's native action primitive and copies rendered message content without creating another persistence path.

## Turn-bound deliverables

Generated deliverables are projected onto the assistant message whose `turnId` matches the artifact event's `runId`. The projection derives from durable `artifact_created` and `artifact_updated` events, deduplicates revisions by workspace path within a turn, and keeps the newest evidence identity. The Computer rail remains authoritative; inline cards are a conversation view of the same record.

The ONEComputer extraction boundary emits one event per portable file after its bytes have been copied into the task workspace. Runtime internals, dotfiles, `node_modules`, uploaded `inputs/`, visual `evidence/`, `index.html`, and the separately recorded validation report are excluded. PPTX and PDF exports are slide decks; other eligible files are source deliverables. An aggregate extraction receipt cannot establish which turn created a particular file.

Artifact actions are same-origin and same-task only. The browser accepts a supplied URI only under `/api/tasks/<current-task>/`; otherwise it constructs the bounded file-download endpoint from the safe workspace path. Absolute paths, traversal segments, input files, evidence frames, external URLs, and raw sandbox locations never become inline actions.

## Responsive navigation

At widths up to 960px the sidebar starts closed so the task remains usable. Opening it creates a modal backdrop and an in-panel close control; selecting a task or primary view closes it again. The collapsed grid has one real content column—never a zero-width placeholder—so both conversation and workspace surfaces remain reachable at mobile breakpoints.

## Upstream reference and virtualization

The upstream assistant-ui repository is pinned locally at `/Users/gini/Desktop/Project ONEComputer/reference/assistant-ui`, commit `595fcba` (`https://github.com/assistant-ui/assistant-ui`). The study focused on three patterns: `useExternalStoreRuntime` for external persistence, `ThreadPrimitive.Unstable_MessageById` with `@tanstack/react-virtual` for large transcripts, and artifact panels that are derived from assistant-ui state rather than becoming a second persistence system.

ONEVibe adapts those patterns to its own authority boundary. The virtualized thread groups durable message IDs into user/assistant turns, keeps the transcript in a bounded scroll region, follows the newest activity while the reviewer is at the bottom, and exposes an accessible jump-to-latest affordance after the reviewer scrolls away. The Computer/artifact rail remains a ONEVibe surface because it is driven by the signed runtime-event ledger and must continue to show evidence even when the assistant-ui transcript is virtualized. We do not import the upstream demo's mock store, browser-owned thread list, or provider runtime.

The responsive review gate now includes desktop light/dark rendering, a 390x844 viewport with a reachable sidebar control, internal transcript scrolling, jump-to-latest behavior, and the existing bounded artifact actions. Reduced-motion behavior must continue to disable smooth scrolling and non-essential transitions.

## Failure and migration rules

- Never introduce browser-local conversation arrays as a fallback.
- Never treat assistant-ui thread state as evidence or persistence.
- A UI adapter failure must not alter the server transcript.
- Add future capabilities such as attachments, tool parts, message actions, and thread navigation by extending the API-backed adapter, not by bypassing it.
- Keep assistant-ui lazy-loaded so the conversation framework does not increase the initial home-page bundle.

## Verification

The first integration gate covers conversion unit tests, cursor/search/restart history tests, the full repository check, and browser inspection in light and dark themes. Later gates should exercise reconnect during streaming, queued guidance, error/cancellation rendering, mobile layout, and attachment/tool-part contracts.
