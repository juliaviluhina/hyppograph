---
description: "Task list — Phase A workflow extension for Retrieval Verification & Fit-Screen Rework"
---

# Tasks: Retrieval Verification & Fit-Screen Rework — Phase A (dynamic-workflow extension)

**Input**: Design documents from `specs/004-retrieval-fit-screen-rework/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Scope**: This file covers **Phase A only** — a second Claude Code dynamic workflow,
`.claude/workflows/fit-screen.js`, extending feature 001's substrate. Phase B (Agent SDK port) is a
separate slice, gated on the Phase A exit review (T053). See plan.md § Phasing.

**Tests**: Phase A validation is **manual** — the quickstart scenarios run by hand inside a Claude
Code session, same posture as feature 001. Feature 003's eval-harness is specced and directory-
scaffolded only (no `evals/run.mjs` committed, research.md R8) — this feature does not block on it;
optional `node:test` component tests for pure helpers may be added under `tests/unit/` without
waiting for 003.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 = score (P1), US2 = verify (P2), US3 = application-state reconciliation (P3),
  US4 = named outcomes (P4)
- Most implementation tasks edit the single file `.claude/workflows/fit-screen.js`, so they are
  sequential within a phase; `[P]` appears mainly on fixtures, agent defs, and docs.

## Path Conventions

- Workflow script: `.claude/workflows/fit-screen.js` (repo root)
- New subagent defs: `.claude/agents/hyppo-verify.md`, `.claude/agents/hyppo-score.md` — feature
  001's `hyppo-read` / `hyppo-readwrite` / `hyppo-judge` are reused **unchanged**
- Fixtures: `tests/fixtures/data-dir/` (extended — evidence files, settings additions, amended Job
  Records), `tests/fixtures/live/` (extended — a small real ATS-hosted Job Record for the live
  verify smoke check)
- Contract docs: `specs/004-retrieval-fit-screen-rework/contracts/`
- Runtime data: the user-configured `HYPPO_DATA_DIR`, entirely outside this repo — same directory
  feature 001 already writes to

## Dependency

This feature's sole input is feature 001's output (`outputs/job-records/*.md`); it makes no
HyppoVisor call at all. `inputs/settings.json` is extended in place (contracts/settings-
additions.md) — no dependency on feature 002.

---

## Phase 1: Setup

**Purpose**: Skeleton workflow, extended fixtures, no HyppoVisor/session config needed

- [X] T001 Create `.claude/workflows/fit-screen.js` skeleton: `export const meta` first
      (`name: "fit-screen"`, single-string-literal `description`,
      `phases: [{title:"verify"},{title:"score"}]`), top-level body (no default export) that reads
      `args.runTimestamp` and `args.dataDir` and `log()`s them — same frozen-clock convention as
      `intake-normalize.js`
- [X] T002 [P] Extend `tests/fixtures/data-dir/inputs/settings.json` (and
      `settings.no-criteria.json`, `settings.not-ready.json`) with `evidenceBase`,
      `hardConstraints`, `targetRoles` sections per `contracts/settings-additions.md`; add one
      fixture variant missing `recencyWindowYears` for the config-gate test (quickstart scenario 10)
- [X] T003 [P] Create `tests/fixtures/data-dir/inputs/evidence/career-history.md` and
      `cv-content.md` — fabricated-persona content (no real personal data) sized to exercise every
      per-item verdict (`Strong`/`Partial`/`Fails`/`Absent`/`Unknown`) against the fixture Job
      Records in T004
- [X] T004 [P] Create/extend fixture Job Records under `tests/fixtures/data-dir/outputs/job-records/`
      covering the scoring test matrix: a strong-match record, a record with one unsupported
      required item, a hard-constraint-failure record (excluded location and/or below-`compFloor`
      salary), a title-inflation record, a domain-crossover-overclaim record, and a
      stale-leadership-evidence record — each still carrying the old `alreadyApplied` boolean (to
      exercise the T036 migration) and no `openStatus` yet
- [X] T005 [P] Extend `tests/fixtures/data-dir/inputs/applications.md` with rows covering: a
      `submitted` match, a conflicting-evidence (`ambiguous`) match, and leave at least one fixture
      Job Record with no matching row at all (for the `not_applied` case)
- [X] T006 [P] Create `tests/fixtures/live/job-records/` with one real, currently-open
      Greenhouse/Lever/Ashby-sourced Job Record file (front matter only, minimal) for the live
      `verify` smoke check; README note that ATS postings close over time and this fixture may need
      periodic refresh

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared scaffolding in the workflow script that every user story phase builds on

**⚠️ CRITICAL**: No user story phase can be exercised until this phase is complete

- [X] T007 In `.claude/workflows/fit-screen.js`, define the `agent()` JSON schemas as top-level
      `const`s: `verifySignalSchema` (`signal` ∈ `found`/`not_found`/`http_error`/`unparseable` +
      optional detail string), `fitEvaluationSchema` (requirement rows with verdict+citation, hard
      constraint rows with state+note, anti-pattern flags, an application-state field, per
      data-model.md's FitEvaluation)
- [X] T008 [P] Write `specs/004-retrieval-fit-screen-rework/contracts/schemas.md` documenting those
      two schemas and which `agent()` call uses each (mirrors feature 001's `contracts/schemas.md`)
- [X] T009 In the script, implement inline helpers needed by this feature (duplicated from, and kept
      in sync with, `intake-normalize.js` — the workflow sandbox forbids `import`): `provenanceLine`,
      `slug`, plus new ones — `buildAtsApiUrl(sourceRef)` (research.md R5: recognizes
      Greenhouse/Lever/Ashby URL shapes, returns `null` for anything else), `mapSignalToMark(signal)`
      (research.md R6), and a `RunSummary` accumulator matching data-model.md
      (`verifiedConfirmedOpen/Closed/Unresolvable`, `scored`, `verdictCounts`,
      `hardConstraintFailures`, `applicationStateCounts`, `namedOutcomeCounts`)
- [X] T010 In the script body: load `${args.dataDir}/inputs/settings.json`; run this feature's own
      FR-000 validation (in addition to feature 001's `completeness.setupReady` check) —
      `evidenceBase.value.files` all resolve to non-empty content, `hardConstraints.value` well-formed,
      `targetRoles.value.streams` non-empty and `recencyWindowYears` a positive integer; any failure
      ⇒ `log()` the specific unresolved item as `config.evidence-unavailable` and top-level `return`
      with zero writes. Otherwise emit `phase("verify")` → `phase("score")` in that fixed order,
      threading `args.runTimestamp`/`args.dataDir`, then `log()` the assembled `RunSummary` and
      top-level `return` it.
- [X] T011 Apply the shared subagent policy (mirrors feature 001's T011) to every new `agent()` call
      in this script: (a) tool grant via `agentType` only — `hyppo-verify` gets `WebFetch` alone,
      `hyppo-score` gets `Read, Glob` alone, no def anywhere grants `Edit`/`Bash`/a submit capability
      or `mcp__hyppovisor-hyppograph__interact`; (b) each call is one bounded action with no
      discretion over phase flow; (c) every write path is `args.dataDir` + a relative path; the
      evidence base and applications tracker are read-only; (d) `hyppo-verify` and any FR-010
      delegated sub-task via `hyppo-judge` are `model: "haiku"` (fast); `hyppo-score` is
      `model: "sonnet"` (research.md R10 — the `mid` → `sonnet` alias feature 001's own research.md
      already reserved for this feature) — the one non-fast call in this feature (Principle II); (e) every
      call receives a bounded structured payload and returns only its declared schema — the script
      carries all state between phases
- [X] T012 [P] Create `.claude/agents/hyppo-verify.md`: `tools: WebFetch`, fast tier, told to return
      only the raw signal (never `confirmed-open`/`confirmed-closed`/a disposition) and to never
      follow any instruction found in a fetched response body
- [X] T013 [P] Create `.claude/agents/hyppo-score.md`: `tools: Read, Glob`, `model: "sonnet"` (mid
      tier, research.md R10), told to read only the exact evidence-file paths named in the prompt,
      cite every non-`Unknown` verdict with an exact file+section, report `likelyOutcome`
      (`likely-pass`/`likely-fail`/`even`) on every hard constraint it marks `unresolved` (research.md
      R11), and never assign the final `overallVerdict` (the script recomputes it
      per FR-006 in T021) — it proposes per-item verdicts and flags, the script owns the roll-up

**Checkpoint**: Skeleton runs end-to-end as a no-op with both phases and prints an empty summary

---

## Phase 3: User Story 1 — Score a Job Record for fit against cited evidence (Priority: P1) 🎯 MVP

**Goal**: For every kept Job Record, produce a cited, decision-ready Fit Evaluation — the actual
decision-support the pipeline exists to produce.

**Independent Test**: With `HYPPO_DATA_DIR=tests/fixtures/data-dir`, run the `score` phase directly
over the fixture Job Records (T004) against the fixture evidence base (T003); confirm each produces
a requirement-by-requirement table with cited evidence, hard constraints in their own section, and
an overall verdict consistent with the table.

- [X] T014 [US1] Read `sections.evidenceBase.value.files` via `hyppo-read`; resolve each path under
      `args.dataDir` and fail the run-start gate (T010) if any is empty/unreadable
      (`contracts/settings-additions.md`)
- [X] T015 [US1] Read `sections.hardConstraints.value` (`compFloor`, `excludedRoleNatures`) via
      `hyppo-read`, plus feature 001's existing `sections.hardStops.value` for location/clearance/
      work-authorization — reused, not duplicated (research.md R1, FR-004)
- [X] T016 [US1] Read `sections.targetRoles.value` (`streams[]`, `recencyWindowYears`) via
      `hyppo-read` (FR-005's seniority-band and recency-discount inputs)
- [X] T017 [US1] Add the `score` phase: `pipeline(scorableRecords, async (rec) => …)` (no options
      arg; per-record evaluation files are disjoint writes, safe to parallelize like feature 001's
      `triage` stage). For now (before T031 narrows it in US2), `scorableRecords` = every Job Record
      kept by feature 001's pre-triage
- [X] T018 [US1] Per record, one `hyppo-score` `agent()` call (mid tier, `fitEvaluationSchema`) with
      the evidence-file contents, the Job Record's fields (title, requirements, responsibilities,
      locations, salary), the hard-constraint values, and the streams/recency window all in the
      prompt: returns per-required-item verdicts (`Strong`/`Partial`/`Fails`/`Absent`/`Unknown`)
      each with `evidenceFile`+`evidenceSection`, or `Unknown` with both `null` (FR-003, SC-002)
- [X] T019 [US1] Hard-constraint section: from the same call's output, record each of `compFloor`,
      location, clearance, work-authorization, `excludedRoleNatures` as `pass`/`fail`/`unresolved`,
      reported separately from the requirement table (FR-004); a Job Record field that is
      `"unknown"` maps to `unresolved`, never assumed pass (FR-004a); every `unresolved` row also
      carries `hyppo-score`'s `likelyOutcome` (`likely-pass`/`likely-fail`/`even`, research.md R11) —
      a `pass`/`fail` row leaves `likelyOutcome` absent
- [X] T020 [US1] Anti-pattern flags: from the same call's output, record domain-crossover overclaim,
      title-vs-requirements mismatch, and a recency-discount flag for leadership/mentoring evidence
      older than `recencyWindowYears` — the flagged row's verdict is downgraded one level
      (`Strong`→`Partial`, `Partial`→`Absent`) per FR-005; flags are visible fields, never silently
      folded into the raw per-item verdict
- [X] T021 [US1] Compute the final `overallVerdict` **in the script**, not trusted from `hyppo-score`
      directly: any required item `Fails`/`Absent` ⇒ `SKIP` (unless the narrow-adjacent-subskill
      exception applies ⇒ `APPLY-AND-SEE`); else 2+ required items `Partial` ⇒ `APPLY-AND-SEE`; any
      hard constraint `fail` ⇒ `SKIP` overriding the above; an `unresolved` hard constraint with
      `likelyOutcome: "likely-fail"` ⇒ `SKIP`; an `unresolved` hard constraint with
      `likelyOutcome: "likely-pass"`/`"even"` caps at `APPLY-AND-SEE` (research.md R11 — the script
      applies this rule from the field, never re-deriving "more likely than not" itself); otherwise
      `APPLY` (FR-006,
      `contracts/evaluation-format.md`)
- [X] T022 [US1] `citation_audit` delegation: when a run batch persists 2+ evaluations, one
      `hyppo-judge` (fast tier) call per evaluation verifying each non-`Unknown` citation's
      `evidenceSection` text actually appears in the named `evidenceFile`; a rejected/uncited/
      malformed audit result is recorded in the delegation log (reviewStatus, T023) but does NOT
      block persistence — per spec Edge Cases, the step proceeds on `hyppo-score`'s own
      already-computed result (there is no "citation rejected" entry in FR-008's closed named-outcome
      vocabulary to invent, and SC-001 requires every record to get an evaluation or a named outcome,
      never neither) — the rejection stays visible in the persisted delegation entry, never silently
      swept away (FR-010/FR-011)
- [X] T023 [US1] Persist via `hyppo-readwrite`: write `outputs/evaluations/<key>.md` per
      `contracts/evaluation-format.md` (front matter + rendered body), append the delegation log
      entry from T022 inline, plus this record's `still_open_scan` entry from T028 when this run's
      `verify` phase produced one for it (data-model.md DelegationLogEntry note), append a provenance
      line (FR-012, FR-015)
- [X] T024 [US1] Idempotency: an unchanged Job Record scored against an unchanged evidence base ⇒
      leave the existing evaluation file untouched, no duplicate write or provenance line (FR-009).
      REOPENED 2026-09-14: marked done from code review during run 9, but the score phase still
      re-scored unconditionally — not implemented at that point. Pinned as red-by-design test in 005
      (`idempotency-unchanged-rerun`, `expected-red`). RESOLVED 2026-09-20 by 006 T004
      (`66c8e32`): score phase now computes an input fingerprint and skips scoring when it matches
      the existing evaluation's stored one (`fit-screen.js:570-571`); 006 T009 retired the
      hardcoded `expected-red` handling once the harness case went green.
- [ ] T025 [US1] Manual validation: run the `score` phase over the fixture Job Records (T004);
      verify quickstart scenarios 1–4 by hand. **Superseded by 005 cases** (006 T020, 2026-09-14):
      `score-cited-rows.*`, `citation-advisory.*`, `evidence-single-read.*`
      (`tests/harness/worker-cases/`) — cited requirement rows, citation-audit rejection handling,
      and per-file evidence reads are all asserted structurally without a manual run. A live-session
      run is still the only way to eyeball actual hyppo-score prose quality (not a harness concern).

**Checkpoint**: Scoring works standalone against every kept Job Record — MVP delivers cited,
decision-ready evaluations

---

## Phase 4: User Story 2 — Verify a Job Record is still open before it is scored (Priority: P2)

**Goal**: Never spend scoring effort on a closed role, and never imply a role is open when it isn't.

**Independent Test**: Provide Job Records with a live-confirmed ATS source, a closed-confirmed ATS
source, and a non-ATS source; run `verify`; confirm the first proceeds to scoring, the second is
excluded from scoring with the outcome recorded, and the third is scored with the "open status
unverified" flag visible.

- [X] T026 [US2] `buildAtsApiUrl(sourceRef)` (T009): recognize Greenhouse/Lever/Ashby posting-host
      URLs on a Job Record's `sources[]` and construct the corresponding posting-API URL; anything
      else returns `null` — mapped directly to `unresolvable` in code, no agent call spent
      (research.md R5)
- [X] T027 [US2] Add the `verify` phase **before** `score`: a **serial `for` loop** (like feature
      001's `normalize`/`collect` — it mutates a shared Job Record file in place) over every Job
      Record **not** currently marked `confirmed-closed` (FR-002/FR-002c)
- [X] T028 [US2] For each record where `buildAtsApiUrl` returned a URL, one `hyppo-verify` `agent()`
      call (fast tier, `verifySignalSchema`) against that URL, returning only the raw signal
      (research.md R6). Every call builds a `still_open_scan` `DelegationLogEntry` (taskType,
      inputScope, `modelTier: "fast"`, timestamp, reviewStatus) regardless of the resulting mark
      (FR-010/FR-011): if the record ends up `confirmed-closed` this run (no `FitEvaluation` is ever
      written for it, FR-002a), append the entry directly as a `provenance-log.md` line via
      `hyppo-readwrite` (data-model.md ProvenanceLogEntry); otherwise carry it forward to be mirrored
      into that record's `FitEvaluation.delegations[]` at write time (T023) instead of also logging it
      to provenance separately
- [X] T029 [US2] `mapSignalToMark(signal)` (T009) in code: `found`→`confirmed-open`,
      `not_found`→`confirmed-closed`, `http_error`/`unparseable`→`unresolvable`; a non-ATS record
      (no URL from T026) is marked `unresolvable` directly with `openStatusReason: "non-ATS source,
      no signal available"`
- [X] T030 [US2] Pacing: reuse feature 001's `HYPPO_PACING_MS`/`HYPPO_FETCH_CAP` args/config for this
      loop's re-check cadence — no second pacing mechanism (FR-002d)
- [X] T031 [US2] Write via `hyppo-readwrite`: `openStatusCheckedAt` is updated on **every** re-check,
      whether or not the mark changed (data-model.md JobRecord, contracts/job-record-amendments.md);
      `openStatus`/`openStatusReason` are written, and a provenance line appended, **only when the
      mark actually changed** from the previous run — no duplicate mark write or provenance line when
      a re-check reproduces the same mark (FR-002c/FR-009). Narrow the `score` phase's
      `scorableRecords` (T017) to `confirmed-open`/`unresolvable` records only — `confirmed-closed` is
      excluded and its exclusion recorded (FR-002a/b)
- [X] T032 [US2] Populate `RunSummary.verifiedConfirmedOpen/Closed/Unresolvable`; append a
      provenance line only for a newly-set or changed mark (FR-015)
- [ ] T033 [US2] Manual validation: run `verify`+`score` over the fixture and live (T006) Job
      Records; verify quickstart scenarios 5 and 6 by hand — including a second run where the mocked/
      live ATS response changes, confirming the mark updates without disturbing the prior evaluation.
      **Superseded by 005 cases** (006 T020, 2026-09-14): `flapping: post-flip scratch passes
      flipped expectations, fails default ones` and `verify-signal: self-configure scenarios, then
      assert ground truth` / `mapping + non-ATS short-circuit` (`tests/harness/regression-cases/`,
      `tests/harness/worker-cases/`) cover the mark-flip-without-disturbing-evaluation assertion
      structurally. The genuinely **live** ATS call (real `https://` posting) still needs a human
      session per `intake.md` F1 / 005 research.md R8 — the isolated harness cannot reach it.

**Checkpoint**: Only genuinely open (or unverifiable) roles get scored; closed roles are excluded and
reported — all four user stories now compose into one coherent run

---

## Phase 5: User Story 3 — Reconcile application state on every evaluation (Priority: P3)

**Goal**: Every evaluation states where the user actually stands with the role — never inferring
`not_applied` from silence.

**Independent Test**: Provide Job Records with no tracker match (tracker file present), a
`submitted` match, a conflicting-evidence match, and a run with no tracker file at all; confirm each
resolves to the correct distinct `ApplicationStateValue`.

- [X] T034 [US3] Read `inputs/applications.md` via `hyppo-read`, reusing feature 001's tolerant
      parsing; distinguish "file missing entirely" from "file present with zero/no matching rows"
      (research.md R3)
- [X] T035 [US3] Application-state reconciliation (folded into the `hyppo-score` call's scope, T018):
      no match + tracker file exists ⇒ `not_applied`; no tracker file at all ⇒ `unknown`; a match ⇒
      the tracker's specific state (`application_prepared`/`submitted`/`existing_application`/
      `withdrawn`/`rejected`); conflicting evidence (e.g. company matches, role doesn't) ⇒
      `ambiguous` with a note (FR-007/FR-007a)
- [X] T036 [US3] Migrate the Job Record on write (via `hyppo-readwrite`): replace the old
      `alreadyApplied` boolean with the computed `applicationState`, keep `appliedEntryRef` unchanged
      (research.md R9, `contracts/job-record-amendments.md`) — no dual-write, clean replacement
- [X] T037 [US3] Mirror `applicationState` onto the FitEvaluation front matter at scoring time
      (`contracts/evaluation-format.md`)
- [ ] T038 [US3] Manual validation: run over the `applications.md` fixture rows (T005); verify
      quickstart scenario 7 by hand, including the no-tracker-file case defaulting to `unknown`.
      **Superseded by 005 cases** (006 T020, 2026-09-14): `applications-presence: tracker parses
      with a submitted match row` and `applications-presence: missing file forces unknown in code,
      not in the model` (`tests/harness/worker-cases/applications-presence.test.mjs`) assert exactly
      this, structurally, on every run.

**Checkpoint**: Every evaluation carries a real, reconciled application status

---

## Phase 6: User Story 4 — Consistent named outcomes for anything that isn't a clean result (Priority: P4)

**Goal**: Every non-clean condition uses this feature's fixed vocabulary, never free text.

**Independent Test**: Force each of the four named outcomes; confirm the run summary and provenance
log use exactly the vocabulary name in every case.

- [X] T039 [US4] Confirm T010's run-start gate reports `config.evidence-unavailable` (not free text)
      for every FR-000-class failure — empty/missing evidence file, malformed `hardConstraints`,
      empty `streams`, missing `recencyWindowYears` (SC-012)
- [X] T040 [US4] Tag `open.unresolved` on any Job Record's evaluation whose `openStatus` is
      `unresolvable` at scoring time (T031) — the outcome name on the evaluation, `unresolvable` the
      underlying mark on the Job Record; keep the two aligned per data-model.md
- [X] T041 [US4] Tag `score.insufficient-input` for a kept, verified Job Record too sparse to build a
      requirement table from (missing role title, requirements, or company) — still write an
      evaluation file per SC-001, with an empty `requirementTable` and `overallVerdict: null`, rather
      than skipping the record silently
- [X] T042 [US4] Tag `state.ambiguous-match` alongside the `ambiguous` `ApplicationStateValue` from
      T035 (FR-008's fourth vocabulary entry)
- [X] T043 [US4] Populate `RunSummary.namedOutcomeCounts`; review every non-clean code path in the
      script and confirm each sets one of exactly these four values (plus feature 001's existing
      vocabulary for anything upstream) — no ad hoc string ever reaches the summary or provenance log
- [ ] T044 [US4] Manual validation: force each of the four outcomes against fixtures (delete an
      evidence file, truncate a Job Record's requirements, remove `recencyWindowYears`, engineer a
      conflicting tracker match); verify quickstart scenario 8 by hand — grep the run summary and
      `provenance-log.md` for any outcome text outside `data-model.md`'s `NamedOutcome` enumeration.
      **NOT superseded** (006 T020, 2026-09-14): no 005 harness case forces or asserts the
      named-outcome vocabulary end-to-end (checked — zero hits for `namedOutcome`/`NamedOutcome`
      under `tests/harness/`). This still needs a human session run; candidate for a future 005/006
      follow-up case, out of scope here per FR-004 (no fix without a failing case).

**Checkpoint**: All four stories functional end-to-end as one workflow run

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T045 [P] Run-summary rendering: write/extend `${args.dataDir}/outputs/last-run-summary.md`
      with every field from data-model.md's `RunSummary`, and `log()` a human-readable rendering
- [X] T046 [P] Create the committed, fabricated-persona settings + evidence template (FR-000a) —
      e.g. `docs/settings.template.json` plus `docs/evidence-template/career-history.md` /
      `cv-content.md` — covering every section feature 001 and this feature read, so a new data
      directory can be bootstrapped by copying and editing (SC-013)
- [X] T047 Constitution audit — Principles I, II, IV: confirm `fit-screen.js`'s two `phase()` markers
      are the only control-flow decision points, `hyppo-verify` is `model: "haiku"` with `tools:
      WebFetch` only, `hyppo-score` is the one mid-tier call with `tools: Read, Glob` only and no
      `Write`, and no `agent()` call in this script can take an outward-facing action
- [X] T048 Constitution audit — Principle V: confirm every write in this feature is under
      `args.dataDir`, a provenance line exists for every open-status **change**, every Fit
      Evaluation write, and every `applicationState` value recorded, and that the external Golden
      Calibration Set is never read by the script itself (it's a human-only rubric-tuning reference,
      per spec Assumptions)
- [X] T049 Idempotency-shaped check (SC-009): run `fit-screen.js` twice over an unchanged data dir
      with a stable ATS response; confirm zero evaluation-content changes, zero changed
      `applicationState` values, and zero *new* provenance lines for records whose `openStatus`
      didn't change on the second run (verify's re-check itself is expected to run again — FR-002c
      — only the write must be a no-op). Covered by 005's `idempotency-unchanged-rerun` harness case
      (green since 006 T004/T009, `66c8e32`) — the fingerprint skip in `fit-screen.js:570-571`
      structurally proves this on every harness run; no separate manual double-run needed.
- [ ] T050 Throughput smoke (SC-014): run over ~100 non-terminal Job Records with the reused
      `HYPPO_PACING_MS`; confirm wall-clock < 30 minutes and a complete summary
- [X] T051 [P] Save the workflow as a project command via `/workflows` → `s`; update
      `quickstart.md` Phase A if the invocation name differs from `/fit-screen`
- [X] T052 [P] Add a docs note (mirroring feature 001's `docs/pipeline.md`) that verify→score is live
      as a second dynamic workflow, linking `specs/004-retrieval-fit-screen-rework/`
- [ ] T053 Phase A exit review: walk plan.md § Phasing exit criteria; record in plan.md's Phasing
      table the decision between **B1** (wrap `fit-screen.js` via the Agent SDK `Workflow` tool) and
      **B2** (full TypeScript `pipeline/verify.ts` + `pipeline/score.ts`), with the reason

---

## Deferred: Phase B (separate slice — gated on T053)

Not enumerated as tasks here. When T053 chooses a path, re-run `/speckit-tasks` for the Phase B
slice. It will involve, roughly:

- Add `pipeline/verify.ts` + `pipeline/score.ts` beside feature 001's `pipeline/{collect,triage,
  normalize}.ts`, and `store/evaluation.ts` as the sole writer for `outputs/evaluations/**`
- `model/judge.ts`'s tier map gains `mid`; `verify.ts` reuses `collect.ts`'s pacing helper
- Fixture-backed fakes for the ATS fetch and the mid-tier judge; `vitest` covering quickstart
  scenarios 1–11 plus a dedicated FR-002c re-check-cadence assertion (distinct from feature 001's
  stricter idempotency)
- A labelled eval set to **measure** SC-003/SC-005/SC-006/SC-008's percentage targets — spot-checked
  only in Phase A, and never against the external Golden Calibration Set (spec Assumptions)

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: after Setup — blocks all user story phases
- **US1 (Phase 3)**: after Foundational — MVP, scores every kept Job Record with no open-status gate
- **US2 (Phase 4)**: after Foundational and US1 — T031 narrows the `score` phase T017 introduced
- **US3 (Phase 5)**: after US1 (extends the same `hyppo-score` call and its persistence step);
  independent of US2
- **US4 (Phase 6)**: after US1/US2/US3 — names the outcomes those stories' failure paths already
  produce; adds no new decision logic of its own
- **Polish (Phase 7)**: after the user story phases you intend to ship
- **Phase B**: after T053

### Within a phase

- The workflow script is one file — tasks that edit `.claude/workflows/fit-screen.js` run in listed
  order
- Fixture, agent-def, and doc tasks (`[P]`) can run anytime after Setup starts

### Cross-story note

US2 (P2) has a small, deliberate dependency on US1 (P1): the open-status gate is wired into the
`score` phase US1 built. US1 remains independently testable before US2 lands (it just scores every
kept Job Record, unfiltered by open status).

---

## Parallel Opportunities

- **Setup**: T002, T003, T004, T005, T006 in parallel (distinct files)
- **Foundational**: T008 (contract doc) parallel with T007/T009/T010/T011 (script); T012/T013
  (agent defs) parallel with each other and with the script tasks
- **Polish**: T045, T046, T051, T052 in parallel; T047–T050 are review/validation passes
- User story phases are mostly sequential within themselves (one script file); different people
  could own US3 vs US4 once US1/US2 land

### Parallel example: Setup

```bash
Task: "Extend tests/fixtures/data-dir/inputs/settings.json with the new sections"   # T002
Task: "Create tests/fixtures/data-dir/inputs/evidence/*.md"                          # T003
Task: "Create/extend fixture Job Records for the scoring test matrix"                # T004
Task: "Extend tests/fixtures/data-dir/inputs/applications.md"                        # T005
Task: "Create tests/fixtures/live/job-records/ for the live verify smoke check"       # T006
```

---

## Implementation Strategy

### MVP first (User Story 1 only)

1. Phase 1 Setup → Phase 2 Foundational → Phase 3 US1
2. **STOP and VALIDATE**: run `score` over the fixture Job Records; confirm cited, decision-ready
   evaluations (quickstart scenarios 1–4)
3. This alone delivers the pipeline's actual decision-support value — everything upstream only
   prepared the input

### Incremental delivery

1. Setup + Foundational → skeleton runs as a no-op
2. + US1 → every kept Job Record gets a cited fit evaluation (MVP)
3. + US2 → closed roles excluded from scoring; unresolvable roles flagged
4. + US3 → every evaluation states real application status
5. + US4 → every failure path is named consistently
6. Polish → summary rendering, settings template, constitution audits, idempotency + throughput
   checks
7. T053 exit review → decide Phase B path

### Notes

- `[P]` = different files, no incomplete dependency
- Every implementation task names its file; workflow-body tasks all touch
  `.claude/workflows/fit-screen.js`
- Pass all timestamps via `args` — the workflow clock is frozen for replay determinism, same as
  feature 001
- Commit after each task or logical group
- Stop at any checkpoint to validate a story by hand
