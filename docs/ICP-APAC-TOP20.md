# ONEVibe — APAC Ideal Customer Profiles: Top 20
> Written: 2026-07-18. Owner: Strategy & GTM office.
> Purpose: sharpen product for APAC enterprise buyers. Each profile identifies the workflow pain, compliance burden, and the specific ONEVibe wedge.

---

## Selection criteria

The 20 organisations below were selected for:
1. **Workflow complexity** — multi-entity, multi-geography, multi-approval-chain operations
2. **Compliance burden** — regulated industries (financial services, government, healthcare) where audit trails are legally required, not optional
3. **Shadow IT exposure** — large organisations where employees visibly escape to Excel/email/WhatsApp for real work
4. **Data sovereignty sensitivity** — preference or legal requirement for self-hosted, auditable infrastructure
5. **AI-forward signal** — public statements or initiatives indicating appetite for AI-native tooling

The wedge is always the same: find the workflow employees hate most in the incumbent (Concur, Workday, SAP, ServiceNow), ship a mini-app that does it in under 60 seconds, earn the audit trail.

---

## The 20 Profiles

---

### 1. Temasek Trust (Singapore)
**Vertical:** Philanthropy / Impact investing
**Size:** Umbrella over 10+ member entities (Temasek Foundation, ABC Impact, Mandai Nature, WMI, MoneyOwl, CIIP, and others)
**Workflow pain:** Multi-entity grant management, capital deployment approvals, and compliance coordination across legally distinct organisations — each with different governance structures, different boards, different reporting rhythms — stitched together by email chains and shared Excel trackers.
**Compliance burden:** Philanthropic capital flows require named-individual sign-off with paper trails. No room for "the approval was implicit."
**Shadow IT:** High probability of per-entity Excel trackers for grant disbursement, disconnected from each other.
**ONEVibe wedge:** Multi-org workspace (P16-E) + immutable audit event bus (P20-10). A single approval inbox where a grant request flows from entity to Temasek Trust board level with cryptographic receipts at each step — no email chains, no SharePoint folders, no "who approved this?"
**Key ask to verify:** What system manages cross-entity grant approvals today? Does each member entity run its own workflow tools?

---

### 2. Economic Development Board Singapore (EDB)
**Vertical:** Government / Investment promotion agency
**Size:** Singapore statutory board (~500–1,000 staff estimated)
**Workflow pain:** Inbound FDI applications route through multi-agency review (EDB, MAS, MTI, sector-specific agencies). Each application involves document collection, eligibility checks, incentive calculation, multi-level sign-off, and legal agreement execution. Current tooling is portal-based (EDB Portal) but approval workflows are largely manual.
**Compliance burden:** Government procurement rules, ministerial accountability, public audit requirements. Every incentive decision is auditable by the Auditor-General's Office.
**Shadow IT:** Officers use email and shared drives to track application status between agencies.
**ONEVibe wedge:** Intent-to-workflow engine (P19-15) + procurement mini-app (P19-13/14). FDI application becomes a structured workflow: entity profile → eligibility check → incentive modelling → inter-agency review → approval card (with named civil servant sign-off) → legal agreement trigger. Full AGO-ready audit trail built in.
**Key ask to verify:** Is EDB on a GovTech-standard platform (WoG ICT)? What is the current inter-agency approval tooling?

---

### 3. GIC Private Limited
**Vertical:** Sovereign wealth fund / Global asset management
**Size:** ~2,300 employees, 11 global offices, US$770B+ AUM
**Workflow pain:** Multi-asset-class investment approvals (public equity, PE, real estate, infrastructure, credit) across 40+ countries. Each investment requires deal kanban tracking, credit/IC committee approval, legal review, and post-investment monitoring — all with strict fiduciary accountability.
**Compliance burden:** Singapore sovereign wealth fund — fiduciary duty to Singapore citizens. Data sovereignty is explicitly cited by leadership as a priority. External auditors, MAS oversight.
**Shadow IT:** Deal teams build Excel-based IC memo trackers; email threads carry approvals that should be in a system of record.
**ONEVibe wedge:** Finance/IB mini-app (P16-C, P19) — deal kanban + credit committee approval + FINRA/MAS-supervised communications. Self-hosted deployment satisfies data sovereignty. VTI-signed IC approval receipts are the legally-defensible evidence that the named partner approved at AAL2.
**Key ask to verify:** Does GIC use Bloomberg AIM or a proprietary OMS? What is the IC approval workflow today?

