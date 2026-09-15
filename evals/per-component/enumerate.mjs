// evals/per-component/enumerate.mjs — point the enumerate subtask at a synthetic raw/ dir, assert
// the exact expected record set (US4 scenario 1; SC-002 "stage silently zeroed" coverage).

import { enumeratePrompt } from "../../.claude/workflows/lib/prompts.mjs";
import { runSubtaskEval } from "./lib/run-subtask.mjs";

function checkExpected(fx, output) {
  const actualPaths = (output.records || []).map((r) => r.path).sort();
  const expectedPaths = [...fx.expected.paths].sort();
  const pass = JSON.stringify(actualPaths) === JSON.stringify(expectedPaths);
  return { pass, message: pass ? "" : `expected paths ${JSON.stringify(expectedPaths)}, got ${JSON.stringify(actualPaths)}` };
}

export async function runEnumerate({ substrate = "mock" } = {}) {
  // Built (never a copy — FR-007) even though the mock substrate never sends it anywhere; the real
  // workflow-tool substrate uses this exact string.
  enumeratePrompt({ rawDir: "tests/synthetic/data-dir/outputs/job-records/raw/" });

  return runSubtaskEval({
    subtaskName: "enumerate",
    fixturesPath: "evals/per-component/fixtures/enumerate.json",
    substrate,
    checkExpected,
    judgeSourcePosting: () => "",
  });
}
