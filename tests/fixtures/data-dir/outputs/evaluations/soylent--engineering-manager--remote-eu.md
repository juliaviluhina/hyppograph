---
jobRecordKey: "soylent--engineering-manager--remote-eu"
openStatus: "unresolvable"
overallVerdict: "APPLY"
requirementTable:
  - requirement: "3+ years building internal platforms"
    verdict: "Strong"
    evidenceFile: "inputs/evidence/career-history.md"
    evidenceSection: "Platform engineering, Vandelay Industries, 2021-2024"
    note: "Built and operated internal developer platform for ~40 teams over 2021-2024 (~3 years), directly matching the requirement."
  - requirement: "Strong TypeScript"
    verdict: "Strong"
    evidenceFile: "inputs/evidence/career-history.md"
    evidenceSection: "Core languages and tooling"
    note: "TypeScript in daily use across all roles 2018-2024."
  - requirement: "Experience leading and mentoring a team of engineers"
    verdict: "Partial"
    evidenceFile: "inputs/evidence/career-history.md"
    evidenceSection: "Engineering team lead, Acme Corp, 2016-2018"
    note: "Formal team leadership (hiring, 1:1s, technical direction) for a 4-person team is the only supporting evidence, and it ended in 2018 (>4 years ago); recency discount applied, downgrading from Strong to Partial. The 2023 tech-lead stint was explicitly informal and did not include mentoring/hiring."
hardConstraints:
  - constraint: "compFloor"
    state: "pass"
    note: "Salary range €105k-€125k is above the €90k floor."
  - constraint: "location"
    state: "pass"
    note: "Remote (EU) is not in excludedLocations (United States on-site, India)."
  - constraint: "clearance"
    state: "pass"
    note: "Posting text does not mention any clearance requirement."
  - constraint: "workAuth"
    state: "pass"
    note: "Candidate is an EU citizen needing no visa sponsorship for EU roles (cv-content.md Logistics); role is Remote (EU), and lackedWorkAuth is empty, so no conflict."
  - constraint: "excludedRoleNatures"
    state: "pass"
    note: "Responsibilities summary (hiring, 1:1s, career growth, technical direction) does not mention on-call rotation."
antiPatternFlags:
  - { type: "recency-discount", detail: "Row 'Experience leading and mentoring a team of engineers' downgraded from Strong to Partial: its only supporting evidence is the Acme Corp, 2016-2018 team-lead role, which ended over 4 years ago (career-history.md, 'Engineering team lead, Acme Corp, 2016-2018')." }
applicationState: "not_applied"
namedOutcome: "open.unresolved"
delegations:
  - taskType: "citation_audit"
    inputScope: "3 citations"
    modelTier: "fast"
    timestamp: "2026-09-13T23:00:00Z"
    reviewStatus: "accepted"
    note: "All three citations verified: 3-year platform engineering tenure (2021–2024), daily TypeScript use across 2018–2024 roles, and formal team leadership with 1:1s and technical guidance at Acme (2016–2018)."
scoredAt: "2026-09-13T23:00:00Z"
evidenceFilesUsed: ["inputs/evidence/career-history.md"]
---
## Requirement table

| Requirement | Verdict | Evidence |
|---|---|---|
| 3+ years building internal platforms | Strong | inputs/evidence/career-history.md § Platform engineering, Vandelay Industries, 2021-2024 |
| Strong TypeScript | Strong | inputs/evidence/career-history.md § Core languages and tooling |
| Experience leading and mentoring a team of engineers | Partial | inputs/evidence/career-history.md § Engineering team lead, Acme Corp, 2016-2018 |

## Hard constraints

- **compFloor**: pass — Salary range €105k-€125k is above the €90k floor.
- **location**: pass — Remote (EU) is not in excludedLocations (United States on-site, India).
- **clearance**: pass — Posting text does not mention any clearance requirement.
- **workAuth**: pass — Candidate is an EU citizen needing no visa sponsorship for EU roles (cv-content.md Logistics); role is Remote (EU), and lackedWorkAuth is empty, so no conflict.
- **excludedRoleNatures**: pass — Responsibilities summary (hiring, 1:1s, career growth, technical direction) does not mention on-call rotation.

## Anti-pattern findings

- recency-discount: Row 'Experience leading and mentoring a team of engineers' downgraded from Strong to Partial: its only supporting evidence is the Acme Corp, 2016-2018 team-lead role, which ended over 4 years ago (career-history.md, 'Engineering team lead, Acme Corp, 2016-2018').

## Application state

not_applied — No tracker row matches company "Soylent Corp"; the tracker lists Acme, Globex LLC, Initech, Vandelay Industries, and Globex, none of which correspond to this Job Record.

## Source

[Job Record](../job-records/soylent--engineering-manager--remote-eu.md)
