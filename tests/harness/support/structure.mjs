// 005 — structural pins on .claude/workflows/fit-screen.js source.
// These guard fixes whose behavior only manifests in-session (runs 5/6/7 class):
// the structure that makes the bug impossible must stay present. If 006 legitimately
// restructures the code, it updates these pins — never deletes them silently.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKFLOW = path.resolve(HERE, "..", "..", "..", ".claude", "workflows", "fit-screen.js");
const AGENTS = path.resolve(HERE, "..", "..", "..", ".claude", "agents");

export function workflowSource() {
  return fs.readFileSync(WORKFLOW, "utf8");
}

// Run 6 pin: settings arrive as raw text and are parsed in code — never transcribed.
export function hasRawSettingsPassthrough(src = workflowSource()) {
  return (
    src.includes("schema: rawFileReadSchema") &&
    src.includes("JSON.parse(settingsFile.content)")
  );
}

// Run 5 pin: exactly one evidence-read call site, inside the per-file loop.
export function hasSingleFileEvidenceReads(src = workflowSource()) {
  const callSites = (src.match(/schema: evidenceReadSchema/g) ?? []).length;
  const loopIdx = src.indexOf("for (const f of settings.evidenceBase.files)");
  const callIdx = src.indexOf("schema: evidenceReadSchema");
  return callSites === 1 && loopIdx >= 0 && callIdx > loopIdx;
}

// Run 7 pin: a rejected citation audit is logged and falls through to the
// evaluation write — no return/continue/throw between rejection and persistence.
export function hasNonBlockingAudit(src = workflowSource()) {
  const marker = "citation_audit rejected — proceeding";
  const mi = src.indexOf(marker);
  if (mi < 0) return false;
  const wi = src.indexOf("label: `write-evaluation", mi);
  if (wi < 0) return false;
  return !/\b(return|continue|throw)\b/.test(src.slice(mi, wi));
}

// T024 pin (red until 006): the score phase reads the existing evaluation file
// before writing — the prerequisite for skip-when-unchanged.
export function hasIdempotencyGuard(src = workflowSource()) {
  return /read-evaluation|existingEval|existing-evaluation|skip.*unchanged|unchanged.*skip/i.test(src);
}

// Run 2 pin: agent definitions exist with least-privilege grants.
export function readAgentDef(name) {
  const text = fs.readFileSync(path.join(AGENTS, `${name}.md`), "utf8");
  const m = /^---\n([\s\S]*?)\n---/.exec(text);
  const fm = {};
  if (m) {
    for (const line of m[1].split("\n")) {
      const kv = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line.trim());
      if (kv) fm[kv[1]] = kv[2];
    }
  }
  return fm;
}
