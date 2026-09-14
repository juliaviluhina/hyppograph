# Contract: Harness Report

## Report format (`tests/harness/last-report.md` + stdout)

Per case, one line: case name, traced historical run (regression cases only), verdict —
`pass`, `expected-red (T024 → 006)`, or `unexpected-red` with the failure symptom. Followed by the
isolation proof: count of ATS calls found in the service access log vs. expected, and the count of
observed non-loopback targets (must be zero).

## Exit-code rule

- `0` iff every case is `pass`, except the single allowed `expected-red` (T024 idempotency).
- Non-zero iff any `unexpected-red` exists — including any non-loopback target observed, or any
  second case claiming `expected-red` status.
- `expected-red` requires no flag: the runner knows exactly one case ID with that status. Any
  mechanism to widen it needs a spec amendment, not a CLI option.
