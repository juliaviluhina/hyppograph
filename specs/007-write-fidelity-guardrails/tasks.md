---

description: "Task list for Write-Fidelity Guardrails (007)"
---

# Tasks: Write-Fidelity Guardrails

**Input**: Design documents from `/specs/007-write-fidelity-guardrails/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: US1/US2 tasks include the atomic fidelity tests themselves — they are this feature's
primary deliverable (FR-001, FR-003), not optional extras.

**Organization**: Tasks are grouped by user story (US1 P1, US2 P2, US3 P3) per spec.md.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1, US2, or US3
- File paths are exact

## Path Conventions

Single project, no `src/`. Production code: `.claude/workflows/*.js`. New test tier:
`tests/fidelity/`. Existing free harness: `tests/harness/`.

---

## Phase 1: Setup

**Purpose**: Wire up the new Tier-2 npm entry point and directory.

- [X] T001 Add `"test:fidelity": "node --test tests/fidelity/"` to the `scripts` block in `package.json`
- [X] T002 [P] Create `tests/fidelity/README.md` documenting the tier's shape (one real `agent()` call per test, no fixture service, no scratch dir — mirrors `tests/harness/README.md`'s style) and linking `contracts/atomic-fidelity-test.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared plumbing US1 and US2's atomic tests both need — no atomic test can be written before this exists.

**⚠️ CRITICAL**: Complete before any US1/US2 test task.

- [X] T003 Create `tests/fidelity/support/run-workflow.mjs` exporting `async function runFidelityWorkflow(workflowRelPath, args)`: allocates one throwaway temp file path via `fs.mkdtempSync` (no fixture directory copy), shells out to `claude -p` instructing it to invoke the Workflow tool on `.claude/workflows/../../<workflowRelPath>` (i.e. the path relative to `tests/fidelity/`) with `args` (including the temp file path), waits for the session to finish, and returns `{ tempFilePath, cleanup() }` (`cleanup()` deletes the temp file)
- [X] T004 [P] Create `tests/fidelity/support/assert-bytes.mjs` exporting `function assertByteIdentical(actualPath, expectedContent)`: reads `actualPath`, throws an `Error` with an actual-vs-expected diff in its message if the bytes differ from `expectedContent` (first line included)

**Checkpoint**: `tests/fidelity/support/` exists and is importable — US1 can now start.

---

## Phase 3: User Story 1 - Catch write-fidelity drift at the cost of one fast-tier call (Priority: P1) 🎯 MVP

**Goal**: An atomic test regression-proofs audit #1 (`write-evaluation`, already fixed on 006) —
proving the fix's mechanism, not just the absence of the symptom.

**Independent Test**: Per spec — strip the BEGIN-CONTENT/END-CONTENT markers from the test's own
prompt copy, confirm it fails naming the byte mismatch; restore, confirm it passes.

- [X] T005 [P] [US1] Create `tests/fidelity/write-evaluation.workflow.js`: a minimal dynamic-workflow script (no `import`, no `fs`/shell/network in the body — see `contracts/atomic-fidelity-test.md`) that builds the same BEGIN-CONTENT/END-CONTENT-wrapped prompt shape as `fit-screen.js`'s `buildEvaluationWritePrompt` (audit #1) against one small inline synthetic record, and makes exactly one `agent()` call (`agentType: "hyppo-readwrite"`, `model: FAST`, `label: "write-evaluation"`) writing to the temp file path passed in via `args`
- [X] T006 [US1] Create `tests/fidelity/write-evaluation.test.mjs`: uses `runFidelityWorkflow` (T003) to run T005's script, then `assertByteIdentical` (T004) to confirm the written file matches the expected content byte-for-byte, including the leading `---`; depends on T003, T004, T005
- [ ] T007 [US1] Validate SC-001 per `quickstart.md` §2: temporarily remove the BEGIN-CONTENT/END-CONTENT markers from T005's script, run `npm run test:fidelity`, confirm T006 fails with a diff showing the dropped `---`; restore the markers, confirm it passes again; record the result (pass) in the PR description, no code change retained from this step
  - **BLOCKED in agent-driven sessions**: `npm run test:fidelity` shells out to `claude -p --dangerously-skip-permissions` (research.md R1). When that command is itself run from inside a Claude Code agent's Bash tool, auto-mode's classifier denies it outright ("Create Unsafe Agents") before the Workflow tool ever runs — confirmed 2026-09-14, see `run-workflow.mjs`'s header comment. This is not a bug in the test tier's design; it is specific to nested-agent spawning from within another agent session. **Run this task from a plain human terminal** (not through an agent's Bash tool) to complete it.

**Checkpoint**: `npm run test:fidelity` passes with one test (write-evaluation). US1 independently shippable.

---

## Phase 4: User Story 2 - Fix the two at-risk call sites the audit found beyond F4 (Priority: P2)

**Goal**: Apply audit #1's marker fix to audit #2 (`fit-screen.js` `write-run-summary`) and #3
(`intake-normalize.js` `write-run-summary`), each with its own atomic test.

**Independent Test**: Per spec — both `write-run-summary` prompts wrapped in
BEGIN-CONTENT/END-CONTENT markers, each with its own passing atomic test.

- [X] T008 [P] [US2] In `.claude/workflows/fit-screen.js`, wrap `writeSummary()`'s prompt content (`rendered`, currently `[instruction, "", rendered].join("\n")` around line 1023) in `BEGIN-CONTENT`/`END-CONTENT` markers, matching audit #1's already-shipped wording (`buildEvaluationWritePrompt`, same file, ~line 1206)
- [X] T009 [P] [US2] Apply the same marker fix to `intake-normalize.js`'s write-run-summary prompt (`[instruction, "", rendered].join("\n")` around line 841)
- [X] T010 [P] [US2] Create `tests/fidelity/write-run-summary-fit-screen.workflow.js`, one `agent()` call mirroring T008's fixed prompt shape against an inline synthetic summary, writing to the temp file passed via `args`
- [X] T011 [P] [US2] Create `tests/fidelity/write-run-summary-intake.workflow.js`, one `agent()` call mirroring T009's fixed prompt shape against an inline synthetic summary
- [X] T012 [US2] Create `tests/fidelity/write-run-summary-fit-screen.test.mjs` (uses T003/T004 helpers, runs T010's script, asserts byte-exact output); depends on T003, T004, T008, T010
- [X] T013 [US2] Create `tests/fidelity/write-run-summary-intake.test.mjs` (uses T003/T004 helpers, runs T011's script, asserts byte-exact output); depends on T003, T004, T009, T011

**Checkpoint**: `npm run test:fidelity` passes with all three tests (write-evaluation, both write-run-summary). US1+US2 shippable together.

---

## Phase 5: User Story 3 - Make BEGIN/END-CONTENT the default shape for new verbatim-write prompts (Priority: P3)

**Goal**: A free structural pin catches a future regression (or a new unmarked verbatim-write
prompt) at the node-only tier, and a linkable convention doc is referenced from both scripts.

**Independent Test**: Per spec — a new verbatim-write prompt added without markers makes the
structural pin fail (`npm run harness`), naming the offending call site.

- [X] T014 [P] [US3] Add a one-line reference to `specs/007-write-fidelity-guardrails/contracts/verbatim-write.md` in `.claude/workflows/fit-screen.js`'s module header comment block (near the top, alongside the existing `Spec:` line)
- [X] T015 [P] [US3] Add the same reference in `.claude/workflows/intake-normalize.js`'s module header comment block
- [X] T016 [US3] In `tests/harness/support/structure.mjs`: add an `INTAKE_WORKFLOW` path constant (mirroring the existing `WORKFLOW` constant, pointing at `intake-normalize.js`) and an `intakeWorkflowSource()` reader; then add `hasVerbatimWriteMarkers(site, src)` (or three named functions, one per site) that greps the given source text for both literal `BEGIN-CONTENT` and `END-CONTENT` substrings, applied to: audit #1 (`fit-screen.js`, `buildEvaluationWritePrompt`), audit #2 (`fit-screen.js`, `writeSummary`, post-T008), audit #3 (`intake-normalize.js`, write-run-summary, post-T009) — per `contracts/verbatim-write.md`'s literal-string-check contract; depends on T008, T009
- [X] T017 [US3] Create `tests/harness/regression-cases/verbatim-write-markers.test.mjs` (mirroring `fault-sweep.test.mjs`'s import-and-`assert.ok` pattern) importing T016's pin function(s) and asserting all three in-class sites pass; depends on T016

**Checkpoint**: `npm run harness` passes with the new pin; `npm run harness && npm run test:fidelity` both green. Full spec (SC-001–SC-004) satisfied.

---

## Dependencies & Execution Order

- **Phase 1 (Setup)** → **Phase 2 (Foundational)**: no dependencies between them; both can start immediately, but Phase 2 must finish before any US1/US2 test task.
- **Phase 3 (US1)** depends on Phase 2 (T003, T004). Independent of US2/US3 — audit #1 is already fixed on `main`.
- **Phase 4 (US2)** depends on Phase 2 (T003, T004). Independent of US1's test files, but T012/T013 each depend on their own T008/T009 fix landing first.
- **Phase 5 (US3)**'s pin (T016) depends on T008 and T009 (US2) actually landing, since it checks all three sites — but T014/T015 (the doc references) and T017's test file can be scaffolded in parallel with US2.
- **Suggested order**: Phase 1 + 2 → Phase 3 (US1, MVP) → Phase 4 (US2) → Phase 5 (US3).

## Parallel Execution Examples

- Phase 2: T003 and T004 touch different files — run in parallel.
- Phase 4: T008 and T009 touch different files — run in parallel. Once both land, T010/T011 (different files) run in parallel; then T012/T013 (different files) run in parallel.
- Phase 5: T014 and T015 touch different files — run in parallel, independent of T016/T017.

## Implementation Strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (US1)**: regression-proofs the actual F4 incident with one
atomic test. Ship this alone if time-boxed — it directly closes the gap the spec was written to
close (SC-001).

**Incremental delivery**: US1 → US2 (closes the two audit-found-but-not-yet-hit sites, SC-002/SC-003)
→ US3 (makes the convention self-enforcing going forward, SC-004). Each phase's checkpoint is a
green `npm run test:fidelity` / `npm run harness` — safe to stop after any phase.
