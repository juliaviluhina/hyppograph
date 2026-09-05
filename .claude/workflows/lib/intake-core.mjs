// intake-core — pure, dependency-free helpers for the intake & normalize pipeline.
//
// SOURCE OF TRUTH. `.claude/workflows/intake-normalize.js` carries a marker-delimited
// inlined copy of this file's body (the sandbox forbids `import`); the module content
// with `export ` prefixes removed and `import` lines dropped must stay byte-identical
// to that region. `evals/component/drift.test.mjs` enforces it (FR-002).
//
// Contract (contracts/prompt-module.md): no `import`, no I/O, no `Date.now()`,
// deterministic for a given input.

// Deterministic, dependency-free string hash (FNV-1a, 32-bit) for change-detection only.
export function stableHash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return "fnv1a:" + h.toString(16).padStart(8, "0");
}

// Deterministic title component for the dedup key (see dedupKey()).
// Strips parentheticals, a trailing " — Company" / " - Company" tail, and leading seniority words,
// then slugs. Same real role from two boards ("Senior Platform Engineer" /
// "Senior Platform Engineer (Remote, EU)") collapses to the same value: "platform-engineer".
export function titleKey(roleTitle) {
  let t = String(roleTitle || "unknown").toLowerCase();
  t = t.replace(/\([^)]*\)/g, " "); // drop "(remote, eu)" etc.
  t = t.replace(/\s+[—–-]\s+.*$/, " "); // drop trailing " — Acme Inc."
  t = t.replace(/^(?:jr|sr|junior|senior|staff|principal|lead|entry[-\s]?level)\b\.?\s+/i, "");
  return slug(t) || "unknown";
}

// Deterministic company component for the dedup key. The canonicaliser agent is unreliable about
// suffixes — "Tyrell Corp" one run, "Tyrell" the next; "Globex LLC" left alone — which silently
// renamed the Job Record file between runs. Strip trailing legal-entity / generic corporate
// suffixes repeatedly, then slug. companies.md + canonOf stay DISPLAY-only for the key.
export function companyKey(company) {
  let c = String(company || "unknown").toLowerCase().replace(/\([^)]*\)/g, " ");
  let prev;
  do {
    prev = c;
    c = c
      .replace(
        /[,.]?\s*\b(?:inc|llc|l\.l\.c|ltd|limited|corp|corporation|co|company|gmbh|ag|plc|s\.?a|n\.?v|b\.?v|oy|ab|holdings?|group|enterprises)\.?\s*$/i,
        ""
      )
      .trim();
  } while (c !== prev && c.length);
  return slug(c) || slug(String(company || "")) || "unknown";
}

