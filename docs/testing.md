# Testing approach

Three independent tiers, each catching a different class of defect at the cheapest
layer that can express it — cheapest and fastest first. The split came out of a
concrete post-mortem: five real Phase A bugs were all findable in seconds at a low
tier, but the only instrument available at the time was a full ~25-minute,
~89-`agent()`-call workflow run. Full reasoning and bug history:
[`specs/003-eval-harness/eval-strategy.md`](../specs/003-eval-harness/eval-strategy.md).

## Layers, top to bottom: cheapest/most-frequent → priciest/rarest

Solid boxes are live today; dashed boxes are specced but not built yet — see each
layer's section below for status and the spec that owns it.

```mermaid
flowchart TD
  classDef live fill:#e8f5e9,stroke:#2e7d32,color:#1b5e20;
  classDef planned fill:#fff3e0,stroke:#e65100,stroke-dasharray:5 5,color:#5d3a00;

  A["Pure-code unit tests
WHAT: dedup keys, slugs, fingerprints, summary rendering
WHY: catch pure-logic bugs in seconds, not a 25-min run
HOW: node:test on .claude/workflows/lib/ — npm test, $0"]:::live

  B["Isolated test harness (005)
WHAT: full verify→score flow vs a loopback ATS stand-in
WHY: catch wiring/integration bugs, zero live network
HOW: npm run harness — $0, session needed for model-backed cases"]:::live

  C["Atomic write-fidelity tests (007)
WHAT: verbatim-write prompts, asserted byte-exact
WHY: guard against paraphrasing/reformatting drift by the model
HOW: npm run test:fidelity — real haiku calls, cents per run"]:::live

  D["Manual quickstart
WHAT: hand-run scenarios against tests/fixtures/data-dir/
WHY: Phase A validation floor until automation lands
HOW: each spec's quickstart.md, run and checked by hand"]:::live

  E["Per-component eval harness (003)
WHAT: judge-graded judgment quality — extraction faithfulness,
triage-reason correctness, stability across reruns
WHY: measure judgment quality, not just wiring/plumbing
HOW: evals/run.mjs + non-Claude judge model — SCAFFOLDED ONLY,
evals/ dirs exist but no runner code yet"]:::planned

  F["Automated vitest + CI, statistical SC measurement (Phase B)
WHAT: full automated coverage, hard idempotency guarantees,
SC-006/SC-008-class statistical measurement against a labelled set
WHY: replace manual quickstart as the release-confidence gate
HOW: vitest suite — gated on each feature's Phase A exit review;
metered runs stay user-triggered by hand, never CI-triggered"]:::planned

  A --> B --> C --> D -.-> E
  D -.-> F
```

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

## Q&A: models and credentials

**What model runs `npm run harness`?** No model at all for node-only cases (pure
loopback HTTP + assertions). Model-backed cases need to be driven inside a Claude
Code session, and then use whatever model the live workflow itself declares — `haiku`
for every step except `hyppo-score`, which is `sonnet`
([Solution design → Model usage](./solution-design.md#model-usage)).

**What model runs `npm run test:fidelity`, and via what credentials?** Each test
shells out to `claude -p` (`tests/fidelity/support/run-workflow.mjs`), which drives a
real `Workflow`/`agent()` call in a throwaway Claude Code session. The model is
hardcoded to `haiku` in each `*.workflow.js` file (e.g.
`tests/fidelity/write-evaluation.workflow.js:100`). Credentials are whatever the
`claude` CLI on your machine is already authenticated with — the same login your
interactive session uses, subscription-billed, **not** an API key from `.env`. The
subprocess runs with `--dangerously-skip-permissions` so it can write its temp output
file non-interactively; that's a permissions bypass, not a separate credential.

**Gotcha:** running `npm run test:fidelity` from *inside* an agent session (rather
than your own terminal) trips a classifier that blocks spawning
`claude -p --dangerously-skip-permissions` outright ("Create Unsafe Agents") — the
child process exits 0 but stdout is just the denial message, so no real model call
happens. Run this suite directly from your terminal.

**Where do `HYPPO_JUDGE_API_KEY` / `HYPPO_JUDGE_BASE_URL` / `HYPPO_JUDGE_MODEL` fit
in?** They're placeholder names in `.env.example` for feature 003's non-Claude judge
model (used for judge-graded per-component eval cases). `evals/` is currently empty
directory scaffolding — no runner code reads those vars yet, so they're a reserved
spot for unbuilt work, not something a working setup is missing.

## Manual validation

Both live workflows still carry a manual **quickstart**: hand-run scenarios against
`tests/fixtures/data-dir/`, checked against the expected outputs in each spec's
`quickstart.md`. This is the Phase A validation floor until each feature's Phase B
slice lands automated `vitest` + CI coverage and the statistical success-criteria
measurements — see [Solution design → Status](./solution-design.md#status).
