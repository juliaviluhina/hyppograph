// 005 — machine-readable form of contracts/expected-matrix.md (concrete fixtures).
// The --assert mode checks a scratch dir against this; the contract stays the source
// of truth for humans. Keep the two in sync when fixtures change.
export const OVERRIDE_HOSTS = [
  "boards-api.greenhouse.io",
  "api.lever.co",
  "api.ashbyhq.com",
];

export function overrideMap(origin) {
  return Object.fromEntries(OVERRIDE_HOSTS.map((h) => [h, origin]));
}

// key -> expectation for a session-backed workflow run with default scenarios
// (tests/harness/scenarios.json) against a scratch copy of the fixtures.
// 006 R3/contracts/harness-report-amendment.md — the three ATS-backed fixtures require the
// live wire (WebFetch upgrades http->https; 005 R8): an isolated loopback run cannot exercise
// them, so --assert reports them `blocked` instead of pass/fail. `--wire live` asserts them
// normally.
export const SIGNAL_EXPECTATIONS = {
  "acme--backend-engineer--remote-eu": {
    mark: "confirmed-open",
    evaluated: true,
    verdict: "APPLY",
    requiresWire: true,
  },
  "initech--backend-engineer--remote-eu": {
    mark: "confirmed-closed",
    evaluated: false,
    requiresWire: true,
  },
  "umbrella--backend-engineer--remote-eu": {
    // flapping starts live: first run scores it; the flip case (T021) asserts the rest
    mark: "confirmed-open",
    evaluated: true,
    requiresWire: true,
  },
  "hooli--closed-role--remote-eu": {
    mark: "confirmed-closed", // terminal: never re-checked, never scored
    evaluated: false,
    rechecked: false, // terminal marks are never re-fetched: no service-log entry expected
  },
};
