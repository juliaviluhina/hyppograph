// 005 T024 — harness-side config-gate mirror (run-1 class).
// HARNESS-ONLY helper: production validation lives in fit-screen.js
// (validateFeatureConfig + the FR-000 gate); this applies the same rules to parsed
// settings + a file probe so malformed/empty/missing config fails in node.
// readFile(relPath) -> string|null (null when missing/unreadable/empty).
export function checkConfigGate(settings, readFile) {
  const issues = [];
  const sections = settings?.sections ?? {};
  const files = sections.evidenceBase?.value?.files;
  if (!Array.isArray(files) || files.length === 0) {
    issues.push("evidenceBase.files is empty or missing");
  } else {
    for (const f of files) {
      if (typeof f !== "string" || !f.startsWith("inputs/")) {
        issues.push(`evidenceBase file path is not a data-dir-relative inputs/ path: ${JSON.stringify(f)}`);
        continue;
      }
      if (f === "inputs/settings.json") {
        issues.push("evidenceBase file points at settings.json itself, not evidence");
        continue;
      }
      let content = null;
      try {
        content = readFile(f);
      } catch {
        content = null;
      }
      if (typeof content !== "string" || content.trim() === "") {
        issues.push(`evidenceBase file missing or empty: ${f}`);
      }
    }
  }
  const hc = sections.hardConstraints?.value;
  if (hc !== undefined) {
    if (hc.compFloor !== null && hc.compFloor !== undefined) {
      if (typeof hc.compFloor.amount !== "number" || hc.compFloor.amount <= 0 || !hc.compFloor.currency) {
        issues.push("hardConstraints.compFloor is malformed (must be null or { amount > 0, currency })");
      }
    }
    if (!Array.isArray(hc.excludedRoleNatures)) {
      issues.push("hardConstraints.excludedRoleNatures must be an array");
    }
  }
  const tr = sections.targetRoles?.value;
  if (!tr || !Array.isArray(tr.streams) || tr.streams.length === 0) {
    issues.push("targetRoles.streams is empty or missing");
  }
  const rwy = tr?.recencyWindowYears;
  if (!Number.isInteger(rwy) || rwy <= 0) {
    issues.push("targetRoles.recencyWindowYears is missing or not a positive integer");
  }
  return issues;
}
