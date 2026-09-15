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

export async function runIntegrationLayer(opts = {}) {
  const substrate = opts.substrate || "workflow-tool";
  if (substrate === "metered") {
    console.error("integration: substrate=metered is not built yet — see the FR-023 milestone (T049).");
    return 2;
  }

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
    return guard.calls.length ? 1 : 2;
  }
  guard.restore();

  if (guard.calls.length) {
    console.error(`integration: hermeticity breach — ${guard.calls.length} outbound call(s) blocked:`);
    for (const url of guard.calls) console.error(`  - ${url}`);
    return 1;
  }

  if (gateResult.setupRequired) {
    console.error(gateResult.message);
    return 2;
  }
  if (!gateResult.pass) {
    console.error("integration: gate FAILED — scratch output does not match tests/synthetic/expected/");
    printDiffs("gate", gateResult);
    return 1;
  }
  console.log(`integration: gate PASSED (scratch=${scratch}, substrate=${substrate})`);

  if (idemResult?.setupRequired) {
    console.error(idemResult.message);
    return 2;
  }
  if (!idemResult?.pass) {
    console.error("integration-idem: FAILED");
    if (idemResult?.newFiles?.length) {
      console.error("  new files written on the second pass:");
      for (const f of idemResult.newFiles) console.error(`    - ${f}`);
    }
    if (idemResult && !idemResult.noNewActivity) console.error("  last-run-summary.md reports new activity on the second pass (expected all-zero)");
    if (idemResult && !idemResult.provenanceIdentical) console.error("  provenance-log.md is not byte-identical after the second pass");
    return 1;
  }
  console.log("integration-idem: PASSED (zero new writes, zero new activity, provenance byte-identical)");

  return 0;
}
