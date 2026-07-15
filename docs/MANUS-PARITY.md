# Manus parity ledger

Updated 2026-07-15 from `onevibe-manus-research/docs/TOP-100-FEATURES.md`.

This is the implementation gate, not a marketing checklist. **I** means behavior is implemented and locally verified, **P** means a meaningful slice exists but the observed Manus behavior is incomplete, and **M** means missing. Security-sensitive features only count when ONEComputer/OpenVTC controls are real; a cosmetic mock does not qualify.

## Task and agent experience

1. **I** Natural-language task entry — `POST /api/tasks` and home composer.
2. **I** Automatic task naming — deterministic persisted title.
3. **P** Automatic multi-step planning — five persisted, outcome-aware stages exist. Native Claude SDK tasks may refine their human-readable titles through a validated, evidence-recorded server MCP tool; ONEComputer runs project a bounded in-sandbox plan control file through the same server validation path. Arbitrary stage creation/reordering and richer agent-generated decomposition remain pending.
4. **P** Live plan progress — live statuses exist and each continuation resets the durable plan lifecycle with evidence linking the prior run. Richer provider-native progress mapping remains pending.
5. **P** Per-step elapsed time — plan transitions now persist start/completion timestamps, render elapsed duration, and append timing evidence. Native-agent-derived granular step mapping remains pending.
6. **I** Narrated execution — typed transcript deltas from demo, SDK, or remote runtime. A controlled opt-in live harness now verifies the Claude SDK lifecycle, workspace artifact, and evidence chain only when server-side credential readiness is explicitly configured.
7. **P** Interruptible follow-up chat — resumable same-session follow-ups work after a turn; explicitly retained ONEComputer sandboxes can reuse their active boundary for a continuation, and active non-interruptible provider turns accept bounded guidance queued for the next turn. Users can review and retract queued guidance before it reaches a provider; cancellation records metadata-only control evidence, not the guidance text. Users can stop a running, pending, input-waiting, or approval-waiting task while preserving workspace/evidence. True provider-native live interruption/injection remains pending.
8. **I** Expandable task messages — long user and grouped assistant turns collapse and expand in place.
9. **I** Structured waiting state — runtime parks durably, UI renders the focused request, and an answer resumes the same execution.
10. **I** Terminal-input request state — native Claude can invoke the ONEVibe input MCP tool and receive the user's answer as its tool result.
11. **I** Persistent routes — `/tasks/:taskId`, workspace review surfaces (`?tab=computer`, preview, code, evidence, and more), and the Skills, Library, and Scheduled surfaces survive reload and browser navigation through explicit view URLs.
12. **P** Concurrent workspace plus conversation and Computer timeline — server-classified, run-bound, evidence-backed task events render as a scrub-able terminal, visual-frame, artifact, diff, preview, deck, and approval record beside the conversation. Native Claude SDK runs now project up to 50 metadata-only workspace artifact cards alongside their tool trace; ONEComputer runs retain their isolated extraction evidence. The rail supports explicit live follow/pause, keyboard step/scrub, grouped tool/result cards, virtualized mixed-media replay, causal inline thumbnails, browser-tool-labelled X11 frames, and pauseable chronological replay of preserved visual evidence. Immutable workspace versions also provide a bounded current-vs-version file/hash compare. Browser navigation evidence is URL-redacted before projection. Native browser metadata, cross-run comparison, and production microVM evidence remain P0 in [`SIDE-ARTIFACT-RAIL.md`](SIDE-ARTIFACT-RAIL.md).
13. **I** Agent-mode entry point — primary ONEVibe surface.
14. **I** Task history surface — durable turn-based chat history, timestamps/status, cursor pagination, full-text search, reload persistence, and evidence export.
15. **P** Reusable project context — a project now retains a governed brief plus up to twelve bounded, path-confined knowledge files. The project sidebar accepts a bounded multi-file selection or browser-selected folder, imports eligible files sequentially, and flattens any browser-relative path into a safe display name rather than a server path. Text-like files are attached server-side as untrusted context with immutable metadata-only evidence, can be edited through an optimistic-hash-protected text editor, and retain up to ten local immutable prior revisions per file for guarded restore. Settled tasks can be moved between projects through a deliberate settings control, with a control event recording the old/new project and the effect on future continuation context. Stale files can be removed before they reach future tasks without altering the brief. Folder sync, fine-grained project permissions, connected drives, organization retention, and collaborative version management remain pending.
15a. **P** Skill library — eight explicit task skill guides can be selected (up to four per task), persisted, injected as non-authoritative operating guidance, and recorded in evidence. Third-party skill installation, organization policy packs, and per-project defaults remain pending.
15b. **P** Artifact library — completed work is indexed server-side across projects with raw inputs and evidence frames excluded; the Library supports title/project/mode/tag/artifact-path search, mode and tag filters, and each entry reopens its governing task. Bounded task tags are edited from task settings and recorded as control events. Retention controls and governed external sharing from the library remain pending.

