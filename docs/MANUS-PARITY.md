# Manus parity ledger

Updated 2026-07-15 from `onevibe-manus-research/docs/TOP-100-FEATURES.md`.

This is the implementation gate, not a marketing checklist. **I** means behavior is implemented and locally verified, **P** means a meaningful slice exists but the observed Manus behavior is incomplete, and **M** means missing. Security-sensitive features only count when ONEComputer/OpenVTC controls are real; a cosmetic mock does not qualify.

## Task and agent experience

1. **I** Natural-language task entry — `POST /api/tasks` and home composer.
2. **I** Automatic task naming — deterministic persisted title.
3. **P** Automatic multi-step planning — five persisted steps; not yet agent-generated.
4. **P** Live plan progress — live statuses exist; per-run reset and richer progress are pending.
5. **P** Per-step elapsed time — plan transitions now persist start/completion timestamps, render elapsed duration, and append timing evidence. Native-agent-derived granular step mapping remains pending.
6. **I** Narrated execution — typed transcript deltas from demo, SDK, or remote runtime.
7. **P** Interruptible follow-up chat — resumable same-session follow-ups work after a turn, and active non-interruptible provider turns now accept bounded, evidence-backed guidance queued for the next turn. True provider-native live interruption/injection remains pending.
8. **I** Expandable task messages — long user and grouped assistant turns collapse and expand in place.
9. **I** Structured waiting state — runtime parks durably, UI renders the focused request, and an answer resumes the same execution.
10. **I** Terminal-input request state — native Claude can invoke the ONEVibe input MCP tool and receive the user's answer as its tool result.
11. **I** Persistent routes — `/tasks/:taskId` and the Skills, Library, and Scheduled surfaces survive reload and browser navigation through explicit view URLs.
12. **I** Concurrent workspace plus conversation and Computer timeline — server-classified, run-bound, evidence-backed task events render as a scrub-able terminal, visual-frame, artifact, diff, preview, deck, and approval record beside the conversation. The rail supports explicit live follow/pause and keyboard step/scrub; authenticated sandbox execution now adds bounded five-second live X11 checkpoints. High-scale replay and deployed production visual capture remain P0 work.
13. **I** Agent-mode entry point — primary ONEVibe surface.
14. **I** Task history surface — durable turn-based chat history, timestamps/status, cursor pagination, full-text search, reload persistence, and evidence export.
15. **P** Reusable project context — a project now retains a governed brief plus up to twelve bounded, path-confined knowledge files. Text-like files are attached server-side as untrusted context with immutable metadata-only evidence. Folder sync, fine-grained project permissions, connected drives, and deletion/version management remain pending.
15a. **P** Skill library — eight explicit task skill guides can be selected (up to four per task), persisted, injected as non-authoritative operating guidance, and recorded in evidence. Third-party skill installation, organization policy packs, and per-project defaults remain pending.
15b. **P** Artifact library — completed work is indexed server-side across projects with raw inputs and evidence frames excluded; the Library supports title/project/mode/artifact-path search and mode filters, and each entry reopens its governing task. Tags, retention controls, and governed external sharing from the library remain pending.

## Prompting, context, and input

16. **I** Large free-form brief support — validated to 8,000 characters.
17. **I** Synthetic-data constraints — accepted as ordinary task instructions.
18. **P** Local-computer selector — control exists; context mounting is not wired.
19. **P** Cloud-computer selector — runtime providers exist; computer inventory is missing.
20. **P** Local-file attachment — the composer stages up to four bounded files in a path-confined `inputs/` directory and records metadata-only evidence. Folder selection, large-file/object storage, and connector mounts remain pending.
21. **P** Workspace inventory — task-derived, observation-only inventory exposes runtime boundary, lifecycle, gateway attestation, visual-runtime readiness, and links to the governing task. Provider provisioning, termination, restart, quotas, and billing remain pending.
22. **M** Connected-app context indicators.
23. **M** GitHub connector.
24. **M** Gmail connector.
25. **M** Figma import.
26. **P** Website-reference input — users can attach up to eight HTTP(S) references; they are persisted, bounded, and handed to the agent as untrusted context. Governed fetching, captures, and citation extraction remain pending.
27. **I** File-selection surface — workspace file tree and viewer.
28. **I** Prompt safety disclaimer — the primary composer has an expandable, always-visible pre-delegation cue: no secrets in prompts, files/references are untrusted context, workspace policy applies, and consequential actions require a separate VTI Wallet approval.

## Creation modes and templates

29. **I** Create Slides mode — mode-specific plan, eight-slide outline, interactive preview, notes, and genuine PPTX output. ONEVibe also has explicit portable Document and Data-story modes with inspectable source/metadata.
30. **P** Build Website mode — portable React/Vite output now includes a responsive, accessible enterprise landing-page starter with clear operating-boundary messaging and semantic FAQ disclosure. AI-directed design, screenshot/browser review, richer template packs, and deployment remain pending.
31. **P** Design mode — concept rationale and design-token artifacts exist; richer visual generation is pending.
32. **P** Create Games mode — dedicated plan and a portable playable React interaction loop now exist; richer mechanics, game assets, and runtime play-testing remain pending.
33. **P** Expandable mode catalogue — the composer exposes nine purpose-specific modes with output descriptions and persists the chosen mode. A compact starter gallery now preconfigures editable Website, Briefing, Research, and Internal-tool tasks; deeper per-mode template packs remain pending.
34. **M** E-commerce / Shopify template.
35. **P** Landing-page template — an editable Website starter is available in the composer; reusable visual/template packs remain pending.
36. **M** Dashboard template.
37. **M** Portfolio template.
38. **M** Corporate-site template.
39. **M** SaaS template.
40. **M** Link-in-bio template.
41. **M** Blog template.
42. **M** Slide-template catalogue and import.
43. **I** Structured slide outline before rendering — persisted eight-slide `outline.json`.
44. **I** Template-driven task bootstrapping — seven persisted modes receive distinct plans and artifact contracts.

