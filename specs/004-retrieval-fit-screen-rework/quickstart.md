# Quickstart & Validation: Retrieval Verification & Fit-Screen Rework

How to run the feature and confirm it works end-to-end. Design detail lives in
[plan.md](./plan.md), [data-model.md](./data-model.md), and [contracts/](./contracts).

Two substrates (plan.md § Phasing). The **Phase A** section below is the dynamic-workflow
extension; everything from *Prerequisites* onward is the **Phase B** Agent SDK path. Validation
scenarios apply to both — run them by hand in Phase A, automated in Phase B. This feature never
uses HyppoVisor — no browser step, unlike feature 001's quickstart.

## Phase A — run the workflow extension

1. Point `HYPPO_DATA_DIR` at `tests/fixtures/data-dir/` (or a small real data dir) — **the same one
   feature 001's `intake-normalize.js` already populated**. This feature reads its Job Records.
2. Confirm `inputs/settings.json` carries this feature's three new sections
   (`evidenceBase`, `hardConstraints`, `targetRoles` — contracts/settings-additions.md) and that
   `inputs/evidence/*.md` exist with real (fixture) content.
3. In a Claude Code session, run the workflow: ask Claude to run
   `.claude/workflows/fit-screen.js`, or `/fit-screen` once saved via `/workflows` → `s`. Pass the
   run timestamp via `args` (the workflow clock is frozen, same convention as feature 001).
4. Watch progress in `/workflows` — the two phases are `verify` / `score`. When it finishes, check
   `outputs/evaluations/`, the amended fields on `outputs/job-records/*.md`, `provenance-log.md`,
   and the printed run summary against the scenarios below.
5. Re-run against the unchanged data dir. `score` outputs must be unchanged (scenario 9); `verify`
   is expected to re-run its ATS checks but should reproduce the same marks with no new provenance
   lines (FR-002c/FR-009 — this is the one place this feature is deliberately *not* silent-idempotent
   at the "did work happen" level, only at the "did anything change" level).

## Prerequisites

- Everything feature 001's quickstart requires (Node.js ≥ 20, npm, Anthropic credentials), **except**
  HyppoVisor — this feature makes no browsing calls.
- A data directory already containing feature 001's output (`outputs/job-records/*.md`) — run
  `intake-normalize.js` first, or use the pre-populated `tests/fixtures/data-dir/`.
- `inputs/evidence/*.md` populated (fixture: fabricated persona content, per FR-000a's settings
  template convention).

## Setup

```bash
npm install
cp .env.example .env   # HYPPO_DATA_DIR + model vars; no HyppoVisor vars needed for this feature
```