## Prompting, context, and input

16. **I** Large free-form brief support — validated to 8,000 characters.
17. **I** Synthetic-data constraints — accepted as ordinary task instructions.
18. **P** Local-computer selector — control exists; context mounting is not wired.
19. **P** Cloud-computer selector — runtime providers and task-derived computer inventory exist; provider lifecycle controls and quota management remain pending.
20. **P** Local-file attachment — the composer stages up to four bounded files in a path-confined `inputs/` directory and records metadata-only evidence. Folder selection, large-file/object storage, and connector mounts remain pending.
21. **P** Workspace inventory — task-derived, observation-only inventory exposes runtime boundary, lifecycle, gateway attestation, visual-runtime readiness, and links to the governing task. Provider provisioning, termination, restart, quotas, and billing remain pending.
22. **M** Connected-app context indicators.
23. **M** GitHub connector.
24. **M** Gmail connector.
25. **M** Figma import.
26. **P** Website-reference input — users can attach up to eight HTTP(S) references; they are persisted, bounded, and handed to the agent as untrusted context. Research-mode artifacts now retain a redacted declared-source manifest (`user_supplied_unverified`, never fetched by demo) so source intent is not mistaken for a citation. Governed fetching, captures, and citation extraction remain pending.
27. **I** File-selection surface — workspace file tree and viewer.
28. **I** Prompt safety disclaimer — the primary composer has an expandable, always-visible pre-delegation cue: no secrets in prompts, files/references are untrusted context, workspace policy applies, and consequential actions require a separate VTI Wallet approval.

## Creation modes and templates

29. **I** Create Slides mode — mode-specific plan, eight-slide outline, interactive preview, notes, and genuine PPTX output. ONEVibe also has explicit portable Document and Data-story modes with inspectable source/metadata.
30. **P** Build Website mode — portable React/Vite output now includes a responsive, accessible enterprise landing-page starter with clear operating-boundary messaging and semantic FAQ disclosure. AI-directed design, screenshot/browser review, richer template packs, and deployment remain pending.
31. **P** Design mode — concept rationale and design-token artifacts exist; richer visual generation is pending.
32. **P** Create Games mode — dedicated plan and a portable playable React interaction loop now exist; richer mechanics, game assets, and runtime play-testing remain pending.
33. **P** Expandable mode catalogue — the composer exposes nine purpose-specific modes with output descriptions and persists the chosen mode. The starter gallery now preconfigures editable enterprise/SaaS sites, storefronts, dashboards, portfolios, link hubs, decks, research, blogs, and data stories; deeper per-mode template packs remain pending.
34. **P** E-commerce template — an editable App-mode storefront brief is available; checkout, commerce connectors, and reusable visual packs remain pending.
35. **P** Landing-page template — editable Enterprise-site and Portfolio Website starters are available in the composer; reusable visual/template packs remain pending.
36. **P** Dashboard template — an editable Operations-dashboard App starter is available; richer dashboard components and data connectors remain pending.
37. **P** Portfolio template — an editable Portfolio Website starter is available; portfolio-specific visual packs remain pending.
38. **P** Corporate-site template — an editable Enterprise-site Website starter is available; reusable corporate-site packs remain pending.
39. **P** SaaS template — an editable SaaS-launch Website starter is available; pricing, auth, and deployment remain pending.
40. **P** Link-in-bio template — an editable Link-hub Website starter is available; social connectors and reusable visual packs remain pending.
41. **P** Blog template — an editable Document-mode Blog starter is available; CMS publishing and editorial workflows remain pending.
42. **P** Slide-template catalogue — Slide mode offers editable Executive update, Product narrative, and Decision brief starters. Template import, visual template packs, and external deck ingestion remain pending.
43. **I** Structured slide outline before rendering — persisted eight-slide `outline.json`.
44. **I** Template-driven task bootstrapping — seven persisted modes receive distinct plans and artifact contracts.

