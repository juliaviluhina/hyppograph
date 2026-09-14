# Feature Specification: Fit-Screen Gap Fixes

**Feature Branch**: `006-fit-screen-gap-fixes`

**Created**: 2026-09-14

**Status**: Draft (spec level only — planned and built after 005 lands)

**Input**: User description: "After 005's isolated harness exists, fix the production gaps it proves broken in feature 004's verify-then-score flow. Do not lose track of this work while 005 is being built."

## User Scenarios & Testing *(mandatory)*

This spec owns **fixes only**. Every item below is proven broken by 005's harness (red cases) or
is 004 validation debt the harness supersedes-but-does-not-close. Nothing here adds new pipeline
behavior; the 005 harness is the acceptance gate for all of it.

### User Story 1 - Idempotent re-run: skip scoring when nothing changed (Priority: P1)

Re-running the score phase with no new Job Records, no evidence-base change, and no
applications-tracker change must leave existing evaluation files untouched — no duplicate writes,
no new provenance lines. Open-status re-checks keep running every time for non-terminal records
(004 FR-002c, by design) but must not write when the mark is unchanged (already implemented in 004
T031; this story covers the scoring/reconciliation half: 004 T024, reopened 2026-09-14).

**Why this priority**: The one known-red case in 005's harness. Until this lands, every run
rewrites every evaluation, which hides real changes and breaks the harness's baseline assertions.

**Independent Test**: 005's `idempotency-unchanged-rerun` case goes from `expected-red` to `pass`
with no other case changing state; a run with a genuine change (edited evidence, new Job Record)
still re-scores exactly the affected records.

**Acceptance Scenarios**:

1. **Given** an unchanged data dir, **When** the flow runs twice, **Then** the second run produces
   zero evaluation-content changes, zero changed application-state values, and zero new
   provenance lines for records whose open-status mark did not change (004 SC-009).
2. **Given** a changed evidence file affecting one record, **When** the flow runs, **Then** exactly
   that record's evaluation is rewritten (with provenance), and all others are left untouched.
3. **Given** a Job Record whose open-status flips confirmed-open → confirmed-closed between runs,
   **When** the flow runs, **Then** the mark updates with reason recorded, the existing evaluation
   is left in place, and scoring skips the now-terminal record.

---

### User Story 2 - Fix everything else the 005 harness proves broken (Priority: P2)

Every 005 case reporting `unexpected-red` against production code gets a fix here — bounded
strictly by "only what the harness proves broken." Suspected members (to confirm at plan time
against actual reds): verbatim-echo or raw-passthrough regressions, batched-read resurfacing,
blocking citation-audit behavior, ATS override-map handling, worker-presence/registration gaps of
the run-2 class.

**Why this priority**: The harness's value is proving breakage; this story is the other half of
that loop. Scope is deliberately open-ended but evidence-bounded — no fix without a failing case.

**Independent Test**: 005's full matrix reports all `pass` (zero `unexpected-red`), with the
spec-005 exit code `0`.

**Acceptance Scenarios**:

1. **Given** the 005 harness report with N `unexpected-red` cases, **When** this story is
   complete, **Then** all N are `pass` and no previously-passing case regressed.
2. **Given** a proposed fix with no failing harness case behind it, **When** it is reviewed,
   **Then** it is rejected — out of scope for this spec (new behavior needs its own spec).
3. **Given** a run whose summary write returns a false ack, **When** the flow handles it,
   **Then** it retries once via the single writer and, on persistent failure, logs loudly
   with the full summary attached — the on-disk summary always carries the run
   (`contracts/summary-write.md`; intake F2).
4. **Given** an isolated session run where the three `requiresWire` expectations cannot
   exercise the wire, **When** the report is produced, **Then** they show `blocked` with
   the R8 reason — counted in neither pass nor fail, exit code unaffected
   (`contracts/harness-report-amendment.md`).

---

### User Story 3 - Close out 004's remaining validation debt (Priority: P3)

