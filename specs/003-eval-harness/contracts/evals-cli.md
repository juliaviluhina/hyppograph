# Contract: `evals/run.mjs` command surface

The single entry point for every eval layer. Plain Node, invoked by hand.

## Invocation

```
node evals/run.mjs <layer> [options]
```

| `<layer>` | Runs | Metered? |
|---|---|---|
| `component` | `node --test evals/component/` | no — always free |
| `enumerate` \| `pre-triage` \| `extraction` \| `source-list` | that per-component eval | only on `--substrate metered` |
| `integration` | integration gate + idempotency second pass | only on `--substrate metered` |
| `live-smoke` | shallow real run against a scratch dir outside the repo | plan-billed on the `Workflow` tool; still requires `--confirm-spend` |

Also: `npm test` → `component`; `npm run eval -- <layer> …` → passthrough.

## Options

| Option | Default | Effect |
|---|---|---|
| `--substrate <workflow-tool\|mock\|metered>` | `workflow-tool` | `mock` uses `evals/lib/mock-agent.mjs` (no model, no cost). `metered` uses the standalone SDK substrate — only available after the FR-023 milestone. |
| `--confirm-spend` | absent | Required for any run that would incur metered cost. Absent → print estimate and exit 0 without a paid call (FR-014). |
| `--ceiling <dollars>` | built-in per-layer default | Abort before a metered `agent()` call that would cross it; write a partial-result report (FR-015). |
| `--runs <n>` | per-fixture `runs` or 3 | N for N-run stability assertions (FR-008). |
| `--scratch <dir>` | OS temp dir | Where the dataset is copied and the pipeline writes. Never inside the repo for `live-smoke`. |
| `--no-report` | absent | Skip report writing. For local iteration only; a real run always reports (SC-009). |

## Behaviour

1. Resolve layer + substrate. If `metered` and the standalone substrate is not built yet → exit 2
   with a message pointing at the FR-023 milestone.
2. If the run would incur metered cost and `--confirm-spend` is absent → print the estimate
   (`case count × blended per-call cost`) and exit 0. No paid call.
3. Load required credentials from the environment. Any absent → exit 2 immediately with a clear
   message naming the variable. Never prompt; never accept a credential as an option value (FR-016).
4. Copy the dataset to `--scratch`. Run the layer. Enforce `--ceiling` before each metered call.
5. Unless `--no-report`, write `docs/eval-reports/NNNN-YYYY-MM-DD-<scope>.md` and append the index
   row (FR-011, FR-013).

## Exit codes

| Code | Meaning |
|---|---|
| 0 | all cases passed; **or** estimate printed and exited (no `--confirm-spend`) |
| 1 | one or more cases failed (report written with diffs) |
| 2 | precondition failure — missing credential, unknown layer, `metered` substrate not built |
| 3 | spend ceiling hit mid-run — partial-result report written |

## Non-negotiable

- No code path prompts for a credential or reads one from `argv`.
- No layer other than `component` can run without a TTY-initiated invocation — there is no CI entry
  point, no scheduled entry point (FR-018).
- `component` never imports the judge client, the SDK, or anything that opens a socket.
