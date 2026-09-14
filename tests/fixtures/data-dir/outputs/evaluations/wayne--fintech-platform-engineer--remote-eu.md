---
jobRecordKey: "wayne--fintech-platform-engineer--remote-eu"
openStatus: "unresolvable"
overallVerdict: "SKIP"
requirementTable:
  - requirement: "3+ years building internal platforms"
    verdict: "Strong"
    evidenceFile: "inputs/evidence/career-history.md"
    evidenceSection: "Platform engineering, Vandelay Industries, 2021-2024"
    note: "Built and operated the internal developer platform for ~40 engineering teams over 2021-2024 (3 years), including self-service deploy pipeline, observability stack, service mesh rollout."
  - requirement: "Strong TypeScript"
    verdict: "Strong"
    evidenceFile: "inputs/evidence/career-history.md"
    evidenceSection: "Core languages and tooling"
    note: "TypeScript daily use across all roles 2018-2024."
  - requirement: "Fintech regulatory compliance experience (AML/KYC tooling, banking-license-adjacent systems)"
    verdict: "Fails"
    evidenceFile: "inputs/evidence/career-history.md"
    evidenceSection: "Payments-adjacent e-commerce integrations, Initech, 2018-2021"
    note: "Evidence explicitly states Initech work touched payment processing (Stripe/Adyen integrations, PCI-scope code review) but 'never fintech regulatory compliance, AML/KYC tooling, or banking-license-adjacent systems' -- that adjacent domain is not covered. No genuine AML/KYC or banking-license experience found anywhere in the evidence."
hardConstraints:
  - constraint: "compFloor"
    state: "pass"
    note: "Posted range EUR 100,000-115,000 exceeds configured floor of EUR 90,000."
  - constraint: "location"
    state: "pass"
    note: "Remote (EU) does not match excluded locations (United States on-site, India)."
  - constraint: "clearance"
    state: "pass"
    note: "No mention of any security clearance requirement in the posting."
  - constraint: "workAuth"
    state: "pass"
    note: "lackedWorkAuth is empty (candidate is EU citizen per cv-content.md Logistics section); role is Remote (EU), so no lacked authorization applies."
  - constraint: "excludedRoleNatures"
    state: "pass"
    note: "Posting's responsibilitiesSummary (AML/KYC tooling, audit-trail infrastructure) does not clearly match 'on-call rotation'; on-call is only mentioned in the candidate's own evidence, not the posting."
antiPatternFlags:
applicationState: "not_applied"
namedOutcome: "open.unresolved"
delegations:
  - taskType: "citation_audit"
    inputScope: "3 citations"
    modelTier: "fast"
    timestamp: "2026-09-13T23:00:00Z"
    reviewStatus: "rejected"
    note: "Citation 3 is contradicted by evidence: career-history.md explicitly states the Initech role \"never\" covered fintech regulatory compliance, AML/KYC, or banking-license-adjacent systems."
scoredAt: "2026-09-13T23:00:00Z"
evidenceFilesUsed: ["inputs/evidence/career-history.md"]
---
## Requirement table

| Requirement | Verdict | Evidence |
|---|---|---|
| 3+ years building internal platforms | Strong | inputs/evidence/career-history.md § Platform engineering, Vandelay Industries, 2021-2024 |
| Strong TypeScript | Strong | inputs/evidence/career-history.md § Core languages and tooling |
| Fintech regulatory compliance experience (AML/KYC tooling, banking-license-adjacent systems) | Fails | inputs/evidence/career-history.md § Payments-adjacent e-commerce integrations, Initech, 2018-2021 |

## Hard constraints

- **compFloor**: pass — Posted range EUR 100,000-115,000 exceeds configured floor of EUR 90,000.
- **location**: pass — Remote (EU) does not match excluded locations (United States on-site, India).
- **clearance**: pass — No mention of any security clearance requirement in the posting.
- **workAuth**: pass — lackedWorkAuth is empty (candidate is EU citizen per cv-content.md Logistics section); role is Remote (EU), so no lacked authorization applies.
- **excludedRoleNatures**: pass — Posting's responsibilitiesSummary (AML/KYC tooling, audit-trail infrastructure) does not clearly match 'on-call rotation'; on-call is only mentioned in the candidate's own evidence, not the posting.

## Anti-pattern findings

(none)

## Application state

not_applied — No tracker row matches "Wayne Enterprises" (company) or "Fintech Platform Engineer" (role); no plausible partial match found either.

## Source

[Job Record](../job-records/wayne--fintech-platform-engineer--remote-eu.md)
