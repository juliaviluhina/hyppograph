/**
 * write-evaluation.workflow.js — 007 T005
 * Atomic regression test for audit #1 (fit-screen.js's buildEvaluationWritePrompt).
 * Reproduces its exact risk shape — content whose first line is the YAML front-matter's
 * opening "---", wrapped in BEGIN-CONTENT/END-CONTENT markers per the shipped 006 fix — without
 * importing the real function (dynamic workflows can't `import` from outside their own body).
 * See specs/007-write-fidelity-guardrails/contracts/verbatim-write.md.
 *
 * args.outputPath : string — where to write (temp file, allocated by the Node test wrapper)
 *
 * Content shape (front matter + body) mirrors buildEvaluationWritePrompt's real field count and
 * size — a minimal 4-line synthetic fixture did not reproduce F4 on a one-off live retry (2026-
 * 09-14; F4's original incident was itself only 2/9 records, so the collision is content-size/
 * shape-sensitive, not guaranteed on any "---"-first content). This wider fixture is deliberately
 * closer to the real acme-record shape that did reproduce it.
 */
export const meta = {
  name: "fidelity-write-evaluation",
  description: "007 atomic regression test for audit #1's write-evaluation marker fix (F4).",
  phases: [{ title: "write" }],
};

const frontMatter = [
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
].join("\n");
const body = [
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
const content = frontMatter + body;

const prompt = [
  `Write the EXACT content between the BEGIN-CONTENT and END-CONTENT markers below (excluding the`,
  `marker lines themselves — they are not part of the file) to (overwrite if it already exists): ${args.outputPath}`,
  "",
  "BEGIN-CONTENT",
  content,
  "END-CONTENT",
].join("\n");

await agent(prompt, {
  schema: { type: "object", properties: { written: { type: "boolean" } }, required: ["written"] },
  label: "write-evaluation",
  model: "haiku",
  agentType: "hyppo-readwrite",
});
