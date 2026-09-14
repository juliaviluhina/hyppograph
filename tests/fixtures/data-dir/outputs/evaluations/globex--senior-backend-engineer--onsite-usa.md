---
jobRecordKey: "globex--senior-backend-engineer--onsite-usa"
openStatus: "unresolvable"
overallVerdict: "SKIP"
requirementTable:
  - requirement: "3+ years building internal platforms"
    verdict: "Strong"
    evidenceFile: "inputs/evidence/career-history.md"
    evidenceSection: "Platform engineering, Vandelay Industries, 2021-2024"
    note: "Built and operated the internal developer platform for ~40 engineering teams over 2021-2024 (3 years)."
  - requirement: "Strong TypeScript"
    verdict: "Strong"
    evidenceFile: "inputs/evidence/career-history.md"
    evidenceSection: "Core languages and tooling"
    note: "TypeScript daily use across all roles, 2018-2024."
  - requirement: "Experience with Kubernetes as a platform operator"
    verdict: "Strong"
    evidenceFile: "inputs/evidence/career-history.md"
    evidenceSection: "Core languages and tooling"
    note: "Explicitly states 'Comfortable with Kubernetes as a platform user and operator (the 2021-2024 role)' — matches requirement directly; no CRD-authoring claim needed."
hardConstraints:
  - constraint: "compFloor"
    state: "pass"
    note: "Offered $140,000-$160,000 USD is well above the 90,000 EUR floor at any plausible exchange rate."
  - constraint: "location"
    state: "fail"
    note: "Job location 'United States (on-site)' exactly matches an excluded location."
  - constraint: "clearance"
    state: "pass"
    note: "Posting text (responsibilities/requirements) makes no mention of any security clearance requirement."
  - constraint: "workAuth"
    state: "unresolved"
    likelyOutcome: "likely-fail"
    note: "Candidate is an EU citizen who needs no sponsorship only for EU roles (cv-content.md, Logistics) and visaSponsorshipRequired=true; this is a US on-site role and the Job Record does not state whether Globex sponsors US work visas, so US work authorization is not established and is more likely than not a blocker."
  - constraint: "excludedRoleNatures"
    state: "pass"
    note: "responsibilitiesSummary and requirements do not mention an on-call rotation for this role."
antiPatternFlags:
applicationState: "ambiguous"
namedOutcome: "open.unresolved"
delegations:
  - taskType: "citation_audit"
    inputScope: "3 citations"
    modelTier: "fast"
    timestamp: "2026-09-13T23:00:00Z"
    reviewStatus: "accepted"
    note: "All three citations resolve to supporting evidence in the specified file sections."
scoredAt: "2026-09-13T23:00:00Z"
evidenceFilesUsed: ["inputs/evidence/career-history.md"]
---
## Requirement table

| Requirement | Verdict | Evidence |
|---|---|---|
| 3+ years building internal platforms | Strong | inputs/evidence/career-history.md § Platform engineering, Vandelay Industries, 2021-2024 |
| Strong TypeScript | Strong | inputs/evidence/career-history.md § Core languages and tooling |
| Experience with Kubernetes as a platform operator | Strong | inputs/evidence/career-history.md § Core languages and tooling |

## Hard constraints

- **compFloor**: pass — Offered $140,000-$160,000 USD is well above the 90,000 EUR floor at any plausible exchange rate.
- **location**: fail — Job location 'United States (on-site)' exactly matches an excluded location.
- **clearance**: pass — Posting text (responsibilities/requirements) makes no mention of any security clearance requirement.
- **workAuth**: unresolved (likely-fail) — Candidate is an EU citizen who needs no sponsorship only for EU roles (cv-content.md, Logistics) and visaSponsorshipRequired=true; this is a US on-site role and the Job Record does not state whether Globex sponsors US work visas, so US work authorization is not established and is more likely than not a blocker.
- **excludedRoleNatures**: pass — responsibilitiesSummary and requirements do not mention an on-call rotation for this role.

## Anti-pattern findings

(none)

## Application state

ambiguous — Tracker has an exact company match 'Globex' (row: Globex | VP of Engineering | applied | 2026-08-10 | app-globex-voe-2026-08-10), but the role there (VP of Engineering) is clearly different from this Job Record's 'Senior Backend Engineer'. There is also a 'Globex LLC | Staff AI Engineer' row, which is a different company name and a different role. Neither row is a confident match to this Job Record, so the conflict is reported as ambiguous rather than guessed at.

## Source

[Job Record](../job-records/globex--senior-backend-engineer--onsite-usa.md)
