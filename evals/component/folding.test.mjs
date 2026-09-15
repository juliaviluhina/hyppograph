// evals/component/folding.test.mjs — foldSet / set-folding, renderSummary, newRunSummary,
// bumpReason, provenanceLine.

import test from "node:test";
import assert from "node:assert/strict";
import {
  foldSet,
  renderSummary,
  newRunSummary,
  bumpReason,
  provenanceLine,
} from "../../.claude/workflows/lib/intake-core.mjs";

test("foldSet: trims, lowercases, de-blanks, and de-dupes", () => {
  const s = foldSet([" Berlin ", "berlin", "London", ""]);
  assert.deepEqual([...s].sort(), ["berlin", "london"]);
});

test("foldSet: empty/absent input yields an empty set", () => {
  assert.equal(foldSet(undefined).size, 0);
  assert.equal(foldSet([]).size, 0);
});

test("provenanceLine: run, run, what, how, why — double-space separated", () => {
  const line = provenanceLine("2026-09-14T00:00:00Z", {
    what: "outputs/job-records/raw/foo.md",
    how: "mcp-page-read",
    why: "collected from \"Board A\" (depth 1/25)",
  });
  assert.equal(
    line,
    '2026-09-14T00:00:00Z  2026-09-14T00:00:00Z  outputs/job-records/raw/foo.md  mcp-page-read  collected from "Board A" (depth 1/25)'
  );
});

test("newRunSummary: zeroed accumulator shape", () => {
  const s = newRunSummary("run-1");
  assert.equal(s.run, "run-1");
  assert.equal(s.postingsCollected, 0);
  assert.equal(s.newRawRecords, 0);
  assert.equal(s.triageKept, 0);
  assert.equal(s.triageRejected, 0);
  assert.deepEqual(s.triageRejectReasons, {});
  assert.equal(s.triageLowConfidence, 0);
  assert.equal(s.newJobRecords, 0);
  assert.equal(s.duplicatesMerged, 0);
  assert.deepEqual(s.sourcesFailed, []);
  assert.deepEqual(s.itemsSkipped, []);
  assert.equal(s.noTriageCriteria, false);
});

test("bumpReason: buckets on the text before the first colon, counts occurrences", () => {
  const s = newRunSummary("run-1");
  bumpReason(s, "excluded-location: only listed in Antarctica");
  bumpReason(s, "excluded-location: only listed in the Arctic");
  bumpReason(s, "clearance: requires TS/SCI");
  assert.deepEqual(s.triageRejectReasons, { "excluded-location": 2, clearance: 1 });
});

test("bumpReason: falls back to \"unspecified\" for an empty/absent reason", () => {
  const s = newRunSummary("run-1");
  bumpReason(s, "");
  bumpReason(s, undefined);
  assert.deepEqual(s.triageRejectReasons, { unspecified: 2 });
});

test("renderSummary: includes the core counts and omits empty optional sections", () => {
  const s = newRunSummary("run-1");
  s.postingsCollected = 10;
  s.newRawRecords = 8;
  s.triageKept = 6;
  s.triageRejected = 2;
  s.newJobRecords = 5;
  s.duplicatesMerged = 1;
  const rendered = renderSummary(s);
  assert.match(rendered, /Run run-1/);
  assert.match(rendered, /postings collected\s+: 10/);
  assert.match(rendered, /new raw records\s+: 8/);
  assert.match(rendered, /triage kept \/ rejected\s+: 6 \/ 2/);
  assert.match(rendered, /new job records\s+: 5/);
  assert.match(rendered, /duplicates merged\s+: 1/);
  assert.doesNotMatch(rendered, /reject-reason breakdown/);
  assert.doesNotMatch(rendered, /sources failed/);
  assert.doesNotMatch(rendered, /items skipped/);
  assert.doesNotMatch(rendered, /NOTE: no triage criteria/);
});

test("renderSummary: surfaces reject-reason breakdown, sources failed, items skipped, no-criteria note", () => {
  const s = newRunSummary("run-1");
  bumpReason(s, "clearance: requires TS/SCI");
  s.sourcesFailed.push({ source: "Board A", reason: "could not open filtered search" });
  s.itemsSkipped.push({ ref: "note.md", reason: "not a posting" });
  s.noTriageCriteria = true;
  const rendered = renderSummary(s);
  assert.match(rendered, /reject-reason breakdown\s*:/);
  assert.match(rendered, /clearance: 1/);
  assert.match(rendered, /sources failed\s*:/);
  assert.match(rendered, /Board A — could not open filtered search/);
  assert.match(rendered, /items skipped\s*:/);
  assert.match(rendered, /note\.md — not a posting/);
  assert.match(rendered, /NOTE: no triage criteria configured/);
});
