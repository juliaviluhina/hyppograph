# Atomic Write-Fidelity Tests (007)

Tier-2 tests for `.claude/workflows/fit-screen.js`'s and `intake-normalize.js`'s verbatim-write
prompts. One real fast-tier `agent()` call per test — no fixture service, no scratch-copied data
dir, no other agent calls (spec 007 US1 Independent Test). See
`specs/007-write-fidelity-guardrails/contracts/atomic-fidelity-test.md` for the full contract.

```bash
npm run test:fidelity      # runs all three atomic tests, real model calls (cents, not free)
npm run harness            # separate, free, zero-live-dependency tier (005) — unaffected
```

## Layout

| Path | Role |
|---|---|
| `*.workflow.js` | Minimal dynamic-workflow script, one `agent()` call, writes to a temp file passed via `args` |
| `*.test.mjs` | Plain-Node half: allocates the temp file, runs the workflow script via `claude -p`, asserts byte-exact output |
| `support/run-workflow.mjs` | `runFidelityWorkflow(workflowRelPath, args)` — shells out to `claude -p` |
| `support/assert-bytes.mjs` | `assertByteIdentical(actualPath, expectedContent)` |

Each `.workflow.js` file inlines its own copy of the target prompt shape rather than importing the
production prompt-builder — dynamic workflows cannot `import` from outside their own body (see the
`workflow-authoring` skill's runtime contract). If a production prompt changes shape, its matching
`.workflow.js` file needs a matching update — the structural pin
(`tests/harness/support/structure.mjs`, feature 007 FR-004) is the free tier that catches drift
between the two.
