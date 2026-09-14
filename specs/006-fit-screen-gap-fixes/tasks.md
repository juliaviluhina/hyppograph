---

description: "Task list for 006: Fit-Screen Gap Fixes"
---

# Tasks: Fit-Screen Gap Fixes

**Input**: Design documents from `/specs/006-fit-screen-gap-fixes/` (spec.md, plan.md, research.md,
data-model.md, contracts/, quickstart.md, intake.md)

**Prerequisites**: 005's isolated harness (`tests/harness/`) exists and runs — confirmed on this
branch: `npm run harness` reports one hardcoded `expected-red` (`idempotency-unchanged-rerun`) and
zero `unexpected-red` from the node layer; the first session run recorded three findings in
`intake.md` (F1 closed with no code fix, F2 open, F3 mitigated). This feature owns F2, T024, and R3.

**Tests**: Proof is the 005 harness itself (spec's own Testing strategy — no separate test-task
layer). Node-layer coverage is added only for the fingerprint helper's mirror (T007), matching
005's existing `pure.mjs` sync-check convention.

**Constraint carried into every task below (spec FR-004)**: no production change without a failing
005 case or a named 004 validation task behind it — new behavior is out of scope.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 per spec.md priorities
- File paths are exact

---

## Phase 1: Setup

- [ ] T001 Run `npm run harness` and record the pre-fix baseline report alongside this file's
      commit (node layer only — no session run needed yet): confirms starting state is exactly
      `intake.md`'s (1 expected-red, 0 unexpected-red from node).

---

## Phase 2: Foundational

None. Each story below is a self-contained edit to existing files (`fit-screen.js`,
`tests/harness/support/*.mjs`, `tests/harness/run.mjs`) with no new shared infrastructure —
per plan.md's Structure Decision ("no new modules, no new directories").

---

## Phase 3: User Story 1 — Idempotent re-run: skip scoring when nothing changed (Priority: P1) 🎯 MVP

**Goal**: Score phase skips writes (evaluation + provenance) when a record's inputs are unchanged;
still re-scores exactly the affected record(s) on any genuine change (spec FR-001/FR-002).

**Independent Test**: 005's `idempotency-unchanged-rerun` case goes from `expected-red` to `pass`
with no other case changing state; a run with a genuine change still re-scores exactly the affected
records (spec Edge Cases: "never rewrite" is as wrong as "always rewrite").

### Implementation for User Story 1

- [ ] T002 [US1] Resolve the fingerprint input-source gap before writing code: research.md R1 /
      `contracts/eval-fingerprint.md` specify hashing the raw **Job Record file text**, but the score
      phase's `records` array (`fit-screen.js:427`, built from the verify-phase index) only holds
      parsed fields — no raw file text is in memory at the score-phase call site
      (`fit-screen.js:565`). Decide: (a) add one `hyppo-read` per record before the fingerprint check
      to get the literal file text, matching the contract as written but costing a fast-tier call on
      every run (partly undercutting R1's "skips the mid-tier call, which is the expensive part"
      rationale — the read itself is cheap but not free), or (b) amend
      `specs/006-fit-screen-gap-fixes/contracts/eval-fingerprint.md` and `data-model.md` to hash the
      already-in-memory parsed fields passed to `buildScorePrompt` (`fit-screen.js:929`) instead —
      zero extra calls, same determinism, but diverges from "file text" as literally written.
      Recommended: (b). Update the contract file to match whichever is chosen — spec Edge Cases:
      "fix the spec first, then the code."
- [ ] T003 [US1] Implement `fnv1aHex(str)` and a `computeInputFingerprint({ rec, evidenceText,
      evidenceFiles, applications, hardConstraints, hardStops, targetRoles })` hoisted helper in
      `.claude/workflows/fit-screen.js` (near the other inline helpers, ~line 733), per
      `contracts/eval-fingerprint.md`'s computation rule as amended by T002.
