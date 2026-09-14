# Contract: Fit Evaluation output file

New output type this feature introduces. All under `HYPPO_DATA_DIR/outputs/evaluations/`. Only
`hyppo-readwrite` writes here (Principle V single-writer discipline, same as feature 001's `store/`).

---

## Fit Evaluation — `outputs/evaluations/<job-record-key>.md`

```markdown
---
jobRecordKey: "acme--platform-engineer--remote-eu"
openStatus: "confirmed-open"
overallVerdict: "APPLY-AND-SEE"
requirementTable:
  - requirement: "5+ years building internal platforms"
    verdict: "Strong"
    evidenceFile: "inputs/evidence/career-history.md"
    evidenceSection: "## Acme-adjacent platform work, 2021-2024"
  - requirement: "Experience leading a platform team"
    verdict: "Partial"
    evidenceFile: "inputs/evidence/career-history.md"
    evidenceSection: "## Tech lead, 3-person team, 2023"
    note: "Led a 3-person team, not a full platform org — adjacent, not the thing asked for."
hardConstraints:
  - constraint: "compFloor"
    state: "pass"
  - constraint: "location"
    state: "unresolved"
    likelyOutcome: "even"
    note: "Posting says hybrid Berlin; candidate's location preference for on-site is unconfirmed."
antiPatternFlags:
  - type: "recency-discount"
    detail: "Only leadership evidence is from 2019, outside the configured 4-year window — downgraded Strong to Partial."
applicationState: "not_applied"
namedOutcome: null
delegations:
  - taskType: "citation_audit"
    inputScope: "2 citations in requirementTable"
    modelTier: "fast"
    timestamp: "2026-09-12T10:04:11Z"
    reviewStatus: "accepted"
    note: null
scoredAt: "2026-09-12T10:04:00Z"
evidenceFilesUsed: ["inputs/evidence/career-history.md", "inputs/evidence/cv-content.md"]
---

## Requirement table

| Requirement | Verdict | Evidence |
|---|---|---|
| 5+ years building internal platforms | Strong | inputs/evidence/career-history.md § Acme-adjacent platform work, 2021-2024 |
| Experience leading a platform team | Partial | inputs/evidence/career-history.md § Tech lead, 3-person team, 2023 — adjacent, not the thing asked for |

## Hard constraints

- **Compensation floor**: pass
- **Location**: unresolved — posting says hybrid Berlin; on-site preference unconfirmed

## Anti-pattern findings

- Recency discount: leadership evidence from 2019 falls outside the 4-year window; downgraded.

## Application state

not_applied

## Source

[Job Record](../job-records/acme--platform-engineer--remote-eu.md)
```

---

## Field rules

- `requirementTable[].verdict` ∈ `Strong` / `Partial` / `Fails` / `Absent` / `Unknown` (spec
  Clarifications, FR-003). Every row MUST carry `evidenceFile` + `evidenceSection`, or `verdict:
  Unknown` with both left `null` — never a citation for a non-`Unknown` verdict left empty (SC-002).
- `hardConstraints[].state` ∈ `pass` / `fail` / `unresolved` — a closed, separate scale from
  `requirementTable`'s (FR-004, data-model.md Verdict Scale entity). Every row with
  `state: "unresolved"` MUST also carry `likelyOutcome` ∈ `likely-pass` / `likely-fail` / `even`
  (research.md R11) — `hyppo-score`'s own best-effort read of whether the constraint is more likely
  than not to fail; a `pass`/`fail` row MUST leave `likelyOutcome` absent.
- `overallVerdict` MUST be derivable from `requirementTable` + `hardConstraints` alone by the FR-006
  rule (any `Fails`/`Absent` ⇒ `SKIP` unless the narrow-adjacent-subskill exception; any hard
  constraint `fail` ⇒ `SKIP`; an `unresolved` hard constraint with `likelyOutcome: "likely-fail"` ⇒
  `SKIP`; an `unresolved` hard constraint with `likelyOutcome: "likely-pass"`/`"even"` caps at
  `APPLY-AND-SEE`) — a citation_audit or later manual read MUST be able to recompute it from the
  table, never trust a verdict the table doesn't support (SC-003).
- `namedOutcome` is set (and `overallVerdict`/`requirementTable` may be partial or absent) exactly
  when this evaluation exists to record a non-clean condition — e.g. `open.unresolved` for an
  unresolvable record still being scored with the flag surfaced (FR-002b), or
  `score.insufficient-input` when no requirement table could be built at all (in which case the file
  still exists, per SC-001's "every kept, verified Job Record gets an evaluation or a named outcome
  — never neither," but its `requirementTable` is empty and `overallVerdict` is `null`).
- One file per `jobRecordKey`. A later `score` pass **replaces** the file's content (not an append) —
  see data-model.md's FitEvaluation state-transition note.

## Provenance

One `provenance-log.md` line per Fit Evaluation write (create or overwrite), in feature 001's
existing line format:

```
2026-09-12T10:04:12Z  run-2026-09-12T10-00-00Z  evaluations/acme--platform-engineer--remote-eu.md  score  APPLY-AND-SEE — 1 Strong, 1 Partial, location unresolved
```
