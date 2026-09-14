---
jobRecordKey: "stark--head-of-platform-engineering--remote-eu"
openStatus: "unresolvable"
overallVerdict: "APPLY"
requirementTable:
  - requirement: "1-2 years of backend engineering experience"
    verdict: "Strong"
    evidenceFile: "inputs/evidence/cv-content.md"
    evidenceSection: "Summary"
    note: "Candidate has 6+ years of backend/platform experience (2018-2024), well exceeding the 1-2 year requirement."
  - requirement: "Basic familiarity with Docker"
    verdict: "Strong"
    evidenceFile: "inputs/evidence/cv-content.md"
    evidenceSection: "Skills"
    note: "Docker listed directly among skills alongside Kubernetes and Terraform."
hardConstraints:
  - constraint: "compFloor"
    state: "pass"
    note: "Posted range €95,000-€105,000 meets the €90,000 EUR floor."
  - constraint: "location"
    state: "pass"
    note: "Remote (EU) is not in the excluded locations list (United States on-site, India)."
  - constraint: "clearance"
    state: "pass"
    note: "No US Security Clearance (TS/SCI) requirement appears anywhere in this posting's requirements or responsibilities text."
  - constraint: "workAuth"
    state: "pass"
    note: "lackedWorkAuth is empty and candidate is an EU citizen needing no sponsorship for this EU remote role (per cv-content.md Logistics)."
  - constraint: "excludedRoleNatures"
    state: "pass"
    note: "Responsibilities summary describes single-tool IC ownership with no mention of an on-call rotation requirement for this role."
antiPatternFlags:
  - { type: "title-vs-requirements", detail: "roleTitle 'Head of Platform Engineering' implies senior organizational leadership, but the job record's own requirements (1-2 years backend experience, basic Docker familiarity) and responsibilitiesSummary explicitly state this is an 'individual-contributor-heavy role despite the title — no organization-wide platform ownership, no direct reports required at hire.' This is a stark, self-acknowledged title/requirements mismatch independent of the configured seniority streams (which cover AI Engineering and Test Automation, neither applicable to this Platform Engineering posting)." }
applicationState: "not_applied"
namedOutcome: "open.unresolved"
delegations:
  - taskType: "citation_audit"
    inputScope: "2 citations"
    modelTier: "fast"
    timestamp: "2026-09-13T23:00:00Z"
    reviewStatus: "rejected"
    note: "Citation 1 is identity-changing and uncited: evidence shows 6+ years experience, not 1-2 years. Citation 2 lacks explicit \"basic\" qualifier in text."
scoredAt: "2026-09-13T23:00:00Z"
evidenceFilesUsed: ["inputs/evidence/cv-content.md"]
---
## Requirement table

| Requirement | Verdict | Evidence |
|---|---|---|
| 1-2 years of backend engineering experience | Strong | inputs/evidence/cv-content.md § Summary |
| Basic familiarity with Docker | Strong | inputs/evidence/cv-content.md § Skills |

## Hard constraints

- **compFloor**: pass — Posted range €95,000-€105,000 meets the €90,000 EUR floor.
- **location**: pass — Remote (EU) is not in the excluded locations list (United States on-site, India).
- **clearance**: pass — No US Security Clearance (TS/SCI) requirement appears anywhere in this posting's requirements or responsibilities text.
- **workAuth**: pass — lackedWorkAuth is empty and candidate is an EU citizen needing no sponsorship for this EU remote role (per cv-content.md Logistics).
- **excludedRoleNatures**: pass — Responsibilities summary describes single-tool IC ownership with no mention of an on-call rotation requirement for this role.

## Anti-pattern findings

- title-vs-requirements: roleTitle 'Head of Platform Engineering' implies senior organizational leadership, but the job record's own requirements (1-2 years backend experience, basic Docker familiarity) and responsibilitiesSummary explicitly state this is an 'individual-contributor-heavy role despite the title — no organization-wide platform ownership, no direct reports required at hire.' This is a stark, self-acknowledged title/requirements mismatch independent of the configured seniority streams (which cover AI Engineering and Test Automation, neither applicable to this Platform Engineering posting).

## Application state

not_applied — No tracker row matches company 'Stark Industries' — the tracker lists Acme, Globex LLC, Initech, Vandelay Industries, and Globex, none of which correspond to this employer.

## Source

[Job Record](../job-records/stark--head-of-platform-engineering--remote-eu.md)
