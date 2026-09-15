// evals/integration/idempotency.mjs — the second pass over the SAME scratch dir the gate already
// ran (FR-005, feature 001 SC-006, contracts/expected-tree.md "Idempotency pass"). Asserts: zero new
// files under outputs/job-records/, outputs/last-run-summary.md unchanged, provenance-log.md
// byte-identical to before this pass. Reported as scope `integration-idem`.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { listFilesRecursive } from "./gate.mjs";
import { runMockPipeline } from "./mock-pipeline.mjs";

export async function runIdempotency({ scratch, substrate = "workflow-tool" }) {
  if (!scratch) throw new Error("idempotency: --scratch is required");

  const outputsDir = join(scratch, "outputs");
  const summaryPath = join(scratch, "outputs/last-run-summary.md");
  const provenancePath = join(scratch, "provenance-log.md");

  if (!existsSync(outputsDir) || !existsSync(summaryPath) || !existsSync(provenancePath)) {
    return {
      pass: false,
      setupRequired: true,
      message: "idempotency: no first-pass output found in this scratch dir — run the gate first.",
    };
  }

  const filesBefore = listFilesRecursive(outputsDir).map((f) => f.replace(scratch, ""));
  const provenanceBefore = readFileSync(provenancePath, "utf8");

  let secondPassSummary;
  if (substrate === "mock") {
    ({ summary: secondPassSummary } = await runMockPipeline({ dataDir: scratch }));
  } else if (substrate === "workflow-tool") {
    return {
      pass: false,
      setupRequired: true,
      message: [
        "idempotency: substrate=workflow-tool needs a human/Claude session to re-run the real",
        `workflow a second time over the same scratch dir (${scratch}), then re-invoke this check.`,
      ].join("\n"),
    };
  } else {
    throw new Error(`idempotency: unsupported substrate ${JSON.stringify(substrate)}`);
  }

  const filesAfter = listFilesRecursive(outputsDir).map((f) => f.replace(scratch, ""));
  const newFiles = filesAfter.filter((f) => !filesBefore.includes(f));
  const provenanceAfter = readFileSync(provenancePath, "utf8");
  const provenanceIdentical = provenanceAfter === provenanceBefore;

  // "last-run-summary.md unchanged" (contracts/expected-tree.md) means zero NEW activity, not a
  // byte-identical report — the report legitimately differs run-to-run by design (see
  // mock-pipeline.mjs's runMockPipeline doc comment).
  const noNewActivity =
    substrate !== "mock" ||
    (secondPassSummary.newRawRecords === 0 &&
      secondPassSummary.newJobRecords === 0 &&
      secondPassSummary.duplicatesMerged === 0);

  return {
    pass: newFiles.length === 0 && noNewActivity && provenanceIdentical,
    newFiles,
    noNewActivity,
    provenanceIdentical,
  };
}
