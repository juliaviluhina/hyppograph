// 007 T006 — regression-proofs audit #1 (write-evaluation, F4): asserts the real model
// transcribes the leading front-matter "---" byte-for-byte when the BEGIN-CONTENT/END-CONTENT
// markers are in place. See specs/007-write-fidelity-guardrails/spec.md US1.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runFidelityWorkflow } from "./support/run-workflow.mjs";
import { assertByteIdentical } from "./support/assert-bytes.mjs";

// Must match write-evaluation.workflow.js's `content` exactly — the workflow script can't be
// imported (dynamic-workflow runtime contract), so this is a deliberate, documented duplicate.
const EXPECTED_CONTENT =
  ["---", 'jobRecordKey: "acme"', 'overallVerdict: "APPLY"', "---"].join("\n") +
  ["", "## Requirement table", "", "(synthetic fidelity-test fixture)", ""].join("\n");

test("write-evaluation transcribes leading front-matter delimiter byte-for-byte", async () => {
  const { tempFilePath, cleanup } = runFidelityWorkflow("write-evaluation.workflow.js", {});
  try {
    assertByteIdentical(tempFilePath, EXPECTED_CONTENT);
  } finally {
    cleanup();
  }
});

// Guards against this test silently asserting against an empty/wrong constant.
test("EXPECTED_CONTENT fixture starts with the front-matter delimiter", () => {
  assert.ok(EXPECTED_CONTENT.startsWith("---\n"), "test fixture itself must start with ---");
});
