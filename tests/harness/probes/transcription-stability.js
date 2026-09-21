export const meta = {
  name: "transcription-stability-probe",
  description: "Calls fit-screen.js's index-job-records prompt twice and diffs fingerprinted fields — 2 agent calls, not a full pipeline run.",
  phases: [{ title: "probe" }],
};

/**
 * transcription-stability probe (006 T010 follow-up, 2026-09-21)
 * ================================================================
 * Cheap, targeted diagnostic — NOT the full fit-screen.js pipeline. Answers exactly one question:
 * does `index-job-records` (fit-screen.js:413, FAST-tier hyppo-read) return byte-identical
 * front-matter/body fields for the SAME on-disk files across two back-to-back calls?
 *
 * Why this exists: a full two-pass live Workflow run (~80 agents/~700-800k tokens each) was used
 * to chase a `skippedIdempotent: 0` idempotency-guard failure and found the root cause was
 * `index-job-records` re-transcribing `responsibilitiesSummary` with different whitespace each call
 * (line-wrapped vs collapsed), which flows into `computeInputFingerprint` and defeats the 006
 * fingerprint guard on every record, every run. That diagnosis only needed the ONE agent call
 * repeated twice — 2 agent calls total instead of 160+. This probe is that minimal repro, kept so
 * the question ("is index-job-records transcription-stable today?") can be re-asked cheaply after
 * any prompt/model change, instead of re-running the full pipeline to find out.
 *
 * RUNTIME CONTRACT: same dynamic-workflow sandbox as fit-screen.js/intake-normalize.js — see the
 * `workflow-authoring` skill. No import/require; args/phase/agent/parallel/log are globals.
 *
 * args:
 *   args.dataDir : string — a HYPPO_DATA_DIR-shaped dir with outputs/job-records/*.md (e.g. a
 *                  tests/fixtures/data-dir scratch copy). Read-only — nothing is written.
 *
 * Usage: Workflow({ scriptPath: "tests/harness/probes/transcription-stability.js",
 *                    args: { dataDir: "<scratch dir>" } })
 */

const DATA = args.dataDir;

// Verbatim copy of fit-screen.js's jobRecordIndexSchema (kept in sync manually — this probe exists
// to test that exact call, so it must send that exact schema/prompt, not an approximation).
const jobRecordIndexSchema = {
  type: "object",
  additionalProperties: false,
  required: ["records"],
  properties: {
    records: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "path",
          "key",
          "roleTitle",
          "canonicalCompany",
          "locations",
          "salaryAmountOrRange",
          "salaryCurrency",
          "requirements",
          "responsibilitiesSummary",
          "sourceRefs",
          "appliedEntryRef",
          "alreadyApplied",
          "applicationState",
          "openStatus",
          "openStatusCheckedAt",
          "openStatusReason",
        ],
        properties: {
          path: { type: "string" },
          key: { type: "string" },
          roleTitle: { type: "string" },
          canonicalCompany: { type: "string" },
          locations: { type: "array", items: { type: "string" } },
          salaryAmountOrRange: { type: "string" },
          salaryCurrency: { type: "string" },
          requirements: { type: "array", items: { type: "string" } },
          responsibilitiesSummary: { type: "string" },
          sourceRefs: { type: "array", items: { type: "string" } },
          appliedEntryRef: { type: ["string", "null"] },
          alreadyApplied: { type: ["boolean", "null"] },
          applicationState: { type: ["string", "null"] },
          openStatus: { type: ["string", "null"] },
          openStatusCheckedAt: { type: ["string", "null"] },
          openStatusReason: { type: ["string", "null"] },
        },
      },
    },
  },
};

const INDEX_PROMPT = [
  `List every *.md file directly under this directory, EXCLUDING the raw/ subdirectory and`,
  `companies.md:`,
  `  ${DATA}/outputs/job-records/`,
  "For each Job Record return: path (bare file name, e.g. \"acme--platform-engineer--berlin.md\"),",
  "front-matter key/roleTitle/canonicalCompany/locations/salaryAmountOrRange/salaryCurrency,",
  "appliedEntryRef, alreadyApplied (null if the field is absent — already migrated),",
  "applicationState (null if never set), openStatus/openStatusCheckedAt/openStatusReason",
  "(null if this feature has never touched the record), sourceRefs (the sources[].sourceRef list),",
  "responsibilitiesSummary (the '## Responsibilities' body section verbatim), and requirements",
  "(the '## Requirements' body section as a discrete string array, one entry per bullet).",
  "If the directory is empty or missing, return an empty array.",
].join("\n");

// Exactly the fields computeInputFingerprint hashes (fit-screen.js:823-839) — these are the ones
// whose instability actually breaks the idempotency guard. Diffing everything else is noise.
const FINGERPRINTED_FIELDS = [
  "roleTitle",
  "canonicalCompany",
  "locations",
  "salaryAmountOrRange",
  "salaryCurrency",
  "responsibilitiesSummary",
  "requirements",
  "openStatus",
];

phase("probe");

const pass1 = await agent(INDEX_PROMPT, {
  schema: jobRecordIndexSchema,
  label: "index-job-records:pass1",
  model: "haiku",
  agentType: "hyppo-read",
});
const pass2 = await agent(INDEX_PROMPT, {
  schema: jobRecordIndexSchema,
  label: "index-job-records:pass2",
  model: "haiku",
  agentType: "hyppo-read",
});

const byKey1 = Object.fromEntries((pass1.records || []).map((r) => [r.key, r]));
const byKey2 = Object.fromEntries((pass2.records || []).map((r) => [r.key, r]));

const mismatches = [];
for (const key of Object.keys(byKey1)) {
  const a = byKey1[key];
  const b = byKey2[key];
  if (!b) {
    mismatches.push({ key, field: "(whole record)", note: "missing from pass2" });
    continue;
  }
  for (const field of FINGERPRINTED_FIELDS) {
    const av = JSON.stringify(a[field]);
    const bv = JSON.stringify(b[field]);
    if (av !== bv) {
      mismatches.push({ key, field, pass1: a[field], pass2: b[field] });
    }
  }
}

log(mismatches.length === 0 ? "STABLE — pass1/pass2 identical on every fingerprinted field" : "UNSTABLE — transcription drift found", {
  recordCount: Object.keys(byKey1).length,
  mismatchCount: mismatches.length,
});

return {
  ok: true,
  stable: mismatches.length === 0,
  recordCount: Object.keys(byKey1).length,
  mismatches,
};
