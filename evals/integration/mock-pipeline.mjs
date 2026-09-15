// evals/integration/mock-pipeline.mjs — a deterministic, canned-judgment reimplementation of
// `.claude/workflows/intake-normalize.js`'s control flow, driven by tests/synthetic/fixtures/mock-answers.mjs
// instead of live agent() calls. Real file I/O, real dedup/completeness/summary logic (imported
// from the same source-of-truth module the workflow uses) — only the model *judgments*
// (triage decision, extracted fields, company canonicalisation, applied-match) are canned.
//
// This exists to debug the harness's copy -> triage -> normalize -> diff -> report plumbing for $0,
// with no model and no network (research D7). It does not exercise the real pipeline's prompts or
// judgment quality — that is per-component evals' job (US4) and the `workflow-tool` substrate's job.

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  slug,
  stableHash,
  dedupKey,
  criteriaFingerprint,
  effectiveExcludedLocations,
  foldSet,
  noTriageCriteria,
  completenessLevel,
  provenanceLine,
  newRunSummary,
  bumpReason,
  renderSummary,
  trackedBoardsToSources,
} from "../../.claude/workflows/lib/intake-core.mjs";
import * as answers from "../../tests/synthetic/fixtures/mock-answers.mjs";

const RAW_DIR_REL = "outputs/job-records/raw";
const JOB_RECORDS_DIR_REL = "outputs/job-records";

function readSettings(dataDir) {
  const path = join(dataDir, "inputs/settings.json");
  if (!existsSync(path)) {
    return { found: false, setupReady: false, unresolved: [], trackedBoards: [], hardStops: {}, locationsExcluded: [], directions: [] };
  }
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const sections = raw.sections || {};
  return {
    found: true,
    setupReady: (raw.completeness || {}).setupReady === true,
    unresolved: (raw.completeness || {}).unresolved || [],
    trackedBoards: (sections.trackedBoards || {}).value || [],
    hardStops: (sections.hardStops || {}).value || {},
    locationsExcluded: ((sections.locations || {}).value || {}).excluded || [],
    directions: (sections.directions || {}).value || [],
  };
}

function appendProvenanceLine(dataDir, run, entry) {
  const path = join(dataDir, "provenance-log.md");
  const line = provenanceLine(run, entry);
  const prefix = existsSync(path) ? readFileSync(path, "utf8") : "";
  const sep = prefix && !prefix.endsWith("\n") ? "\n" : "";
  writeFileSync(path, prefix + sep + line + "\n");
}

// Minimal front-matter split — this dataset's files are hand-authored to a fixed shape (a top-level
// `---` block of `key: value` lines, `triage: null` or a `triage:` sub-block, then the body).
function splitFrontMatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error("not a front-matter file");
  return { frontRaw: m[1], body: m[2] };
}

function parseFront(frontRaw) {
  const lines = frontRaw.split("\n");
  const front = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const kv = line.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/);
    if (!kv) {
      i++;
      continue;
    }
    const [, key, rest] = kv;
    if (key === "triage" && rest.trim() === "") {
      // multi-line `triage:` sub-block, 2-space-indented children
      const block = {};
      i++;
      while (i < lines.length && /^  [A-Za-z]/.test(lines[i])) {
        const child = lines[i].match(/^  ([A-Za-z]+):\s*"?([^"]*)"?$/);
        if (child) block[child[1]] = child[2];
        i++;
      }
      front.triage = block;
      continue;
    }
    front[key] = rest === "null" ? null : rest.replace(/^"|"$/g, "");
    i++;
  }
  return front;
}

function writeTriageBlock(dataDir, relPath, triageMark, criteriaHash, run) {
  const abs = join(dataDir, relPath);
  const text = readFileSync(abs, "utf8");
  const block = [
    "triage:",
    `  decision: "${triageMark.decision}"`,
    `  reason: "${triageMark.reason}"`,
    `  confidence: "${triageMark.confidence}"`,
    `  criteriaHash: "${criteriaHash}"`,
    `  decidedAt: "${run}"`,
  ].join("\n");
  const updated = text.replace(/^triage: null$/m, block);
  if (updated === text) throw new Error(`could not find "triage: null" in ${relPath}`);
  writeFileSync(abs, updated);
}