Finish what 004's manual Phase A left open and supersede what 005 automates: the throughput smoke
(004 T050 / SC-014 — 100 records inside 30 minutes), the Phase A exit review (004 T053 — B1 vs B2
decision for the Agent SDK port, recorded in 004's plan.md phasing table), and an explicit
supersede note for the manual quickstart validations (004 T025/T033/T038/T044) marking which are
now covered by harness cases and which (if any) still need a human run.

**Why this priority**: Without it, 004 never formally closes and the B1/B2 decision floats
forever. Lowest priority because it blocks nothing — 005 and stories 1–2 deliver value regardless.

**Independent Test**: 004's tasks.md shows T049/T050/T053 checked with evidence links, and each of
T025/T033/T038/T044 is either checked or annotated "superseded by 005 case X."

**Acceptance Scenarios**:

1. **Given** ~100 non-terminal fixture records, **When** the flow runs with production pacing,
   **Then** wall-clock stays under 30 minutes with a complete summary (SC-014).
2. **Given** the completed harness + fixes, **When** the exit review runs, **Then** plan.md's
   phasing table records B1 or B2 with the reason, and Phase B becomes a plannable slice.

### Edge Cases

- A fix makes the idempotency case pass but breaks the genuine-change case (story 1, scenario 2):
  both are asserted together; "never rewrite" is as wrong as "always rewrite."
- The harness exposes a disagreement between spec text and intended behavior (ambiguous
  requirement rather than a code bug): fix the spec (004 or 005) first, then the code — never
  "fix" code to match a misreading (the run-7 T022 misdocumentation is the cautionary example).
- A 005 red traces to a harness bug, not production: fix the harness in 005's own scope, not here.
- 004's live smoke fixture (`tests/fixtures/live/`) rots (posting closes): refresh or retire it;
  the isolated harness never depended on it, so this must not block stories 1–2.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Implement skip-when-unchanged for scoring and application-state reconciliation (004
  T024/FR-009): unchanged inputs ⇒ untouched evaluation files and zero new provenance lines.
- **FR-002**: Preserve the genuine-change path: any material change to a Job Record, the evidence
  base, or the applications tracker MUST re-score exactly the affected records.
- **FR-003**: Every 005 `unexpected-red` case MUST be resolved to `pass` — by production fix, by
  spec correction (when the harness and the spec disagree, the spec is fixed first), or by
  reassignment to 005 (when the bug is in the harness itself).
- **FR-004**: No production change in this spec without a failing 005 case (or a 004 validation
  task) behind it; new behavior is out of scope.
- **FR-005**: Complete 004 T049/T050/T053 with evidence; annotate T025/T033/T038/T044 as done or
  superseded-by-harness-case.
- **FR-006**: Record the B1/B2 Phase B decision with reasons in 004 plan.md's phasing table.
- **FR-007**: The run summary MUST be written via the single-writer protocol
  (`contracts/summary-write.md`): `hyppo-readwrite`, ack checked, one retry, loud log
  on persistent failure — never a silent `false`.

### Key Entities

- **Harness Red**: A 005 case reporting `unexpected-red` (or the known `expected-red` T024 case) —
  the sole unit of work intake for stories 1–2.
- **Exit Review Record**: The T053 decision entry (B1 vs B2 + reason) that formally closes 004
  Phase A.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 005's harness reports all `pass`, zero `unexpected-red`, zero `expected-red` — exit
  code `0`.
- **SC-002**: Two consecutive unchanged runs produce zero evaluation diffs and zero new
  provenance lines, verified by file comparison rather than log reading.
- **SC-003**: A run with exactly one material change rewrites exactly one evaluation file.
- **SC-004**: 004 T049/T050/T053 are checked with evidence; T025/T033/T038/T044 each resolve to
  done or superseded-by-case.
- **SC-005**: Zero new pipeline behaviors introduced — every production diff traces to a harness
  red or a 004 validation task.

## Assumptions

- 005's harness exists, runs, and its reds are trustworthy (harness bugs are fixed in 005's
  scope, not here).
- Fixes land as changes to `.claude/workflows/fit-screen.js`, agent definitions, or fixtures —
  the Phase B port (if B2) is a separate slice gated on the T053 decision, not part of this spec.
- Manual live checks may still need a human session (browser-free but session-driven, like 004's
  Phase A runs); the harness covers everything automatable.
