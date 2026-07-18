# ONEVibe ERP Modules — The 80/20 Stack
> Written: 2026-07-18. Owner: Strategy & GTM office.
> Cross-referenced against the APAC Top 20 ICP profiles (docs/ICP-APAC-TOP20.md).
>
> **The principle:** ONEVibe ships 12 pre-built modules covering 80% of enterprise workflow pain
> across all 20 ICPs. Each module has a well-designed default UX, sensible routing defaults, and
> a manifest-driven config layer. The customer's 20% is adjusting field labels, approval thresholds,
> routing rules, and branding — all via the vibe builder, no developer needed.
>
> **The engine underneath:** Phase 20 ERP Core (entity registry, state machine, approval engine,
> audit bus, manifest format). Every module below is a manifest that runs on that engine.

---

## How the modules were selected

Each module below appears as a pain point in at least 8 of the 20 APAC ICPs.
The selection filter was:
1. **Frequency** — how many of the 20 ICPs share this pain?
2. **Shadow IT signal** — is the current solution visibly Excel/email/WhatsApp?
3. **Compliance forcing function** — does a regulator, auditor, or legal requirement make "do nothing" costly?
4. **Wedge quality** — can ONEVibe show measurable improvement (steps reduced, time to approval) in a demo?

Modules are ordered by combined score: highest frequency × highest compliance forcing function first.

---

## The 12 Core Modules

---

### Module 1 — Approvals Inbox
**"Every pending decision in one place, with one tap to act."**

**ICPs it serves:** All 20. Every ICP has approval workflows spread across email, portals, and WhatsApp.

**Pain today:** Approvers context-switch between Concur (expenses), Workday (leave/hiring), ServiceNow (IT), SAP (POs), email (everything else), and WhatsApp (urgent escalations) to clear their queue. There is no single view of "what do I need to decide today." High-value approvers (CFOs, investment committee members, compliance officers) lose hours per week to this.

**Ideal UJ — Approver:**
1. Opens ONEVibe on mobile (or desktop). Single card stack: "3 decisions waiting."
2. First card: expense report, $2,400, Singapore team offsite. Policy status shown. One tap: Approve.
3. Second card: leave request, 3 days, next week. Team calendar overlay shows no conflict. One tap: Approve.
4. Third card: vendor PO, $85,000, above threshold. Requires AAL2. Face ID prompt. Approve.
5. Queue cleared in 4 minutes. Audit trail written. No portal logins. No email threads.

**Default config:** Aggregates from all other modules. Routes by role from org chart. Push notifications via mobile (P18-04). AAL2 threshold configurable per org.

**Customer's 20%:** Approval threshold values, escalation timers, notification preferences, which modules feed in.

---

### Module 2 — Expense & Reimbursement
**"Submit a receipt in 30 seconds. Get paid in the next cycle."**

**ICPs it serves:** DBS (5), Grab (7), CapitaLand (8), CIMB (9), SIA (11), OCBC (12), ST Engineering (14), Mapletree (15), Tokio Marine (18), Lazada (20) — 10/20 ICPs.

**Pain today:** SAP Concur — 14 steps for a $12 lunch. Mandatory travel agent ($8 booking fee). No calendar integration. Hotel itemisation. GL code from a list of 40. Finance re-enters into a different system. Average 23 minutes per expense report (industry benchmark).

