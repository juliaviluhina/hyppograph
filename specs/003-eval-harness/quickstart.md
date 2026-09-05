# Quickstart: Pipeline Eval Harness

Runnable validation scenarios that prove the feature works. Each maps to a success criterion in
[spec.md](./spec.md). Run from the repo root.

## Prerequisites

- Node.js ≥ 20 (`node --version`).
- For the model-backed layers on the default substrate: the Claude Code `Workflow` tool (already
  present).
- For any judge-graded case: the judge credential exported in the environment (name in
  `.env.example`; value in a gitignored `.env` or your shell profile — never committed).
- No credential is needed for the `component` layer.

## Scenario 1 — component layer is fast, free, offline  (SC-001)

```
npm test          # → node --test evals/component/
```

Expected: whole suite passes in under 5 seconds, prints `tests N / pass N / fail 0`, makes no
network connection and no model call.

## Scenario 2 — a helper regression is caught cheaply  (SC-002, US1)

Make `titleKey` case-sensitive again (revert its `.toLowerCase()`), then:

```
npm test
```

Expected: `evals/component/keys.test.mjs` fails, naming the case with input, expected, and actual.
Restore the line → suite green again.

## Scenario 3 — helper / prompt drift is caught  (US1 scenario 2)

Edit one character inside a `/* BEGIN inlined:intake-core */ … /* END */` region of
`.claude/workflows/intake-normalize.js` without touching the module.

```
npm test
```

Expected: `evals/component/drift.test.mjs` fails with a unified diff and the region name. Revert →
green.

## Scenario 4 — integration gate matches the expected tree  (SC-003, US2)

```
node evals/run.mjs integration
```

Expected: the pipeline runs over a scratch copy of `tests/synthetic/data-dir/`; every file under
`outputs/` byte-matches `tests/synthetic/expected/`; the run performs no network access; a report
`docs/eval-reports/NNNN-YYYY-MM-DD-integration.md` is written and the index gains a row.

## Scenario 5 — idempotency  (SC-003, FR-005, feature 001 SC-006)

The `integration` run above automatically does a second pass over the same scratch dir.

Expected: zero new files under `outputs/jobs/`, `last-run-summary.md` unchanged, `provenance-log.md`
byte-identical to after the first pass. Reported as scope `integration-idem`.

## Scenario 6 — a metered command will not spend without confirmation  (SC-005, US3)

```
node evals/run.mjs integration --substrate metered
```

Expected (before the FR-023 milestone): exits 2, message points at the milestone. After it is built,
without `--confirm-spend`: prints the cost estimate and exits 0 with **no** paid call.

## Scenario 7 — spend ceiling stops an over-budget run  (SC-006)

```
node evals/run.mjs integration --substrate metered --confirm-spend --ceiling 0.01
```

Expected: the run aborts before the first call that would cross $0.01, exits 3, and writes a
partial-result report.

## Scenario 8 — credential absent fails fast  (US3 scenario 3)

Unset the judge credential, then run a judge-graded per-component eval:

```
node evals/run.mjs extraction
```

Expected: exits 2 immediately, names the missing environment variable, never prompts, never runs a
case.

## Scenario 9 — no secrets anywhere  (SC-007)

```
git grep -nEi '(api[_-]?key|authorization:|bearer )' -- . ':!*.example'
```

Expected: no match in the repo, its history, `provenance-log.md`, or any file under
`docs/eval-reports/`.

## Scenario 10 — no unattended metered path  (SC-005)

Inspect the repo's automation config.

Expected: no `.github/workflows/`, no scheduled job, no push hook that runs any layer other than
`component`. Only `npm test` is safe to wire into a pre-commit hook.

## Scenario 11 — every run leaves evidence  (SC-009)

After any of the runs above, `docs/eval-reports/` contains a new dated file with Methodology / Under
test / Results / Cost / Findings sections, and `docs/eval-reports/README.md` has a matching row.

## Scenario 12 — live smoke (manual, real board)  (US2 scenario 4)

```
node evals/run.mjs live-smoke --scratch /tmp/hyppo-live --confirm-spend
```

Expected: a shallow real run against a board search you are signed into via HyppoVisor, writing to a
scratch dir **outside the repo**. Judged by hand: Job Records, provenance, and summary look sane.
Reference: [contracts/evals-cli.md](./contracts/evals-cli.md).
