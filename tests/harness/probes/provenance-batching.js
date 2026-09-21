export const meta = {
  name: "provenance-batching-probe",
  description: "Isolated correctness check for fit-screen.js's queueProvenance/flushProvenance fix — 3 agent calls, no verify/score logic.",
  phases: [{ title: "probe" }],
};

/**
 * provenance-batching probe (2026-09-21, post-cost-audit fix verification)
 * ==========================================================================
 * Tests ONLY the new queueProvenance()/flushProvenance() pair ported from intake-normalize.js
 * (issue 006's batching fix) into fit-screen.js, in isolation from verify/score logic. The risk
 * this change introduces is narrow: does ONE agent() call correctly append MULTIPLE queued lines,
 * in order, without disturbing existing file content? That's exactly what this probe checks —
 * 3 agent calls total (baseline read, one batched flush, read-back diff) instead of running the
 * full pipeline (which would cost ~80 agents to exercise the same code path indirectly).
 *
 * args.dataDir : string — any scratch dir; provenance-log.md may or may not already exist there.
 */

const DATA = args.dataDir;

const rawFileReadSchema = {
  type: "object",
  additionalProperties: false,
  required: ["found", "content"],
  properties: { found: { type: "boolean" }, content: { type: "string" } },
};
const appendedAckSchema = {
  type: "object",
  additionalProperties: false,
  required: ["appended"],
  properties: { appended: { type: "boolean" } },
};

// Verbatim copy of fit-screen.js's post-fix functions (kept in sync manually, same convention as
// tests/harness/support/pure.mjs's mirrors — this probe exists to test this exact code shape).
function provenanceLine(run, { what, how, why }) {
  return `${run}  ${run}  ${what}  ${how}  ${why}`;
}
function queueProvenance(queue, run, entry) {
  queue.push(provenanceLine(run, entry));
}
async function flushProvenance(dataDir, phaseName, queue) {
  if (queue.length === 0) return;
  const lines = queue.splice(0, queue.length);
  await agent(
    [
      `APPEND exactly these lines, in this order (create the file if missing), to:`,
      `  ${dataDir}/provenance-log.md`,
      "Do not modify existing lines, do not add a trailing blank line, do not reorder or merge them:",
      ...lines,
    ].join("\n"),
    { schema: appendedAckSchema, label: "provenance", model: "haiku", phase: phaseName, agentType: "hyppo-readwrite" }
  );
}

phase("probe");

const before = await agent(
  [
    `Read this file's exact text if it exists (found=true, full content); if it does not exist,`,
    `report found=false with empty content:`,
    `  ${DATA}/provenance-log.md`,
  ].join("\n"),
  { schema: rawFileReadSchema, label: "read-before", model: "haiku", agentType: "hyppo-read" }
);

const RUN = "2026-09-21T00:00:00.000Z";
const queue = [];
queueProvenance(queue, RUN, { what: "outputs/job-records/probe-a.md", how: "still-open-check", why: "null -> unresolvable (synthetic probe line 1)" });
queueProvenance(queue, RUN, { what: "outputs/job-records/probe-b.md", how: "still-open-check", why: "null -> confirmed-open (synthetic probe line 2)" });
queueProvenance(queue, RUN, { what: "evaluations/probe-a.md", how: "score", why: "APPLY — application-state not_applied (synthetic probe line 3)" });
const expectedNewLines = queue.map((l) => l); // flushProvenance mutates via splice, snapshot first

await flushProvenance(DATA, "probe", queue);

const after = await agent(
  [
    `Read this file's exact text if it exists (found=true, full content); if it does not exist,`,
    `report found=false with empty content:`,
    `  ${DATA}/provenance-log.md`,
  ].join("\n"),
  { schema: rawFileReadSchema, label: "read-after", model: "haiku", agentType: "hyppo-read" }
);

const beforeLines = before.found ? before.content.split("\n").filter((l) => l.trim() !== "") : [];
const afterLines = after.content.split("\n").filter((l) => l.trim() !== "");

const prefixMatches = beforeLines.every((l, i) => afterLines[i] === l);
const suffixMatches =
  afterLines.length === beforeLines.length + expectedNewLines.length &&
  expectedNewLines.every((l, i) => afterLines[beforeLines.length + i] === l);
const noTrailingBlank = !after.content.endsWith("\n\n");

const ok = prefixMatches && suffixMatches;

log(ok ? "PASS — one batched flush appended all 3 lines, in order, existing content untouched" : "FAIL — batched append did not match expectation", {
  beforeLineCount: beforeLines.length,
  afterLineCount: afterLines.length,
  expectedNewLineCount: expectedNewLines.length,
  prefixMatches,
  suffixMatches,
  noTrailingBlank,
});

return {
  ok,
  beforeLineCount: beforeLines.length,
  afterLineCount: afterLines.length,
  prefixMatches,
  suffixMatches,
  noTrailingBlank,
  afterTail: afterLines.slice(-4),
};