## Website ideation and design

45. **P** Automatic concept generation — Design mode writes three deterministic candidates; agent-generated exploration is pending.
46. **P** Candidate comparison — Design mode emits three structured directions and displays a labelled deterministic heuristic fit for review. It is not a model probability, user-research result, or decision authority.
47. **I** Automatic concept selection — Design mode records its selected direction in `ideas.md`.
48. **I** Named design philosophy — Design artifacts declare and render the “Secure Signal” philosophy: evidence-forward enterprise interfaces, calm infrastructure, decisive status, and human approval at consequential boundaries.
49. **I** Design-principle documentation — Design mode retains `ideas.md`.
50. **I** Semantic color planning — generated tokens distinguish verified and pending states.
51. **P** Generated brand artwork — Design mode emits and renders a portable `brand-mark.svg` aligned to the selected Secure Signal direction. Rich visual exploration, image generation, and brand-research grounding remain pending.
52. **P** Responsive-layout intent — shell is responsive; generated-project validation is pending.
53. **P** Restrained-motion intent — shell uses Framer Motion and reduced-motion handling.
54. **P** Typography-system selection — shell has a deliberate stack; generated selection is pending.
55. **I** Design-token generation — shell token system exists.
56. **I** OKLCH theme values — generated Design artifacts include perceptual OKLCH values alongside hex fallbacks for the Secure Signal background, verified, and pending palette.
57. **I** Dark and light foundation tokens — persisted system/light/dark preference, pre-paint selection, semantic tokens, focus styling, and reduced-motion handling are implemented.
58. **P** Cut-corner interface language — the primary compose, workspace, and approval surfaces now use a restrained Secure Signal corner treatment in both themes; broader generated-artifact and visual-regression proof remain pending.
59. **P** Asymmetric editorial layout planning — represented in shell, not generated rationale.
60. **P** Generated realistic product copy — demo output is prompt-derived but shallow.

## Embedded development workspace

61. **I** Embedded code workspace.
62. **I** Project file tree.
63. **I** Syntax-highlighted code viewer — line-numbered source applies lightweight token highlighting for comments, strings, numbers, and language keywords without introducing a heavyweight editor dependency.
64. **I** Editable code surface — embedded text editor saves with optimistic hash protection, pre-edit snapshot, and evidence event.
65. **I** Diff mode — Original, Modified, and line-oriented Diff views are available before save.
66. **I** Dashboard workspace tab — task progress, artifact, evidence, boundary, and approval summaries are available in the workspace.
67. **P** Database workspace tab — Data mode renders the portable generated CSV as an inspectable in-workspace table and can open the source; live data sources, edits, and query tooling remain pending.
68. **I** Files workspace tab.
69. **P** Settings workspace tab — read-only task runtime, security boundary, approval, artifact-contract, and context metadata are visible; organization-wide settings and permission management remain pending.
70. **I** Workspace expansion — fullscreen overlay with explicit exit and Escape handling.
71. **I** Vite project generation — Website, App, and Game modes emit a portable Vite scaffold.
72. **I** React and TypeScript generation as a mode contract.
73. **P** Tailwind CSS integration as a generated scaffold — generated React/Vite projects include Tailwind 4 plus the Vite plugin, but dependency installation/build proof remains sandbox-gated.
74. **P** Component-library scaffold — projects include a typed reusable Button and `cn` helper; richer component catalogue and visual-regression proof remain pending.
75. **P** Server scaffold — App mode emits a typed, local Node HTTP health endpoint with separate scripts; connectors, auth, deployment, and sandbox execution proof remain pending.
76. **P** Shared-code scaffold — App mode emits a small typed client/server contract; broader domain/shared-package generation remains pending.
77. **P** Package lock generation — a successful, opt-in gateway-attested ONEComputer build extracts the sandbox-generated `app/package-lock.json` into the governed workspace, bounded to 1 MiB. Deterministic lock generation for local/demo and Claude-SDK runs remains pending.
78. **I** Formatting configuration — generated `.prettierrc`.
79. **I** Git ignore generation — generated `.gitignore` excludes dependencies, builds, and environment files.
80. **I** Generated ideation artifact — Design mode persists candidate rationale and selection.

## Interaction and application assembly