---

### 4. Monetary Authority of Singapore (MAS)
**Vertical:** Central bank / Financial regulator
**Size:** ~4,000 staff (estimated statutory board scale)
**Workflow pain:** Administers Banking Act, Securities and Futures Act, Insurance Act, and Payment Services Act simultaneously. Licensing applications, supervisory actions, enforcement decisions, and policy consultations all require multi-level internal approval before any external communication. Cross-directorate coordination (Supervision, Policy, Technology, Enforcement) on regulated entity decisions.
**Compliance burden:** MAS is the compliance authority — their own internal governance must be exemplary. Ministerial accountability. Everything is subject to Parliamentary scrutiny.
**Shadow IT:** Low tolerance for shadow IT, but email-based coordination between directorates is the de facto workflow for complex licensing decisions.
**ONEVibe wedge:** Regulatory workflow mini-apps (P16-D) — SAR-style internal decision workflows with named civil servant approval receipts, full audit trail, inter-directorate routing. MAS-grade data governance: self-hosted, cryptographic receipts, no third-party SaaS holding sensitive supervisory data.
**Key ask to verify:** Is MAS on WoG GovTech infrastructure? Any public tenders for workflow/BPM tooling?

---

### 5. DBS Group
**Vertical:** Banking & financial services
**Size:** ~36,000 employees, 19 markets
**Workflow pain:** Corporate banking (IDEAL platform) and treasury operations run high-volume, multi-level approvals: credit committees, trade finance document review, FX deal approvals. Internal HR and expense workflows are secondary pain — primary pain is operational approval latency in revenue-generating workflows.
**Compliance burden:** MAS, HKMA, RBI, and 16 other regulators simultaneously. Post-2023 outage, S$80M allocated for resilience — indicates willingness to spend on operational infrastructure.
**Shadow IT:** At DBS's AI maturity level (S$1B AI value claimed), shadow IT is less prevalent — but approval chains for complex structured products still run on email.
**ONEVibe wedge:** Finance/IB approval workflows (P16-C) + the ERP Core manifest engine (P20) as a platform layer beneath DBS's existing fintech stack. Not replacing digibank — replacing the internal operational approval plumbing. Position: "the workflow layer your engineering teams don't want to build."
**Key ask to verify:** Does DBS use ServiceNow for internal IT? What is the credit committee approval workflow for SME lending?

---

### 6. Prudential Singapore / Prudential APAC
**Vertical:** Life insurance & asset management
**Size:** 14 APAC markets; Eastspring Investments US$247.8B AUM; ~15,000 APAC employees (estimated)
**Workflow pain:** Policy administration (claims, policy changes, new business onboarding) historically outsourced to Capita (~£722M contract). MAS-mandated cheque elimination forces portal migration. PRUWorks/PRUServices portals are agent-facing — internal approval workflows for claims escalation and compliance exceptions run on separate systems.
**Compliance burden:** MAS, HKMA, OJK (Indonesia), and 11 other APAC regulators. Claims decisions require named approver accountability. Solvency II-equivalent capital reporting.
**Shadow IT:** Legacy outsourcing model (Capita) means internal workflow visibility is structurally poor — when Capita handles processing, Prudential staff lose sight of the approval chain.
**ONEVibe wedge:** Claims escalation mini-app — structured workflow for exception decisions with compliance-ready audit trail. Replace Capita dependency incrementally by bringing the workflow in-house on a self-hosted, auditable platform. Position: "take back your own audit trail."
**Key ask to verify:** Is Prudential's outsourcing arrangement with Capita still active? What is the current claims exception workflow?