- [ ] T004 [US1] In the score phase's `pipeline(scorable, ...)` callback
      (`.claude/workflows/fit-screen.js:565`), before the `hyppo-score` agent call (line 579): read
      the existing `outputs/evaluations/<key>.md` front matter via `hyppo-read` (missing file ⇒
      proceed to scoring as today), recompute the fingerprint via T003's helper, compare against the
      stored `inputFingerprint`. Equal ⇒ skip the `hyppo-score` call, the citation audit, the
      evaluation write, the application-state migration write, and the provenance append entirely;
      bump `summary.skippedIdempotent`; move to the next record. Different or missing ⇒ proceed
      exactly as today. Depends on: T003.
- [ ] T005 [US1] Add `inputFingerprint: ${JSON.stringify(fingerprint)}` to the evaluation front
      matter in `buildEvaluationWritePrompt` (`.claude/workflows/fit-screen.js:1055`, alongside
      `scoredAt`), persisted on every real (non-skipped) write. Depends on: T003.
- [ ] T006 [US1] Add a `skippedIdempotent` counter: initialize in `newRunSummary`
      (`fit-screen.js:871`), increment in T004, render it beside `scored` in `renderSummary`
      (`fit-screen.js:898`), per data-model.md's RunSummary amendment. Depends on: T004.
- [ ] T007 [P] [US1] Mirror `fnv1aHex`/`computeInputFingerprint` verbatim into
      `tests/harness/support/pure.mjs`, per that file's existing convention ("fix the workflow file
      first, then re-copy here, never the reverse"); extend `pure.test.mjs`'s sync-check function
      list to cover the new function(s). Depends on: T003 (copy after the workflow version is final).
- [ ] T008 [US1] Check `hasIdempotencyGuard()` in `tests/harness/support/structure.mjs:46` against
      T004's actual implementation — its regex
      (`read-evaluation|existingEval|existing-evaluation|skip.*unchanged|unchanged.*skip`) must match
      real source text; update the pin (never delete it) if naming differs, per the file's own
      header comment. Depends on: T004.
- [ ] T009 [US1] Retire the hardcoded `expected-red` handling for `idempotency-unchanged-rerun`:
      update `EXPECTED_RED_CASE` in `tests/harness/support/expectations.mjs` and its consumption in
      `tests/harness/run.mjs` so the case is asserted as an ordinary `pass`/`unexpected-red` case
      like every other. Depends on: T004, T008.
- [ ] T010 [US1] Session validation — quickstart.md scenarios 1–2: `--prep` a scratch dir, session-run
      the workflow, `--assert`; re-run the workflow **unchanged** against the same scratch dir,
      `--assert` again (expect byte-identical evaluation files, zero new provenance lines,
      `summary.skippedIdempotent` equal to the scored count, no mid-tier calls on the second run).
      Then edit one evidence file + one Job Record and re-run; `--assert` and confirm exactly the
      affected evaluation(s) were rewritten, all others untouched. Depends on: T002–T009.

**Checkpoint**: The harness's sole `expected-red` case is resolved; US1 independently deliverable.

---

## Phase 4: User Story 2 — Fix everything else the 005 harness proves broken (Priority: P2)

**Goal**: Every 005 case reporting `unexpected-red` against production code is fixed — bounded
strictly to what the harness proves broken (spec FR-003/FR-004). Confirmed members going in: F2
(summary-write silent drop) and R3 (transport scoping for the three ATS fixtures).

**Independent Test**: 005's full matrix reports all `pass` (zero `unexpected-red`); spec-005 exit
code `0`.

### Implementation for User Story 2

