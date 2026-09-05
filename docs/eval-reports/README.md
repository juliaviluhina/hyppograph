# Eval reports — index & spend ledger

One row per eval run. Each row links to a dated report file in this directory
(`NNNN-YYYY-MM-DD-<scope>.md`) written by the harness as its final step (FR-011, SC-009).

## How to read this

- `NNNN` — zero-padded 4-digit sequence, monotonic across **all** scopes (never reused,
  never reordered).
- `date` — the run date (`YYYY-MM-DD`).
- `scope` — `component` | `eval-<subtask>` | `integration` | `integration-idem` | `live-smoke`.
- `result` — `pass (n/n)` | `fail (k/n)` | `partial (ceiling)`.
- `cost` — `$0` for the free layers (`component`, and any `workflow-tool` substrate run,
  which is subscription-billed); the **measured** dollar figure for `metered` runs.
- `commit` — the repo commit the run was taken at.

This table doubles as the spend ledger: the metered rows sum to a total that matches the
account's recorded spend for the same runs within 10% or $1, whichever is larger (SC-008 / D11).

## Ledger

| NNNN | date | scope | result | cost | commit |
|------|------|-------|--------|------|--------|
