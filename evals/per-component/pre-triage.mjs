// evals/per-component/pre-triage.mjs — assert keep/reject + reason bucket (deterministic) and
// N-run stability; judge grades reason soundness against the pre-triage-reason rubric.

import { preTriagePrompt } from "../../.claude/workflows/lib/prompts.mjs";
import { runSubtaskEval } from "./lib/run-subtask.mjs";

function checkExpected(fx, output) {
  const pass = output.decision === fx.expected.decision;
  return { pass, message: pass ? "" : `expected decision ${fx.expected.decision}, got ${output.decision}` };
}

// The judge exchange is only {criteria, source_posting, produced_output} (contracts/judge-rubric.md)
// — there is no separate channel for "what criteria/directions were configured". Reason-soundness
// grading needs that context, so it is folded into source_posting alongside the posting text (a
// real gap found by running this against the live judge: without it, the judge correctly refused to
// credit a reason it had no way to check).
function judgeSourcePosting(fx) {
  return [
    "CONFIGURED HARD STOPS:",
    JSON.stringify(fx.input.criteria, null, 2),
    "",
    "CONFIGURED DIRECTIONS:",
    (fx.input.directions || []).map((d) => `- ${d.name}: ${d.description}`).join("\n") || "(none configured)",
    "",
    "POSTING TEXT:",
    fx.input.body,
  ].join("\n");
}

export async function runPreTriage({ substrate = "mock" } = {}) {
  // Built (never a copy — FR-007) even though the mock substrate never sends it anywhere; the real
  // workflow-tool substrate builds one of these per case.
  preTriagePrompt({ criteria: {}, directions: [], body: "" });

  return runSubtaskEval({
    subtaskName: "pre-triage",
    fixturesPath: "evals/per-component/fixtures/pre-triage.json",
    substrate,
    checkExpected,
    judgeSourcePosting,
  });
}
