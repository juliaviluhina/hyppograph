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

Two layers (research.md R3/R7): the **node layer** above runs fully automatically (service
behavior, pure-logic mirror + sync-check, support units, fixture honesty, structural pins,
assertion-layer cases with synthetic scratches). The **session layer** runs the real
`fit-screen.js` workflow in a Claude session against a `--prep` scratch dir, then checks it:

```bash
node tests/harness/run.mjs --prep                              # prints dataDir + atsApiBaseOverrides + service cmd
node tests/harness/service.mjs --port 8471 --scenarios tests/harness/scenarios.json --access-log <scratch>/access.jsonl
# ... run fit-screen.js in-session with the printed args ...
node tests/harness/run.mjs --assert --dir <scratch> --access-log <scratch>/access.jsonl
```

Expected outcome: every case `pass` except `idempotency-unchanged-rerun`, which reports
`expected-red (T024 → 006)`. Exit code `0`.

## Validation scenarios (map to spec stories)

Status as of 005 implementation (autonomous mode): node-runnable halves validated (N);
in-session halves pending (S).

1. **Full flow, isolated (US1)**: `npm run harness` (N: assertion layer + synthetic
   scratches green). S: real session run via `--prep`/`--assert` above. Confirm all 6
   scoring fixtures reach the verdicts in `contracts/expected-matrix.md`, the summary
   counts match, and the isolation proof shows zero non-loopback targets.
2. **Per-worker contracts (US2)**: break one worker fixture at a time (N: honesty/
   verbatim/single-read/presence/audit cases green; each fault class covered) — S: prompt
   each worker in-session and confirm the signal/verdicts agree with the node ground truth.
3. **Service scenarios (US3)**: N: flip mechanics + fail-fast + wiring green. S: POST a
   `flapping` flip between two session runs; confirm the mark updates without disturbing
   the prior evaluation. Stop the service and confirm dependent cases fail fast
   with "fixture service unreachable".
4. **Regression traceability (US4)**: N: reintroduce each historical fault from spec.md's
   table in isolation (strip `inputs/` prefix; batch two evidence reads; transcribe instead
   of passthrough; drop on audit rejection; re-score unconditionally) — structural pins +
   gate mirror assert each (fault-sweep + config-gate green). S: confirm the session
   workflow exhibits the historical symptom for each.
5. **Idempotency expected-red**: N: structural red present and routed to expected-red
   (runner shows it, exit 0). S: run twice unchanged in-session; confirm the case fails
   pointing at 006.

## Setup for a new machine

Copy nothing by hand: the runner builds the scratch dir from the committed
`tests/fixtures/data-dir/` every run. The only local state is the port (must be free) and the
`ATS_API_BASE_OVERRIDES` map the runner generates pointing at the started service.