function canonOf(canonGroups, name) {
  const n = String(name || "").trim().toLowerCase();
  for (const g of canonGroups) {
    if (g.canonical.toLowerCase() === n) return g.canonical;
    if ((g.variants || []).some((v) => v.toLowerCase() === n)) return g.canonical;
  }
  return String(name || "unknown").trim() || "unknown";
}

function writeCompaniesMd(dataDir, canonGroups) {
  const lines = canonGroups.map((g) => `- ${g.canonical}  <=  ${(g.variants || []).join(", ")}`);
  writeFileSync(join(dataDir, JOB_RECORDS_DIR_REL, "companies.md"), lines.join("\n") + "\n");
}

function jobRecordBody(key, fields, canonicalCompany, completeness, sources, alreadyApplied, appliedEntryRef) {
  const front = [
    "---",
    `key: "${key}"`,
    `roleTitle: "${fields.roleTitle}"`,
    `normalizedTitle: "${fields.normalizedTitle}"`,
    `canonicalCompany: "${canonicalCompany}"`,
    `locations: ${JSON.stringify(fields.locations)}`,
    `workArrangement: "${fields.workArrangement}"`,
    `salaryAmountOrRange: "${fields.salaryAmountOrRange}"`,
    `salaryCurrency: "${fields.salaryCurrency}"`,
    `seniority: "${fields.seniority}"`,
    `employmentType: "${fields.employmentType}"`,
    `postingDate: "${fields.postingDate}"`,
    `originalLanguage: "${fields.originalLanguage}"`,
    `completeness: "${completeness}"`,
    "sources:",
    ...sources.map((s) => `  - { sourceName: "${s.sourceName}", sourceRef: "${s.sourceRef}", rawRecordId: "${s.rawRecordId}" }`),
    `appliedEntryRef: ${appliedEntryRef ? `"${appliedEntryRef}"` : "null"}`,
    `alreadyApplied: ${alreadyApplied ? "true" : "false"}`,
    "---",
  ].join("\n");
  const body = [
    "",
    "## Responsibilities",
    "",
    fields.responsibilitiesSummary || "unknown",
    "",
    "## Requirements",
    "",
    (fields.requirements || []).map((r) => `- ${r}`).join("\n") || "- unknown",
    "",
    "## Sources",
    "",
    ...sources.map((s) => `- [Raw record](./raw/${s.rawBasename})`),
    "",
  ].join("\n");
  return front + "\n" + body;
}

