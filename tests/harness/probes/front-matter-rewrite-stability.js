export const meta = {
  name: "front-matter-rewrite-stability-probe",
  description: "Reads a Job Record, applies fit-screen.js's verify-phase front-matter-only rewrite, reads again, diffs — 3 agent calls, isolates whether the rewrite (not the read) is what drifts responsibilitiesSummary.",
  phases: [{ title: "probe" }],
};

/**
 * front-matter-rewrite-stability probe (006 T010 follow-up, 2026-09-21, round 2)
 * ================================================================================
 * `transcription-stability.js` called `index-job-records` twice back-to-back with NOTHING happening
 * in between, and came back stable 3/3 runs (0 mismatches each time). That rules out plain LLM
 * sampling noise on an unchanged file as the cause of the drift seen in the two full pipeline runs
 * (9/9 records drifted between RUN1 and RUN2 there).
 *
 * The one thing that DID happen between RUN1's and RUN2's `index-job-records` calls, on every
 * record, was the verify phase's `write-open-status` agent call (fit-screen.js ~505-520) —
 * "Update ONLY the YAML front-matter... leave the body BYTE-FOR-BYTE unchanged". That instruction
 * is a prompt, not a guarantee: an LLM asked to edit a file can still reformat prose it re-reads
 * along the way. This probe isolates exactly that: read -> front-matter-only rewrite (markChanged
 * false path, the common case) -> read again -> diff. 3 agent calls, ~1 record, instead of a full
 * ~80-agent run, to test the actual hypothesis instead of a narrower one.
 *
 * RUNTIME CONTRACT: same dynamic-workflow sandbox as fit-screen.js — see the `workflow-authoring`
 * skill. No import/require; args/phase/agent/parallel/log are globals.
 *
 * args:
 *   args.dataDir   : string — a HYPPO_DATA_DIR-shaped dir with outputs/job-records/*.md.
 *   args.recordPath: string — bare file name under outputs/job-records/ to rewrite (e.g.
 *                    "acme--backend-engineer--remote-eu.md"). MUTATES this one file's
 *                    openStatusCheckedAt in place — pick a scratch copy, not shared fixtures.
 *   args.checkedAt  : string — ISO timestamp to stamp openStatusCheckedAt with (workflow sandbox
 *                     forbids Date.now()/new Date(), so this must come in via args).
 *
 * Usage: Workflow({ scriptPath: "tests/harness/probes/front-matter-rewrite-stability.js",
 *                    args: { dataDir: "<scratch dir>", recordPath: "<bare file name>" } })
 */

const DATA = args.dataDir;
const RECORD_PATH = args.recordPath;

// Verbatim copy of fit-screen.js's jobRecordIndexSchema.
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

const writtenAckSchema = {
  type: "object",
  additionalProperties: false,
  required: ["written"],
  properties: { written: { type: "boolean" } },
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

// Verbatim copy of fit-screen.js's write-open-status prompt, markChanged=false branch (the common
// re-check-reproduced-the-existing-mark case) — same instruction, same agentType/model tier.
const checkedAt = args.checkedAt;
await agent(
  [
    `Update ONLY the YAML front-matter of this EXISTING file — leave the body BYTE-FOR-BYTE unchanged:`,
    `  ${DATA}/outputs/job-records/${RECORD_PATH}`,
    "",
    `Set openStatusCheckedAt: ${JSON.stringify(checkedAt)}.`,
    "Leave openStatus and openStatusReason UNCHANGED — this re-check reproduced the existing mark (FR-002c/FR-009).",
    "",
    "Do not reformat or re-order the other front-matter keys.",
  ].join("\n"),
  { schema: writtenAckSchema, label: `write-open-status:${RECORD_PATH}`, model: "haiku", phase: "probe", agentType: "hyppo-readwrite" }
);

const pass2 = await agent(INDEX_PROMPT, {
  schema: jobRecordIndexSchema,
  label: "index-job-records:pass2",
  model: "haiku",
  agentType: "hyppo-read",
});

const byKey1 = Object.fromEntries((pass1.records || []).map((r) => [r.path, r]));
const byKey2 = Object.fromEntries((pass2.records || []).map((r) => [r.path, r]));

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

const rewrittenRecordMismatches = mismatches.filter((m) => m.key === RECORD_PATH);

log(
  mismatches.length === 0
    ? "STABLE — no fingerprinted-field drift after the front-matter rewrite"
    : "UNSTABLE — drift found after the front-matter rewrite",
  { recordCount: Object.keys(byKey1).length, mismatchCount: mismatches.length, rewrittenRecord: RECORD_PATH }
);

return {
  ok: true,
  stable: mismatches.length === 0,
  rewrittenRecordDrifted: rewrittenRecordMismatches.length > 0,
  recordCount: Object.keys(byKey1).length,
  mismatches,
};
