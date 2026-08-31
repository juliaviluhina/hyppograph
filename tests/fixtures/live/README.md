# `tests/fixtures/live/`

A **minimal** settings store for the one real HyppoVisor collect check in the Phase A exit criteria
(quickstart.md § "Manual end-to-end", task T019).

## The real data directory is never in this repo

`HYPPO_DATA_DIR` — the folder with the real job search's `inputs/` and `outputs/` — lives entirely
**outside** this repository and is never committed (Constitution Principle V: personal data stays in
the user-pointed folder, not in this repo, logs, or telemetry). This repo contains only synthetic
fixtures.

## How to use it

1. Make a scratch directory somewhere outside the repo, e.g. `~/hyppo-live-check/`.
2. `mkdir -p ~/hyppo-live-check/inputs && cp tests/fixtures/live/settings.json ~/hyppo-live-check/inputs/settings.json`
3. Edit `filteredSearch` in that copy to a board search you are actually logged into via HyppoVisor.
4. Point `HYPPO_DATA_DIR` at `~/hyppo-live-check/` and run the `intake-normalize` workflow.
5. Expect ≤ 5 Raw Records under `outputs/job-records/raw/`, a grown `provenance-log.md`, and a run
   summary. Re-run and confirm nothing new is written.
