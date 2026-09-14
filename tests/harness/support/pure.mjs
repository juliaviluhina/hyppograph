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
