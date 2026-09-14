---
description: "Task list — Isolated Test Harness for feature 004's verify-then-score flow"
---

# Tasks: Isolated Test Harness

**Input**: Design documents from `specs/005-isolated-test-harness/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: This feature IS tests — every task below produces harness code or cases. `node:test`
throughout, stdlib only, zero new dependencies.

**Scope note**: The single production touch is the additive `ATS_API_BASE_OVERRIDES` routing seam
(research.md R2, plan.md Technical Context). All 004 judgment/state fixes belong to 006.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 = full flow (P1), US2 = worker contracts (P2), US3 = fixture service (P3),
  US4 = regression matrix (P4)
- Most runner/service tasks touch shared files, so they are sequential; `[P]` marks the
  independent case files and docs.

## Path Conventions

- Harness: `tests/harness/` (`service.mjs`, `run.mjs`, `worker-cases/`, `regression-cases/`,
  `support/`)
- Fixtures: `tests/fixtures/` (extended in place — sourceRefs stay production-faithful)
- Runner entry: `npm run harness` (new script in `package.json`)
- Scratch data dir: temp copy per run, never `tests/fixtures/data-dir` in place (research.md R4)

---

## Phase 1: Setup

**Purpose**: Harness skeleton, runner entry, no service logic yet

- [x] T001 Create `tests/harness/` layout per plan.md (`service.mjs`, `run.mjs`,
      `worker-cases/`, `regression-cases/`, `support/`) with stub files that exit non-zero
      ("not implemented") so unfinished work is loud, never silently green
- [x] T002 [P] Add `npm run harness` script to `package.json` invoking `tests/harness/run.mjs`;
      confirm `npm test` (`node --test evals/component/`) is unaffected
- [x] T003 [P] Write `tests/harness/support/ports.mjs`: fixed-port bind with fail-fast on
      conflict (names the port and likely stale process, never auto-picks another)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared scaffolding every story phase builds on — service, scratch dir, isolation
assertion, routing seam

**⚠️ CRITICAL**: No user story phase can be exercised until this phase is complete

- [x] T004 Implement `tests/harness/service.mjs` per `contracts/fixture-service.md`: ATS-shaped
      GET routes (Greenhouse/Lever/Ashby paths), `live`/`closed`/`malformed`/`error`/`flapping`
      scenarios, `/__admin/scenario` read+write, `/__admin/access-log`, stdlib `node:http` only
- [x] T005 Implement `tests/harness/support/scratch.mjs`: copy `tests/fixtures/data-dir/` to a
      temp dir per run, return paths; runner deletes on success, keeps on failure (with the path
      printed) for debugging
- [x] T006 Implement `tests/harness/support/isolation.mjs`: two-sided FR-005 assertion — every
      ATS call the run claims appears in the service access log AND zero non-loopback targets
      across worker prompts + constructed URLs; any violation fails the whole run
- [x] T007 Add the `ATS_API_BASE_OVERRIDES` host→origin map read at the `buildAtsApiUrl` site in
      `.claude/workflows/fit-screen.js` (research.md R2): empty/absent map ⇒ byte-identical URLs
      to today; document the arg alongside `HYPPO_PACING_MS`/`HYPPO_FETCH_CAP`
- [x] T008 Implement `tests/harness/run.mjs` skeleton: service start → scratch copy → case
      discovery (`worker-cases/` + `regression-cases/`) → report per `contracts/harness-report.md`
      (`pass` / `expected-red (T024 → 006)` / `unexpected-red`) → exit code rule → service stop;
      exactly one case ID may claim `expected-red`, hardcoded
- [x] T009 [P] Extend `tests/fixtures/data-dir/` where the expected matrix needs it (ATS-shaped
      sourceRefs stay production-faithful per `contracts/expected-matrix.md`); do NOT touch
      `tests/fixtures/live/` (harness never uses it)

**Checkpoint**: `npm run harness` runs end-to-end with zero cases discovered and reports "no
cases" (non-zero exit) — scaffolding proven before cases land

---

## Phase 3: User Story 1 — Full verify-then-score flow, zero live deps (Priority: P1) 🎯 MVP

**Goal**: One command runs the whole flow isolated and asserts summary, verdicts, flags, and
named outcomes against the expected matrix.

**Independent Test**: `npm run harness -- --case=full-flow`; confirm all 6 scoring fixtures hit
`contracts/expected-matrix.md` verdicts, counts match, isolation proof shows zero non-loopback
targets.

- [x] T010 [US1] Implement the full-flow case in `tests/harness/regression-cases/full-flow.mjs`:
      scratch dir + override map → run verify→score → assert per-record verdicts/flags/outcomes
      against `contracts/expected-matrix.md`
- [x] T011 [US1] Assert the run summary counts (verified open/closed/unresolvable, scored,
      verdicts by category, hard-constraint failures, application-state values, named outcomes)
      match the matrix exactly — any drift fails the case
- [x] T012 [US1] Wire the FR-005 isolation proof into the full-flow case (service access log
      contains every ATS call; zero non-loopback targets) per `contracts/harness-report.md`
- [ ] T013 [US1] Manual validation: run the full flow; verify quickstart scenarios 1 and 5 by hand
      (STATUS 2026-09-14: node half done — assertion layer + synthetic scratches green;
      session run executed once: 9 scored but ATS marks unresolvable per R8 transport
      constraint + F2 summary-ack bug found. Full green pending 006.)

**Checkpoint**: MVP — the isolated full cycle runs green (minus the known T024 red, which lands
in Phase 6)

---

## Phase 4: User Story 2 — Per-worker contract cases (Priority: P2)

**Goal**: Each bounded worker tested alone against schema + role boundary (research.md R3).

**Independent Test**: Run any single case file with `node --test`; it passes/fails without any
other case running.

- [x] T014 [P] [US2] Verify case in `tests/harness/worker-cases/verify-signal.mjs`: live →
      `found`, closed → `not_found`, error → `http_error`, malformed → `unparseable`; never a
      `confirmed-*` disposition; non-ATS sourceRef rejected before any call
      (`contracts/worker-contract.md`)
- [x] T015 [P] [US2] Score case in `tests/harness/worker-cases/score-cited-rows.mjs`: gap fixture
      → gap row `Fails`/`Absent`/`Unknown`, every non-`Unknown` row cites an existing file+section,
      output contains no overall-verdict field
- [x] T016 [P] [US2] Settings-reader case in `tests/harness/worker-cases/settings-verbatim.mjs`:
      tricky paths echoed byte-for-byte (runs 1/4/6 class)
- [x] T017 [P] [US2] Evidence-reader case in `tests/harness/worker-cases/evidence-single-read.mjs`:
      one call per file, each result echoes its own path+content (run 5 class)
- [x] T018 [P] [US2] Applications-reader case in
      `tests/harness/worker-cases/applications-presence.mjs`: missing vs present-no-match vs empty
      tracker → `unknown` vs `not_applied` (research.md R3)
- [x] T019 [P] [US2] Citation-audit case in `tests/harness/worker-cases/citation-advisory.mjs`:
      planted bad citation rejected AND recorded advisory with persistence proceeding (run 7 class)
- [ ] T020 [US2] Manual validation: break one worker fixture at a time; confirm exactly its case
      fails while all others stay green (quickstart scenario 2)
      (STATUS 2026-09-14: node halves green incl. fault isolation; in-session worker
      agreement pending. hyppo-verify wire proven separately via live https smoke — R8.)

**Checkpoint**: All six worker cases green independently; a one-field corruption is catchable in
seconds

---

## Phase 5: User Story 3 — Fixture service scenarios (Priority: P3)

**Goal**: Scenario control incl. mid-run flips and fail-fast when stopped.

**Independent Test**: Drive `/__admin/*` directly (curl or node) without running any worker case.

- [ ] T021 [US3] Flapping case in `tests/harness/regression-cases/flapping-mark-update.mjs`:
      `live` → run → POST flip to `closed` → run → mark updates, prior evaluation untouched,
      now-terminal record skipped by score (quickstart scenario 3, 004 run 8 / scenario 6)
      (STATUS 2026-09-14: implemented as `flapping.test.mjs`; node half green — flipped
      expectations pass both directions. Live two-run session pending; meaningful without
      the wire since mark-update logic is transport-independent — R8.)
- [x] T022 [US3] Service-stopped case: with the service down, dependent cases fail fast with
      "fixture service unreachable" and no live-host fallback is attempted (assert via isolation
      proof)
- [x] T023 [US3] Closed/malformed matrix wired to the service scenarios from
      `contracts/expected-matrix.md` (closed → `confirmed-closed` excluded with reason;
      malformed/error + non-ATS → `unresolvable` scored with flag)

**Checkpoint**: Service scenarios fully drivable; stoppage is loud, never a silent fallback

---

## Phase 6: User Story 4 — Run-1–9 regression matrix (Priority: P4)

**Goal**: Every historical issue pinned as a labelled, fault-injectable case (spec.md
traceability table).

**Independent Test**: Reintroduce each historical fault in isolation; exactly its case turns red
with the historical symptom (quickstart scenario 4).

- [x] T024 [P] [US4] Config-gate case in `tests/harness/regression-cases/config-gate.mjs`:
      stripped-prefix / empty-evidence / missing-recency-window fixtures →
      `config.evidence-unavailable`, zero writes (run 1)
- [x] T025 [P] [US4] Worker-presence case in
      `tests/harness/regression-cases/worker-presence.mjs`: missing worker definition fails fast
      with a named error, not a mid-run crash (run 2 class)
- [x] T026 [P] [US4] Fixture-honesty case in
      `tests/harness/regression-cases/fixture-honesty.mjs`: labelled gap/domain fixtures score as
      designed; evidence supports exactly what it claims (run 3 class)
- [x] T027 [US4] Idempotency case in `tests/harness/regression-cases/idempotency.mjs`:
      unchanged re-run asserts zero evaluation-content changes + zero new provenance lines for
      unchanged marks; registered as the single `expected-red (T024 → 006)` — red-by-design until
      006, never skipped (runs 8–9, research.md R6)
- [x] T028 [US4] Fault-injection sweep: for each case above, reintroduce its historical fault and
      confirm exactly that case turns red with the historically observed symptom; document the
      mapping in the case file header (tracesTo run-N)

**Checkpoint**: Full matrix green except the one named expected-red; every 004 run (1–9) has a
tracing case (spec SC-006)

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T029 [P] Harness docs: one short section (service lifecycle, `--case=` debug flag,
      override-map generation, reading the report) linked from quickstart.md Setup
- [ ] T030 [P] Run quickstart.md validation scenarios 1–5 end to end by hand; record results
      (STATUS 2026-09-14: node-runnable halves validated — scenario 4 via fault-sweep/
      config-gate green; 1–3 and 5 need session runs. See quickstart.md status notes.)
- [x] T031 Confirm `npm test` unaffected, `package.json` still has zero dependencies, and no
      committed fixture was mutated in place by any harness run (`git status` clean on
      `tests/fixtures/` after a full cycle)
- [x] T032 Record the 005 exit state for 006 intake: current reds (expected: exactly T024),
      plus anything unexpected found during T028/T030

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: after Setup — blocks all story phases (T007's seam is needed by
  US1/US3; T008's runner skeleton by every case)
- **US1 (Phase 3, P1)**: after Foundational — MVP, full flow isolated
- **US2 (Phase 4, P2)**: after Foundational; independent of US1 (different files; needs only
  T004's service + T008's discovery)
- **US3 (Phase 5, P3)**: after Foundational; needs T004's `/__admin` surface; independent of
  US1/US2 content
- **US4 (Phase 6, P4)**: after US1–US3 (reuses their cases + runner); T027's expected-red needs
  T008's single-expected-red mechanism
- **Polish (Phase 7)**: after the story phases you intend to ship

### Within a phase

- Runner/service/support files are shared — tasks touching them run in listed order
- Case files (`[P]`) can be written in any order once the runner skeleton (T008) exists

### Cross-story note

US2 and US3 are independent of US1's full-flow case despite priority ordering — priorities here
express value (isolation guarantee first), not technical dependency.

---

## Parallel Opportunities

- **Setup**: T002, T003 in parallel (different files)
- **Foundational**: T009 (fixtures) parallel with T004–T008 (harness code)
- **US2**: T014–T019 all in parallel (six independent case files)
- **US4**: T024, T025, T026 in parallel (independent case files); T028 last (needs all cases)
- **Polish**: T029 parallel with T030–T032

### Parallel example: US2 worker cases

```bash
Task: "Verify case in tests/harness/worker-cases/verify-signal.mjs"              # T014
Task: "Score case in tests/harness/worker-cases/score-cited-rows.mjs"            # T015
Task: "Settings-reader case in tests/harness/worker-cases/settings-verbatim.mjs" # T016
Task: "Evidence-reader case in tests/harness/worker-cases/evidence-single-read.mjs" # T017
Task: "Applications-reader case in tests/harness/worker-cases/applications-presence.mjs" # T018
Task: "Citation-audit case in tests/harness/worker-cases/citation-advisory.mjs"  # T019
```

---

## Implementation Strategy

### MVP first (US1 only)

1. Phase 1 Setup → Phase 2 Foundational → Phase 3 US1
2. **STOP and VALIDATE**: `npm run harness -- --case=full-flow` isolated, counts match
   (quickstart scenarios 1 and 5)
3. This alone delivers the independence guarantee — everything else deepens it

### Incremental delivery

1. Setup + Foundational → runner reports "no cases" (scaffolding proven)
2. + US1 → isolated full cycle green (MVP)
3. + US2 → single-field corruptions catchable in seconds
4. + US3 → scenario flips + fail-fast stoppage
5. + US4 → every 004 run pinned; exactly one expected-red (T024 → 006)
6. Polish → docs, quickstart validation, clean-fixtures check, 006 intake record

### Notes

- `[P]` = different files, no incomplete dependency
- Every implementation task names its file; shared runner/service tasks run in listed order
- Scratch dir per run — committed fixtures are immutable inputs, never mutated
- Commit after each task or logical group; stop at any checkpoint to validate a story