## Website ideation and design

45. **P** Automatic concept generation — Design mode writes three deterministic candidates; agent-generated exploration is pending.
46. **M** Candidate probability display.
47. **I** Automatic concept selection — Design mode records its selected direction in `ideas.md`.
48. **M** Named design philosophy.
49. **I** Design-principle documentation — Design mode retains `ideas.md`.
50. **I** Semantic color planning — generated tokens distinguish verified and pending states.
51. **M** Generated brand artwork.
52. **P** Responsive-layout intent — shell is responsive; generated-project validation is pending.
53. **P** Restrained-motion intent — shell uses Framer Motion and reduced-motion handling.
54. **P** Typography-system selection — shell has a deliberate stack; generated selection is pending.
55. **I** Design-token generation — shell token system exists.
56. **M** OKLCH theme values.
57. **I** Dark and light foundation tokens — persisted system/light/dark preference, pre-paint selection, semantic tokens, focus styling, and reduced-motion handling are implemented.
58. **M** Cut-corner interface language.
59. **P** Asymmetric editorial layout planning — represented in shell, not generated rationale.
60. **P** Generated realistic product copy — demo output is prompt-derived but shallow.

## Embedded development workspace

61. **I** Embedded code workspace.
62. **I** Project file tree.
63. **P** Syntax-highlighted code viewer — line-numbered source exists; token highlighting is pending.
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
77. **M** Package lock generation.
78. **I** Formatting configuration — generated `.prettierrc`.
79. **I** Git ignore generation — generated `.gitignore` excludes dependencies, builds, and environment files.
80. **I** Generated ideation artifact — Design mode persists candidate rationale and selection.

## Interaction and application assembly

81. **I** Stateful React interactions — App-family scaffolds include a typed stateful interaction.
82. **M** Role-journey interaction.
83. **I** Security-approval demonstration — separate bearer-authenticated wallet CLI signs approve/deny receipts; the browser has no decision authority.
84. **P** Sandbox-dashboard mockup — security context and a headless visual-runtime timeline are visible; inventory and management interaction are incomplete.
85. **P** Mobile-wallet mockup — deep link and approval card exist; wallet simulator/client is pending.
86. **I** Navigation interaction.
87. **P** FAQ accordion interaction as generated output — Website mode includes semantic `details`/`summary` disclosure; agent-directed content and browser-reviewed interaction remain pending.
88. **M** Development observability collector.
89. **I** Icon-system integration — Lucide.
90. **M** Generated-asset storage proxy.

## Validation, delivery, and reuse

91. **P** Production-build validation and portability — ONEVibe ZIPs source and writes a versioned per-task static contract report. Generated React/Vite projects now validate their portable dependency/scripts contract and output semantics, but are not yet dependency-installed or built in an attested sandbox.
92. **P** Accessibility-validation step — static preview semantics plus generated Website landmarks, native FAQ disclosure, compact layout, reduced-motion, and keyboard-focus affordances are checked. Automated accessibility scans remain pending.
93. **P** Live-preview delivery and agent browser validation — isolated local preview works, and an attested sandbox may surface server-proxied X11 PNG frames; automated browser review, managed HTTPS, and a deployed microVM proof are pending.
94. **P** Publish control — external approval is required and publication is withheld; approved deployment is pending.
95. **P** GitHub handoff action — the source/evidence ZIP now includes an evidence-bound, GitHub-ready review guide with safe `git`/`gh` handoff steps. It does not create repositories or use GitHub credentials; a governed connector and approved push/PR flow remain pending.
96. **I** Download-as-ZIP source handoff with evidence manifest.
97. **I** Artifact reuse controls — follow-up editing, immutable history/restore, provenance-linked copy, wallet-approved read-only share, ZIP, and fullscreen all work.
98. **P** Multi-format slide export — PPTX is implemented and ZIP-portable; PDF and cloud-drive destinations are pending.
99. **P** Interactive deck viewer with notes — visual outline thumbnails, previous/next review controls, and an editable speaker-note source flow work. Rendered PPTX thumbnails and PDF export remain pending.
100. **M** Cross-device clients.

## Immediate parity sequence

1. Durable routes, user-input states, mid-run steering, copy, and version history.
2. Mode architecture for Website, Slides, Research, Design, and App with mode-specific plans and artifacts.
3. Editable/diffable workspace plus browser/build/accessibility verification.
4. Real ONEComputer sandbox lifecycle, headless visual-runtime evidence, and gateway enforcement for every non-demo execution.
5. OpenVTC/VTI Wallet resolution, signed approval receipts, and gated publish/share/GitHub handoff.
6. Connectors, reusable project context, generated scaffolds, slide exports, and cross-device clients.

No parity claim is permitted until every line is **I** with test, runtime, or rendered-artifact evidence.
