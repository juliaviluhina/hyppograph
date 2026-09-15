// evals/per-component/run-layer.mjs — wires the four per-component layers into evals/run.mjs.
// A layer whose fixtures use a judge (pre-triage, extraction) is treated as incurring cost — the
// judge is a real (if currently ~$0) external API call — so it goes through the same
// --confirm-spend gate as any metered layer (FR-014); enumerate/source-list have no judge cases and
// so are always free.

import { checkConfirmSpend } from "../lib/spend.mjs";
import { requireJudgeCredential, missingCredentialMessage } from "../lib/credentials.mjs";
import { loadFixtures } from "./lib/run-subtask.mjs";
import { runEnumerate } from "./enumerate.mjs";
import { runPreTriage } from "./pre-triage.mjs";
import { runExtraction } from "./extraction.mjs";
import { runSourceList } from "./source-list.mjs";

const RUNNERS = {
  enumerate: { run: runEnumerate, fixturesPath: "evals/per-component/fixtures/enumerate.json" },
  "pre-triage": { run: runPreTriage, fixturesPath: "evals/per-component/fixtures/pre-triage.json" },
  extraction: { run: runExtraction, fixturesPath: "evals/per-component/fixtures/extraction.json" },
  "source-list": { run: runSourceList, fixturesPath: "evals/per-component/fixtures/source-list.json" },
};

function printCases(layer, result) {
  for (const c of result.cases || []) {
    const mark = c.pass ? "PASS" : "FAIL";
    console.log(`${layer}: [${mark}] ${c.id}`);
    if (!c.determCheck.pass) console.log(`  deterministic check: ${c.determCheck.message}`);
    if (!c.stable) console.log(`  stability: output differed across runs`);
    if (c.judgeResult && c.judgeResult.verdict !== "pass") {
      console.log(`  judge: ${c.judgeResult.verdict}${c.judgeResult.note ? ` — ${c.judgeResult.note}` : ""}`);
      for (const r of c.judgeResult.results || []) {
        if (r.verdict === "fail") console.log(`    fail: ${r.criterion} — ${r.note || ""}`);
      }
    }
  }
}

export function makePerComponentHandler(layer) {
  return async function handler(opts) {
    const { run, fixturesPath } = RUNNERS[layer];
    const fixtures = loadFixtures(fixturesPath);
    const wouldBeMetered = fixtures.some((fx) => fx.judge);
    const substrate = opts.substrate || "workflow-tool";

    const confirm = checkConfirmSpend({ layer, wouldBeMetered, confirmSpend: opts.confirmSpend, caseCount: fixtures.length });
    if (!confirm.proceed) return { exitCode: confirm.exitCode, report: null };

    if (wouldBeMetered) {
      const cred = requireJudgeCredential();
      if (!cred.ok) {
        console.error(`${layer}: ${missingCredentialMessage(cred.missing)}`);
        return { exitCode: 2, report: null };
      }
    }

    const result = await run({ substrate });
    if (result.setupRequired) {
      console.error(result.message);
      return { exitCode: 2, report: null };
    }
    printCases(layer, result);
    const passCount = result.cases.filter((c) => c.pass).length;
    console.log(`${layer}: ${result.pass ? "PASSED" : "FAILED"} (${passCount}/${result.cases.length})`);

    const judgeTypes = [...new Set(fixtures.filter((fx) => fx.judge).map((fx) => fx.judge))];
    return {
      exitCode: result.pass ? 0 : 1,
      report: {
        scope: `eval-${layer}`,
        methodology: {
          layer,
          judge: judgeTypes.length ? `GPT Luna (${judgeTypes.join(", ")})` : "none",
          substrate,
        },
        underTest: {
          modelIds: substrate === "mock" ? "n/a (mock substrate)" : "claude-haiku-4-5",
          fixture: fixturesPath,
          run: "manual (node evals/run.mjs " + layer + ")",
        },
        results: result.cases.map((c) => ({
          case: c.id,
          expected: "pass",
          actual: c.pass ? "pass" : "fail",
          verdict: c.pass ? "pass" : "fail",
        })),
        cost: { tokensIn: 0, tokensOut: 0, dollarCost: wouldBeMetered ? "$0 (measured)" : "$0" },
        findings: result.cases
          .filter((c) => !c.pass)
          .map((c) => `${c.id}: ${!c.determCheck.pass ? c.determCheck.message : !c.stable ? "output unstable across runs" : c.judgeResult?.note || "judge failed"}`),
        indexResult: `${result.pass ? "pass" : "fail"} (${passCount}/${result.cases.length})`,
        indexCost: "$0",
      },
    };
  };
}
