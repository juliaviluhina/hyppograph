/**
 * write-evaluation.workflow.js — 007 T005
 * Atomic regression test for audit #1 (fit-screen.js's buildEvaluationWritePrompt).
 * Reproduces its exact risk shape — content whose first line is the YAML front-matter's
 * opening "---", wrapped in BEGIN-CONTENT/END-CONTENT markers per the shipped 006 fix — without
 * importing the real function (dynamic workflows can't `import` from outside their own body).
 * See specs/007-write-fidelity-guardrails/contracts/verbatim-write.md.
 *
 * args.outputPath : string — where to write (temp file, allocated by the Node test wrapper)
 */
export const meta = {
  name: "fidelity-write-evaluation",
  description: "007 atomic regression test for audit #1's write-evaluation marker fix (F4).",
  phases: [{ title: "write" }],
};

const frontMatter = ["---", 'jobRecordKey: "acme"', 'overallVerdict: "APPLY"', "---"].join("\n");
const body = ["", "## Requirement table", "", "(synthetic fidelity-test fixture)", ""].join("\n");
const content = frontMatter + body;

// TEMPORARY — SC-001 regression check (T007): pre-fix flat shape, no BEGIN/END markers.
// Revert with `git checkout -- tests/fidelity/write-evaluation.workflow.js` after confirming
// this makes the test fail with the leading "---" dropped.
const prompt = [`Write this exact text to ${args.outputPath} (overwrite if it already exists):`, "", content].join(
  "\n"
);

await agent(prompt, {
  schema: { type: "object", properties: { written: { type: "boolean" } }, required: ["written"] },
  label: "write-evaluation",
  model: "haiku",
  agentType: "hyppo-readwrite",
});