**Ideal UJ — Employee:**
1. Takes photo of receipt. AI reads: S$47.50, Din Tai Fung, 2026-07-18, "lunch."
2. AI suggests: "Client entertainment? Or team lunch?" Employee taps "Team lunch."
3. AI fills cost centre (from employee's org profile), GL code (from policy), and approver (direct manager).
4. Employee reviews the pre-filled card. Everything correct. Submit.
5. Manager gets a push card. One tap approve.
6. Queued for next payroll cycle. Employee gets push confirmation.
7. Total time: 45 seconds. No portal. No GL code lookup. No email.

**Default config:** AI receipt extraction, org-chart approver resolution, configurable per-category spending limits, threshold-based multi-level routing (e.g. >S$5k goes to Finance Director), policy auto-flag.

**Customer's 20%:** Category list, spending limits per category, approval thresholds, GL code mapping, payroll sync connector.

---

### Module 3 — Investment / Deal Committee Approval
**"IC memo → decision receipt, with a full fiduciary audit trail."**

**ICPs it serves:** GIC (3), Temasek Trust (1), Mapletree (15), CapitaLand (8), CLI/Ascendas (17), OCBC (12 — private banking suitability), Ayala (16), Tokio Marine (18 — reinsurance) — 8/20 ICPs. High AUM per ICP.

**Pain today:** IC memo written in PowerPoint/Word. Circulated by email for pre-read. IC meeting happens. Decision recorded in meeting minutes (Word doc). Finance/legal execute based on email confirmation. The approval decision is in a meeting minute, not a signed artefact. Legal teams frequently chase "who approved this and when?"

**Ideal UJ — Deal team:**
1. Analyst creates deal card: asset name, deal summary, financial model attachment, recommendation, risk rating.
2. Card auto-routes to the correct IC (resolved from which fund owns the asset — GIC's real estate IC ≠ GIC's PE IC).
3. IC members review on desktop or mobile before the meeting. One-tap pre-vote (support / flag / decline).
4. In the meeting: chairperson sees live vote tally. Discussion recorded as comment thread on the card.
5. Chairperson submits final decision. All voting IC members receive AAL2 biometric prompt on mobile.
6. Decision card sealed: who voted what, when, with biometric evidence. Legal receives the signed artefact.
7. Next step (legal review, term sheet execution) auto-triggered as the next workflow state.

**Default config:** Multi-fund IC routing, quorum rules, pre-vote, AAL2 final decision, connected legal workflow trigger.

**Customer's 20%:** IC membership list per fund, quorum rules, decision categories, connected systems (legal, portfolio monitoring).

---

### Module 4 — Leave & Absence Management
**"Request leave in 10 seconds. Manager approves before coffee."**

**ICPs it serves:** All 20. Every organisation with more than 50 employees has this problem.

**Pain today:** Workday — employees navigate 4 sub-menus to find the leave request form. HR policies vary by entity (annual leave, sick leave, childcare, NS leave in Singapore context). Balance calculations are opaque. Team coverage visibility is absent — the manager approves blindly.

**Ideal UJ — Employee:**
1. "I want Monday and Tuesday off next week." NL entry or calendar picker.
2. Card shows: balance remaining (8 days), team calendar overlay (one teammate already on leave — flagged, not blocked), policy type auto-selected (annual leave).
3. Submit. Manager gets push card: dates, balance, team coverage summary. Approve with one tap.
4. Employee's calendar blocked. HR system updated. All done.

**Ideal UJ — Manager (shift workers, SIA/Grab context):**
1. 3 leave requests pending for the same shift window.
2. Approvals Inbox (Module 1) shows them together with a conflict alert: "Approving all 3 leaves this shift will leave you below minimum coverage."
3. Manager approves 2, defers 1 with a note. All actions in one view.

**Default config:** Balance calculation from employment record, team coverage check, MOM-compliant leave types for Singapore (configurable per jurisdiction), manager cascade if absence.

**Customer's 20%:** Leave types by jurisdiction, balance rules, minimum coverage thresholds, public holiday calendar per country.

---

### Module 5 — Procurement & Purchase Orders
**"Describe what you need. The PO writes itself."**

**ICPs it serves:** Wilmar (13), Sinar Mas (19), ST Engineering (14), CapitaLand (8), SIA (11 — MRO parts), Jardine (10), Mapletree (15 — maintenance contractors), Tokio Marine (18 — vendor contracts) — 8/20 ICPs.

**Pain today:** SAP ME21N (goods receipt transaction) — requires material number, vendor code, plant code, storage location, purchasing organisation, GL account, cost centre, and delivery date, all entered manually. Average 14 minutes per PO. Most orgs have a parallel "email to procurement" shortcut that bypasses the system entirely.

**Ideal UJ — Budget holder:**
1. "I need 500 units of industrial solvent from our preferred supplier in Jakarta, deliver by end of month."
2. AI resolves: vendor (from preferred vendor list), material code, quantity unit, delivery date, plant code (from employee's location profile), GL code (from cost centre policy), cost centre.
3. Card shows: pre-filled PO, total value S$12,400, policy status (within budget, preferred vendor). Two fields to confirm: quantity and delivery date.
4. Submit. Routes to department head (below threshold) or Finance Director (above). Approval in one tap.
5. PO sent to vendor via email or connector. Goods receipt workflow triggered on delivery.

**Default config:** Preferred vendor catalogue, approval threshold matrix, GL code auto-resolve, delivery tracking, goods receipt confirmation.

**Customer's 20%:** Vendor catalogue, approval thresholds, GL code mapping, ERP connector (SAP, Oracle, Netsuite).

---

### Module 6 — Compliance & Regulatory Decisions
**"The decision you have to make. The trail you have to prove."**

**ICPs it serves:** MAS (4), CIMB (9 — AML/Shariah), DBS (5), OCBC (12), Grab (7 — cross-market regulatory), ST Engineering (14 — ITAR), Wilmar (13 — EUDR), Sinar Mas (19 — SFMP), Tokio Marine (18) — 9/20 ICPs. Highest compliance forcing function of all 12 modules.

**Pain today:** Compliance decisions (SAR filings, ITAR export licence checks, EUDR supply chain decisions, Shariah compliance sign-offs) are made in email threads, PDF forms, or bespoke legacy tools. The named individual who made the decision is often unclear from the audit trail. Regulators (MAS, FATF, EU) increasingly require not just "what was decided" but "who decided, when, with what evidence, at what authentication level."

**Ideal UJ — Compliance officer (SAR filing, MAS context):**
1. Alert raised by transaction monitoring system: unusual wire transfer pattern.
2. Compliance officer opens case card in ONEVibe. Pre-populated with: transaction details, counterparty profile, risk score, previous filings for same counterparty.
3. Officer reviews AI-drafted SAR narrative. Edits as needed. Attaches supporting documents.
4. Routes to MLRO (Money Laundering Reporting Officer) for sign-off.
5. MLRO reviews, confirms with AAL2 biometric. Decision sealed: officer + MLRO + timestamps + authentication evidence.
6. SAR filed to regulator (via connector or export). Sealed decision card retained as evidence. 10-year retention policy enforced automatically.

**Ideal UJ — Supply chain manager (EUDR, Wilmar context):**
1. Palm oil shipment from new supplier in North Sumatra. EUDR deforestation check required.
2. ONEVibe creates a supply chain decision card: supplier details, geolocation data (from satellite monitoring integration), EUDR check result (pass/flag/fail).
3. If flagged: routes to sustainability officer. Evidence attached. Decision card: approve supply (with justification) or reject.
4. Whatever the decision: the signed artefact with named officer's approval is the EUDR compliance evidence. No separate reporting exercise.

**Default config:** Case management state machine, AAL2 for high-risk decisions, 7/10-year retention, regulator export format (configurable), evidence attachment with hash verification.

**Customer's 20%:** Decision categories, risk threshold definitions, regulator connector, retention policy duration, jurisdiction-specific routing rules.

---

### Module 7 — Contract & Document Sign-off
**"Send for signature. Know who signed, when, and why."**

**ICPs it serves:** Temasek Trust (1 — grant agreements), EDB (2 — incentive agreements), GIC (3 — investment agreements), CapitaLand (8 — leases), CIMB (9 — facility letters), SIA (11 — MRO contracts), Mapletree (15 — leases), Ayala (16 — subsidiary agreements), Tokio Marine (18 — reinsurance contracts), Lazada (20 — merchant agreements) — 10/20 ICPs.

**Pain today:** DocuSign/Adobe Sign is the status quo — which is fine for simple two-party signatures. But complex contracts requiring internal approval before external signing (legal review → commercial approval → board sign-off → counterparty signature) still run on email between steps. The DocuSign sits at the end of a 6-email approval chain that has no audit trail.

**Ideal UJ — Legal team:**
1. Draft contract uploaded. AI summarises: key terms, obligations, risk flags (non-standard indemnity clause detected).
2. Internal review workflow: legal counsel annotates → commercial team approves terms → board committee ratifies (for material contracts above threshold).
3. Each internal step is a signed approval card (AAL2 for board members).
4. External signature link sent only after all internal approvals are sealed.
5. Counterparty signs (via DocuSign connector or native e-sign). Final signed document attached to the approval chain.
6. Contract stored with complete trail: who drafted → who reviewed → who internally approved → who signed externally → when.

**Default config:** Document hash on upload (tamper evidence), internal review state machine, DocuSign/Singpass connector for external e-sign, board-level AAL2, contract register with expiry reminders.

**Customer's 20%:** Review role definitions, approval thresholds by contract value, e-sign provider, retention period, contract type taxonomy.

---

### Module 8 — Shift Scheduling & Workforce Management
**"Build the roster in minutes. Fill gaps automatically."**

**ICPs it serves:** SIA (11 — 27,000 cabin crew/ground staff), Grab (7 — driver operations), Lazada (20 — warehouse/logistics), Prudential (6 — call centre), CIMB (9 — branch operations), Jardine (10 — retail/hotel operations) — 6/20 ICPs. Very high employee count per ICP.

**Pain today:** Workday for shift workers is unusable. "Assign shifts one person at a time through the UI." The real workflow: supervisor builds the week's roster in Excel on Sunday night, screenshots it into a WhatsApp group, and manages swap requests by WhatsApp DM. The official system is never updated. HR sees a disconnected record. Overtime is invisible.

**Ideal UJ — Supervisor:**
1. Opens scheduling canvas for the week. All available staff shown with their certified roles (SIA: qualified routes, Grab: vehicle category).
2. "Auto-fill week based on last week's roster." AI fills gaps, flags conflicts (rest requirements, certifications).
3. One-tap publish. All affected staff receive push notifications with their schedule.
4. Swap request: staff member A requests swap with B. B confirms. Supervisor approves (or auto-approved below threshold). Both calendars updated. HR sees the actual roster, not Sunday's Excel.

**Default config:** Role/certification constraints, minimum rest period enforcement, MOM overtime rules (Singapore), swap request workflow, daily/weekly summary to supervisor.

**Customer's 20%:** Role/certification taxonomy, rest period rules per jurisdiction, swap approval policy, connected HR system.

---

### Module 9 — Audit & Workpaper Management
**"Close the books. Sign the workpaper. File the evidence."**

**ICPs it serves:** GIC (3), Temasek Trust (1), Mapletree (15), CapitaLand (8), Wilmar (13 — RSPO), Sinar Mas (19 — SFMP), Tokio Marine (18 — Solvency), CIMB (9 — external audit) — 8/20 ICPs. Strong overlap with financial services and listed companies.

**Pain today:** Audit workpapers still live in shared drives. Reviewer comments are in email. The engagement quality review (EQR) sign-off is an email from a partner. The SOX 302/906 certification is a PDF sent by the CFO/CEO with no authenticated audit trail. External auditors request evidence via email and receive ZIP files of PDFs. Every audit cycle involves the same manual chase.

**Ideal UJ — Audit manager:**
1. Creates workpaper package for the period: structured sections (planning, testing, review, conclusion).
2. Preparer completes each section and submits for review.
3. Reviewer annotates inline, raises queries as threaded comments (each comment tracked to resolution).
4. EQR step: Engagement Quality Reviewer opens the sealed package, reviews, signs with AAL2.
5. CFO receives SOX certification card. Reviews. Signs with AAL2 biometric.
6. All signatures are cryptographic receipts. Sealed package exported as evidence for external auditor or regulator. No email. No ZIP file.

**Default config:** Workpaper structure templates, preparer→reviewer→EQR state machine, AAL2 for partner/CFO sign-off, sealed package export (PDF with signature chain), 10-year retention.

**Customer's 20%:** Workpaper section templates by industry/standard (PCAOB, Singapore Standards on Auditing), certification language by jurisdiction, EQR timing rules.

---

### Module 10 — IT Service & Incident Management
**"Report a problem. Get it fixed. Know what's happening."**

**ICPs it serves:** All 20. Every organisation above 100 employees needs this. IT is universally the worst-experience department for employees because ServiceNow's employee portal is an afterthought.

**Pain today:** ServiceNow employee portal — 6 clicks to report a broken laptop. The AI chatbot "useless if you don't train it" and most orgs don't. Status updates arrive as email digests. Employees resort to calling the IT helpdesk directly, which defeats the purpose of a ticketing system.

**Ideal UJ — Employee:**
1. "My VPN won't connect from the Singapore office."
2. AI classifies instantly: "Connectivity issue, Singapore office. Checking known issues." Finds: "Known issue with Cisco AnyConnect on macOS 15.4 — here's the fix." Walks employee through it.
3. Fixed in 3 minutes. No ticket created. AI logs the self-resolution for IT visibility.
4. If AI can't fix it: creates structured ticket with full diagnostic context already filled. Routes to the correct IT team (network, device, access). Employee gets push updates at each status change.

**Ideal UJ — IT technician:**
1. Queue shows structured tickets, each with: device model, OS version, error message, steps already tried. No "please provide more details" back-and-forth.
2. Resolve, close. Employee gets a push confirmation: "Your VPN issue was resolved. The fix: update to AnyConnect 5.1."

**Default config:** AI first-responder (knowledge base integration), incident classification, priority matrix, SLA timers with breach escalation, push status updates, self-resolution logging.

**Customer's 20%:** IT knowledge base content, SLA targets by priority, routing rules per IT team, connected CMDB/asset register.

---

### Module 11 — Performance Reviews & Goals
**"Set goals that connect to work. Reviews that don't start from a blank page."**

**ICPs it serves:** DBS (5), Grab (7), CapitaLand (8), CIMB (9), SIA (11), OCBC (12), ST Engineering (14), Mapletree (15) — 8/20 ICPs.

**Pain today:** SuccessFactors — goal-setting module built for top-down cascade, not collaborative goal-setting. The UI "does not invite the user to interact with it." Year-end performance review starts from a blank text box: "What did you achieve this year?" Employee has no record of continuous feedback, no reference to goals set 11 months ago. Manager has no structured data either. The review is a reconstruction exercise.

**Ideal UJ — Employee (goal setting):**
1. "I want to build our Singapore compliance team from 4 to 8 people by year-end and have zero MAS audit findings."
2. AI structures: two SMART goals. Suggests alignment to team OKRs (pulled from project board).
3. Manager reviews the goal card, adds one comment, confirms.
4. Goals visible on employee's home screen all year. Mid-year: push card, "How is your hiring goal tracking? (2/8 hired)"

**Ideal UJ — Employee (year-end review):**
1. Performance review card opens. Pre-populated: all goals with actual outcomes, all continuous feedback received, all projects worked on (from task history).
2. Employee writes a 3-sentence narrative. Not a blank page reconstruction.
3. Manager reviews with the same pre-populated card. Rating + narrative. No surprises.

**Default config:** SMART goal templates, OKR alignment pull from project board, continuous feedback card, pre-populated review card from activity history, calibration workflow for managers.

**Customer's 20%:** Competency framework, rating scale, calibration rules, review cycle timing, connected HRIS for headcount data.

---

### Module 12 — Grant & Fund Disbursement
**"Manage capital deployment with a named sign-off at every gate."**

**ICPs it serves:** Temasek Trust (1), EDB (2), GIC (3 — co-investment structures), Ayala (16 — group capital allocation), MAS (4 — AFIN sandbox grants), Mapletree (15 — fund capital calls) — 6/20 ICPs. Highest average transaction value of all 12 modules.

**Pain today:** Grant and fund disbursement workflows are almost entirely email-based. Application → eligibility review → committee approval → legal agreement execution → disbursement instruction → confirmation are all separate steps in separate systems with separate email threads. Reconciling "what was approved vs what was disbursed" requires a human to manually trace across 4 inboxes.

**Ideal UJ — Program manager (Temasek Trust / EDB context):**
1. Grant applicant submits through a structured card: organisation profile, project description, budget breakdown, impact KPIs.
2. Eligibility check step: reviewer scores against criteria. Passes automatically if above threshold; flags for committee if borderline.
3. Committee review: each member sees the application card with the eligibility score, prior grants history, and a recommendation. Vote → decision sealed with AAL2.
4. Legal agreement auto-drafted from the approved terms. Sent for e-sign (counterparty signs via DocuSign connector).
5. Disbursement instruction generated from the signed agreement. Finance confirms receipt. Post-disbursement monitoring: KPI check-ins at 6 months, 12 months, as cards to the grantee.

**Default config:** Application form template, eligibility scoring rubric, committee routing, legal agreement generation, disbursement instruction, post-disbursement monitoring cadence.

**Customer's 20%:** Application form fields, eligibility criteria, committee composition, legal agreement template, monitoring KPIs, connected finance system for disbursement.

---

## The 80/20 matrix

| Module | ICP coverage (of 20) | Compliance forcing function | Shadow IT signal | Wedge quality |
|---|---|---|---|---|
| 1 — Approvals Inbox | 20/20 | High (all regulated) | Email/WhatsApp everywhere | ★★★★★ |
| 2 — Expense & Reimbursement | 10/20 | Medium (policy audit) | Concur escapees → Excel | ★★★★★ |
| 3 — Investment/IC Approval | 8/20 | Very high (fiduciary) | Email/Word meeting minutes | ★★★★★ |
| 4 — Leave & Absence | 20/20 | Medium (MOM/labour law) | Email + WhatsApp | ★★★★☆ |
| 5 — Procurement & POs | 8/20 | High (audit threshold) | SAP escapees → email | ★★★★★ |
| 6 — Compliance & Regulatory | 9/20 | Very high (legal liability) | PDF forms + email | ★★★★★ |
| 7 — Contract & Document Sign-off | 10/20 | High (legal enforceability) | DocuSign + email approval chain | ★★★★☆ |
| 8 — Shift Scheduling | 6/20 | Medium (labour law) | WhatsApp + Excel rosters | ★★★★★ |
| 9 — Audit & Workpaper | 8/20 | Very high (SOX/SAA) | Shared drive + email | ★★★★★ |
| 10 — IT Service & Incident | 20/20 | Low–medium (ITSM SLA) | IT helpdesk direct calls | ★★★★☆ |
| 11 — Performance & Goals | 8/20 | Medium (HR compliance) | SuccessFactors escapees | ★★★★☆ |
| 12 — Grant & Fund Disbursement | 6/20 | Very high (fiduciary/AGO) | Email + Excel trackers | ★★★★★ |

**Every module runs on Phase 20 ERP Core.** Each is a manifest — entity schema + state machine + form template + permissions + connector bindings. No bespoke engine code.

---

## The customer's 20%

Every module ships with a vibe-configurable layer. Admins can adjust:

| What | How | Time |
|---|---|---|
| Field labels and field set | Edit manifest in vibe builder | 5 minutes |
| Approval thresholds | Slider or number input | 2 minutes |
| Routing rules | Plain-language rules ("above $50k → CFO") | 5 minutes |
| Connector bindings | Pick from connector library, map fields | 10 minutes |
| Branding | Logo, primary colour, font | 3 minutes |
| Notification text | Edit push/email templates | 5 minutes |

Total time for a business admin to take a default module and make it "ours": **30–45 minutes.** No developer. No IT ticket. No implementation partner.

This is the structural advantage over SAP/ServiceNow: their equivalent is a 3-month implementation project costing $200k–$2M.

---

## Module delivery sequence (recommended)

Sequence determined by: ICP urgency × ease of wedge demo × least dependency on other modules.

1. **Approvals Inbox** (Module 1) — first because it aggregates everything. Every other module feeds it.
2. **Expense & Reimbursement** (Module 2) — fastest demo cycle. Everyone has been frustrated by Concur.
3. **Leave & Absence** (Module 4) — universally relatable. Lowest-risk deployment.
4. **IT Service & Incident** (Module 10) — IT team as internal champion. Fastest viral spread.
5. **Procurement & POs** (Module 5) — finance team as champion. High ROI story.
6. **Investment/IC Approval** (Module 3) — Tier 1 ICPs (GIC, Mapletree). High ACV.
7. **Compliance & Regulatory** (Module 6) — MAS/CIMB/Wilmar. Highest compliance forcing function.
8. **Contract & Document Sign-off** (Module 7) — natural complement to Module 3 and 6.
9. **Grant & Fund Disbursement** (Module 12) — Temasek Trust, EDB. High ACV + social impact story.
10. **Audit & Workpaper** (Module 9) — annual cycle — plan for pre-year-end release.
11. **Shift Scheduling** (Module 8) — SIA, Grab, Lazada. Requires mobile (P18) to be compelling.
12. **Performance & Goals** (Module 11) — annual cycle — plan for Q1 release.