- [ ] T011 [P] [US2] Fix F2: switch `writeSummary`'s agent call
      (`.claude/workflows/fit-screen.js:919-924`) from `agentType: "hyppo-write"` to
      `"hyppo-readwrite"` (single-writer rule); check the returned `written` ack in code; on `false`,
      retry once via `hyppo-readwrite` with the identical prompt; on a second `false`, `log()` loudly
      (label `write-run-summary FAILED twice`, full rendered summary attached) and emit a
      `summary.write-failed` line in the run output — never silently continue. Per
      `contracts/summary-write.md`. No dependency on US1 (different function, same file — do not run
      literally concurrently with T004–T006 edits to avoid merge noise, but no logical dependency).
- [ ] T012 [P] [US2] Add `requiresWire: true` to the three ATS entries (`acme--backend-engineer...`,
      `initech--backend-engineer...`, `umbrella--backend-engineer...`) in
      `tests/harness/support/expectations.mjs`, per `contracts/harness-report-amendment.md`.
- [ ] T013 [US2] Add a `--wire live|isolated` flag (default `isolated`) to `tests/harness/run.mjs`'s
      `--assert` mode; thread it into `assertScratch()`'s signature in
      `tests/harness/support/assert.mjs`. Depends on: T012.
- [ ] T014 [US2] In `assertScratch()`'s per-record matrix loop
      (`tests/harness/support/assert.mjs:89-99`), route entries with `requiresWire: true` to a
      `blocked` verdict (reason: `transport: WebFetch upgrades http→https; 005 R8`) instead of
      pass/fail when `--wire` is `isolated`; assert them normally (existing pass/fail logic) when
      `--wire live`. Depends on: T013.
- [ ] T015 [US2] In `tests/harness/run.mjs`'s `writeReport()`, add a `blocked` verdict to the
      rendered report as its own section with reasons, and add `blocked` to the summary counts line
      (`pass N · blocked M · expected-red K · unexpected-red 0`); confirm the exit-code computation
      stays driven only by `unexpected-red.length`. Depends on: T014.
- [ ] T016 [US2] Run `npm run harness` (node layer) and one full isolated session run
      (`--prep`/`--serve`/`--assert --wire isolated`); confirm the report shows zero
      `unexpected-red`, with the three ATS cases listed under `blocked`. Depends on: T011, T015.
- [ ] T017 [US2] For any `unexpected-red` T016 surfaces beyond F2/R3 — spec's "suspected members"
      list (verbatim-echo/raw-passthrough regressions, batched-read resurfacing, blocking
      citation-audit behavior, ATS override-map handling, worker-presence/registration gaps of the
      run-2 class) — add one task per confirmed red here and fix it, strictly bounded to the failing
      case (FR-004: reject any fix proposed without a failing case behind it). Depends on: T016.

**Checkpoint**: 005 harness fully green (zero `unexpected-red`); `blocked` cases explicitly scoped,
not hidden and not permanently red.

---

## Phase 5: User Story 3 — Close out 004's remaining validation debt (Priority: P3)

**Goal**: 004 T049/T050/T053 complete with evidence; T025/T033/T038/T044 each resolved to done or
superseded-by-harness-case; B1/B2 Phase B decision recorded.

**Independent Test**: `specs/004-retrieval-fit-screen-rework/tasks.md` shows T049/T050/T053 checked
with evidence links; each of T025/T033/T038/T044 is checked or annotated
"superseded by 005 case X."

### Implementation for User Story 3

- [ ] T018 [US3] Session run: ~100 non-terminal fixture records (duplicate the matrix with renamed
      keys if the existing fixture set is smaller), production pacing; measure wall-clock and confirm
      under 30 minutes with a complete summary (004 SC-014). Depends on: Phase 3 + Phase 4 checkpoints
      (fixes must be live before the smoke run is representative).
- [ ] T019 [P] [US3] Check whether `tests/fixtures/live/job-records/` (the Figma posting) has rotted
      (posting closed); refresh with a currently-live posting or retire the fixture per spec Edge
      Cases — independent of the isolated harness, must not block Phase 3/4.
