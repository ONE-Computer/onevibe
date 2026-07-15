# P0: side artifact rail

**Priority:** P0 — first interaction stream after the security boundary

## Why this matters

The strongest Manus interaction is not merely an activity log. While an agent works, a person can scan a single vertical rail and understand what it did: a tool action, its result, the Linux desktop or browser state produced by that action, and the files or deliverables that followed. They can scroll back to any moment without losing the conversation.

ONEVibe's current **Computer** view already has durable typed events, terminal inspection, captured X11 frames, filters, live follow, keyboard stepping, and immutable event links. It is an important foundation, but it is not yet the artifact-first, continuously scrollable mixed-media experience above.

## Product contract

For every supported agent action, render a compact, ordered evidence card in one side rail:

| Event | Rail card | Required relationship |
|---|---|---|
| Tool starts | Tool name, sanitized input/command, running state | Stable tool-use ID and run ID |
| Tool completes/fails | Output summary, expandable sanitized output, duration, status | Must pair to the originating tool card |
| Shell/CLI execution | Command, working-directory label, streamed sanitized stdout/stderr, exit state | Must be one chronological card pair; never expose host paths, secrets, or shell access |
| X11/browser checkpoint | Inline thumbnail, timestamp, expand-to-inspect | Must name the causal tool event or explicitly say it is periodic |
| File/diff/preview/deck | File type, path, compact preview/thumbnail where safe | Must point to immutable workspace version/evidence event |
| Approval/policy boundary | Scope, policy decision, external-wallet state | Browser remains request-only; receipt resolves server-side |

The default view is chronological and auto-follows new activity. A settled task opens on its latest visual deliverable (frame, preview, or deck) rather than a trailing control receipt. Pausing preserves the reader's position and shows an accessible “new activity” affordance. Selecting a card opens a detail pane without replacing the scroll position. The conversation remains visible beside the rail on desktop and becomes a clear route/tab on compact screens.

## Security and evidence invariants

- The browser receives only server-projected, redacted task events and proxied render assets. It never receives X11, VNC, CDP, shell, sandbox, wallet, or connector credentials.
- Every persistent card carries task ID, run ID, sequence, timestamp, artifact version where relevant, and immutable evidence hash.
- Live frames are clearly labelled live and cannot masquerade as historical evidence. Historical cards are immutable and deep-linkable.
- Screenshot capture follows tenant policy and retention. Secrets, personal data, and unrelated windows must be redacted before durable storage. Identical X11 frames may reuse one immutable PNG blob, but each causal rail card remains a separate evidence event.
- Tool input and output have size limits and secret-/host-path-aware redaction before they reach the card or export.

## Delivery slices

1. **P0a — rail cards:** Replace the history-list + single-stage mental model with a virtualized chronological card rail. Group request/result events by `toolUseId`; retain standalone control/policy cards.
2. **P0b — visual correlation:** Persist causality for X11 and future browser captures; show safe inline thumbnails directly after the producing tool card and provide an expanded inspect view.
3. **P0c — replay (in progress):** Selection, scroll anchor, filters, and deep links survive reload/reconnect; the rail can play preserved visual evidence in chronological order, then pause for manual immutable inspection. Filter and comparison state is immediately URL-addressable, even before another card is selected. Multi-run tasks surface visible run chapters and can be filtered to one immutable run through a deep-linkable selector; two runs can now be compared through bounded evidence counts and elapsed spans. Historical tasks without persisted run IDs derive display-only `Turn 1`, `Turn 2` boundaries from their immutable `run_started` events—without rewriting the ledger. Immutable workspace versions can now be compared against the current workspace through bounded path/hash metadata without copying source into evidence. Add richer prior-run artifact comparison and synchronized production browser/desktop playback without mutating evidence.
4. **P0d — browser evidence (in progress):** Website, App, and Game outputs now add an explicit sandbox-local `file://` Chromium screenshot after artifact extraction, with hostname resolution blocked. Allowlisted browser-tool starts/results now produce explicitly labelled X11 checkpoints tied to the tool-use ID and a bounded tool/URL record; query strings, fragments, credentials, and sandbox-local paths are removed before projection. Add trusted page-title metadata and production browser playback without exposing CDP or control credentials.
5. **P0e — scale and accessibility:** Progressive media loading, keyboard traversal, screen-reader labels, reduced-motion behavior, and performance proof at 10,000 events.
6. **P0f — real runtime proof:** Exercise the rail against an attested ONEComputer X11/browser runtime—not demo fixtures—with redaction and retention evidence.
7. **P0g — Manus-style mixed tool stream (next):** Make the rail visibly alternate between the right evidence type for the agent's actual tool call: a compact CLI transcript for command work; an inline X11/browser capture for graphical work; and a file, diff, preview, or slide card for a produced deliverable. Preserve a single scroll position across the mixed stream, bind every card to the same tool-use/run/sequence model, and make visual capture availability explicit rather than fabricating a frame. Validate the interaction against real sandbox sessions before treating the UX as parity.

## Definition of done

- A real governed task visibly interleaves a CLI command/transcript where shell work occurs, one causal visual frame where graphical work occurs, and one produced artifact in chronological order.
- A reviewer can return to any immutable card by URL after reload and see the same evidence-bound content.
- A task with 10,000 cards opens in under two seconds p95 and scrub/card selection responds under 100 ms p95 on reference hardware.
- Automated tests cover grouping, ordering, pairing, redaction, deep links, reconnect idempotency, live/persisted distinction, and keyboard operation.
- A security review confirms no runtime-control or credential capability is introduced into the browser.

## Dependencies

This is dependent on the typed event contract already in place and is blocked only for production visual proof by the attested ONEComputer microVM/X11/browser path. It must not wait for connectors, GitHub publishing, or native mobile clients.
