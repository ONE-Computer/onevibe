# GeBIZ Government Procurement Analysis — ONEVibe ERP Module Opportunity
> Written: 2026-07-18. Owner: Strategy & GTM office.
> Source: 18,464 rows of Singapore government tender awards from the GeBIZ open dataset (2021–2026).
> Cross-referenced with: docs/ERP-MODULES-80-20.md (Phase 21), docs/ICP-APAC-TOP20.md (APAC ICPs).
>
> **Purpose:** Identify recurring workflow pain across Singapore government agencies that ONEVibe ERP modules can address. Government is a distinct customer segment from the private-sector APAC ICP Top 20 — different procurement cycles, different compliance frameworks, but the same structural problem: fragmented approval workflows, email-driven decisions, Excel shadow IT, and no unified audit trail.

---

## Dataset overview

| Metric | Value |
|---|---|
| Total rows | 18,464 tender awards |
| Date range | 2021–2026 |
| Total awarded value | SGD 123.8B |
| Year-on-year growth | SGD 16.9B (2021) → SGD 33.6B (2025) — near-2x in 5 years |
| Unique agencies | 80+ (ministries, statutory boards, public hospitals, universities) |

---

## Top agencies by spend (government IT buying landscape)

| Agency | Total spend | Profile |
|---|---|---|
| Land Transport Authority | SGD 34.8B | Infrastructure megaprojects + fleet management + rail operations |
| Housing & Development Board | SGD 33.4B | Property + town council + maintenance management |
| Ministry of Health (HQ + clusters) | SGD 10.4B | Clinical systems, hospital operations, health data |
| Ministry of Home Affairs | SGD 6.9B | Public safety, immigration, border management |
| PUB (national water agency) | SGD 5.7B | Utilities operations, inspection, asset management |
| Ministry of Education | SGD 4.9B | Training, scheduling, HR, student management |
| National Environment Agency | SGD 4.2B | Cleaning contracts, inspection, compliance, permits |

**Observation:** The highest-spend agencies (LTA, HDB, PUB) are large infrastructure operators. Their dominant spend is construction. But their *administrative workflows* — procurement decisions, contractor management, inspection scheduling, compliance sign-offs — are exactly the same as any large enterprise. These are ONEVibe ERP customers embedded inside infrastructure procurement orgs.

---

## IT/Software tender categories by spend (SGD) and volume

| Category | Spend | Tender count | Avg tender value | TCO signal |
|---|---|---|---|---|
| Health/Clinical systems | 7.4B | 111 | 66.7M | Low-volume, high-ACV — not our wedge |
| Infrastructure/Cloud | 6.7B | 596 | 11.2M | Platform/infra bids — not our wedge |
| Asset & Facilities Management | 2.7B | 274 | 9.9M | Medium-volume, addressable with Gov-M9 |
| Reporting/BI/Dashboards | 2.2B | **830** | 2.7M | **High-volume, recurring — highest TCO wedge** |
| Scheduling/Duty Roster | 2.0B | **842** | 2.4M | **High-volume, universal — solved by Gov-M5** |
| Compliance/Regulatory decisions | 1.0B | **718** | 1.4M | **High-volume, MAS/AGO forcing function** |
| Inspection/Enforcement | 874M | 267 | 3.3M | Medium-volume, fieldwork context |
| HR/Manpower management | 834M | **417** | 2.0M | **High-volume, every agency** |
| Training/Learning management | 784M | **911** | 0.9M | **Highest volume, lowest ACV — mass-market** |
| Finance/Procurement systems | 738M | 249 | 3.0M | Medium-volume, budget tracking |
| Maintenance & Support (recurring) | 702M | 134 | 5.2M | Maintenance contracts = TCO reduction signal |
| App Maintenance | 521M | — | — | Existing systems being maintained by integrators |
| Survey/Assessment platforms | 491M | 245 | 2.0M | Universal across agencies |
| GIS/Mapping | 352M | 281 | 1.3M | Field operations context |

---

## AI/Analytics spend trajectory

| Year | Spend | Growth |
|---|---|---|
| 2021 | SGD 2.4M | — |
| 2022 | SGD 4.5M | +87% |
| 2023 | SGD 16.8M | +273% |
| 2024 | SGD 27.6M | +64% |
| 2025 (partial) | SGD 40M+ (projected) | — |

**11x growth in 3 years.** AI/analytics is no longer a line item — it is becoming a procurement category. The window for a modern AI-native workflow platform to displace incumbent BI tools (SPSS, SAS, legacy dashboards) is open.

The trend is driven by:
1. Smart Nation 2.0 mandate (all agencies required to demonstrate AI adoption)
2. GovTech central platform strategy — agencies are being pushed toward reusable AI tools
3. MOF budget guidance: efficiency savings through AI must be demonstrated before headcount increases are approved

---

## Structural buying signal: recurring tenders = shadow IT + maintenance lock-in

Three patterns indicate where incumbent tools are failing:

1. **Maintenance & Support contracts (SGD 702M, 134 tenders, avg SGD 5.2M):** These are agencies paying system integrators to keep legacy systems alive. The system was built 10–15 years ago and the SI now owns the institutional knowledge. Every renewal is a negotiation with no competition. This is the "do nothing" cost ONEVibe competes against — not SAP's license fee, but the SI maintenance contract.

2. **App maintenance contracts (SGD 521M):** Same dynamic. Government agencies own applications built on .NET/Java/Oracle stacks that nobody internally understands. SI charge SGD 500k–3M/year to keep them running. ONEVibe ERP modules on a SaaS delivery model eliminates the maintenance contract entirely.

