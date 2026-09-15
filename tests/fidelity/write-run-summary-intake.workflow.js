/**
 * write-run-summary-intake.workflow.js — 007 T011
 * Atomic test for audit #3 (intake-normalize.js's write-run-summary), post-FR-003 marker fix.
 * Same collision-prone synthetic shape as write-run-summary-fit-screen.workflow.js (T010) — see
 * that file's header comment for rationale.
 *
 * args.outputPath : string — where to write (temp file, allocated by the Node test wrapper)
 */
export const meta = {
  name: "fidelity-write-run-summary-intake",
  description: "007 atomic test for audit #3's write-run-summary marker fix (intake-normalize.js).",
  phases: [{ title: "write" }],
};

const rendered = ["- newJobRecords: 1", "  duplicatesMerged: 0"].join("\n");

const prompt = [
  `Write the EXACT content between the BEGIN-CONTENT and END-CONTENT markers below (excluding the`,
  `marker lines themselves — they are not part of the file) to ${args.outputPath} (overwrite):`,
  "",
  "BEGIN-CONTENT",
  rendered,
  "END-CONTENT",
].join("\n");

await agent(prompt, {
  schema: { type: "object", properties: { written: { type: "boolean" } }, required: ["written"] },
  label: "write-run-summary",
  model: "haiku",
  agentType: "hyppo-write",
});