---

### 7. Grab Holdings
**Vertical:** Super-app / Technology platform (mobility, food, fintech, logistics)
**Size:** ~11,000 employees, 8 Southeast Asian countries
**Workflow pain:** Multi-vertical operations (GrabCar, GrabFood, GrabPay, GXS Bank, GrabAds, drone delivery) each generate internal approval workflows: merchant onboarding, driver incentive approvals, credit decisions, regulatory filings across 8 markets. Existing AI CoE (OpenAI + Anthropic integrations, April 2025) means the team is already comfortable with AI-native tooling.
**Compliance burden:** GXS Bank (Singapore digital bank) is MAS-regulated. GrabPay is licensed as a Major Payment Institution. Drone delivery requires CAAS approvals. IMDA Data Protection Trustmark holder — data governance posture is high.
**Shadow IT:** Grab is tech-native — shadow IT is low risk, but cross-market regulatory compliance workflows (8 different regulators, 8 different rule sets) are a genuine pain point.
**ONEVibe wedge:** Compliance/RegTech mini-apps (P16-D) — policy exception workflows with per-market routing. Grab's AI CoE is a natural internal champion: "ONEVibe is the governed workflow layer on top of your existing AI stack." Also: P19-05 scheduling for driver-partner operations.
**Key ask to verify:** What is the internal tooling for cross-market regulatory filings? Does Grab use ServiceNow for IT operations?

---

### 8. CapitaLand Group
**Vertical:** Real estate investment management + development
**Size:** ~11,500 employees; 7 listed REITs/trusts; 10+ countries
**Workflow pain:** REIT fund administration requires board-level approval for every material transaction — asset acquisitions, divestments, capex above threshold, related-party transactions. Across 7 listed vehicles and numerous private funds, the approval matrix is extremely complex. Property management (maintenance requests, contractor approvals, tenant fit-out sign-offs) generates high-volume operational workflow load.
**Compliance burden:** SGX listing rules for 7 REITs (each with independent trustee, REIT manager, board). MAS REIT Code. Annual valuation reports. Related-party transaction disclosure requirements.
**Shadow IT:** Property management teams use Excel for capex tracking; REIT secretarial teams use email for board resolution routing.
**ONEVibe wedge:** Procurement mini-app (P19-13) for capex approvals + the ERP Core state machine (P20-04) for REIT board resolution workflows. The SGX disclosure trail becomes a byproduct of the approval workflow — not a separate filing exercise. Position: "your audit trail is already done when the board approves."
**Key ask to verify:** What system manages REIT board resolution workflows? Does CapitaLand use Yardi or MRI for property management?

---

### 9. CIMB Group
**Vertical:** Pan-ASEAN banking & financial services
**Size:** ~33,000–38,000 employees; 18 countries
**Workflow pain:** Dual Islamic/conventional banking compliance requires parallel approval chains for every product — a conventional credit facility and its Islamic equivalent must both satisfy their respective Shariah compliance requirements. Multi-jurisdiction operations (Malaysia, Indonesia, Singapore, Thailand, Cambodia, Vietnam, Philippines) means 7 different regulatory regimes in parallel.
**Compliance burden:** Bank Negara Malaysia (BNR), OJK, MAS, and 4+ other regulators simultaneously. Shariah Advisory Council sign-off on Islamic products. Anti-money laundering (AML) workflows with FATF compliance.
**Shadow IT:** Cross-border operations this complex almost certainly produce per-market Excel-based compliance trackers that don't connect to each other.
**ONEVibe wedge:** Compliance/RegTech workflows (P16-D) — AML case management, Shariah compliance sign-off chains, and KYC re-certification (P16-15) across 7 markets. The multi-jurisdiction routing in the approval engine (P20-05) is purpose-built for this. Position: "one approval inbox, seven regulatory regimes."
**Key ask to verify:** What AML/compliance case management system does CIMB use? Does CIMB have an internal GRC platform?

