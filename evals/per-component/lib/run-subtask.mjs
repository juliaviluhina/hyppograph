// evals/per-component/lib/run-subtask.mjs — shared driver for the four per-component evals
// (contracts/judge-rubric.md, data-model.md "Per-component fixture table"). `mock` substrate runs
// against `evals/lib/mock-agent.mjs`'s canned results (zero cost, zero network — research D7);
// `workflow-tool` needs a human/Claude session, same architectural constraint as the integration
// gate (the `Workflow` tool's `agent()` global does not exist in plain Node).

import { readFileSync } from "node:fs";
import { createMockAgent } from "../../lib/mock-agent.mjs";
import { loadRubric, callJudge } from "../../lib/judge.mjs";
import { randomUUID } from "node:crypto";

export function loadFixtures(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

// Runs one subtask's fixture table. `checkExpected(fixtureCase, producedOutput)` returns
// `{ pass, message }`. `judgeSourcePosting(fixtureCase)` extracts the source-posting text for a
// judge-graded case (only called when `fixtureCase.judge` is set).
export async function runSubtaskEval({ subtaskName, fixturesPath, substrate, checkExpected, judgeSourcePosting }) {
  if (substrate === "workflow-tool") {
    return {
      pass: false,
      setupRequired: true,
      message: [
        `${subtaskName}: substrate=workflow-tool needs a human/Claude session to run the real`,
        `subtask via the Workflow tool for each fixture case and capture its structured output.`,
        `Use --substrate mock to exercise the eval's plumbing for $0 (research D7).`,
      ].join("\n"),
    };
  }
  if (substrate !== "mock") {
    throw new Error(`${subtaskName}: unsupported substrate ${JSON.stringify(substrate)}`);
  }

  const fixtures = loadFixtures(fixturesPath);
  const mockAgent = createMockAgent(fixtures);
  const sessionId = `hyppograph-eval-${subtaskName}-${randomUUID()}`;
  const cases = [];

  for (const fx of fixtures) {
    const runs = fx.stability ? fx.runs || 3 : 1;
    const outputs = [];
    for (let i = 0; i < runs; i++) outputs.push(await mockAgent(fx.id));

    const determCheck = checkExpected(fx, outputs[0]);
    let stable = true;
    if (fx.stability) {
      const serialized = outputs.map((o) => JSON.stringify(o));
      stable = serialized.every((s) => s === serialized[0]);
    }

    let judgeResult = null;
    if (fx.judge) {
      const rubric = loadRubric(`evals/per-component/rubrics/${fx.judge}.md`);
      judgeResult = await callJudge(
        { criteria: rubric.criteria, source_posting: judgeSourcePosting(fx), produced_output: outputs[0] },
        { sessionId }
      );
    }

    const pass = determCheck.pass && stable && (!judgeResult || judgeResult.verdict === "pass");
    cases.push({ id: fx.id, pass, determCheck, stable, judgeResult });
  }

  return { pass: cases.every((c) => c.pass), cases };
}