// Returns { ok, summary }. `summary`'s counters describe THIS run's new activity (postingsCollected,
// newRawRecords, newJobRecords, duplicatesMerged) — by design, not a cumulative total — so a
// same-scratch second pass legitimately renders a DIFFERENT last-run-summary.md (all-zero activity)
// even though nothing is wrong. Idempotency is checked on these counters directly, not by
// byte-diffing the rendered file — see evals/integration/idempotency.mjs.
export async function runMockPipeline({ dataDir }) {
  const RUN = answers.RUN_TIMESTAMP;
  const summary = newRunSummary(RUN);

  const settings = readSettings(dataDir);
  if (!settings.found || settings.setupReady !== true) {
    return { ok: false, reason: settings.found ? "setup-not-ready" : "settings-not-found", summary };
  }

  const sources = trackedBoardsToSources(settings.trackedBoards, 25);
  const hs = settings.hardStops || {};
  const excludedLocationsFolded = effectiveExcludedLocations(hs, settings.locationsExcluded);
  const criteria = {
    excludedLocations: [...new Set(excludedLocationsFolded)],
    lackedClearances: [...foldSet(hs.lackedClearances)],
    lackedWorkAuth: [...foldSet(hs.lackedWorkAuth)],
    visaSponsorshipRequired: hs.visaSponsorshipRequired === true,
  };
  const directions = (settings.directions || []).map((d) => ({ name: d.name, description: d.description }));
  const noCriteria = noTriageCriteria(criteria, directions);
  summary.noTriageCriteria = noCriteria;
  const critFingerprint = criteriaFingerprint(criteria, directions);

  // ---- collect: manual-drop ingestion only (boards are *.invalid — nothing resolves) ----
  const manualDir = join(dataDir, "inputs/manual-postings");
  if (existsSync(manualDir)) {
    for (const filename of readdirSync(manualDir).sort()) {
      const decision = answers.manualIngest[filename];
      if (!decision) throw new Error(`mock-pipeline: no manualIngest fixture for ${filename}`);
      const absSourcePath = join(manualDir, filename);
      // A dataDir-relative identifier, not the true absolute filesystem path: the real production
      // prompt (T016's "ingest-manual-postings") uses the absolute path, which is fine for a real
      // run but makes a COMMITTED expected fixture non-reproducible across scratch locations. The
      // synthetic dataset uses this portable form instead; noted as a Finding in the eval report.
      const portableRef = `inputs/manual-postings/${filename}`;
      if (!decision.isPosting) {
        summary.itemsSkipped.push({ ref: portableRef, reason: decision.reason });
        continue;
      }
      const rawBasename = `manual-${filename}`;
      const rawRelPath = `${RAW_DIR_REL}/${rawBasename}`;
      const rawAbsPath = join(dataDir, rawRelPath);
      const isNew = !existsSync(rawAbsPath);
      if (isNew) {
        const body = readFileSync(absSourcePath, "utf8");
        const content = [
          "---",
          `id: "${portableRef}"`,
          'sourceName: "manual"',
          `sourceRef: "${portableRef}"`,
          `firstSeenAt: "${RUN}"`,
          'retrievalMethod: "manual"',
          `run: "${RUN}"`,
          'availability: "ok"',
          "triage: null",
          "---",
          body,
        ].join("\n");
        writeFileSync(rawAbsPath, content);
        summary.postingsCollected++;
        summary.newRawRecords++;
        appendProvenanceLine(dataDir, RUN, {
          what: rawRelPath,
          how: "manual",
          why: `ingested from manual drop "${portableRef}"`,
        });
      }
    }
  }

  // ---- triage ----
  const rawDirAbs = join(dataDir, RAW_DIR_REL);
  const rawFiles = existsSync(rawDirAbs) ? readdirSync(rawDirAbs).filter((f) => f.endsWith(".md")).sort() : [];
  const rawRecords = [];
  for (const basename of rawFiles) {
    const relPath = `${RAW_DIR_REL}/${basename}`;
    const absPath = join(dataDir, relPath);
    const { frontRaw, body } = splitFrontMatter(readFileSync(absPath, "utf8"));
    const front = parseFront(frontRaw);
    rawRecords.push({ path: relPath, basename, id: front.id, body, triage: front.triage || null });
  }

  for (const rec of rawRecords) {
    const thisHash = stableHash(critFingerprint + " " + (rec.body || ""));

    if (rec.triage && rec.triage.criteriaHash === thisHash && rec.triage.decision) {
      if (rec.triage.decision === "kept") summary.triageKept++;
      else summary.triageRejected++;
      if (rec.triage.confidence === "low") summary.triageLowConfidence++;
      rec._decision = rec.triage.decision;
      continue;
    }

    const mark = noCriteria
      ? { decision: "kept", reason: "no triage criteria configured", confidence: "normal" }
      : answers.triage[rec.basename];
    if (!mark) throw new Error(`mock-pipeline: no triage fixture for ${rec.basename}`);

    writeTriageBlock(dataDir, rec.path, mark, thisHash, RUN);

    rec._decision = mark.decision;
    if (mark.decision === "kept") {
      summary.triageKept++;
      if (mark.confidence === "low") summary.triageLowConfidence++;
    } else {
      summary.triageRejected++;
      bumpReason(summary, mark.reason);
    }
    appendProvenanceLine(dataDir, RUN, {
      what: rec.path,
      how: "pre-triage",
      why: `${mark.decision} — ${mark.reason}` + (mark.confidence === "low" ? " (low confidence)" : ""),
    });
  }

  // ---- normalize ----
  const kept = rawRecords.filter((r) => r._decision === "kept");
  if (kept.length > 0) {
    if (!existsSync(join(dataDir, JOB_RECORDS_DIR_REL))) mkdirSync(join(dataDir, JOB_RECORDS_DIR_REL), { recursive: true });
    writeCompaniesMd(dataDir, answers.canonGroups);

    for (const rec of kept) {
      const fields = answers.extraction[rec.basename];
      if (!fields) throw new Error(`mock-pipeline: no extraction fixture for ${rec.basename}`);

      const canonicalCompany = canonOf(answers.canonGroups, fields.companyAsStated);
      const locs = fields.locations && fields.locations.length ? fields.locations : ["unknown"];
      const locKey = slug(fields.locationBucket) || [...new Set(locs.map((l) => slug(l)).filter(Boolean))].sort().join("_") || "unknown";
      const key = dedupKey(canonicalCompany, fields.roleTitle, locKey);
      const completeness = completenessLevel(fields, canonicalCompany);
      const { alreadyApplied = false, appliedEntryRef = null } = answers.applied[rec.basename] || {};

      const jobRecordPath = join(dataDir, JOB_RECORDS_DIR_REL, `${key}.md`);
      const rawFront = parseFront(splitFrontMatter(readFileSync(join(dataDir, rec.path), "utf8")).frontRaw);
      const thisSource = { sourceName: rawFront.sourceName, sourceRef: rec.id, rawRecordId: rec.id, rawBasename: rec.basename };

      if (!existsSync(jobRecordPath)) {
        const content = jobRecordBody(key, fields, canonicalCompany, completeness, [thisSource], alreadyApplied, appliedEntryRef);
        writeFileSync(jobRecordPath, content);
        summary.newJobRecords++;
        appendProvenanceLine(dataDir, RUN, {
          what: `${JOB_RECORDS_DIR_REL}/${key}.md`,
          how: "normalize",
          why: `created from ${rec.path}` + (alreadyApplied ? " (already applied)" : ""),
        });
      } else {
        // Idempotency (FR-005 / feature 001 SC-006): a re-run over a kept record whose source is
        // already listed on the Job Record is a true no-op — no file write, no provenance line, no
        // duplicatesMerged bump. Only an ACTUAL merge (a source not seen before) counts. Counting or
        // logging on every re-visit (regardless of whether anything changed) is exactly the kind of
        // idempotency gap this gate exists to catch — see docs/eval-reports/0002-….md Findings.
        const existing = readFileSync(jobRecordPath, "utf8");
        const alreadyListed = existing.includes(`rawRecordId: "${rec.id}"`);
        if (!alreadyListed) {
          const sourceLine = `  - { sourceName: "${thisSource.sourceName}", sourceRef: "${thisSource.sourceRef}", rawRecordId: "${thisSource.rawRecordId}" }`;
          const withSource = existing.replace(/^(sources:\n(?:  - .*\n)*)/m, (m0) => m0 + sourceLine + "\n");
          const sourcesBullet = `- [Raw record](./raw/${thisSource.rawBasename})`;
          const withBullet = withSource.includes(sourcesBullet)
            ? withSource
            : withSource.replace(/(## Sources\n\n(?:- \[Raw record\]\([^)]*\)\n)*)/, (m0) => m0 + sourcesBullet + "\n");
          writeFileSync(jobRecordPath, withBullet);
          summary.duplicatesMerged++;
          appendProvenanceLine(dataDir, RUN, {
            what: `${JOB_RECORDS_DIR_REL}/${key}.md`,
            how: "normalize",
            why: `merged source ${rec.path} into existing record`,
          });
        }
      }
    }
  }

  // ---- run summary ----
  const rendered = renderSummary(summary);
  writeFileSync(join(dataDir, "outputs/last-run-summary.md"), rendered + "\n");

  return { ok: true, summary };
}