---

### 10. Jardine Matheson Group
**Vertical:** Diversified conglomerate (retail, real estate, automotive, hotels, engineering, agribusiness, financial services)
**Size:** 400,000+ employees; 55% profits from China, 42% from Southeast Asia
**Workflow pain:** Extreme conglomerate complexity — DFI Retail, Hongkong Land, Mandarin Oriental, Astra International, Gammon Construction, and KFC/Pizza Hut franchises are all distinct operating businesses with different ERP systems, different approval cultures, and different regulatory contexts. Group-level capex and M&A approvals must aggregate information from incompatible systems.
**Compliance burden:** Hong Kong Stock Exchange listing. Regulated subsidiaries (Astra insurance and financial services in Indonesia). HKMA. Multiple jurisdictions.
**Shadow IT:** At conglomerate scale with this much vertical diversity, the group treasury and corporate secretarial teams almost certainly run on Excel + email for group-level consolidation.
**ONEVibe wedge:** ERP Core manifest engine (P20) as the group-level consolidation layer — not replacing each subsidiary's ERP, but providing the approval and reporting layer above them. Each business unit connects its data via the connector binding layer (P20-11). Group treasury sees consolidated approval queues without touching each subsidiary's system.
**Key ask to verify:** Does Jardine use SAP at group level? What is the group capex approval process?

---

### 11. Singapore Airlines Group
**Vertical:** Aviation & travel services
**Size:** ~27,000 employees; operates SIA, SilkAir, Scoot, Singapore Airlines Cargo, SATS
**Workflow pain:** Aviation MRO (maintenance, repair, overhaul) generates extremely high-volume approval workflows — every maintenance action requires engineer sign-off with regulatory accountability (CAAS Part 145). Procurement for spare parts and catering (via SATS) at high frequency. HR scheduling for 27,000+ cabin crew and ground staff across global routes.
**Compliance burden:** CAAS (Civil Aviation Authority of Singapore), EASA, FAA. Every maintenance record is a legal document. Cabin crew scheduling must comply with MOM (Ministry of Manpower) rest requirements.
**ONEVibe wedge:** P19-05 scheduling (shift management at scale) + procurement mini-app for MRO parts (P19-13). The CAAS-required engineer sign-off becomes a VTI-signed AAL2 receipt — the regulatory audit trail is a built-in byproduct.
**Key ask to verify:** Does SIA use SAP PM for MRO? What is the current engineer sign-off workflow for Part 145?

---

### 12. OCBC Bank
**Vertical:** Banking & financial services (Singapore/APAC)
**Size:** ~35,000 employees; operations in 18 countries
**Workflow pain:** Great Eastern Life (insurance subsidiary) + Bank of Singapore (private banking) + OCBC Bank (commercial/retail) under one roof — three different regulated businesses with three different approval cultures and compliance requirements that must sometimes escalate to the same group-level committee.
**Compliance burden:** MAS, multiple ASEAN regulators, MAS Technology Risk Management guidelines (post-2021 enforcement actions on other banks — OCBC is acutely sensitive here). Private banking suitability assessments for investment products require named RM accountability.
**ONEVibe wedge:** Private banking workflow — investment suitability sign-off (P16-C, P19) where the RM, compliance officer, and product approval are all on one card with AAL2 biometric evidence. Position: "the MAS audit trail your private banking team actually wants."
**Key ask to verify:** Does OCBC use FIS or Temenos for core banking? What is the current private banking suitability workflow?

---

