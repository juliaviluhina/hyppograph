// evals/per-component/source-list.mjs — assert source-list parsing from a saved fixture
// (deterministic; no judge — this is a structural parse, not a fuzzy judgment).

import { sourceListPrompt } from "../../.claude/workflows/lib/prompts.mjs";
import { runSubtaskEval } from "./lib/run-subtask.mjs";

function checkExpected(fx, output) {
  if (output.opened !== fx.expected.opened) {
    return { pass: false, message: `expected opened=${fx.expected.opened}, got ${output.opened}` };
  }
  if (fx.expected.opened && (output.postingRefs || []).length !== fx.expected.refCount) {
    return { pass: false, message: `expected ${fx.expected.refCount} refs, got ${(output.postingRefs || []).length}` };
  }
  return { pass: true, message: "" };
}

export async function runSourceList({ substrate = "mock" } = {}) {
  // Built (never a copy — FR-007) even though the mock substrate never sends it anywhere.
  sourceListPrompt({ filteredSearch: "", depth: 25 });

  return runSubtaskEval({
    subtaskName: "source-list",
    fixturesPath: "evals/per-component/fixtures/source-list.json",
    substrate,
    checkExpected,
    judgeSourcePosting: () => "",
  });
}
