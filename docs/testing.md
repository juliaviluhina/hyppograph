# Testing approach

Three independent tiers, each catching a different class of defect at the cheapest
layer that can express it — cheapest and fastest first. The split came out of a
concrete post-mortem: five real Phase A bugs were all findable in seconds at a low
tier, but the only instrument available at the time was a full ~25-minute,
~89-`agent()`-call workflow run. Full reasoning and bug history:
[`specs/003-eval-harness/eval-strategy.md`](../specs/003-eval-harness/eval-strategy.md).

| Tier | What it covers | Cost | Command |
|---|---|---|---|
| Pure-code unit tests | Dedup keys, slugging, fingerprints, summary rendering — every helper factored out of the workflows into `.claude/workflows/lib/` | $0, milliseconds | `npm test` |
| Isolated test harness (005) | The full verify-then-score flow against a loopback ATS stand-in — no live network, no real postings | $0 (subscription-billed session time) | `npm run harness` |
| Atomic write-fidelity tests (007) | Byte-exact verification of the verbatim-write prompts in both live workflows — one real fast-tier model call per test | cents per run | `npm run test:fidelity` |

## Pure-code unit tests

Stdlib Node (`node:test` + `node:assert`), zero dependencies. Covers the pure
functions a workflow's control flow depends on — dedup-key assembly, company-name
canonicalization, criteria fingerprints — factored into plain ESM under
`.claude/workflows/lib/` so they're both `import`-able by tests and inlined (with a
byte-identity guard test) into the sandboxed workflow script, which cannot `import`
from outside its own body.

## Isolated test harness

`tests/harness/` — a zero-live-dependency suite for `.claude/workflows/fit-screen.js`'s
verify-then-score flow, built around a loopback ATS stand-in
(Greenhouse/Lever/Ashby paths, live/closed/malformed/error/flapping scenarios). 57
cases, all green. Model-backed cases need a Claude Code session (the workflow only
executes in-session); node-only cases run standalone. See
[`tests/harness/README.md`](../tests/harness/README.md) for the managed-service
workflow, session-backed run rails, and a troubleshooting table. Design:
[`specs/005-isolated-test-harness/`](../specs/005-isolated-test-harness/).

Known constraint: `hyppo-verify` (WebFetch-only) cannot reach a plain-HTTP fixture
service — WebFetch upgrades `http://` to `https://` unconditionally. Session runs
show ATS records as `unresolvable` by design; the worker's real wire behavior is
proven separately against `tests/fixtures/live/`.

## Atomic write-fidelity tests

`tests/fidelity/` — one real fast-tier `agent()` call per test, asserting the
verbatim-write prompts in both workflows reproduce their input byte-for-byte, with no
paraphrasing or reformatting drift. No fixture service, no scratch-copied data
directory, no other agent calls per test (spec 007's independent-test requirement).
See [`tests/fidelity/README.md`](../tests/fidelity/README.md) and
[`specs/007-write-fidelity-guardrails/`](../specs/007-write-fidelity-guardrails/).

## Eval harness and evidence reports

`evals/` holds the broader eval scaffold (component, per-component, integration) that
predates and complements the isolated harness — per-component rubrics and fixtures,
integration runs, and a **spend ledger**: every metered eval run is logged as a dated
report in [`docs/eval-reports/`](./eval-reports/README.md), so cost stays auditable
against the account's actual recorded spend. No run is triggered automatically — no
CI, no push/PR hooks; every metered run is started by hand.

## Manual validation

Both live workflows still carry a manual **quickstart**: hand-run scenarios against
`tests/fixtures/data-dir/`, checked against the expected outputs in each spec's
`quickstart.md`. This is the Phase A validation floor until each feature's Phase B
slice lands automated `vitest` + CI coverage and the statistical success-criteria
measurements — see [Solution design → Status](./solution-design.md#status).
