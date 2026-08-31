# Quickstart & Validation: Intake & Normalize Pipeline Steps

How to run the feature and confirm it works end-to-end. Design detail lives in
[plan.md](./plan.md), [data-model.md](./data-model.md), and [contracts/](./contracts).

Two substrates (plan.md § Phasing). The **Phase A** section below is the dynamic-workflow prototype;
everything from *Prerequisites* onward is the **Phase B** Agent SDK path. Validation scenarios apply to
both — run them by hand in Phase A, automated in Phase B.

## Phase A — run the prototype workflow

1. Configure HyppoVisor as an MCP server in the Claude Code session (`.mcp.json` or session settings),
   allow-listing only its read/navigation tools.
2. Point `HYPPO_DATA_DIR` at `tests/fixtures/data-dir/` (or a small real data dir).
3. In a Claude Code session, run the workflow: `/intake-normalize` (once saved), or ask Claude to run
   `.claude/workflows/intake-normalize.js`. Pass the run timestamp via `args` (the workflow clock is
   frozen).
4. Watch progress in `/workflows`; when it finishes, check `outputs/job-records/`, `provenance-log.md`,
   and the printed run summary against the scenarios below.
5. Re-run against the unchanged data dir and confirm nothing new is written (scenario 8, checked by
   hand in this phase).

## Prerequisites

- Node.js ≥ 20, npm
- A data directory following the README's `inputs/` layout — for local validation use
  `tests/fixtures/data-dir/`
- Anthropic credentials on the environment (`ant auth login`, or `ANTHROPIC_API_KEY`)
- For a real run: a reachable HyppoVisor MCP endpoint (`HYPPO_VISOR_MCP_URL` + `HYPPO_VISOR_MCP_TOKEN`).
  For validation runs, the faked page-read client is used instead (see below).

## Setup

```bash
npm install
cp .env.example .env   # set HYPPO_DATA_DIR and, for real runs, HyppoVisor + model vars
```

Key environment variables (defaults in `src/config/index.ts`):

| Var | Default | Purpose |
|---|---|---|
| `HYPPO_DATA_DIR` | — (required) | Root of the inputs/outputs tree |
| `HYPPO_MODEL_FAST` | current Haiku alias | Fast-tier model id (the only tier this feature uses) |
| `HYPPO_PACING_MS` | `3000` | Delay between posting fetches per source |
| `HYPPO_FETCH_CAP` | `300` | Max fetches per run |
| `HYPPO_DEFAULT_DEPTH` | `25` | Depth for a board bullet with no `depth:` |
| `HYPPO_VISOR_MCP_URL` / `_TOKEN` | — | HyppoVisor page-read endpoint (real runs only) |

## Run

```bash
npm run pipeline            # collect → pre-triage → normalize, against HYPPO_DATA_DIR
npm run pipeline -- --dry   # parse inputs and report the plan (sources, depths) without fetching
```

Exit code is non-zero only on a fatal error (bad config, data dir unwritable). A source failure or a
per-record model failure is reported in the summary, not a crash.

## Validation scenarios

Phase A: run each by hand in a Claude Code session against the fixtures. Phase B: automated with
`npm test` (vitest). Each maps to spec acceptance criteria / success criteria.

**Note on percentage targets**: SC-006a (triage recall ≥ 85% / false-reject ≤ 2%) and SC-007 (dedup
merge ≥ 90% / wrong-merge ≤ 2%) are only **spot-checked** on the labelled fixtures in Phase A — the
fixture set is too small to measure a percentage. Their numeric targets are measured against a
labelled eval set in Phase B.

### 1. Collect stores everything from the filtered set — US1, SC-001, SC-002, SC-002a
`tests/integration/collect.spec.ts`: two fixture sources (depth N) + one manual posting, faked
page-read. Assert: ≤ N raw records per source, all from the filtered result set, each with
`sourceRef` + `firstSeenAt` + `retrievalMethod`; one provenance line per raw record; manual posting has
`retrievalMethod: "manual"`.

### 2. Source failure is isolated — US1 AS-4, FR-006
One source's `openFilteredSearch` throws. Assert: other sources still collected, failure in
`RunSummary.sourcesFailed` and provenance, run exit code 0.

### 3. Zero-result source — US1 AS-5, FR-002a
A source whose filtered search returns `[]`. Assert: zero raw records for it, no error, run continues.

### 4. Pre-triage keep/reject — US3 AS-1..5, SC-006a, SC-006b
`tests/integration/triage.spec.ts`: fixture raw records — one excluded-location, one lacked-clearance,
one no-direction-overlap, two plausible — with a faked `judge()` returning recorded decisions. Assert:
first three `rejected` with reasons, last two `kept`; only kept records reach normalize; a
low-confidence fixture is `kept` and counted in `triageLowConfidence`.

### 5. No triage criteria — FR-008d
Fixture data dir with empty `directions/` and no `## Hard stops`. Assert: every raw record `kept`,
`RunSummary.noTriageCriteria === true`.

### 6. Normalize produces the full fixed field set — US2 AS-1..5, SC-004, SC-005
`tests/integration/normalize.spec.ts`: kept raw records from three fixture boards, faked `judge()`.
Assert: one Job Record per role; every front-matter key present (value or `"unknown"`); a no-salary /
no-location fixture yields `"unknown"` (not inferred); a non-English fixture has `originalLanguage`
set and English fields; a "see careers site" fixture is `completeness: "low"`.

### 7. Dedup, canonicalisation, already-applied — US4 AS-1..4, SC-007, SC-008
Same role from two boards + `Acme` / `Acme Inc.` variants + one matching `applications.md`. Assert:
one Job Record file, `sources` has both refs, `canonicalCompany: "Acme"`, `appliedEntryRef` set and
`alreadyApplied: true`; a same-title-different-location fixture stays a separate record.

### 8. Idempotent re-run — SC-006
Run the full pipeline twice over an unchanged fixture data dir (fakes replay). Assert: second run adds
zero raw records, changes zero triage marks, creates zero Job Records; `provenance-log.md` unchanged
after the second run.

### 9. No outward-facing actions — SC-010, FR-018
Static + runtime check: the MCP `allowedTools` list contains only HyppoVisor read/navigation tool
names; no test double ever receives a submit/send/apply call. `tests/unit/allowed-tools.spec.ts`.

### 10. Throughput — SC-009 (smoke, not in CI gate)
`npm run pipeline` against a 100-posting fixture with real `HYPPO_PACING_MS=3000`; assert wall-clock
< 30 min and the summary has every required count.

## Manual end-to-end (real HyppoVisor)

1. Point `HYPPO_DATA_DIR` at a real data dir with a small `boards.md` (one board, `depth: 5`).
2. `npm run pipeline`.
3. Confirm `outputs/job-records/raw/` has ≤ 5 files, `outputs/job-records/` has the normalized
   records, `provenance-log.md` grew, and `outputs/last-run-summary.md` matches what you saw on stdout.
4. Re-run; confirm nothing new is written.
