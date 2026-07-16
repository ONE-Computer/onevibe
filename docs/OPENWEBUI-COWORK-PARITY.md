# Open WebUI / Claude Cowork / Manus parity study

Updated 2026-07-16. The Open WebUI reference was cloned outside the product repository at `/Users/gini/Desktop/Project ONEComputer/reference/open-webui` and inspected at commit `ecd48e2f718220a6400ecf49eafd4867a38feb10` (`0.10.2`). It is a reference implementation only; no Open WebUI source is imported into ONEVibe.

## Product boundary

ONEVibe should combine the strongest interaction patterns from Open WebUI, Claude Cowork, and Manus while keeping a stricter execution boundary:

```text
Open WebUI conversation and extensibility
        + Claude Cowork / Manus task-to-artifact workflow
        + ONEComputer sandbox, LiteLLM, evidence, and VTI Wallet
        = ONEVibe governed agent workspace
```

Open WebUI is a broad self-hosted AI platform: its current README describes OpenAI-compatible and Ollama model routing, RBAC/groups, Filters/Actions/Pipes/Tools/Skills, MCP/MCPO/OpenAPI tool servers, notes, channels, memory, queued messages, automations, RAG/web search, voice, artifacts, storage backends, SSO/SCIM, cloud file integrations, OpenTelemetry, and horizontal scaling. Those capabilities are useful parity targets, but their normal self-hosted trust model is not sufficient for consequential enterprise actions in ONEVibe.

Claude Cowork and Manus are the interaction references for an agent that turns a natural-language brief into a plan, live work trace, isolated computer workspace, and portable artifacts. The essential UX contract is: the user can understand what the agent is doing, inspect the resulting files/screenshots, continue the same task, and distinguish a preview from an approved external action.

## Capability mapping

| Reference capability | ONEVibe current implementation | Parity/security decision |
|---|---|---|
| Durable chat and reloadable history | SQLite-authoritative messages, cursor history, SSE replay, assistant-ui projection | Keep as the canonical transcript; never add browser-authoritative history |
| Models and providers | Safe demo, Claude Agent SDK, ONEComputer, remote adapter; Claude route supports LiteLLM | Add provider/model catalog only after server-side policy and cost limits exist |
| Tools, MCP, and skills | Mode-scoped tools, versioned local skill packs, governed ONEVibe MCP tools | Provider tools require allowlists, path confinement, redacted evidence, and sandbox routing |
| Manus-style plan and live work trace | Five-stage durable plan, tool cards, artifact rail, X11 evidence | Improve native provider progress mapping; do not display hidden chain-of-thought verbatim |
| Cowork/Manus computer workspace | ONEComputer conversation lease, visual runtime, browser-local review, screenshots | Production acceptance requires attested microVM isolation; current Kasm path remains development-only |
| Artifacts and previews | PPTX/PDF/source/preview extraction, turn-bound assistant cards, ZIP handoff | Every deliverable needs a durable creating-turn event and same-task action URI |
| Notes / project memory | Project brief and bounded knowledge files with versioned edits | Add durable user/org memory only with explicit scope, provenance, retention, and deletion controls |
| Files / RAG / web search | Bounded local attachments and untrusted HTTP references | Connectors and fetching must be policy-mediated; never let references become implicit network authority |
| Automations / schedules | Server-owned schedules and manual run path | Add tenant limits, deduplication, and wallet policy before autonomous external effects |
| Channels / collaboration | Not implemented | Defer until conversation/event authorization and per-member evidence semantics are defined |
| RBAC / SSO / SCIM | Not implemented in ONEVibe product layer | Required for enterprise deployment; identity must map to policy subject, not UI role text |
| Multi-model conversations | Not implemented | Defer until provider cost, data-boundary, and transcript attribution contracts exist |
| Voice / video / PWA / offline | Responsive web foundation only | Defer native clients/offline state until sync and wallet-device binding are specified |
| Analytics / observability | Task-scoped evidence and duration only | Add aggregate telemetry with redaction and tenant isolation; never use raw prompts as analytics payloads |

## Backend-first sequence

1. Prove the real Claude Agent SDK route through the configured server-side LiteLLM gateway, including two durable turns and a provider session identity.
2. Prove one conversation owns one sandbox lease, a continuation reuses it, and a second conversation receives a different lease.
3. Prove the sandbox-origin PPTX/PDF renderer, extraction manifest, per-file provenance, evidence-chain validity, and explicit release.
4. Add a first-class artifact/activity projection contract for Open WebUI/Cowork/Manus-style work traces without exposing hidden reasoning or credentials.
5. Add enterprise identity/policy/RBAC and external VTI Wallet approval before connectors, automations, publishing, or GitHub writes.

## Non-negotiable security translation

- Open WebUI plugin/MCP extensibility becomes a governed capability catalog; an installed tool is not automatically executable.
- A Manus/Cowork screenshot is evidence of an observed sandbox surface, not proof that an external action was authorized.
- A model-generated artifact is private until a separate policy decision and VTI Wallet receipt authorize sharing or publication.
- Memory, channels, automations, connectors, and multi-model routing must carry tenant, actor, conversation, lease, and retention scope in their durable records.
- Every parity claim must distinguish implemented behavior, development-provider behavior, and production-attested behavior.
