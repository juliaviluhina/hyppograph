// 007 T017 — FR-004 structural pin: every in-class verbatim-write call site (audit #1/#2/#3)
// must use the BEGIN-CONTENT/END-CONTENT marker convention (contracts/verbatim-write.md).
// Free, node-only, zero live model calls — see tests/harness/support/structure.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hasWriteEvaluationMarkers,
  hasFitScreenSummaryMarkers,
  hasIntakeSummaryMarkers,
} from "../support/structure.mjs";

test("write-evaluation (audit #1) uses BEGIN-CONTENT/END-CONTENT markers", () => {
  assert.ok(hasWriteEvaluationMarkers(), "write-evaluation marker pin broken");
});

test("fit-screen write-run-summary (audit #2) uses BEGIN-CONTENT/END-CONTENT markers", () => {
  assert.ok(hasFitScreenSummaryMarkers(), "fit-screen write-run-summary marker pin broken");
});

test("intake-normalize write-run-summary (audit #3) uses BEGIN-CONTENT/END-CONTENT markers", () => {
  assert.ok(hasIntakeSummaryMarkers(), "intake-normalize write-run-summary marker pin broken");
});
