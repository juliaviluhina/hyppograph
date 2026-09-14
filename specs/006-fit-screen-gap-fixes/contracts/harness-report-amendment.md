# Contract: Harness Report Amendment (`blocked` verdict)

Amends 005 `contracts/harness-report.md`; all other rules (format, exit code on
`unexpected-red`, single `expected-red`) stand.

## When `blocked` applies

An expectation carrying `requiresWire: true` (the three ATS fixtures:
acme/initech/umbrella) reports `blocked` instead of pass/fail when the run
environment cannot exercise the wire — i.e. an isolated loopback run where
`hyppo-verify` provably cannot reach the service (005 research.md R8). A run that
CAN exercise it (live-`https` session, or a future loopback-capable transport)
asserts those expectations normally.

## Report shape

`blocked` cases list under their own heading with the reason
(`transport: WebFetch upgrades http→https; 005 R8`), e.g.:

- `[~] matrix:acme--backend-engineer--remote-eu — blocked: transport (005 R8)`

Counts: `pass N · blocked M · expected-red K · unexpected-red 0`. Exit code `0`
iff `unexpected-red` is empty — `blocked` never affects it.

## Harness changes (traceable, minimal)

- `support/expectations.mjs`: `requiresWire: true` on the three ATS entries.
- `support/assert.mjs`: derive per-run wire reachability (session runs declare it
  via a `--wire live|isolated` flag, default `isolated`); emit `blocked` with reason
  instead of evaluating those entries when isolated.
- `run.mjs`: render the `blocked` section; TAP/node layer unaffected (no wire there).
