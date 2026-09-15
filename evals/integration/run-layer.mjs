// evals/integration/run-layer.mjs — wires the `integration` layer into evals/run.mjs: gate then
// idempotency, both under a network guard (FR-006), honouring --scratch. Contract: evals-cli.md.

import { tmpdir } from "node:os";
import { join } from "node:path";
import { installNetworkGuard } from "../lib/network-guard.mjs";
import { runGate } from "./gate.mjs";
import { runIdempotency } from "./idempotency.mjs";

function printDiffs(label, result) {
  if (result.fileSetMismatch?.missing?.length) {
    console.error(`${label}: missing files (expected but not produced):`);
    for (const f of result.fileSetMismatch.missing) console.error(`  - ${f}`);
  }
  if (result.fileSetMismatch?.extra?.length) {
    console.error(`${label}: extra files (produced but not expected):`);
    for (const f of result.fileSetMismatch.extra) console.error(`  - ${f}`);
  }
  for (const d of result.diffs || []) {
    console.error(`${label}: diff in ${d.path}`);
    console.error(d.diff);
  }
}

function baseReport(scope, substrate) {
  return {
    scope,
    methodology: { layer: "integration", judge: "none", substrate },
    underTest: {
      modelIds: substrate === "mock" ? "n/a (mock substrate)" : "claude-haiku-4-5",
      fixture: "tests/synthetic/data-dir/ (hash not computed)",
      run: "manual (node evals/run.mjs integration)",
    },
    cost: { tokensIn: 0, tokensOut: 0, dollarCost: "$0" },
  };
}

export async function runIntegrationLayer(opts = {}) {
  // `--substrate metered` is refused centrally in evals/run.mjs before this handler ever runs.
  const substrate = opts.substrate || "workflow-tool";
  const scratch = opts.scratch || join(tmpdir(), "hyppograph-eval-integration");
  const guard = installNetworkGuard();

  let gateResult, idemResult;
  try {
    gateResult = await runGate({ scratch, substrate });
    if (gateResult.pass) {
      idemResult = await runIdempotency({ scratch, substrate });
    }
  } catch (err) {
    guard.restore();
    console.error(`integration: ${err.message}`);
    return { exitCode: guard.calls.length ? 1 : 2, report: null };
  }
  guard.restore();

  if (guard.calls.length) {
    console.error(`integration: hermeticity breach — ${guard.calls.length} outbound call(s) blocked:`);
    for (const url of guard.calls) console.error(`  - ${url}`);
    return {
      exitCode: 1,
      report: {
        ...baseReport("integration", substrate),
        results: [{ case: "hermeticity", expected: "no outbound calls", actual: `${guard.calls.length} blocked: ${guard.calls.join(", ")}`, verdict: "fail" }],
        findings: [`Hermeticity breach: ${guard.calls.join(", ")}`],
        indexResult: "fail (0/1)",
        indexCost: "$0",
      },
    };
  }

  if (gateResult.setupRequired) {
    console.error(gateResult.message);
    return { exitCode: 2, report: null };
  }
  if (!gateResult.pass) {
    console.error("integration: gate FAILED — scratch output does not match tests/synthetic/expected/");
    printDiffs("gate", gateResult);
    return {
      exitCode: 1,
      report: {
        ...baseReport("integration", substrate),
        results: [{ case: "gate", expected: "matches tests/synthetic/expected/", actual: "mismatch", verdict: "fail" }],
        diffs: (gateResult.diffs || []).map((d) => ({ case: d.path, diff: d.diff })),
        findings: [
          ...(gateResult.fileSetMismatch?.missing?.length ? [`Missing files: ${gateResult.fileSetMismatch.missing.join(", ")}`] : []),
          ...(gateResult.fileSetMismatch?.extra?.length ? [`Extra files: ${gateResult.fileSetMismatch.extra.join(", ")}`] : []),
        ],
        indexResult: "fail (0/1)",
        indexCost: "$0",
      },
    };
  }
  console.log(`integration: gate PASSED (scratch=${scratch}, substrate=${substrate})`);

  if (idemResult?.setupRequired) {
    console.error(idemResult.message);
    return { exitCode: 2, report: null };
  }
  if (!idemResult?.pass) {
    console.error("integration-idem: FAILED");
    const problems = [];
    if (idemResult?.newFiles?.length) problems.push(`new files: ${idemResult.newFiles.join(", ")}`);
    if (idemResult && !idemResult.noNewActivity) problems.push("last-run-summary.md reports new activity on the second pass");
    if (idemResult && !idemResult.provenanceIdentical) problems.push("provenance-log.md is not byte-identical after the second pass");
    for (const p of problems) console.error(`  ${p}`);
    return {
      exitCode: 1,
      report: {
        ...baseReport("integration-idem", substrate),
        results: [{ case: "idempotency", expected: "0 new files, 0 new activity, provenance byte-identical", actual: problems.join("; "), verdict: "fail" }],
        findings: problems,
        indexResult: "fail (0/1)",
        indexCost: "$0",
      },
    };
  }
  console.log("integration-idem: PASSED (zero new writes, zero new activity, provenance byte-identical)");

  return {
    exitCode: 0,
    report: {
      ...baseReport("integration", substrate),
      results: [
        { case: "gate", expected: "matches tests/synthetic/expected/", actual: "exact match", verdict: "pass" },
        { case: "idempotency", expected: "0 new files, 0 new activity, provenance byte-identical", actual: "confirmed", verdict: "pass" },
      ],
      findings: [],
      indexResult: "pass (2/2)",
      indexCost: "$0",
    },
  };
}
