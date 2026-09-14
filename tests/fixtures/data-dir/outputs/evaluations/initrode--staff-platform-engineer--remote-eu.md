---
jobRecordKey: "initrode--staff-platform-engineer--remote-eu"
openStatus: "unresolvable"
overallVerdict: "SKIP"
requirementTable:
  - requirement: "3+ years building internal platforms"
    verdict: "Strong"
    evidenceFile: "inputs/evidence/career-history.md"
    evidenceSection: "Platform engineering, Vandelay Industries, 2021-2024"
    note: "Senior Platform Engineer, 2021-2024 (3 years), built/operated internal developer platform for ~40 teams."
  - requirement: "Strong TypeScript"
    verdict: "Strong"
    evidenceFile: "inputs/evidence/cv-content.md"
    evidenceSection: "Skills"
    note: "TypeScript daily use 2018-2024, corroborated by career-history.md 'Core languages and tooling'."
  - requirement: "Experience authoring custom Kubernetes operators/CRDs from scratch"
    verdict: "Fails"
    evidenceFile: "inputs/evidence/career-history.md"
    evidenceSection: "Core languages and tooling"
    note: "Evidence explicitly states 'no experience authoring Kubernetes operators or CRDs specifically'; only user/operator-level Kubernetes experience, not operator-author."
hardConstraints:
  - constraint: "compFloor"
    state: "pass"
    note: "Salary range €110,000-€130,000 exceeds the €90,000 floor."
  - constraint: "location"
    state: "pass"
    note: "Remote (EU) is not in excludedLocations (United States on-site, India)."
  - constraint: "clearance"
    state: "pass"
    note: "Posting text contains no mention of requiring US Security Clearance (TS/SCI)."
  - constraint: "workAuth"
    state: "pass"
    note: "Candidate is an EU citizen (cv-content.md Logistics) and the role is Remote (EU); lackedWorkAuth is empty."
  - constraint: "excludedRoleNatures"
    state: "pass"
    note: "responsibilitiesSummary describes designing/operating a platform and a Kubernetes operator; no mention of an on-call rotation requirement for this role."
antiPatternFlags:
  - { type: "title-vs-requirements", detail: "roleTitle 'Staff Platform Engineer' implies materially more seniority/scope than the listed requirements support (only '3+ years building internal platforms' plus TypeScript and operator-authoring skills — no requirement for staff-level scope such as cross-org influence, architecture ownership across multiple platforms, or mentoring/leadership). Platform Engineering is not among the configured seniority streams (AI Engineering, Test Automation), so no explicit ceiling was configured for this domain, but the requirements-vs-title mismatch is evident on its face." }
applicationState: "not_applied"
namedOutcome: "open.unresolved"
delegations:
  - taskType: "citation_audit"
    inputScope: "3 citations"
    modelTier: "fast"
    timestamp: "2026-09-13T23:00:00Z"
    reviewStatus: "rejected"
    note: "Citation 3 is contradicted: evidence explicitly states \"no experience authoring Kubernetes operators or CRDs specifically.\""
scoredAt: "2026-09-13T23:00:00Z"
evidenceFilesUsed: ["inputs/evidence/career-history.md","inputs/evidence/cv-content.md"]
---
## Requirement table

| Requirement | Verdict | Evidence |
|---|---|---|
| 3+ years building internal platforms | Strong | inputs/evidence/career-history.md § Platform engineering, Vandelay Industries, 2021-2024 |
| Strong TypeScript | Strong | inputs/evidence/cv-content.md § Skills |
| Experience authoring custom Kubernetes operators/CRDs from scratch | Fails | inputs/evidence/career-history.md § Core languages and tooling |

## Hard constraints

- **compFloor**: pass — Salary range €110,000-€130,000 exceeds the €90,000 floor.
- **location**: pass — Remote (EU) is not in excludedLocations (United States on-site, India).
- **clearance**: pass — Posting text contains no mention of requiring US Security Clearance (TS/SCI).
- **workAuth**: pass — Candidate is an EU citizen (cv-content.md Logistics) and the role is Remote (EU); lackedWorkAuth is empty.
- **excludedRoleNatures**: pass — responsibilitiesSummary describes designing/operating a platform and a Kubernetes operator; no mention of an on-call rotation requirement for this role.

## Anti-pattern findings

- title-vs-requirements: roleTitle 'Staff Platform Engineer' implies materially more seniority/scope than the listed requirements support (only '3+ years building internal platforms' plus TypeScript and operator-authoring skills — no requirement for staff-level scope such as cross-org influence, architecture ownership across multiple platforms, or mentoring/leadership). Platform Engineering is not among the configured seniority streams (AI Engineering, Test Automation), so no explicit ceiling was configured for this domain, but the requirements-vs-title mismatch is evident on its face.

## Application state

not_applied — No tracker row matches 'Initrode' (company) or 'Staff Platform Engineer' (role); the tracker's closest company-name entries (Initech, Vandelay Industries) are distinct companies, not a match.

## Source

[Job Record](../job-records/initrode--staff-platform-engineer--remote-eu.md)
