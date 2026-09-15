/**
 * write-run-summary-fit-screen.workflow.js — 007 T010
 * Atomic test for audit #2 (fit-screen.js's writeSummary), post-FR-003 marker fix. Uses a
 * synthetic summary whose first line is deliberately collision-prone (a list marker) — proving
 * the BEGIN-CONTENT/END-CONTENT fix holds even though renderSummary's real first line ("Run
 * <timestamp>") happens to be safe today (spec Edge Cases: "not structurally guaranteed safe").
 *
 * args.outputPath : string — where to write (temp file, allocated by the Node test wrapper)
 */
const rendered = [
  "- verified confirmed-open / confirmed-closed / unresolvable : 1 / 0 / 0",
  "  scored                  : 1",
  "  skipped (unchanged)     : 0",
].join("\n");

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
  agentType: "hyppo-readwrite",
});