81. **I** Stateful React interactions — App-family scaffolds include a typed stateful interaction.
82. **P** Role-journey interaction — general App scaffolds include an interactive Admin, Manager, and Employee journey that distinguishes company policy, team guardrails, and bounded employee work. Persisted role policy and identity integration remain pending.
83. **I** Security-approval demonstration — separate bearer-authenticated wallet CLI signs approve/deny receipts bound to a task/action/expiry/evidence-head digest; the browser has no decision authority. This local HMAC adapter is explicitly not credited as an OpenVTC asymmetric receipt.
84. **P** Sandbox-dashboard mockup — security context and a headless visual-runtime timeline are visible; inventory and management interaction are incomplete.
85. **P** Mobile-wallet mockup — deep link and approval card exist; wallet simulator/client is pending.
86. **I** Navigation interaction.
87. **P** FAQ accordion interaction as generated output — Website mode includes semantic `details`/`summary` disclosure; agent-directed content and browser-reviewed interaction remain pending.
88. **P** Development observability — task-scoped event-derived duration, tool activity/errors, X11 evidence count, artifact count, runtime boundary, and gateway-attestation state are rendered in the workspace. Provider metrics, network flows, organization telemetry, and export remain pending.
89. **I** Icon-system integration — Lucide.
90. **P** Generated-asset delivery — path-confined workspace image artifacts can be rendered and downloaded in the Assets tab through a server-only raw-file route. External object storage, transformations, retention, and signed delivery URLs remain pending.

## Validation, delivery, and reuse

91. **P** Production-build validation and portability — ONEVibe ZIPs source and writes a versioned per-task static contract report. Native Claude SDK and ONEComputer sandbox runs both emit that bounded report after workspace delivery. When `ONEVIBE_SANDBOX_BUILD_VALIDATION=true` and a gateway-attested ONEComputer sandbox is available, Website/App/Game artifacts additionally install dependencies with lifecycle scripts disabled and run their build inside that disposable boundary, producing `sandbox-build-report.json`. Dependency provenance, browser behavior, and production deployment proof remain pending.
92. **P** Accessibility-validation step — static preview semantics plus generated Website landmarks, native FAQ disclosure, compact layout, reduced-motion, and keyboard-focus affordances are checked. The recorded `validation-report.json` is now rendered in a dedicated, read-only workspace tab with every check and its static-only limitation visible. Automated accessibility scans remain pending.
93. **P** Live-preview delivery and agent browser validation — isolated local preview works, and an attested sandbox may surface server-proxied X11 PNG frames. For Website, App, and Game outputs, a gateway-enforced browser runtime now additionally renders `file://` `index.html` inside the sandbox into a preserved artifact-rail screenshot with hostname resolution blocked. Allowlisted agent browser activity remains separately recorded; managed HTTPS and a deployed microVM proof remain pending.
94. **P** Publish control — external approval is required and publication is withheld; approved deployment is pending.
95. **P** GitHub handoff action — the source/evidence ZIP now includes an evidence-bound, GitHub-ready review guide with safe `git`/`gh` handoff steps. It does not create repositories or use GitHub credentials; a governed connector and approved push/PR flow remain pending.
96. **I** Download-as-ZIP source handoff with evidence manifest.
97. **I** Artifact reuse controls — follow-up editing, immutable history/restore, provenance-linked copy, wallet-approved read-only share, ZIP, and fullscreen all work.
98. **P** Multi-format slide export — PPTX is implemented and ZIP-portable; PDF and cloud-drive destinations are pending.
99. **P** Interactive deck viewer with notes — visual outline thumbnails, previous/next review controls, and an editable speaker-note source flow work. Rendered PPTX thumbnails and PDF export remain pending.
100. **P** Cross-device access — responsive web UI now exposes installable-web-app metadata and branded app icon for desktop/mobile browsers. Native iOS/Android clients, offline caching, push notification handling, and device-bound wallet integration remain pending.

## Immediate parity sequence

1. Durable routes, user-input states, mid-run steering, copy, and version history.
2. Mode architecture for Website, Slides, Research, Design, and App with mode-specific plans and artifacts.
3. Editable/diffable workspace plus browser/build/accessibility verification.
4. Real ONEComputer sandbox lifecycle, headless visual-runtime evidence, and gateway enforcement for every non-demo execution.
5. OpenVTC/VTI Wallet resolution, signed approval receipts, and gated publish/share/GitHub handoff.
6. Connectors, reusable project context, generated scaffolds, slide exports, and cross-device clients.

No parity claim is permitted until every line is **I** with test, runtime, or rendered-artifact evidence.
