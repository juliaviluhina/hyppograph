---
description: "Task list — Phase A prototype for Intake & Normalize Pipeline Steps"
---

# Tasks: Intake & Normalize Pipeline Steps — Phase A (dynamic-workflow prototype)

**Input**: Design documents from `specs/001-intake-normalize-pipeline/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Scope**: This file covers **Phase A only** — the Claude Code dynamic-workflow prototype
(`.claude/workflows/intake-normalize.js`). Phase B (Agent SDK port) is a separate slice, gated on the
Phase A exit review (T047). See plan.md § Phasing.

**Tests**: Phase A validation is **manual** — the quickstart scenarios run by hand inside a Claude
Code session. No automated test tasks in this phase (spec did not request TDD; automated `vitest`
coverage is Phase B).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 = collect, US2 = normalize, US3 = pre-triage, US4 = dedup/canonicalise
- Most implementation tasks edit the single file `.claude/workflows/intake-normalize.js`, so they are
  sequential; `[P]` appears mainly on fixtures and docs.

## Path Conventions

- Workflow script: `.claude/workflows/intake-normalize.js` (repo root)
- Project MCP config: `.mcp.json` (repo root) — Claude Code project scope
- Fixtures: `tests/fixtures/data-dir/` (synthetic, incl. a hand-written `inputs/settings.json`), `tests/fixtures/live/` (a small real `settings.json`)
- Contract docs: `specs/001-intake-normalize-pipeline/contracts/`; settings-store schema: `specs/002-onboarding-settings/contracts/settings-store.md`
- Runtime data: the user-configured `HYPPO_DATA_DIR`, entirely outside this repo

## Dependency

Configuration (tracked boards, hard stops, considered directions) is read from
`HYPPO_DATA_DIR/inputs/settings.json`, produced by **feature 002 (onboarding & settings stage)**. A
real run needs `completeness.setupReady: true`; fixtures supply a hand-written store. `applications.md`
and the `manual-postings/` drop remain hand-authored files.

---

## Phase 1: Setup

**Purpose**: Skeleton workflow, fixtures, and session configuration

- [ ] T001 Create `.claude/workflows/intake-normalize.js` skeleton: `export const meta` first (`name: "intake-normalize"`, `description`, `phases: ["collect","triage","normalize"]`), empty body that reads `args.runTimestamp` and `args.dataDir` and `log()`s them (the workflow clock is frozen — all timestamps come from `args`)
- [ ] T002 [P] Create fixture inputs tree under `tests/fixtures/data-dir/inputs/`: a hand-written `settings.json` (per `specs/002-onboarding-settings/contracts/settings-store.md`) with `completeness.setupReady: true`, `trackedBoards` = 2 valid entries + 1 with an empty `filteredSearch`, `hardStops` = excluded locations + a lacked clearance, `directions` = 2 entries; `applications.md` (1 entry that will match a fixture posting); `manual-postings/` (1 real posting `.md` + 1 non-posting file). Also a second fixture `settings.json` with `completeness.setupReady: false` for the precondition test.
- [ ] T003 [P] Create fixture pre-made Raw Records under `tests/fixtures/data-dir/outputs/job-records/raw/` (front-matter `id/sourceName/sourceRef/firstSeenAt/retrievalMethod/run/availability` + verbatim body, `triage: null`), one per scenario: excluded-location, lacked-clearance, no-direction-overlap, two plausible matches, one deliberately ambiguous, no-salary/no-location, non-English, "see our careers site", same-role-from-two-boards (x2), `Acme` / `Acme Inc.` company variants, same-title-different-location
- [ ] T004 [P] Create `.mcp.json` at the repo root (Claude Code project scope) configuring the `hyppovisor` MCP server (`type: "http"`, `url`/`Authorization` via `${ENV}` expansion — no literal tokens) and record in `specs/001-intake-normalize-pipeline/contracts/hyppovisor-page-read.md` the exact read/navigation tool names to allow-list once confirmed against HyppoVisor's published contract
- [ ] T005 [P] Create `.env.example` at repo root with `HYPPO_DATA_DIR`, `HYPPO_VISOR_MCP_URL`, `HYPPO_VISOR_MCP_TOKEN`, `HYPPO_MODEL_FAST`, `HYPPO_PACING_MS`, `HYPPO_FETCH_CAP`, `HYPPO_DEFAULT_DEPTH`
- [ ] T006 [P] Create `tests/fixtures/live/settings.json` with `setupReady: true` and one real filtered board search at `depth: 5` for the live collect check; add a short README note that the real `HYPPO_DATA_DIR` is never in this repo

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared scaffolding in the workflow script that every user story phase builds on

**⚠️ CRITICAL**: No user story phase can be exercised until this phase is complete

- [ ] T007 In `.claude/workflows/intake-normalize.js`, define the four `agent()` JSON schemas as top-level `const`s: `collectResultSchema` (posting refs), `triageMarkSchema` (decision/reason/confidence), `jobRecordFieldsSchema` (the fixed field set, every key required, `"unknown"` allowed), `dedupGroupSchema` (canonical company + key)
- [ ] T008 [P] Write `specs/001-intake-normalize-pipeline/contracts/schemas.md` documenting those four schemas and which `agent()` call uses each
- [ ] T009 In the script, implement inline helpers: `provenanceLine(entry)` formatted per `contracts/outputs-format.md`, and a `RunSummary` accumulator object matching data-model.md (`postingsCollected`, `newRawRecords`, `triageKept/Rejected`, `triageRejectReasons`, `triageLowConfidence`, `newJobRecords`, `duplicatesMerged`, `sourcesFailed`, `itemsSkipped`, `noTriageCriteria`)
- [ ] T010 In the script body, implement the code-only orchestrator: first load `${args.dataDir}/inputs/settings.json` — if it is missing/unreadable or `completeness.setupReady !== true`, `log()` `completeness.unresolved` and exit with zero writes (FR-000); otherwise `phase("collect")` → `phase("triage")` → `phase("normalize")` in that fixed order, threading `args.runTimestamp` as the run id and `args.dataDir` as the root, then `log()` the assembled `RunSummary`. The script alone sequences phases and stages — no `agent()` result may redirect control flow (Principle I).
- [ ] T011 In the script, define a shared subagent policy applied on every `agent()` call: (a) **tools** — collect subagents get only `["mcp__hyppovisor__<read>", "Write"]`, triage and normalize subagents get only `["Read", "Write"]`; no subagent gets `Edit`, `Bash`, or any submit/send capability (Principle IV). (b) **scope** — each `agent()` prompt is one bounded action (fetch this posting; classify this record; extract this posting) with no discretion over pipeline flow (Principle I). (c) **paths** — every write is `args.dataDir` + a relative path; `inputs/` (`settings.json`, `applications.md`, `manual-postings/`) is opened read-only and never copied outside `args.dataDir` (Principle V, FR-019). (d) **tier** — every `agent()` that makes a judgment names `model` explicitly and it is the lowest tier that fits the task; this feature is fast-tier (`"haiku"`) only, so any non-fast `model` is a policy violation (Principle II). (e) **structured I/O** — each `agent()` receives a bounded structured payload (the specific record text + the specific criteria/params object for that step), never free-form accumulated context, and returns only its declared JSON `schema` (T007); the script, not an `agent()`, carries state between steps (Principle I).

**Checkpoint**: Skeleton runs end-to-end as a no-op with all three phases and prints an empty summary

---

## Phase 3: User Story 1 — Collect raw job postings from tracked sources (Priority: P1) 🎯 MVP

**Goal**: Walk each tracked source's filtered search via HyppoVisor, store every retrieved posting
verbatim with provenance, plus ingest the manual drop.

**Independent Test**: Point `HYPPO_DATA_DIR` at a dir with a small real `settings.json` (`setupReady: true`) + the fixture
`manual-postings/`, run the workflow; confirm each posting from the filtered result sets is a Raw
Record with `sourceRef` + `firstSeenAt` + `retrievalMethod`, one provenance line each, and manual
postings marked `retrievalMethod: "manual"`.

- [ ] T012 [US1] In the `collect` stage: read `sections.trackedBoards.value[]` from `settings.json` into sources (`{ name, filteredSearch, depth }`); an entry with an empty `filteredSearch` or non-positive `depth` becomes `configError`, is skipped, and is added to `RunSummary.sourcesFailed` (FR-001, FR-002a) — per `contracts/inputs-format.md`
- [ ] T013 [US1] In the `collect` stage: `pipeline(sources, …)` — for each ok source, one `agent()` that opens the filtered search through the HyppoVisor read tool and returns up to `depth` posting refs **from the filtered result set** (`collectResultSchema`); zero results ⇒ record 0 for that source and continue (US1 AS-5, FR-002, FR-002b)
- [ ] T014 [US1] In the `collect` stage: for each posting ref, an `agent()` that fetches full readable text via the HyppoVisor read tool and writes a Raw Record to `${args.dataDir}/outputs/job-records/raw/<id-slug>.md` with all FR-005 fields; skip when a Raw Record with that `id` already exists (FR-008); `status: "unavailable"` ⇒ store front-matter only, empty body (edge case)
- [ ] T015 [US1] Add pacing: await `HYPPO_PACING_MS` (default 3000) between posting fetches per source, and stop a source once `HYPPO_FETCH_CAP` (default 300) fetches this run is reached (FR-006a); drive elapsed/counts from values threaded through `args`/stage state, not `Date.now()`
- [ ] T016 [US1] Ingest `${args.dataDir}/inputs/manual-postings/*` as Raw Records with `retrievalMethod: "manual"` and `sourceRef` = file path; a file that isn't a job posting is skipped and added to `RunSummary.itemsSkipped` with a reason (FR-003, edge case)
- [ ] T017 [US1] Per-source failure isolation: a source whose `agent()` throws is caught, added to `RunSummary.sourcesFailed` with the reason and to the provenance log; the run continues with other sources and exits 0 (FR-006)
- [ ] T018 [US1] Append a provenance line per stored Raw Record; increment `postingsCollected` and `newRawRecords` (FR-007, FR-020)
- [ ] T019 [US1] Manual validation: run quickstart Phase A against `tests/fixtures/live/settings.json` (real HyppoVisor) + fixture `manual-postings/`; verify quickstart scenarios 1, 2, 3, the source-failure / zero-result checks, and the `setupReady: false` precondition exit (FR-000) by hand

**Checkpoint**: A run produces a correct, attributed Raw Record archive from real boards — MVP

---

## Phase 4: User Story 2 — Normalize raw postings into consistent Job Records (Priority: P2)

**Goal**: Convert Raw Records into Job Records — one Markdown file each, structured front-matter for
the fixed field set + readable body, unstated fields `"unknown"`.

**Independent Test**: With `HYPPO_DATA_DIR=tests/fixtures/data-dir`, run the normalize stage over the
pre-made Raw Records; every Job Record exposes every fixed-field key (value or `"unknown"`),
requirements are discrete list items, and each links back to its Raw Record.

- [ ] T020 [US2] Add the `normalize` stage: `pipeline(rawRecords, …)` over Raw Records — in this phase over **all** stored Raw Records (US3 will narrow this to `kept` only)
- [ ] T021 [US2] Normalize `agent()` with `model: "haiku"` (fast tier) + `jobRecordFieldsSchema`: extract the fixed field set; a field the source does not state ⇒ `"unknown"`, never inferred or converted (FR-009, FR-010); requirements emitted as discrete items (FR-011); fields in English with `originalLanguage` set when the source posting isn't English (FR-013)
- [ ] T022 [US2] Write the Job Record to `${args.dataDir}/outputs/job-records/<key-slug>.md` — front-matter = the fixed field set, body = responsibilities prose + requirements list + a link to each linked Raw Record — per `contracts/outputs-format.md` (FR-009a, FR-012)
- [ ] T023 [US2] Set `completeness: "low"` when ≥ 60% of the fixed-field values are `"unknown"`, or when role title / canonical company / requirements is unknown or empty (FR-017); handle the "see our careers site" fixture
- [ ] T024 [US2] Idempotency: an unchanged Raw Record already normalized ⇒ leave the existing Job Record untouched (FR-008, US2 AS-4); append a provenance line per created/updated Job Record; increment `newJobRecords`
- [ ] T025 [US2] Manual validation: run the normalize stage over the fixture pre-made Raw Records; verify quickstart scenario 6 by hand (all fixed-field keys present or `"unknown"`; no-salary/no-location ⇒ `"unknown"`; non-English handled; "careers site" ⇒ `completeness: "low"`)

**Checkpoint**: Raw Records (all of them, for now) normalise into comparable Job Records

---

## Phase 5: User Story 3 — Pre-triage stored postings before normalization (Priority: P3)

**Goal**: A cheap keep/reject mark on each Raw Record before normalize, so normalization only runs on
plausible postings. High-recall gate — hard stops + coarse direction overlap only.

**Independent Test**: Run triage + normalize over fixture Raw Records (excluded-location,
lacked-clearance, no-direction, two plausible, one ambiguous); the first three are `rejected` with
reasons, the plausible two are `kept`, the ambiguous one is `kept` + low-confidence, and only `kept`
records get Job Records.

- [ ] T026 [US3] Read `sections.hardStops.value` from `settings.json` into `{ excludedLocations, lackedClearances, lackedWorkAuth, visaSponsorshipRequired }`; effective excluded locations = `excludedLocations ∪ sections.locations.value.excluded`; all empty + flag false ⇒ no hard stops (FR-008b) — per `contracts/inputs-format.md`
- [ ] T027 [US3] Read `sections.directions.value[]` from `settings.json` into `{ name, description }[]` (ignore `materialsPath`); empty ⇒ no directions (FR-008d)
- [ ] T028 [US3] Add the `triage` stage before `normalize`: `pipeline(rawRecords, …)` — one `agent()` per Raw Record with `model: "haiku"` + `triageMarkSchema` deciding `kept`/`rejected` + one-line reason against the hard stops and direction overlap (FR-008a, FR-008b); cannot classify confidently ⇒ `kept`, `confidence: "low"` (FR-008c)
- [ ] T029 [US3] Write the mark onto the Raw Record front-matter (`triage: { decision, reason, confidence, criteriaHash, decidedAt }` per data-model.md) where `criteriaHash` covers (hard stops + directions + raw text); recompute a mark only when the hash differs from the stored one (FR-008, R6). Never edit the Raw Record body.
- [ ] T030 [US3] `noTriageCriteria` branch: no hard stops AND no directions ⇒ every Raw Record `kept` and `RunSummary.noTriageCriteria = true` (FR-008d)
- [ ] T031 [US3] Narrow the `normalize` stage (T020): `pipeline` over only Raw Records with `triage.decision === "kept"`; `rejected` records stay in the archive with their reason and remain eligible for re-triage on a later run (FR-008e)
- [ ] T032 [US3] Append a provenance line per triage mark; populate `RunSummary.triageKept` / `triageRejected` / `triageRejectReasons` (breakdown) / `triageLowConfidence` (FR-007, FR-020)
- [ ] T033 [US3] Manual validation: run triage + normalize over the fixture Raw Records; verify quickstart scenarios 4 and 5 by hand. SC-006a's ≥85% / ≤2% targets are **spot-checked** on the labelled fixtures here; statistical measurement is Phase B.

**Checkpoint**: Normalize budget is spent only on kept postings; rejects are archived with reasons

---

## Phase 6: User Story 4 — Deduplicate and canonicalise across sources (Priority: P4)

**Goal**: One Job Record per real role — company-name variants resolved, cross-source duplicates
merged in place, already-applied roles linked.

**Independent Test**: Feed the same role from two boards + `Acme` / `Acme Inc.` variants + one role
matching `applications.md`; result is one Job Record listing both sources, `canonicalCompany: "Acme"`,
`alreadyApplied: true`; a same-title-different-location fixture stays separate.

- [ ] T034 [US4] Company canonicalisation: read/build `${args.dataDir}/outputs/job-records/companies.md`, seeded from `inputs/applications.md` and existing Job Records; an `agent()` (`model: "haiku"`, `dedupGroupSchema`) resolves each observed name to one canonical form (FR-014)
- [ ] T035 [US4] Compute the Job Record identity key during normalize: slug of `{ canonicalCompany, normalizedTitle, overlapping location set }` (FR-015)
- [ ] T036 [US4] Merge-in-place: when a posting's key matches an existing Job Record, append its `SourceLink` to `sources`, fill any `"unknown"` field from the new source, never overwrite a stated value (FR-015, FR-010); increment `duplicatesMerged`
- [ ] T037 [US4] Applications link: when the canonical company + role match an `applications.md` entry, set `appliedEntryRef` and `alreadyApplied: true` (FR-016)
- [ ] T038 [US4] Keep same-title-but-different-location postings as separate Job Records (US4 AS-4)
- [ ] T039 [US4] Manual validation: run over the dedup fixtures; verify quickstart scenario 7 by hand. SC-007's ≥90% merge / ≤2% wrong-merge targets are **spot-checked** on the fixtures here; statistical measurement is Phase B.

**Checkpoint**: All four stories functional end-to-end as one workflow run

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T040 [P] Run-summary rendering: write `${args.dataDir}/outputs/last-run-summary.md` and `log()` a human-readable summary with every FR-020 count, the reject-reason breakdown, and the "no triage criteria configured" note when applicable
- [ ] T041 Constitution audit — Principles IV, I & II: confirm `.mcp.json` allow-lists only HyppoVisor read/navigation tools, no `agent()` `tools` list contains `Edit`/`Bash`/a submit capability, every `agent()` prompt is single-action with the script owning all sequencing, every judgment `agent()` names the lowest-fitting tier (all `"haiku"` this feature — T011 clause d), and every `agent()` takes a bounded structured payload and returns only its T007 schema (T011 clause e); note the checks in `contracts/hyppovisor-page-read.md`
- [ ] T042 Constitution audit — Principle V: review the workflow for any write path not under `args.dataDir`; confirm a provenance line exists for every Raw Record, every triage mark, and every Job Record create/update (SC-003)
- [ ] T043 Idempotency check (SC-006): run the full workflow twice over `tests/fixtures/data-dir` (pre-made Raw Records, no live MCP); confirm the second run adds 0 Raw Records, changes 0 triage marks, creates 0 Job Records, and leaves `provenance-log.md` unchanged
- [ ] T044 Throughput smoke (SC-009): run the full workflow over a ~100-posting source (live board or expanded fixture) with `HYPPO_PACING_MS=3000`; confirm wall-clock < 30 min and a complete summary
- [ ] T045 [P] Save the workflow as a project command via `/workflows` → `s` → `.claude/workflows/`; update `quickstart.md` Phase A if the invocation name differs from `/intake-normalize`
- [ ] T046 [P] Add `docs/pipeline.md` (or a README section) noting the collect→triage→normalize prototype is live as a dynamic workflow, linking `specs/001-intake-normalize-pipeline/`
- [ ] T047 Phase A exit review: walk plan.md § Phasing exit criteria; record in the plan.md Phasing table the decision between **B1** (keep the script, invoke via the Agent SDK `Workflow` tool) and **B2** (full TypeScript rewrite), with the reason

---

## Deferred: Phase B (separate slice — gated on T047)

Not enumerated as tasks here. When T047 chooses a path, re-run `/speckit-tasks` for the Phase B slice.
It will involve, roughly:

- Scaffold the TypeScript project (`package.json`, `tsconfig`, `vitest.config`), `src/` + `tests/` per plan.md § "Phase B target layout"
- **B1**: `src/index.ts` invoking `intake-normalize.js` through the SDK `Workflow` tool
- **B2**: port each stage to a module (`pipeline/collect|triage|normalize.ts`, `run.ts`), `model/judge.ts` and `mcp/hyppovisor.ts` behind interfaces, `store/` as the sole writer with a `HYPPO_DATA_DIR` path guard
- Fixture-backed fakes for `model/` and `mcp/`; `vitest` unit + integration covering quickstart scenarios 1–9 and the SC-006 re-run assertion; CI gate
- A labelled eval set to **measure** SC-006a (triage recall ≥ 85% / false-reject ≤ 2%) and SC-007 (dedup merge ≥ 90% / wrong-merge ≤ 2%) against their numeric targets — spot-checked only in Phase A

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: after Setup — blocks all user story phases
- **US1 (Phase 3)**: after Foundational
- **US2 (Phase 4)**: after Foundational; independently testable over any Raw Records
- **US3 (Phase 5)**: after Foundational and US2 — T031 narrows the `normalize` pipeline added in T020
- **US4 (Phase 6)**: after US2 — extends normalize with keying/merge; independent of US3
- **Polish (Phase 7)**: after the user story phases you intend to ship
- **Phase B**: after T047

### Within a phase

- The workflow script is one file — tasks that edit `.claude/workflows/intake-normalize.js` run in listed order
- Fixture and doc tasks (`[P]`) can run anytime after Setup starts

### Cross-story note

US3 (P3) has a small, deliberate dependency on US2 (P2): the pre-triage gate is wired into the
`normalize` pipeline stage. US2 remains independently testable before US3 lands (it just normalises
every Raw Record).

---

## Parallel Opportunities

- **Setup**: T002, T003, T004, T005, T006 in parallel (distinct files)
- **Foundational**: T008 (contract doc) parallel with T007/T009/T010/T011 (script)
- **Polish**: T040, T045, T046 in parallel; T041–T044 are review/validation passes
- User story phases are mostly sequential within themselves (one script file); different people could
  own US2 vs US4 once Foundational is done

### Parallel example: Setup

```bash
Task: "Create fixture inputs tree in tests/fixtures/data-dir/inputs/"        # T002
Task: "Create fixture pre-made Raw Records in .../outputs/job-records/raw/"   # T003
Task: "Create .mcp.json (repo root) for the hyppovisor MCP server"           # T004
Task: "Create .env.example at repo root"                                     # T005
Task: "Create tests/fixtures/live/settings.json"                             # T006
```

---

## Implementation Strategy

### MVP first (User Story 1 only)

1. Phase 1 Setup → Phase 2 Foundational → Phase 3 US1
2. **STOP and VALIDATE**: run against a small real `settings.json`; confirm the Raw Record archive +
   provenance + summary (quickstart scenarios 1–3)
3. This alone delivers the "dated archive of everything I was exposed to" value

### Incremental delivery

1. Setup + Foundational → skeleton runs as a no-op
2. + US1 → attributed Raw Record archive (MVP)
3. + US2 → comparable Job Records (normalises everything)
4. + US3 → normalize budget spent only on kept postings; reasoned reject pile
5. + US4 → one Job Record per real role, already-applied linked
6. Polish → summary rendering, constitution audits, idempotency + throughput checks
7. T047 exit review → decide Phase B path

### Notes

- `[P]` = different files, no incomplete dependency
- Every implementation task names its file; workflow-body tasks all touch `.claude/workflows/intake-normalize.js`
- Pass all timestamps via `args` — the workflow clock is frozen for replay determinism
- Commit after each task or logical group
- Stop at any checkpoint to validate a story by hand
