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
  [
    "---",
    'jobRecordKey: "acme"',
    'openStatus: "confirmed-open"',
    'overallVerdict: "APPLY"',
    "requirementTable:",
    '  - requirement: "5+ years backend engineering"',
    '    verdict: "met"',
    '    evidenceFile: "resume.md"',
    '    evidenceSection: "Experience"',
    '  - requirement: "Kubernetes production experience"',
    '    verdict: "partial"',
    '    evidenceFile: "resume.md"',
    '    evidenceSection: "Skills"',
    '    note: "self-hosted only, not managed EKS/GKE"',
    '  - requirement: "on-call rotation willingness"',
    '    verdict: "unmet"',
    "    evidenceFile: null",
    "    evidenceSection: null",
    "hardConstraints:",
    '  - constraint: "salary >= 180k"',
    '    state: "unresolved"',
    '    likelyOutcome: "range not posted"',
    '  - constraint: "onsite 3 days/week"',
    '    state: "satisfied"',
    'applicationState: "APPLY-AND-SEE"',
    'namedOutcome: "score.evidence-insufficient"',
    "delegations:",
    '  - taskType: "requirement-scoring"',
    '    inputScope: "resume.md, jd.md"',
    '    modelTier: "mid"',
    '    timestamp: "2026-09-14T18:00:00Z"',
    '    reviewStatus: "reviewed"',
    "    note: null",
    'scoredAt: "run-2026-09-14"',
    'evidenceFilesUsed: ["resume.md"]',
    'inputFingerprint: "sha256:deadbeef"',
    "---",
  ].join("\n") +
  [
    "",
    "## Requirement table",
    "",
    "| Requirement | Verdict | Evidence |",
    "|---|---|---|",
    "| 5+ years backend engineering | met | resume.md § Experience |",
    "| Kubernetes production experience | partial | resume.md § Skills |",
    "| on-call rotation willingness | unmet | — |",
    "",
    "## Hard constraints",
    "",
    "- **salary >= 180k**: unresolved (range not posted)",
    "- **onsite 3 days/week**: satisfied",
    "",
    "## Application state",
    "",
    "APPLY-AND-SEE",
    "",
    "## Source",
    "",
    "[Job Record](../job-records/acme.md)",
    "",
  ].join("\n");

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
