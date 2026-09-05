# Contract: integration-gate expected-output tree

`tests/synthetic/expected/` is the committed known-correct result of running the full
collect→triage→normalize flow over `tests/synthetic/data-dir/`. The gate copies the dataset to a
scratch dir, runs the pipeline, then compares scratch output to this tree.

## Layout

```text
tests/synthetic/expected/
└── outputs/
    ├── jobs/
    │   └── <companyKey>-<titleKey>.md      # one per kept posting
    ├── companies.md
    ├── last-run-summary.md
    └── provenance-log.md
```

Only `outputs/` is compared. Inputs and `raw/` in scratch are expected to equal the dataset's own
copies (the idempotency pass re-checks that).

## Comparison rules

| File | Rule |
|---|---|
| `jobs/*.md` | exact byte match. Filename is `<companyKey>-<titleKey>.md` — a wobble that renames the file is a diff (bug 5). Front-matter must include the dedup key, `completeness`, `originalLanguage`, applied status. |
| `companies.md` | exact byte match. Each display name maps to the key used in filenames and dedup. |
| `last-run-summary.md` | exact byte match. Counts are fixed and hand-derived: `newJobRecords`, `duplicatesMerged` (= 1 for the cross-source pair), and one count per reject bucket. |
| `provenance-log.md` | exact byte match, line order significant. |

Any deviation is reported as a file-level unified diff (FR-004). The set of files must match too — an
extra or missing file under `outputs/` is a failure.

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
- zero new files under `outputs/jobs/`;
- `last-run-summary.md` unchanged;
- `provenance-log.md` **byte-identical** to after the first run.

## Re-lock

Regenerating this tree is allowed only for: a deliberate pipeline field change (edge case), or a
one-time substrate move (FR-019). Either way it is recorded in the *Findings* section of an eval
report — never a silent commit.
