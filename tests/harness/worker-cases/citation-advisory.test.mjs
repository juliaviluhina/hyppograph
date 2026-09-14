// 005 US2 (T019) — citation_audit contract (run-7 class).
// Node-runnable: the harness-side audit (support/audit.mjs) resolves every citation
// in the 6 committed baseline evaluations, rejects a planted bad citation, and
// enforces the Unknown-null rule. Structural pin: a rejection is logged and falls
// through to persistence — never blocks it (SC-001).
// SESSION (manual T020): hyppo-judge agrees with this audit on a planted bad batch.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { auditEvaluation, parseRequirementRows } from "../support/audit.mjs";
import { hasNonBlockingAudit } from "../support/structure.mjs";
import { COMMITTED_DATA_DIR } from "../support/scratch.mjs";

const EVDIR = path.join(COMMITTED_DATA_DIR, "outputs", "evaluations");

test("citation-advisory: all committed baseline citations resolve", () => {
  const files = fs.readdirSync(EVDIR).filter((f) => f.endsWith(".md"));
  assert.ok(files.length >= 6);
  for (const f of files) {
    const { rows, bad } = auditEvaluation(COMMITTED_DATA_DIR, path.join(EVDIR, f));
    assert.ok(rows.length > 0, `${f}: no requirement rows parsed`);
    assert.deepEqual(bad, [], `${f}: unresolved citations: ${JSON.stringify(bad)}`);
  }
});

test("citation-advisory: planted bad citation and malformed Unknown row fail", () => {
  const evil = [
    `---`,
    `jobRecordKey: "x"`,
    `---`,
    `- requirement: "Real req"`,
    `  verdict: "Strong"`,
    `  evidenceFile: "inputs/evidence/career-history.md"`,
    `  evidenceSection: "Nonexistent Section XYZ"`,
    `- requirement: "Mystery req"`,
    `  verdict: "Unknown"`,
    `  evidenceFile: "inputs/evidence/career-history.md"`,
    `  evidenceSection: null`,
  ].join("\n");
  const rows = parseRequirementRows(evil);
  assert.equal(rows.length, 2);
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "hyppo-audit-")), "evil-eval.md");
  fs.writeFileSync(tmp, evil);
  try {
    const { bad } = auditEvaluation(COMMITTED_DATA_DIR, tmp);
    assert.equal(bad.length, 2);
    assert.ok(bad.some((b) => b.reason === "section does not resolve in file"));
    assert.ok(bad.some((b) => b.reason === "Unknown row must leave file+section null"));
  } finally {
    fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
  }
});

test("citation-advisory: rejection never blocks persistence", () => {
  assert.ok(hasNonBlockingAudit(), "non-blocking audit pin missing (run-7 class)");
});
