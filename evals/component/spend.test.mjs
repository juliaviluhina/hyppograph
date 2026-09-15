// evals/component/spend.test.mjs — evals/lib/spend.mjs's confirm-spend gate and ceiling tracker
// (FR-014, FR-015). Not yet exercised by a live metered call path (no substrate calls it until the
// judge client (T033) or the FR-023 milestone) — these are direct unit checks of the primitives.

import test from "node:test";
import assert from "node:assert/strict";
import { checkConfirmSpend, createCeilingTracker, estimateCost, BLENDED_COST_PER_CALL_ESTIMATE } from "../lib/spend.mjs";

test("spend: a non-metered run always proceeds regardless of --confirm-spend", () => {
  const r = checkConfirmSpend({ layer: "component", wouldBeMetered: false, confirmSpend: false, caseCount: 0 });
  assert.deepEqual(r, { proceed: true });
});

test("spend: a metered run without --confirm-spend prints an estimate and exits 0, no paid call (FR-014)", () => {
  const r = checkConfirmSpend({ layer: "integration", wouldBeMetered: true, confirmSpend: false, caseCount: 100 });
  assert.equal(r.proceed, false);
  assert.equal(r.exitCode, 0);
});

test("spend: a metered run WITH --confirm-spend proceeds", () => {
  const r = checkConfirmSpend({ layer: "integration", wouldBeMetered: true, confirmSpend: true, caseCount: 100 });
  assert.deepEqual(r, { proceed: true });
});

test("spend: estimateCost multiplies case count by the blended per-call cost", () => {
  assert.equal(estimateCost(100), 100 * BLENDED_COST_PER_CALL_ESTIMATE);
  assert.equal(estimateCost(10, 0.05), 0.5);
});

test("spend: ceiling tracker allows calls under the ceiling and blocks BEFORE crossing it (FR-015)", () => {
  const tracker = createCeilingTracker(0.05);
  assert.equal(tracker.wouldCross(0.02), false);
  tracker.record(0.02);
  assert.equal(tracker.wouldCross(0.02), false);
  tracker.record(0.02);
  // spent = 0.04; next call 0.02 would bring it to 0.06 > 0.05 ceiling — must block BEFORE, not after.
  assert.equal(tracker.wouldCross(0.02), true);
  assert.equal(tracker.spent, 0.04);
});

test("spend: a ceiling of 0 blocks the very first call", () => {
  const tracker = createCeilingTracker(0);
  assert.equal(tracker.wouldCross(0.01), true);
});
