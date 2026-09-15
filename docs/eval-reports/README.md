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
As of this writing every row is `$0` — no metered run has occurred (see "The single spend decision
point" below).

## The committed expected-output tree's re-lock policy

`tests/synthetic/expected/` (the integration gate's known-correct output) is regenerated only for:
one of the 5 known failure-mode fixture postings changing, or a deliberate pipeline field change
(edge case), or a **one-time substrate move** — switching the model-backed layers between
`workflow-tool` and `metered` (FR-019). Each re-lock is a logged step in that run's eval report
*Findings* section, naming what changed and why — never a silent commit that just happens to touch
`tests/synthetic/expected/`. If you see that path changed in a diff with no Findings entry
explaining it, treat that as a red flag, not routine fixture maintenance.

## The single spend decision point (FR-020)

Everything through Phase 7 of this feature (`component`, `integration`, all four per-component
layers) runs on the `workflow-tool` substrate (Claude Code's subscription, effectively $0 to the
user) or the `mock` substrate (zero cost, zero network). The **one** point where this feature
commits to spending real, metered money is building the standalone `@anthropic-ai/claude-agent-sdk`
substrate (task T049) — gated on the user's explicit go-ahead, and only after every free layer is
green. Until that approval, `--substrate metered` refuses to run for any layer (exit 2, naming the
FR-023 milestone) — there is no code path that can spend without it.

## Ledger

| NNNN | date | scope | result | cost | commit |
|------|------|-------|--------|------|--------|
| 0001 | 2026-09-14 | component | pass (37/37) | $0 | 280be5b |
| 0002 | 2026-09-14 | integration | pass (2/2) | $0 | cadc28f |
| 0003 | 2026-09-14 | component | pass (57/57) | $0 | 807779a |
| 0004 | 2026-09-15 | eval-enumerate, eval-pre-triage, eval-extraction, eval-source-list | pass (10/10) | $0 | f783486 |
| 0005 | 2026-09-15 | component | pass (57/57) | $0 | e09328e |
| 0006 | 2026-09-15 | integration | pass (2/2) | $0 | e09328e |
| 0007 | 2026-09-15 | eval-enumerate | pass (2/2) | $0 | e09328e |
| 0008 | 2026-09-15 | eval-pre-triage | pass (3/3) | $0 | e09328e |
| 0009 | 2026-09-15 | eval-extraction | pass (2/2) | $0 | e09328e |
| 0010 | 2026-09-15 | integration | pass (2/2) | $0 | c10f2a3 |
