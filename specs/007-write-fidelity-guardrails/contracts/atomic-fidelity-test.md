# Contract: Atomic Write-Fidelity Test

Governs every test under `tests/fidelity/` (FR-001, FR-003) and the `npm run test:fidelity` entry
point (Clarifications, 2026-09-14).

## Shape

One test = one `.workflow.js` dynamic-workflow script + one plain-Node assertion wrapper.

- The `.workflow.js` file follows the same runtime contract as `fit-screen.js`/`intake-normalize.js`
  (no `import`, no `fs`/shell/network in the body; only `agent()`, `phase()`, `log()`, `args`
  available). It makes **exactly one** `agent()` call, reusing the target call site's real prompt
  text and `agentType`/`model` (`hyppo-readwrite`, `FAST`), against a scratch-copied fixture record
  passed in via `args`.
- The wrapper (plain Node, `tests/fidelity/*.test.mjs`):
  1. Allocates one throwaway temp file path (`fs.mkdtempSync` + one filename) — no fixture service,
     no scratch-copied data dir (spec US1 Independent Test: "no fixture service, no scratch dir, no
     other agent calls").
  2. Invokes `claude -p` to run the target `.workflow.js`, passing the temp file path via `args`.
  3. Reads the temp file the workflow's `agent()` call was supposed to write.
  4. Asserts the file's bytes are identical to the expected content (first line included).
  5. Deletes the temp file.
  6. On mismatch: fails with an actual-vs-expected diff naming the target call site's `label`.

## Cost & pacing

- One real fast-tier `agent()` call per test. Three tests total at spec time (audit #1, #2, #3).
- Run serially; no parallel fan-out (R3, research.md).
- `npm run test:fidelity` runs all three; no flag to select a subset is required at this scale.

## Non-goals

- Does not assert on scoring, verdicts, or any other pipeline semantics (FR-005).
- Does not cover out-of-class sites #4–#8 (patch-shape or single-line-append prompts) — structurally
  impossible for this bug class (spec Audit findings).
- Does not replace 005's harness (`npm run harness`) or 003's eval reports — it is a new, narrower
  tier that happens to reuse their fixture and scratch conventions.
