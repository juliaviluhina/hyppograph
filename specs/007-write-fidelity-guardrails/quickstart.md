# Quickstart: Validating Write-Fidelity Guardrails (007)

## Prerequisites

- Node 20+ (repo tested on v26.8.1), `claude` CLI on `PATH`, repo dependencies installed.
- 005's committed fixture at `tests/fixtures/data-dir/` present (already in repo).

## 1. Free tier — structural pin (FR-004)

```sh
npm run harness
```

Expect the new pin (extending `tests/harness/support/structure.mjs`) to pass for all three
in-class call sites (#1/#2/#3) once FR-003's marker fix lands on #2/#3. See
`contracts/verbatim-write.md` for what the pin checks.

**Regression check**: temporarily remove a `BEGIN-CONTENT`/`END-CONTENT` marker pair from one
in-class prompt-builder function and re-run — the pin must fail, naming that call site.

## 2. Tier-2 — atomic fidelity tests (FR-001, FR-003)

```sh
npm run test:fidelity
```

Runs the three atomic tests (audit #1/#2/#3), one real fast-tier `agent()` call each, against a
single throwaway temp file per test — no fixture service, no scratch-copied data dir (spec US1).
Expect all three to pass (SC-003).

**SC-001 regression check** (proves the atomic test — not a full session run — is what catches
F4-class drift): revert audit #1's `BEGIN-CONTENT`/`END-CONTENT` markers, re-run
`npm run test:fidelity`, confirm the corresponding test fails with an actual-vs-expected diff
showing the dropped leading `---`. Restore the markers; confirm it passes again.

## 3. Convention doc (FR-006)

Confirm `specs/007-write-fidelity-guardrails/contracts/verbatim-write.md` exists and is referenced
from both `.claude/workflows/fit-screen.js`'s and `.claude/workflows/intake-normalize.js`'s module
header comments (`grep -n "verbatim-write.md" .claude/workflows/*.js`).

## Full acceptance pass (SC-001–SC-004)

```sh
npm run harness && npm run test:fidelity
```

Both must be green with no scoring/verdict/persistence code touched (FR-005) — diff the branch
against `main` and confirm changes are limited to `.claude/workflows/*.js` prompt text,
`tests/harness/support/structure.mjs`, `tests/fidelity/`, and `specs/007-write-fidelity-guardrails/`.
