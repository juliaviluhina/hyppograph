// mock-agent — deterministic fixture-canned `agent()` stand-in for debugging harness plumbing
// (research D7). Given a case id, returns a pre-recorded structured result: zero cost, no network,
// ignores pacing (there is no pacing to ignore — this never sleeps).
//
// Contract: fixtures carry the case's `mockResult` (the shape a real `agent()` call with a `schema`
// would have returned). A fixture with no `mockResult` is a fixture-authoring bug, not a runtime
// fallback — it throws rather than silently returning something plausible-looking.

export function createMockAgent(fixtures) {
  const byId = new Map((fixtures || []).map((f) => [f.id, f]));

  return async function mockAgent(caseId) {
    const fixture = byId.get(caseId);
    if (!fixture) {
      throw new Error(`mock-agent: no fixture for case id ${JSON.stringify(caseId)}`);
    }
    if (fixture.mockResult === undefined) {
      throw new Error(`mock-agent: fixture ${JSON.stringify(caseId)} has no mockResult`);
    }
    return fixture.mockResult;
  };
}
