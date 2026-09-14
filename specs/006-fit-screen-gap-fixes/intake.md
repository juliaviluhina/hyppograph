# 006 Intake — harness state at 005 completion (2026-09-14)

Recorded by 005 T032. This is 006's work queue: every red below owns to 006.

## Expected red (by design)

- `idempotency-unchanged-rerun` (tests/harness/regression-cases/idempotency.test.mjs):
  structural pin `hasIdempotencyGuard()` is false — the score phase never reads the
  existing evaluation before writing, so skip-when-unchanged is unimplemented.
  Runner routes it to `expected-red`; exit code unaffected. Fix = 006 US1.

## Unexpected reds

None. `npm run harness`: 53 pass + 1 expected-red, exit 0.

## Notes for 006 implementers

- The idempotency fix must preserve the `summary:no-eval-on-closed` exemption rule
  (support/assert.mjs): post-flip closed records legitimately carry their run-1
  evaluation. "Never write on closed" would break the flapping case.
- If the fix renames/restructures the score phase, update the `hasIdempotencyGuard`
  pin in support/structure.mjs — the test asserts the prerequisite (existing-
  evaluation read), not any particular implementation.
- Session halves still pending (need a Claude Code run): T013 full session flow,
  T020 worker agreement, T021 live two-run flip, T033/T038/T044 manual validations.
  Their rails (`--prep` / `--serve` / `--assert`) are implemented and smoke-tested.
