# Research: Write-Fidelity Guardrails (007)

## R1 — How can an "atomic" test make one real `agent()` call outside a full pipeline run?

**Decision**: Each atomic test is a minimal Claude Code dynamic-workflow script (the same runtime
`fit-screen.js`/`intake-normalize.js` already run under, per the `workflow-authoring` skill) that
does nothing but build one real prompt from the shared prompt-builder function and issue one
`agent()` call targeting a single throwaway temp file path (`fs.mkdtempSync`, one file — not a
scratch-copied fixture directory; spec's US1 Independent Test explicitly requires "no fixture
service, no scratch dir, no other agent calls"). `npm run test:fidelity` is a thin Node wrapper
that shells out to `claude -p` to execute that workflow script through the Workflow tool, then —
back in plain Node, outside the sandboxed workflow body — reads the temp file the agent call was
supposed to have written and asserts it is byte-identical to the expected content, then deletes it.

**Rationale**: `agent()`, `phase()`, `pipeline()`, and `parallel()` are globals the Workflow tool
runtime injects into a dynamic-workflow script body; they do not exist in a plain `node --test`
process (confirmed: neither `fit-screen.js` nor `intake-normalize.js` import them — see
`.claude/workflows/fit-screen.js`'s own runtime-contract header). There is no headless
`claude workflow run <script>` CLI subcommand — the Workflow tool is only invocable from inside a
live Claude Code session. This matches 003-eval-harness's existing "workflow-tool" substrate
concept (`specs/003-eval-harness/contracts/eval-report.md`), which already assumes a real-model-call
eval run happens through a Claude Code session, not a fully headless process — 007 doesn't invent a
new execution model, it automates the wrapper 003 left manual.

The dynamic-workflow script body itself cannot touch `fs` directly ("no direct fs / shell / network
from the script body" — same runtime contract), so the atomic test cannot assert from *inside* the
workflow script. It can only trigger the real `hyppo-readwrite` agent call, which does its own
file I/O through its own tool grants. The plain-Node half of the wrapper — which runs before/after
`claude -p`, not inside the sandboxed body — is unconstrained and does the actual byte-comparison
assertion against a single temp file, deliberately lighter-weight than 005's `scratch.mjs` pattern
(which copies the whole committed fixture tree) — that full-directory copy is exactly the cost US1
rules out as unnecessary for a one-file, one-call test.

**Alternatives considered**:
- *Call the Claude Agent SDK directly from a plain Node script, bypassing the Workflow tool
  entirely.* Rejected: this would exercise a different code path than the one actually used in
  production (`fit-screen.js`/`intake-normalize.js` running as Workflow-tool scripts), defeating
  the point of an atomic *regression* test for a bug that only manifested through that exact
  runtime.
- *Skip automation; document a manual "run this via /workflows" step.* Rejected: FR-001 requires the
  test to be something a developer can run "within seconds, for cents" without hand-holding —
  matching the clarified `npm run test:fidelity` entry point.

## R2 — What does each atomic test need to hold constant vs. vary?

**Decision**: Each atomic test workflow script imports (conceptually re-implements, since dynamic
workflows can't `import` from outside their own body — same runtime contract) the exact prompt
text produced by the real prompt-builder function it targets (`buildEvaluationWritePrompt` for
audit #1, the inline `writeSummary`/summary-write prompt for #2 and #3), applied to one small
synthetic record literal defined inline in the test file, then writes to one throwaway temp file
(not the committed `tests/fixtures/data-dir/`, and not a copy of it) and asserts the resulting
file's bytes.

**Rationale**: US1's Independent Test explicitly says the atomic test needs "no fixture service, no
scratch dir, no other agent calls" — the whole point is a lighter tier than 005's full-flow harness.
An inline synthetic record keeps each test self-contained and avoids coupling to 005's fixture
shape changing out from under it.

**Alternatives considered**: Reusing 005's committed `tests/fixtures/data-dir/` via a scratch copy
(005's own `scratch.mjs` pattern). Rejected: contradicts US1's explicit "no scratch dir" cost
requirement, and pulls in a whole fixture tree to test one file write.

## R3 — Cost/pacing posture for the new Tier-2 tier

**Decision**: Three atomic tests total (FR-001's audit #1, FR-003's audit #2 and #3), each one real
fast-tier (`hyppo-readwrite`, Haiku-class) `agent()` call. No parallel fan-out needed at this scale;
run serially.

**Rationale**: Matches 003-eval-harness's Tier 2 cost posture (cents, not dollars) and the spec's
own Edge Cases note to "keep the atomic suite's total call count small and deliberate."