- [ ] T020 [US3] In `specs/004-retrieval-fit-screen-rework/tasks.md`, annotate T025, T033, T038, T044
      each as done or `superseded by 005 case <case-name>`, citing the specific harness case that now
      covers each manual validation. Depends on: T010, T016 (need the harness green to cite real case
      names).
- [ ] T021 [US3] Record the B1 vs B2 Phase B decision with reasons in
      `specs/004-retrieval-fit-screen-rework/plan.md`'s phasing table (T053); check off T049 and T050
      in `specs/004-retrieval-fit-screen-rework/tasks.md` with evidence links to the harness report
      and T018's smoke-run numbers. Depends on: T018, T020.

**Checkpoint**: 004 formally closes; 006 spec's SC-001–SC-005 all satisfied.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T022 [P] Update `specs/006-fit-screen-gap-fixes/intake.md`: mark F1 (already closed), F2, F3,
      and the T024 red as closed with links to the fix commits — keep it as the historical record per
      the file's own header convention (don't delete, annotate).
- [ ] T023 [P] Run `npm run harness` once more end-to-end (node layer + a final isolated session
      `--assert`) as the SC-001 exit gate before closing the branch: all `pass`, zero
      `unexpected-red`, zero `expected-red`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: None — skip directly to user stories.
- **User Story 1 (Phase 3)**: Depends on Setup only. Independently deliverable (MVP).
- **User Story 2 (Phase 4)**: Depends on Setup only — logically independent of US1 (different
  functions: `writeSummary` vs the score-phase loop, and separate harness-report plumbing), though
  both touch `fit-screen.js` and `tests/harness/*` so sequencing avoids merge noise more than it
  reflects a real dependency.
- **User Story 3 (Phase 5)**: Depends on US1 + US2 checkpoints (quickstart.md scenarios 1–5 must be
  green before the exit review in scenario 6 is meaningful).
- **Polish (Phase 6)**: Depends on all three stories.

### Within Each User Story

- T002 (design decision) before any code (T003+).
- Production edit (`fit-screen.js`) before its harness mirror/pin update, per the repo's own
  "fix workflow first, copy after" convention (T003→T007, T004→T008).
- Harness plumbing (`expectations.mjs` → `assert.mjs`/`run.mjs` flag → report rendering) in that
  order within US2 (T012→T013→T014→T015).
- Session validation (T010, T016, T018) always last within its story — it proves the code tasks
  above it.

### Parallel Opportunities

- T001 has nothing to block it.
- T007 and T008 can run in parallel with each other once T004 lands (different files: `pure.mjs` vs
  `structure.mjs`), but both wait on T004.
- T011 and T012 (US2) are file-disjoint from each other and from US1's T002–T006 — can be worked in
  parallel by different people, same-file caution noted above.
- T019 (live fixture refresh) is disjoint from everything else in US3 and can run any time.
- T022 and T023 (Polish) are file-disjoint.

---

## Parallel Example: Cross-Story

```bash
# Once Setup (T001) is done, these can start together:
Task: "T002 [US1] Resolve fingerprint input-source decision"
Task: "T011 [US2] Fix F2 summary-write ack/retry"
Task: "T012 [US2] Add requiresWire: true to expectations.mjs"
Task: "T019 [US3] Check tests/fixtures/live/ freshness"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001).
2. Complete Phase 3: User Story 1 (T002–T010).
3. **STOP and VALIDATE**: `npm run harness` shows the idempotency case as an ordinary `pass`; no
   other case regressed.
4. This alone resolves the single `expected-red` the spec calls out as its P1 reason-for-being.

### Incremental Delivery

1. Setup → US1 (idempotency green) → US2 (F2 + R3 blocked-scoping, full matrix green) → US3
   (close-out, 004 formally closes) → Polish.
2. Each story is independently testable via the harness (US1/US2) or via 004's tasks.md checklist
   (US3) without waiting on the others, aside from US3's ordering dependency above.

### Suggested MVP Scope

**User Story 1** (T001–T010) — it is the sole `expected-red` case and the spec's explicit P1.
