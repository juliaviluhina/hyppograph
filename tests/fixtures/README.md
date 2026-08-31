# Test fixtures

Synthetic data only. **The real `HYPPO_DATA_DIR` is never in this repo** — per the constitution
(Principle V) all personal inputs and generated outputs live in a user-pointed folder outside version
control. These fixtures exist purely to exercise the pipeline by hand (Phase A) and in `vitest`
(Phase B).

## Layout

| Path | Purpose |
|---|---|
| `data-dir/inputs/settings.json` | A complete, `setupReady: true` settings store (schema: `specs/002-onboarding-settings/contracts/settings-store.md`). `trackedBoards` deliberately includes one entry with an empty `filteredSearch` to exercise the `configError` skip path (001 FR-002a). |
| `data-dir/inputs/settings.not-ready.json` | `completeness.setupReady: false` — drives the FR-000 precondition test (report `unresolved`, exit with zero writes). Rename to `settings.json` for that scenario. |
| `data-dir/inputs/applications.md` | Hand-authored; one entry that matches a fixture posting (added in T002). |
| `data-dir/inputs/manual-postings/` | Hand-authored drop; one real posting + one non-posting file (added in T002). |
| `data-dir/outputs/job-records/raw/` | Pre-made Raw Records for normalize/triage/dedup scenarios (added in T003). |
| `live/settings.json` | `setupReady: true` with one real filtered board search at `depth: 5`, for the manual live-collect check (quickstart Phase A, T019). |

## Notes

- The fixture store is edited by hand — it stands in for feature 002's onboarding output. Section
  `status` is `"answered"` even where a per-entry value is malformed on purpose; per-entry validation
  is feature 001's job, not the completeness gate's.
- `compensation` / `scoringWeightNotes` are `"skipped"` here to show the optional-section shape;
  feature 001 does not read them.
