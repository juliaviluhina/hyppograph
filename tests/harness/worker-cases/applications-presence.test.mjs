// 005 US2 (T018) — applications-reader contract (research.md R3).
// Node-runnable: the tracker parses with the rows reconciliation needs (a submitted
// match; rows distinguishable by company+role for the ambiguous case), and the
// workflow forces the missing-file => unknown override deterministically in code
// (the model is never trusted with that distinction).
// SESSION (manual T020): no-match+present => not_applied; missing file => unknown;
// conflicting evidence => ambiguous with note.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { workflowSource } from "../support/structure.mjs";
import { COMMITTED_DATA_DIR } from "../support/scratch.mjs";

function trackerRows() {
  const text = fs.readFileSync(path.join(COMMITTED_DATA_DIR, "inputs", "applications.md"), "utf8");
  return text.split("\n").filter((l) => l.startsWith("| ")).slice(1); // skip header+separator handled below
}

test("applications-presence: tracker parses with a submitted match row", () => {
  const rows = trackerRows().filter((l) => !l.includes("---"));
  assert.ok(rows.length >= 4, `expected data rows, got ${rows.length}`);
  assert.ok(rows.some((r) => r.includes("Vandelay Industries") && r.includes("submitted")), "submitted match row for vandelay");
});

test("applications-presence: missing file forces unknown in code, not in the model", () => {
  const src = workflowSource();
  assert.ok(src.includes("exists=false"), "reader distinguishes missing file");
  assert.ok(
    src.includes("No applications tracker file exists this run"),
    "script forces unknown when the tracker is missing (R3)"
  );
});