Key environment variables (extends feature 001's `src/config/index.ts` table):

| Var | Default | Purpose |
|---|---|---|
| `HYPPO_DATA_DIR` | — (required) | Same root as feature 001 |
| `HYPPO_MODEL_MID` | current Sonnet-class alias | Mid-tier model id for `hyppo-score` (this feature's one new tier) |
| `HYPPO_PACING_MS` / `HYPPO_FETCH_CAP` | reused from feature 001 | Governs FR-002d's ATS re-check pacing — no second config (research.md R1-adjacent decision, plan.md Technical Context) |

## Run

```bash
npm run fit-screen            # verify → score, against HYPPO_DATA_DIR's existing Job Records
npm run fit-screen -- --dry   # report which Job Records would be verified/scored, without calling out
```

Exit code is non-zero only on a fatal error (bad config, data dir unwritable) — matching
`config.evidence-unavailable`'s "zero writes" contract. A per-record verification or scoring failure
is reported via a named outcome in the summary, not a crash.

## Validation scenarios

Phase A: run each by hand in a Claude Code session against the fixtures. Phase B: automated with
`npm test` (vitest). Each maps to spec acceptance criteria / success criteria.

**Note on percentage targets**: SC-003, SC-005, SC-006, SC-008 (≥85–90% judgment-quality targets)
are only **spot-checked** on the labelled fixtures in Phase A — same posture as feature 001's
SC-006a/SC-007. Their numeric targets are measured against a labelled eval set in Phase B, and never
against the external Golden Calibration Set (spec Assumptions) — that set stays out of this repo
entirely and is used only for manual rubric calibration, not as a committed test fixture.

### 1. Score a strong match — US1, SC-002, SC-003
Fixture: a kept, `confirmed-open` Job Record whose requirements are fully covered by
`inputs/evidence/career-history.md`. Run `score`. Expect: `outputs/evaluations/<key>.md` with every
`requirementTable` row `Strong` and a citation, `overallVerdict: APPLY`.

### 2. Score a gap — US1, SC-002
Fixture: a Job Record with one requirement the evidence base doesn't support. Expect: that row
`Fails`/`Absent`/`Unknown` (never invented), `overallVerdict: SKIP` (or `APPLY-AND-SEE` only if the
narrow-adjacent-subskill exception fires).

### 3. Hard-constraint failure forces SKIP — US1, SC-004
Fixture: a Job Record whose location is in `hardStops.excludedLocations`, or whose salary is below
`hardConstraints.compFloor`. Expect: the hard-constraint section names the failure,
`overallVerdict: SKIP` regardless of the requirement table.

### 4. Anti-pattern checks fire — US1, SC-005
Three fixtures, one per check: a title implying more seniority than the requirements support; a
required bullet claiming an adjacent-but-different domain; leadership evidence older than
`recencyWindowYears`. Expect: each corresponding `antiPatternFlags` entry, and (for the recency
case) the affected row downgraded one verdict level.

### 5. Confirmed-open vs. confirmed-closed vs. unresolvable — US2, SC-006, SC-007
Three fixture Job Records sourced from Greenhouse/Lever/Ashby URLs with a mocked ATS-API response:
one `found`, one `not_found`, one an unreachable/malformed response; plus one non-ATS-sourced record.
Run `verify`. Expect: `confirmed-open` scored normally; `confirmed-closed` excluded from `score`
entirely (SC-007); `unresolvable` (both the malformed-API and non-ATS cases) scored with the "open
status unverified" flag visible on its evaluation.

### 6. Re-check flips a mark without disturbing the prior evaluation — US2 edge case
Fixture: a Job Record already `confirmed-open` with an existing Fit Evaluation; the mocked ATS
response now returns `not_found`. Run `verify` again. Expect: `openStatus` becomes
`confirmed-closed`, `openStatusReason` records why, the existing evaluation file is untouched, and
`score` skips this record on this run (it's now terminal).

### 7. Application-state reconciliation — US3, SC-008
Four fixture Job Records: no tracker match with a populated tracker (→ `not_applied`), a tracker
match already `submitted` (→ `submitted`), a tracker match with conflicting company/role evidence
(→ `ambiguous`), and a run against a data dir with **no** `applications.md` file at all (→
`unknown` for every record, per the spec Edge Case). Confirm none default to `not_applied` without
the tracker actually existing.

### 8. Named outcomes are always from the fixed vocabulary — US4, SC-010
Force each of `open.unresolved`, `score.insufficient-input`, `config.evidence-unavailable`,
`state.ambiguous-match` (delete `inputs/evidence/` for the last one's cousin case, truncate a Job
Record's requirements for the sparse case). Grep the run summary and `provenance-log.md` for any
outcome text not in `data-model.md`'s `NamedOutcome` enumeration — expect zero matches.

### 9. Idempotent re-run (score) / change-only re-run (verify) — SC-009
Run twice against an unchanged data dir with a mocked ATS response that doesn't change between runs.
Expect: zero new `outputs/evaluations/*.md` content changes, zero changed `applicationState` values,
zero new provenance lines for records whose `openStatus` didn't change (FR-009).

### 10. Config gate makes zero writes — SC-012
Remove `recencyWindowYears` from `targetRoles`. Run the workflow. Expect: it reports the specific
missing field and `outputs/evaluations/` gains no new files.

### 11. Settings template bootstraps a working data dir — SC-013
Copy the committed fabricated-persona settings template (FR-000a) into a fresh scratch data
directory alongside fixture evidence files, without reading `data-model.md` or `contracts/` first.
Run `fit-screen.js --dry`. Expect: it reports a valid plan (no config errors) using only the
template's content.
