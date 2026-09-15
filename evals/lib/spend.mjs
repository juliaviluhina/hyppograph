// evals/lib/spend.mjs — the --confirm-spend gate, the per-run ceiling guard, and the cost
// estimate/measure handoff (FR-014, FR-015, research D12, contracts/evals-cli.md).

// eval-strategy.md §5: Haiku 4.5 $1.00/1M in, $5.00/1M out; per-call estimate light ~$0.007,
// medium ~$0.015, heavy ~$0.035 — blended ~$0.02/call. Not yet measured; replaced by the measured
// figure after the first metered run (SC-008).
export const BLENDED_COST_PER_CALL_ESTIMATE = 0.02;

// Built-in per-layer ceiling defaults (dollars) — generous enough for a full run at the blended
// estimate (eval-strategy.md §5's per-run figures), tight enough to catch a runaway loop.
export const DEFAULT_CEILINGS = {
  integration: 5,
  "integration-idem": 5,
  enumerate: 1,
  "pre-triage": 1,
  extraction: 1,
  "source-list": 1,
  "live-smoke": 2,
};

export function estimateCost(caseCount, perCallCost = BLENDED_COST_PER_CALL_ESTIMATE) {
  return caseCount * perCallCost;
}

// FR-014: without --confirm-spend, a run that would incur metered cost prints the estimate and
// exits 0 with no paid call. Returns { proceed, exitCode? }.
export function checkConfirmSpend({ layer, wouldBeMetered, confirmSpend, caseCount }) {
  if (!wouldBeMetered) return { proceed: true };
  if (confirmSpend) return { proceed: true };
  const est = estimateCost(caseCount);
  console.log(
    `${layer}: estimated cost $${est.toFixed(2)} (${caseCount} call(s) x $${BLENDED_COST_PER_CALL_ESTIMATE.toFixed(2)}/call, blended, not yet measured). Pass --confirm-spend to proceed. No paid call was made.`
  );
  return { proceed: false, exitCode: 0 };
}

// FR-015: a per-run ceiling checked BEFORE each metered call — never after — so it never
// overshoots. `record()` is the measured actual cost of a completed call.
export function createCeilingTracker(ceilingDollars) {
  let spent = 0;
  return {
    get spent() {
      return spent;
    },
    wouldCross(nextCallCost = BLENDED_COST_PER_CALL_ESTIMATE) {
      return spent + nextCallCost > ceilingDollars;
    },
    record(actualCost) {
      spent += actualCost;
    },
  };
}
