// 007 T012 — regression-proofs audit #2 (fit-screen.js writeSummary): asserts the real model
// transcribes a collision-prone first line byte-for-byte with the BEGIN-CONTENT/END-CONTENT
// markers in place. See specs/007-write-fidelity-guardrails/spec.md US2.
import { test } from "node:test";
import { runFidelityWorkflow } from "./support/run-workflow.mjs";
import { assertByteIdentical } from "./support/assert-bytes.mjs";

// Must match write-run-summary-fit-screen.workflow.js's `rendered` exactly (duplicated by design
// — dynamic-workflow scripts can't be imported by a plain Node test).
const EXPECTED_CONTENT = [
  "- verified confirmed-open / confirmed-closed / unresolvable : 1 / 0 / 0",
  "  scored                  : 1",
  "  skipped (unchanged)     : 0",
].join("\n");

test("fit-screen write-run-summary transcribes a collision-prone first line byte-for-byte", async () => {
  const { tempFilePath, cleanup } = runFidelityWorkflow("write-run-summary-fit-screen.workflow.js", {});
  try {
    assertByteIdentical(tempFilePath, EXPECTED_CONTENT);
  } finally {
    cleanup();
  }
});
