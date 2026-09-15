# Contract: integration-gate expected-output tree

`tests/synthetic/expected/` is the committed known-correct result of running the full
collect→triage→normalize flow over `tests/synthetic/data-dir/`. The gate copies the dataset to a
scratch dir, runs the pipeline, then compares scratch output to this tree.

## Layout

Matches the real `HYPPO_DATA_DIR` paths the pipeline actually reads/writes (not an idealized
shorthand): Job Records live under `outputs/job-records/`, not `outputs/jobs/`; raw records are
nested under `outputs/job-records/raw/`; `provenance-log.md` sits at the data-dir root, not under
`outputs/` (corrected 2026-09-14 — the original illustrative names in this contract and
data-model.md predated the actual implementation paths).

```text
tests/synthetic/expected/
├── outputs/
│   ├── job-records/
│   │   ├── raw/
│   │   │   └── <raw-record>.md         # pre-seeded raw records, WITH their written triage front-matter
│   │   ├── <companyKey>--<titleKey>--<locKey>.md   # one per distinct kept role
│   │   └── companies.md
│   └── last-run-summary.md
└── provenance-log.md                   # data-dir root, not nested under outputs/
```

The whole tree above is compared (both `outputs/` and the root `provenance-log.md`) — including
`outputs/job-records/raw/` (FR-004), because triage decisions are written back onto the raw records'
front-matter and are themselves part of what the gate asserts. Inputs (`inputs/`) are not compared —
they are the dataset's own untouched copy.

## Comparison rules

| File | Rule |
|---|---|
| `job-records/raw/*.md` | exact byte match, including the written `triage:` block (decision, reason, confidence, criteriaHash). |
| `job-records/*.md` (Job Records) | exact byte match. Filename is `<companyKey>--<titleKey>--<locKey>.md` — a wobble that renames the file is a diff (bug 5). Front-matter must include the dedup key, `completeness`, `originalLanguage`, applied status. |
| `job-records/companies.md` | exact byte match. Each display name maps to the key used in filenames and dedup. |
| `last-run-summary.md` | exact byte match. Counts are fixed and hand-derived: `newJobRecords`, `duplicatesMerged` (= 1 for the cross-source pair), and one count per reject bucket. |
| `provenance-log.md` | exact byte match, line order significant. |

Any deviation is reported as a file-level unified diff (FR-004). The set of files must match too — an
extra or missing file under `outputs/` (or the root `provenance-log.md`) is a failure.

## Expected content, derived from the dataset

| Posting | Outcome |
|---|---|
| Role R at source A / Role R at source B (different phrasing) | one merged Job Record; `duplicatesMerged: 1`; `## Sources` lists both |
| Company-suffix wobble case | Job Record filename stable across runs regardless of "Inc/Corp/—" variance |
| Excluded-location posting | reject, bucket = excluded-location |
| No-direction-overlap posting | reject, bucket = direction-mismatch |
| Clearance-required posting | reject, bucket = clearance |
| Non-English posting | kept; `originalLanguage` set |
| No-salary-no-location posting | kept; `completeness: low` |
| Already-applied match | kept; applied status carried, not overwritten |
| Manual-drop file | ignored by collect/triage, left in place |
| `NOTES-*.md` non-posting | ignored, not turned into a Job Record |

`newJobRecords` = kept postings that produced a new file (6). Collect resolves to nothing — no
network (FR-006).

## Idempotency pass (FR-005, feature 001 SC-006)

Second run over the same scratch dir:
- zero new files under `outputs/job-records/`;
- `last-run-summary.md` reports **zero new activity** (`newRawRecords`, `newJobRecords`,
  `duplicatesMerged` all 0) — not literal byte-identity with the first pass's report. The report
  legitimately shows this run's own activity by design (a re-visited-but-already-listed source is a
  true no-op, not a re-logged merge), so its rendered text differs between an active first pass and
  an all-zero second pass even when idempotency holds. Corrected 2026-09-14 after the mock substrate
  surfaced this exact tension — see `docs/eval-reports/0002-…-integration.md` Findings.
- `provenance-log.md` **byte-identical** to after the first run.

## Re-lock

Regenerating this tree is allowed only for: a deliberate pipeline field change (edge case), or a
one-time substrate move (FR-019). Either way it is recorded in the *Findings* section of an eval
report — never a silent commit.
