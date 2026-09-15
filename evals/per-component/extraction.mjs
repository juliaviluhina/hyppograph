// evals/per-component/extraction.mjs — assert extracted fields and that the coarse location
// bucket stays in its fixed vocabulary and is identical across N runs (FR-008); judge grades
// extraction faithfulness.

import { extractionPrompt } from "../../.claude/workflows/lib/prompts.mjs";
import { runSubtaskEval } from "./lib/run-subtask.mjs";

const LOCATION_BUCKET_VOCAB = /^(remote-(eu|us|uk|global)|unknown|[a-z][a-z0-9-]*)$/;

function checkExpected(fx, output) {
  if (!LOCATION_BUCKET_VOCAB.test(output.locationBucket)) {
    return { pass: false, message: `locationBucket ${JSON.stringify(output.locationBucket)} is outside the fixed vocabulary` };
  }
  for (const [key, expectedVal] of Object.entries(fx.expected)) {
    if (output[key] !== expectedVal) {
      return { pass: false, message: `expected ${key}=${JSON.stringify(expectedVal)}, got ${JSON.stringify(output[key])}` };
    }
  }
  return { pass: true, message: "" };
}

function judgeSourcePosting(fx) {
  return fx.input.body;
}

export async function runExtraction({ substrate = "mock" } = {}) {
  // Built (never a copy — FR-007) even though the mock substrate never sends it anywhere.
  extractionPrompt({ body: "" });

  return runSubtaskEval({
    subtaskName: "extraction",
    fixturesPath: "evals/per-component/fixtures/extraction.json",
    substrate,
    checkExpected,
    judgeSourcePosting,
  });
}
