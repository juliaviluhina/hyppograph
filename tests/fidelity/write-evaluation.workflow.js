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
const frontMatter = ["---", 'jobRecordKey: "acme"', 'overallVerdict: "APPLY"', "---"].join("\n");
const body = ["", "## Requirement table", "", "(synthetic fidelity-test fixture)", ""].join("\n");
const content = frontMatter + body;

const prompt = [
  `Write the EXACT content between the BEGIN-CONTENT and END-CONTENT markers below (excluding the`,
  `marker lines themselves — they are not part of the file) to (overwrite if it already exists): ${args.outputPath}`,
  "",
  "BEGIN-CONTENT",
  content,
  "END-CONTENT",
].join("\n");

await agent(prompt, {
  schema: { type: "object", properties: { written: { type: "boolean" } }, required: ["written"] },
  label: "write-evaluation",
  model: "haiku",
  agentType: "hyppo-readwrite",
});