### 13. Wilmar International
**Vertical:** Agribusiness & food commodities (palm oil, sugar, flour, rice)
**Size:** ~100,000 employees; listed on SGX; operations in 50 countries
**Workflow pain:** Commodity trading approval workflows — every futures/forward contract requires trader sign-off, risk committee approval, and counterparty credit check. Plantation operations across Indonesia/Malaysia generate high-volume procurement (fertiliser, equipment, logistics) that is currently managed at plantation-level with poor group visibility.
**Compliance burden:** SGX listing. RSPO (Roundtable on Sustainable Palm Oil) certification audits — every supply chain decision must be traceable to a named individual for sustainability reporting. EUDR (EU Deforestation Regulation) compliance from 2025 adds traceability burden.
**ONEVibe wedge:** EUDR/RSPO traceability as a compliance mini-app — structured approval chain for sustainability decisions with immutable audit trail. This is not a "nice to have" — EUDR creates legal liability for undocumented supply chain decisions. Position: "your EUDR compliance trail is a workflow problem, not a reporting problem."
**Key ask to verify:** Does Wilmar use SAP for commodity trading? What is the current RSPO audit workflow?

---

### 14. ST Engineering
**Vertical:** Defence & technology (aerospace, smart city, digital systems, marine)
**Size:** ~23,000 employees; operations in 100+ countries
**Workflow pain:** Defence and aerospace contracts require multi-level approvals with export control compliance (ITAR, EAR, Singapore STRATEGIC GOODS CONTROL ACT). Engineering change orders (ECOs) in aerospace MRO require multiple sign-offs before implementation — currently slow and largely paper-based. Smart city project delivery involves multi-agency Singapore government coordination.
**Compliance burden:** MINDEF (Singapore Ministry of Defence) contractual requirements. ITAR/EAR export controls. CAAS. STB (Singapore Tourism Board for smart city projects). Every ECO is an auditable record.
**ONEVibe wedge:** Engineering change order mini-app with ITAR-controlled workflow routing — certain approvers only appear in the chain if the item is export-controlled. The approval engine's permission layer (P20-03) enforces this automatically. Position: "compliance routing built into the workflow, not bolted on afterward."
**Key ask to verify:** Does ST Engineering use SAP PLM for engineering change management? What is the current ECO workflow tool?

---

