// 005 T019 — harness-side citation audit (run-7 class).
// HARNESS-ONLY helper (not a mirror of workflow code): the production audit runs on
// hyppo-judge in-session; this applies the same rule — every non-Unknown row's
// evidenceSection must resolve in the named evidenceFile — to the committed
// evaluations, so citation rot fails the harness without a session.
// Resolution rule: the section string appears as a `## ` heading in the file.
import fs from "node:fs";
import path from "node:path";

export function parseRequirementRows(evalText) {
  const rows = [];
  const re = /-\s*requirement:\s*"([^"]+)"\s*\n\s*verdict:\s*"([^"]+)"\s*\n\s*evidenceFile:\s*(?:"([^"]*)"|null)\s*\n\s*evidenceSection:\s*(?:"([^"]*)"|null)/g;
  let m;
  while ((m = re.exec(evalText)) !== null) {
    rows.push({ requirement: m[1], verdict: m[2], evidenceFile: m[3] ?? null, evidenceSection: m[4] ?? null });
  }
  return rows;
}

export function resolveCitation(dataDir, evidenceFile, evidenceSection) {
  if (!evidenceFile || !evidenceSection) return false;
  let content;
  try {
    content = fs.readFileSync(path.join(dataDir, evidenceFile), "utf8");
  } catch {
    return false;
  }
  if (content.trim() === "") return false;
  return content.includes(`## ${evidenceSection}`);
}

// Returns { rows, bad }: bad lists every non-Unknown row whose citation fails to
// resolve. Unknown rows are skipped (both fields must be null — else malformed).
export function auditEvaluation(dataDir, evalPath) {
  const text = fs.readFileSync(evalPath, "utf8");
  const rows = parseRequirementRows(text);
  const bad = [];
  for (const r of rows) {
    if (r.verdict === "Unknown") {
      if (r.evidenceFile !== null || r.evidenceSection !== null) {
        bad.push({ ...r, reason: "Unknown row must leave file+section null" });
      }
      continue;
    }
    if (!resolveCitation(dataDir, r.evidenceFile, r.evidenceSection)) {
      bad.push({ ...r, reason: "section does not resolve in file" });
    }
  }
  return { rows, bad };
}
