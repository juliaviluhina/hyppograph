# Quickstart & Validation: Fit-Screen Gap Fixes

Proves the fixes with the 005 harness — no new test infrastructure.
Design: [plan.md](./plan.md), [research.md](./research.md), [contracts/](./contracts).

## Prerequisites

- 005 harness green (`npm run harness` → 54 + expected-red T024; after US1 that red
  must be gone — see scenario 1).
- A Claude Code session for the workflow runs (same `--prep` / `--serve` /
  `--assert` rails as 005's quickstart).

## Validation scenarios

### 1. Idempotency green (US1 — the designed red, resolved)

1. `--prep` a scratch dir; session-run the workflow; `--assert` (expect pass except
   transport-`blocked`, scenario 4).
2. Re-run the workflow **unchanged** against the same scratch dir; `--assert` again.
3. Expect: every evaluation file byte-identical, zero new provenance lines for
   unchanged marks, `summary.skippedIdempotent` equals the scored count, second-run
   cost has no mid-tier calls. The harness `idempotency-unchanged-rerun` case is now
   `pass` — remove it from `expected-red` handling (it becomes an ordinary green).

### 2. Genuine change re-scores exactly the affected records (US1 counter-case)

1. From scenario 1's scratch, edit one evidence file (one line) and one Job Record.
2. Re-run; `--assert` with updated expectations where the verdict should move.
3. Expect: exactly the affected evaluations rewritten (new fingerprint, provenance
   line each); all others byte-identical. "Never rewrite" is as wrong as "always
   rewrite" — this scenario guards the other side.

### 3. Summary always written (US1/F2)

1. From any run, confirm `outputs/last-run-summary-fit-screen.md` carries the run's
   timestamp and counts matching `--assert`'s file census.
2. Regression: the pre-006 silent-`false` shape (stale summary, numbers only in the
   session log) must never recur — the loud-log branch makes it visible by construction.

### 4. Transport-`blocked` reporting (US2 scoping)

1. Isolated session run → the three `requiresWire` cases report `blocked` with the
   R8 reason; exit code `0`; everything else asserted normally.
2. Live-`https` session run (`--wire live`, figma smoke record in the scratch dir) →
   wire cases asserted for real; `blocked` section empty.

### 5. Throughput smoke (US3/T050)

~100 non-terminal fixture records (duplicate the matrix with renamed keys if needed),
production pacing: wall-clock under 30 minutes with a complete summary (004 SC-014).

### 6. Exit review (US3/T053)

With scenarios 1–5 green, record B1 vs B2 + reason in 004 plan.md's phasing table.
That decision also answers the automation question (SDK port ⇒ headless harness).