3. **Training/Learning (SGD 784M, 911 tenders, lowest avg ACV at SGD 0.9M):** The volume is driven by agencies procuring small, department-specific training systems repeatedly. 911 separate tenders means 911 separate procurement processes for tools that all do the same thing (track who attended training, manage course calendars, generate completion certificates). One module. 911 procurement cycles collapsed.

---

## The government-specific structural differences from private sector

Before mapping modules, note what makes government procurement different from the APAC ICP Top 20:

| Factor | Private sector (APAC ICP) | Singapore government |
|---|---|---|
| Procurement process | Board/management approval, fast | GeBIZ ITQ/ITT required above SGD 6k, IIMT above SGD 1M |
| Budget cycles | Fiscal year, flexible reforecast | Annual Parliamentary budget, no mid-year additions |
| Compliance framework | MAS/PDPA/industry-specific | IM8 (IT security), PSN (Protected Signal Network), PDPA, IM-SG |
| Audit authority | External auditor, board | Auditor-General's Office (AGO) — findings are public |
| Signing authority | Company director/CEO | Authorised officers under the Financial Procedures Act |
| Tender requirement | Internal policy only | WOG (Whole-of-Government) procurement rules, GeBIZ mandatory |
| Data classification | Commercial-in-confidence | OFFICIAL, RESTRICTED, CONFIDENTIAL, SECRET tiers |
| Approval evidence | Board resolution, email sufficient | Named officer, delegation schedule, financial authority schedule |

**Key implication for ONEVibe:** Government customers need the approval audit trail more urgently than private sector, because the AGO publishes audit findings publicly and named officers have personal liability. A failed audit finding citing "no documented approval" is career-affecting for a Permanent Secretary. This is a stronger forcing function than MAS regulations.

---

## Module opportunity map

| GeBIZ category | Tender count | Gov ERP module | Phase 22 item |
|---|---|---|---|
| Scheduling/Duty Roster | 842 | Duty roster + shift scheduling | Gov-M5 |
| Reporting/BI Dashboards | 830 | Reporting & Decision Intelligence | Gov-M7 |
| Training/Learning | 911 | Training & Course Management | Gov-M6 |
| Compliance/Regulatory | 718 | Compliance & Regulatory Case Mgmt | Gov-M3 |
| HR/Manpower | 417 | HR & Workforce Management | Gov-M10 |
| Survey/Assessment | 245 | Survey & Feedback Collection | Gov-M4 |
| Inspection/Enforcement | 267 | Field Inspection & Enforcement | Gov-M2 |
| Finance/Procurement | 249 | Procurement & Budget Tracking | Gov-M8 |
| Asset/Facilities | 274 | Asset & Facilities Management | Gov-M9 |
| Permit/Licensing | 36 (known, likely 5x undercounted) | Permit & Licensing Management | Gov-M3a |
| Feedback/Case Mgmt | ~40 | Citizen Feedback & Case Management | Gov-M11 |
| Document/Records | ~60 | Records & Document Management | Gov-M12 |

---

## GTM strategy for government

### Entry motion: ITSM wedge
The fastest entry point is IT service management — every agency has a ServiceNow contract or an equivalent that is universally disliked (see P19 analysis). The switching cost is low because the data is already in a government data centre or GovTech managed cloud. Government IT teams are the most accessible internal champions.

Proof path: pilot with a mid-size statutory board (not a Ministry — too slow) → generate AGO-defensible audit trail → use that as the reference case for MOF procurement.

### Target first accounts
1. **GovTech** — the platform owner. A GovTech pilot is a WOG endorsement.
2. **CPF Board** — modern technology organisation, progressive leadership, high approval workflow volume (pension, housing, CPF-IS).
3. **LTA** — highest IT spend after LTA infrastructure. Contractor management + inspection + scheduling at scale.
4. **HDB** — town council maintenance workflows, resident feedback management, licensing.
5. **NEA** — inspection and enforcement workflows, permit management, compliance decisions.

### Procurement pathway
Government purchases above SGD 1M require an Invitation to Tender (ITT) on GeBIZ. Below SGD 1M (Invitation to Quote, ITQ), a single-source or panel arrangement is possible. ONEVibe's go-to-market is: pilot at ITQ threshold → demonstrate AGO-defensible evidence trail → expand to ITT with GovTech endorsement.

GovTech maintains the **SGTS (Singapore Government Tech Stack)** and the **Digital Government Blueprint**. Products that align with SGTS (SingPass integration, Corppass, NDI/Singpass for AAL2, GovCloud deployment) are preferred-vendor eligible. ONEVibe must integrate with Singpass/NDI for government deployment (see Gov-M0 requirements below).

---

## Summary: the government ERP opportunity

The GeBIZ data represents SGD 123.8B of government procurement activity, of which roughly SGD 15–20B is directly relevant IT/workflow software spend. The five highest-volume categories (Training, Scheduling, Reporting/BI, Compliance, HR) each have 400–900 separate tender awards — meaning hundreds of agencies independently procuring the same capability. ONEVibe ERP modules, delivered as a shared platform on SGTS, could collapse this fragmentation into reusable modules and eliminate the recurring integrator maintenance lock-in.

Conservative market sizing: 800 agencies × SGD 200k average annual module subscription = SGD 160M ARR. At Phase 22 maturity (12 modules × top 100 agencies), that is a SGD 1B+ ARR opportunity within Singapore alone — before ASEAN expansion.