### 15. Mapletree Investments
**Vertical:** Real estate investment management
**Size:** ~1,600 employees; S$77.4B AUM across 5 listed REITs and 26 private funds
**Workflow pain:** Fund administration across 31 vehicles (listed + private) with different investor bases, different mandate constraints, different fee structures, and different regulatory regimes. Asset acquisition/divestment approvals must go through the correct investment committee for each fund — a wrong routing creates a conflict-of-interest issue.
**Compliance burden:** SGX listing rules for 5 REITs. MAS licensing for fund management. Institutional investor reporting requirements (quarterly, annual). ABSD (Additional Buyer's Stamp Duty) compliance for Singapore residential acquisitions.
**ONEVibe wedge:** Fund-level routing in the approval engine — the system knows which vehicle owns which asset and routes approvals to the correct IC, with the correct quorum rules, automatically. The SGXNET disclosure becomes a byproduct. Position: "31 funds, one approval inbox, zero routing errors."
**Key ask to verify:** Does Mapletree use Yardi for fund administration? What is the IC approval workflow for asset transactions?

---

### 16. Ayala Corporation (Philippines)
**Vertical:** Diversified conglomerate (banking, real estate, telecom, utilities, healthcare, retail)
**Size:** ~70,000 employees across subsidiaries (BPI, Globe Telecom, Ayala Land, Manila Water, AC Health, ACEN)
**Workflow pain:** Cross-subsidiary capital allocation decisions — Ayala Corp holds stakes in 6+ regulated businesses, each with its own board and governance requirements. Group-level strategic decisions (new investments, subsidiary capital raises) must coordinate information from incompatible systems across banking, telecom, real estate, and utilities.
**Compliance burden:** PSE (Philippine Stock Exchange) listing. BSP (Bangko Sentral ng Pilipinas) for BPI. NTC (National Telecommunications Commission) for Globe. ERC (Energy Regulatory Commission) for ACEN. Five different regulators with five different audit requirements.
**ONEVibe wedge:** Conglomerate-level consolidation layer (same pattern as Jardine, P20 manifest engine). ERP Core above the subsidiaries' own systems — group treasury approval inbox, cross-subsidiary reporting, one audit trail. Position: "the layer above your five ERP systems."
**Key ask to verify:** What does Ayala Corp use for group-level financial consolidation? Does BPI run SAP or Temenos?

---

### 17. Ascendas-Singbridge / CapitaLand Investment (CLI)
**Vertical:** Real estate investment management (industrial, logistics, data centres, suburban malls)
**Size:** Part of CapitaLand Group post-merger; S$134B AUM; ~1,900 fund management staff
**Workflow pain:** Industrial and logistics property management at scale — thousands of lease management approvals (rent review, renewal, fit-out consent), each with different approval thresholds depending on lease value. Data centre capex (power upgrades, cooling) requires multi-level engineering and commercial approval.
**Compliance burden:** See CapitaLand Group (profile 8) — same SGX/MAS framework but with additional data centre security compliance requirements (IMDA, CSA in Singapore; equivalent in other markets).
**ONEVibe wedge:** Lease management workflow + data centre capex approval mini-app. The approval threshold logic (amount → correct IC level) is a perfect use case for the state machine engine (P20-04). Position: "2,000 lease approvals a month, zero routing questions."
**Key ask to verify:** Does CLI use MRI or Yardi for lease management? What is the data centre capex approval workflow?

---

### 18. Tokio Marine Group APAC
**Vertical:** Property & casualty insurance (Japan-headquartered, strong APAC presence)
**Size:** ~40,000 employees globally; APAC operations in 10+ markets via Tokio Marine Life, Tokio Marine Insurance, and local JVs
**Workflow pain:** Claims processing and underwriting approval across APAC markets with different regulatory requirements. Reinsurance placement decisions require multi-level approval. Cross-market compliance reporting to Japanese FSA and local regulators simultaneously.
**Compliance burden:** Japanese FSA. MAS, OJK, CBIRC (China), IRDA (India), and 6+ other APAC regulators. Solvency II-equivalent requirements in multiple markets.
**ONEVibe wedge:** Claims escalation mini-app + underwriting approval workflow (P16-B pattern applied to insurance). Self-hosted deployment satisfies Japanese FSA data residency requirements. Position: "your reinsurance approval trail, FSA-ready from day one."
**Key ask to verify:** Does Tokio Marine use Guidewire or Duck Creek for claims management? What is the current underwriting approval workflow?

---

### 19. Sinar Mas Group (Indonesia)
**Vertical:** Diversified conglomerate (paper/pulp, palm oil, financial services, real estate, telecom, energy)
**Size:** ~300,000+ employees; operations in 50+ countries via APP (Asia Pulp & Paper), Golden Agri-Resources, Sinar Mas Land, Bank Sinarmas, Smartfren
**Workflow pain:** APP (Asia Pulp & Paper) is one of the world's largest pulp and paper producers — supply chain traceability for NDPE (No Deforestation, No Peat, No Exploitation) commitments requires a documented audit trail for every procurement decision. Palm oil operations (Golden Agri-Resources) face the same EUDR burden as Wilmar (profile 13). Financial services and real estate divisions have separate approval workflows that don't connect to group level.
**Compliance burden:** EUDR. RSPO. Indonesia OJK for Bank Sinarmas. IDX listing for multiple subsidiaries. APP's SFMP (Sustainability Forest Management Policy) is legally binding under third-party certification.
**ONEVibe wedge:** EUDR/RSPO sustainability traceability (same wedge as Wilmar) + group-level approval consolidation. The supply chain decision trail is legally required — ONEVibe makes it the natural output of the procurement approval workflow. Position: "EUDR compliance is a workflow problem. Solve the workflow."
**Key ask to verify:** Does APP/Golden Agri use SAP for procurement? What is the current SFMP audit trail workflow?

---

### 20. Lazada Group / Alibaba APAC
**Vertical:** E-commerce / Logistics (Southeast Asia)
**Size:** ~15,000–20,000 employees; operations in 6 Southeast Asian markets
**Workflow pain:** Merchant onboarding approvals (product listings, seller verification, logistics partner agreements) at high volume. Cross-market compliance for prohibited goods, import restrictions, and consumer protection regulations in 6 markets simultaneously. Internal procurement and vendor management workflows at scale.
**Compliance burden:** Local e-commerce regulations in all 6 markets. Consumer Protection Acts (Singapore, Malaysia, Thailand, Vietnam, Philippines, Indonesia). Alibaba Group governance requirements. Data localisation requirements in some markets (Indonesia PDPA, Vietnam PDPD).
**ONEVibe wedge:** Merchant onboarding workflow as a structured approval mini-app — replaces ad-hoc email-based seller verification with a state-machine-driven process (document submission → KYC check → category approval → listing activation). Data localisation compliance is satisfied by self-hosted deployment per market. Position: "onboard 1,000 merchants a day without losing a compliance trail."
**Key ask to verify:** Does Lazada use Salesforce for merchant management? What is the current seller onboarding workflow tool?

---

## ICP Tier Summary

| Tier | Profiles | Rationale |
|---|---|---|
| **Tier 1 — Lead now** (highest urgency + clearest wedge) | GIC (3), Temasek Trust (1), Mapletree (15), CapitaLand (8), OCBC (12) | Fiduciary approval workflows, data sovereignty mandate, named-individual accountability legally required |
| **Tier 2 — Near-term** (strong fit, longer sales cycle) | EDB (2), MAS (4), DBS (5), ST Engineering (14), Singapore Airlines (11) | Government/regulated enterprise, complex multi-level approvals, AI-forward culture |
| **Tier 3 — Strategic APAC expansion** (large, complex, require localisation) | CIMB (9), Wilmar (13), Sinar Mas (19), Ayala (16), Tokio Marine (18) | Multi-jurisdiction, compliance-heavy, EUDR/sustainability trail is a forcing function |
| **Tier 4 — Platform play** (replace the group ERP layer) | Jardine (10), Grab (7), Prudential (6), Lazada (20), CLI/Ascendas (17) | Conglomerate or multi-vertical scale; ONEVibe as the layer above existing ERP systems |

---

## Common patterns across all 20

1. **The audit trail is the product** — every Tier 1/2 ICP has a legal or regulatory requirement for named-individual approval accountability. ONEVibe's VTI-signed receipt is the answer, not just a feature.
2. **Data sovereignty is a deal condition** — GIC, MAS, Tokio Marine (FSA), Lazada (Indonesia PDPA) all have data residency requirements that rule out multi-tenant SaaS. Self-hosted open source is a prerequisite, not a differentiator.
3. **Shadow IT is the opening** — every organisation above has at least one critical workflow running on Excel or email today. The wedge is always: find that workflow, ship a mini-app, earn the audit trail.
4. **The compliance burden is the GTM motion** — EUDR (Wilmar, Sinar Mas), RSPO, SGX listing rules (CapitaLand, Mapletree), MAS TRM guidelines (DBS, OCBC) are all forcing functions that create budget and urgency without requiring ONEVibe to generate the pain. The pain is already there. ONEVibe shows up with a solution.

---

## Next steps (product research)

For each Tier 1 ICP, the next step is to confirm:
- [ ] What ERP/BPM system do they run today (SAP/ServiceNow/Workday/Oracle)?
- [ ] What is the specific workflow where employees most visibly escape to Excel/email?
- [ ] Who is the internal champion (CIO/COO/Head of Compliance vs CISO)?
- [ ] What is the procurement pathway (direct, GovTech framework, SGX-listed procurement policy)?

Sources to mine: LinkedIn job postings (SAP/Workday/ServiceNow admin roles confirm stack), GovTech tender notices, SGX annual reports (technology spend disclosures), industry conference speaker lists (CIOs who publicly discuss workflow pain).
