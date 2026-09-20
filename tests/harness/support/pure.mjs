// 005 — verbatim mirror of the pure helpers in .claude/workflows/fit-screen.js.
// The workflow sandbox forbids `import`, so logic lives there; this file mirrors it
// for node:test. A sync-check test (pure.test.mjs) asserts the function sources are
// textually identical — fix the workflow file first, then re-copy here, never the
// reverse. (Same "duplicated and kept in sync" convention 004 already uses for
// helpers shared with intake-normalize.js.)

export function applyAtsBaseOverride(apiUrl, overrides) {
  if (!overrides || typeof overrides !== "object") return apiUrl;
  for (const [host, origin] of Object.entries(overrides)) {
    const prefix = `https://${host}`;
    if (typeof origin === "string" && origin !== "" && apiUrl.startsWith(prefix + "/")) {
      return `http://${origin}` + apiUrl.slice(prefix.length);
    }
  }
  return apiUrl;
}

export function buildAtsApiUrl(sourceRefs, overrides) {
  let url = null;
  for (const ref of sourceRefs || []) {
    const gh = /^https?:\/\/(?:boards|job-boards)\.greenhouse\.io\/([^/]+)\/jobs\/(\d+)/.exec(ref);
    if (gh) { url = `https://boards-api.greenhouse.io/v1/boards/${gh[1]}/jobs/${gh[2]}`; break; }

    const lever = /^https?:\/\/jobs\.lever\.co\/([^/]+)\/([^/?#]+)/.exec(ref);
    if (lever) { url = `https://api.lever.co/v0/postings/${lever[1]}/${lever[2]}`; break; }

    const ashby = /^https?:\/\/jobs\.ashbyhq\.com\/([^/]+)\/([^/?#]+)/.exec(ref);
    if (ashby) { url = `https://api.ashbyhq.com/posting-api/job-board/${ashby[1]}/${ashby[2]}`; break; }
  }
  if (!url) return null;
  return applyAtsBaseOverride(url, overrides);
}

export function mapSignalToMark(signal) {
  if (signal === "found") return "confirmed-open";
  if (signal === "not_found") return "confirmed-closed";
  return "unresolvable"; // http_error | unparseable
}

export function isInsufficientInput(rec) {
  const missing = (v) => !v || String(v).trim() === "" || String(v).toLowerCase() === "unknown";
  const noRequirements =
    !Array.isArray(rec.requirements) ||
    rec.requirements.length === 0 ||
    (rec.requirements.length === 1 && missing(rec.requirements[0]));
  return missing(rec.roleTitle) || missing(rec.canonicalCompany) || noRequirements;
}

// 006 T003/T007 — FNV-1a 32-bit over UTF-16 code units, hex, zero-padded to 8 chars.
// contracts/eval-fingerprint.md — mirrored verbatim from .claude/workflows/fit-screen.js.
export function fnv1aHex(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// 006 T003/T007 — contracts/eval-fingerprint.md. parts[0] is the parsed-record proxy (T002 decision),
// not raw file text: identical shape to buildScorePrompt's JOB RECORD JSON, so anything that could
// change hyppo-score's answer is already covered.
export function computeInputFingerprint({ rec, evidenceFiles, applications, hardConstraints, hardStops, targetRoles }) {
  const parts = [
    JSON.stringify({
      roleTitle: rec.roleTitle,
      canonicalCompany: rec.canonicalCompany,
      locations: rec.locations,
      salaryAmountOrRange: rec.salaryAmountOrRange,
      salaryCurrency: rec.salaryCurrency,
      responsibilitiesSummary: rec.responsibilitiesSummary,
      requirements: rec.requirements,
      openStatus: rec.openStatus,
    }),
    ...evidenceFiles.map((f) => f.content),
    applications.exists ? applications.content : "NO_TRACKER",
    JSON.stringify({ hardConstraints, hardStops, targetRoles }),
  ];
  return fnv1aHex(parts.join("\n---\n"));
}

// issue 004 remediation — mirrored verbatim from .claude/workflows/fit-screen.js.
export function parseSalaryRange(text) {
  if (!text) return null;
  const trimmed = String(text).trim();
  if (trimmed === "" || trimmed.toLowerCase() === "unknown") return null;
  if (/\b(hourly|hour|\/\s*hr)\b/i.test(trimmed)) return { hourly: true };
  const numbers = [];
  const numRe = /(\d[\d,]*(?:\.\d+)?)\s*(k\b)?/gi;
  let m;
  while ((m = numRe.exec(trimmed)) !== null) {
    let n = parseFloat(m[1].replace(/,/g, ""));
    if (Number.isNaN(n)) continue;
    if (m[2]) n *= 1000; // "k" suffix, e.g. "90k-120k"
    numbers.push(n);
  }
  if (numbers.length === 0) return null;
  if (numbers.length === 1) return { low: numbers[0], high: numbers[0] };
  return { low: numbers[0], high: numbers[1] };
}

export function evaluateCompFloor(salaryAmountOrRange, salaryCurrency, compFloor) {
  if (!compFloor) return { constraint: "compFloor", state: "pass", likelyOutcome: null, note: null };

  if (salaryCurrency && salaryCurrency.toLowerCase() !== "unknown" && salaryCurrency !== compFloor.currency) {
    return {
      constraint: "compFloor",
      state: "unresolved",
      likelyOutcome: "even",
      note: `posting currency ${salaryCurrency} differs from configured floor currency ${compFloor.currency}; no conversion performed`,
    };
  }

  const parsed = parseSalaryRange(salaryAmountOrRange);
  if (!parsed) {
    return {
      constraint: "compFloor",
      state: "unresolved",
      likelyOutcome: "even",
      note: "posting's salary text did not resolve to a comparable annual figure",
    };
  }
  if (parsed.hourly) {
    return {
      constraint: "compFloor",
      state: "unresolved",
      likelyOutcome: "even",
      note: "posting states an hourly rate; no hourly comp floor is configured to compare against",
    };
  }

  const midpoint = (parsed.low + parsed.high) / 2;
  const pass = midpoint >= compFloor.amount;
  return {
    constraint: "compFloor",
    state: pass ? "pass" : "fail",
    likelyOutcome: null,
    note: `midpoint ${midpoint} ${pass ? ">=" : "<"} floor ${compFloor.amount}`,
  };
}

export function computeOverallVerdict(requirementTable, hardConstraints) {
  const RANK = { SKIP: 0, "APPLY-AND-SEE": 1, APPLY: 2 };

  const anyHardFail = hardConstraints.some((c) => c.state === "fail");
  const anyLikelyFailUnresolved = hardConstraints.some((c) => c.state === "unresolved" && c.likelyOutcome === "likely-fail");
  const anyUnresolved = hardConstraints.some((c) => c.state === "unresolved");

  const failOrAbsent = requirementTable.filter((r) => r.verdict === "Fails" || r.verdict === "Absent");
  const failOrAbsentNoException = failOrAbsent.filter((r) => !r.narrowAdjacentException);

  let base;
  if (failOrAbsentNoException.length > 0) {
    base = "SKIP";
  } else if (failOrAbsent.length > 0) {
    base = "APPLY-AND-SEE"; // every such row was covered by the narrow-adjacent-subskill exception
  } else {
    const partialCount = requirementTable.filter((r) => r.verdict === "Partial").length;
    base = partialCount >= 2 ? "APPLY-AND-SEE" : "APPLY";
  }

  let rank = RANK[base];
  if (anyHardFail || anyLikelyFailUnresolved) rank = RANK.SKIP;
  else if (anyUnresolved) rank = Math.min(rank, RANK["APPLY-AND-SEE"]);

  return Object.keys(RANK).find((k) => RANK[k] === rank);
}