export function slug(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export function foldSet(arr) {
  return new Set((arr || []).map((x) => String(x).trim().toLowerCase()).filter(Boolean));
}

// Dedup key assembly — companyKey--titleKey--locKey. Every LLM-derived component is re-derived
// DETERMINISTICALLY here: the judge's normalizedTitle and the canonicaliser's suffix handling both
// wobble run-to-run and silently split or rename Job Records. locKey is derived by the caller from
// the coarse locationBucket (see intake-normalize NORMALIZE).
export function dedupKey(canonicalCompany, roleTitle, locKey) {
  return `${companyKey(canonicalCompany)}--${titleKey(roleTitle)}--${locKey || "unknown"}`;
}

// Criteria fingerprint — a stable hash of the effective hard stops + considered directions.
// Stored on each triage mark; a change forces re-triage of every Raw Record (R6).
export function criteriaFingerprint(criteria, directions) {
  return stableHash(
    JSON.stringify({ criteria, directions: (directions || []).map((d) => d.description).sort() })
  );
}

// Union of the hard-stop excludedLocations and the locations-section excluded list, each folded
// (trimmed + lowercased + de-blanked). Caller de-dups with a Set.
export function effectiveExcludedLocations(hardStops, locationsExcluded) {
  return [
    ...foldSet((hardStops || {}).excludedLocations),
    ...foldSet(locationsExcluded),
  ];
}

// FR-008d — no hard stops AND no considered directions => nothing to triage against, keep everything.
export function noTriageCriteria(criteria, directions) {
  const hasHardStops =
    criteria.excludedLocations.length ||
    criteria.lackedClearances.length ||
    criteria.lackedWorkAuth.length ||
    criteria.visaSponsorshipRequired;
  return !hasHardStops && (directions || []).length === 0;
}

// Completeness level for a Job Record: "low" when >=60% of the fixed core fields are "unknown"/blank,
// or a core identity field (roleTitle, canonicalCompany) is missing/unknown, or requirements is empty.
export function completenessLevel(fields, canonicalCompany) {
  const coreVals = [
    fields.roleTitle,
    canonicalCompany,
    fields.locations && fields.locations.join(","),
    fields.workArrangement,
    fields.salaryAmountOrRange,
    fields.salaryCurrency,
    fields.seniority,
    fields.employmentType,
    fields.postingDate,
  ];
  const unknownCount = coreVals.filter(
    (v) => v === undefined || v === null || String(v).toLowerCase() === "unknown" || v === ""
  ).length;
  const requirementsEmpty = !fields.requirements || fields.requirements.length === 0;
  return unknownCount / coreVals.length >= 0.6 ||
    !fields.roleTitle ||
    fields.roleTitle.toLowerCase() === "unknown" ||
    String(canonicalCompany || "").toLowerCase() === "unknown" ||
    requirementsEmpty
    ? "low"
    : "ok";
}

// provenance-log.md line — one per Raw Record / triage mark / Job Record (contracts/outputs-format.md).
export function provenanceLine(run, { what, how, why }) {
  return `${run}  ${run}  ${what}  ${how}  ${why}`;
}

// RunSummary accumulator — mirrors data-model.md § RunSummary (FR-020).
export function newRunSummary(run) {
  return {
    run,
    postingsCollected: 0,
    newRawRecords: 0,
    triageKept: 0,
    triageRejected: 0,
    triageRejectReasons: {}, // { reasonBucket: count }
    triageLowConfidence: 0,
    newJobRecords: 0,
    duplicatesMerged: 0,
    sourcesFailed: [], // { source, reason }
    itemsSkipped: [], // { ref, reason }
    noTriageCriteria: false,
  };
}

export function bumpReason(summary, reason) {
  const key = String(reason || "unspecified").split(":")[0].trim().slice(0, 60) || "unspecified";
  summary.triageRejectReasons[key] = (summary.triageRejectReasons[key] || 0) + 1;
}

export function renderSummary(s) {
  const lines = [
    `Run ${s.run}`,
    `  postings collected      : ${s.postingsCollected}`,
    `  new raw records         : ${s.newRawRecords}`,
    `  triage kept / rejected  : ${s.triageKept} / ${s.triageRejected}`,
    `  triage low-confidence   : ${s.triageLowConfidence}`,
    `  new job records         : ${s.newJobRecords}`,
    `  duplicates merged       : ${s.duplicatesMerged}`,
  ];
  const rr = Object.entries(s.triageRejectReasons);
  if (rr.length) {
    lines.push("  reject-reason breakdown :");
    for (const [k, v] of rr) lines.push(`      ${k}: ${v}`);
  }
  if (s.sourcesFailed.length) {
    lines.push("  sources failed          :");
    for (const f of s.sourcesFailed) lines.push(`      ${f.source} — ${f.reason}`);
  }
  if (s.itemsSkipped.length) {
    lines.push("  items skipped           :");
    for (const it of s.itemsSkipped) lines.push(`      ${it.ref} — ${it.reason}`);
  }
  if (s.noTriageCriteria) {
    lines.push("  NOTE: no triage criteria configured — every posting kept by default (FR-008d)");
  }
  return lines.join("\n");
}

// tracked-board search configs -> the normalised { name, filteredSearch, depth, configError } shape
// the collect stage consumes. A bad/absent depth falls back to defaultDepth; an empty filteredSearch
// is a per-source config error (the source is skipped, the run continues).
export function trackedBoardsToSources(trackedBoards, defaultDepth) {
  return (trackedBoards || []).map((b) => {
    const depth = Number(b.depth);
    const badDepth = !Number.isFinite(depth) || depth < 1 || Math.floor(depth) !== depth;
    const emptySearch = !b.filteredSearch || !String(b.filteredSearch).trim();
    return {
      name: b.name || "(unnamed source)",
      filteredSearch: b.filteredSearch,
      depth: badDepth ? defaultDepth : depth,
      configError: emptySearch
        ? "filteredSearch is empty"
        : badDepth
        ? `depth is not a positive integer (${b.depth})`
        : null,
    };
  });
}
