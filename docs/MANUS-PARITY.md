# Manus parity ledger

Updated 2026-07-15 from `onevibe-manus-research/docs/TOP-100-FEATURES.md`.

This is the implementation gate, not a marketing checklist. **I** means behavior is implemented and locally verified, **P** means a meaningful slice exists but the observed Manus behavior is incomplete, and **M** means missing. Security-sensitive features only count when ONEComputer/OpenVTC controls are real; a cosmetic mock does not qualify.

## Task and agent experience

1. **I** Natural-language task entry — `POST /api/tasks` and home composer.
2. **I** Automatic task naming — deterministic persisted title.
3. **P** Automatic multi-step planning — five persisted steps; not yet agent-generated.
4. **P** Live plan progress — live statuses exist; per-run reset and richer progress are pending.
5. **M** Per-step elapsed time.
6. **I** Narrated execution — typed transcript deltas from demo, SDK, or remote runtime.
7. **P** Interruptible follow-up chat — resumable same-session follow-ups work after a turn; mid-run steering is pending.
8. **I** Expandable task messages — long user and grouped assistant turns collapse and expand in place.
9. **I** Structured waiting state — runtime parks durably, UI renders the focused request, and an answer resumes the same execution.
10. **I** Terminal-input request state — native Claude can invoke the ONEVibe input MCP tool and receive the user's answer as its tool result.
11. **I** Persistent task routes — `/tasks/:taskId` survives reload and browser navigation.
12. **I** Concurrent workspace plus conversation.
13. **I** Agent-mode entry point — primary ONEVibe surface.
14. **I** Task history surface — durable turn-based chat history, timestamps/status, cursor pagination, full-text search, reload persistence, and evidence export.
15. **M** Reusable project context.

## Prompting, context, and input

16. **I** Large free-form brief support — validated to 8,000 characters.
17. **I** Synthetic-data constraints — accepted as ordinary task instructions.
18. **P** Local-computer selector — control exists; context mounting is not wired.
19. **P** Cloud-computer selector — runtime providers exist; computer inventory is missing.
20. **M** Local-folder attachment.
21. **M** Computer management.
22. **M** Connected-app context indicators.
23. **M** GitHub connector.
24. **M** Gmail connector.
25. **M** Figma import.
26. **M** Website-reference input.
27. **I** File-selection surface — workspace file tree and viewer.
28. **M** Prompt safety disclaimer.

## Creation modes and templates

29. **I** Create Slides mode — mode-specific plan, eight-slide outline, interactive preview, notes, and genuine PPTX output.
30. **P** Build Website mode — website artifacts and isolated preview work; mode-specific workflow is pending.
31. **P** Design mode — concept rationale and design-token artifacts exist; richer visual generation is pending.
32. **P** Create Games mode — dedicated plan and app scaffold exist; playable game generation is pending.
33. **M** Expandable mode catalogue.
34. **M** E-commerce / Shopify template.
35. **M** Landing-page template.
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
57. **P** Dark and light foundation tokens — dark foundation exists; light theme is pending.
58. **M** Cut-corner interface language.
59. **P** Asymmetric editorial layout planning — represented in shell, not generated rationale.
60. **P** Generated realistic product copy — demo output is prompt-derived but shallow.

## Embedded development workspace

61. **I** Embedded code workspace.
62. **I** Project file tree.
63. **P** Syntax-highlighted code viewer — line-numbered source exists; token highlighting is pending.
64. **I** Editable code surface — embedded text editor saves with optimistic hash protection, pre-edit snapshot, and evidence event.
65. **I** Diff mode — Original, Modified, and line-oriented Diff views are available before save.
66. **M** Dashboard workspace tab.
67. **M** Database workspace tab.
68. **I** Files workspace tab.
69. **M** Settings workspace tab.
70. **I** Workspace expansion — fullscreen overlay with explicit exit and Escape handling.
71. **I** Vite project generation — Website, App, and Game modes emit a portable Vite scaffold.
72. **I** React and TypeScript generation as a mode contract.
73. **M** Tailwind CSS integration as a generated scaffold.
74. **M** Component-library scaffold.
75. **M** Server scaffold.
76. **M** Shared-code scaffold.
77. **M** Package lock generation.
78. **I** Formatting configuration — generated `.prettierrc`.
79. **I** Git ignore generation — generated `.gitignore` excludes dependencies, builds, and environment files.
80. **I** Generated ideation artifact — Design mode persists candidate rationale and selection.

## Interaction and application assembly

81. **I** Stateful React interactions — App-family scaffolds include a typed stateful interaction.
82. **M** Role-journey interaction.
83. **I** Security-approval demonstration — separate bearer-authenticated wallet CLI signs approve/deny receipts; the browser has no decision authority.
84. **P** Sandbox-dashboard mockup — security context is visible; management interaction is incomplete.
85. **P** Mobile-wallet mockup — deep link and approval card exist; wallet simulator/client is pending.
86. **I** Navigation interaction.
87. **M** FAQ accordion interaction as generated output.
88. **M** Development observability collector.
89. **I** Icon-system integration — Lucide.
90. **M** Generated-asset storage proxy.

## Validation, delivery, and reuse

91. **P** Production-build validation and portability — ONEVibe builds and ZIPs source; generated projects are not universally built.
92. **M** Accessibility-validation step.
93. **P** Live-preview delivery and agent browser validation — isolated local preview works; automated browser review and managed HTTPS are pending.
94. **P** Publish control — external approval is required and publication is withheld; approved deployment is pending.
95. **M** GitHub handoff action.
96. **I** Download-as-ZIP source handoff with evidence manifest.
97. **I** Artifact reuse controls — follow-up editing, immutable history/restore, provenance-linked copy, wallet-approved read-only share, ZIP, and fullscreen all work.
98. **P** Multi-format slide export — PPTX is implemented and ZIP-portable; PDF and cloud-drive destinations are pending.
99. **P** Interactive deck viewer with notes — previous/next preview and speaker notes work; thumbnails and editable notes are pending.
100. **M** Cross-device clients.

## Immediate parity sequence

1. Durable routes, user-input states, mid-run steering, copy, and version history.
2. Mode architecture for Website, Slides, Research, Design, and App with mode-specific plans and artifacts.
3. Editable/diffable workspace plus browser/build/accessibility verification.
4. Real ONEComputer sandbox lifecycle and gateway enforcement for every non-demo execution.
5. OpenVTC/VTI Wallet resolution, signed approval receipts, and gated publish/share/GitHub handoff.
6. Connectors, reusable project context, generated scaffolds, slide exports, and cross-device clients.

No parity claim is permitted until every line is **I** with test, runtime, or rendered-artifact evidence.
