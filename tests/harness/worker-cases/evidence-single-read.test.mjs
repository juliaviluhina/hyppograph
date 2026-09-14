// 005 US2 (T017) — evidence-reader contract (run-5 class).
// Node-runnable: both evidence files resolve independently with distinct content;
// structural pin: the workflow issues ONE agent() call per file inside the per-file
// loop (a batched multi-file read is what returned the wrong file in run 5).
// SESSION (manual T020): two per-file reads return their own path+content.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { hasSingleFileEvidenceReads } from "../support/structure.mjs";
import { COMMITTED_DATA_DIR } from "../support/scratch.mjs";

const EV = path.join(COMMITTED_DATA_DIR, "inputs", "evidence");

test("evidence-single-read: files resolve independently with distinct content", () => {
  const ch = fs.readFileSync(path.join(EV, "career-history.md"), "utf8");
  const cv = fs.readFileSync(path.join(EV, "cv-content.md"), "utf8");
  assert.ok(ch.trim().length > 0 && cv.trim().length > 0);
  assert.notEqual(ch, cv, "evidence files must not be interchangeable");
  assert.match(ch, /Career history/);
  assert.match(cv, /CV content/);
});

test("evidence-single-read: workflow reads one file per agent() call", () => {
  assert.ok(hasSingleFileEvidenceReads(), "per-file evidence-read pin missing (run-5 class)");
});
