# Quickstart & Validation: Isolated Test Harness

One-command full cycle, zero live dependencies. Design detail: [plan.md](./plan.md),
[data-model.md](./data-model.md), [contracts/](./contracts).

## Prerequisites

- Node.js ≥ 20, no credentials needed (no model calls are made by the harness itself —
  worker-contract cases invoke the existing workers through the normal session substrate).
- Fixed fixture-service port (see `contracts/fixture-service.md`); nothing else may hold it.

## Run

```bash
npm run harness            # service start → scratch copy → all cases → report → service stop
npm run harness -- --case=verify-signal   # single case by name (debug use; CI runs all)
```

Expected outcome: every case `pass` except `idempotency-unchanged-rerun`, which reports
`expected-red (T024 → 006)`. Exit code `0`.

## Validation scenarios (map to spec stories)

1. **Full flow, isolated (US1)**: `npm run harness`. Confirm all 6 scoring fixtures reach the
   verdicts in `contracts/expected-matrix.md`, the summary counts match, and the isolation proof
   shows zero non-loopback targets.
2. **Per-worker contracts (US2)**: break one worker's fixture (e.g. point the settings reader at
   tricky paths) and run that single case — it fails alone while all others stay green.
3. **Service scenarios (US3)**: POST a `flapping` flip between two runs; confirm the mark updates
   without disturbing the prior evaluation. Stop the service and confirm dependent cases fail fast
   with "fixture service unreachable".
4. **Regression traceability (US4)**: reintroduce each historical fault from spec.md's table in
   isolation (strip `inputs/` prefix; batch two evidence reads; transcribe instead of passthrough;
   drop on audit rejection; re-score unconditionally) and confirm exactly its case turns red with
   the historical symptom.
5. **Idempotency expected-red**: run twice unchanged; confirm the case fails pointing at 006 and
   the overall exit code still reflects only unexpected failures per
   `contracts/harness-report.md`.

## Setup for a new machine

Copy nothing by hand: the runner builds the scratch dir from the committed
`tests/fixtures/data-dir/` every run. The only local state is the port (must be free) and the
`ATS_API_BASE_OVERRIDES` map the runner generates pointing at the started service.
