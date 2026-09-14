// 005 T006 — FR-005 isolation assertion, two-sided: every ATS call the run
// claims must appear in the fixture-service access log, AND zero non-loopback
// targets may appear anywhere in the run's inputs. Assertion, not trust:
// a misconfigured override map falling back to a live host must fail the run.
const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1"]);

export function nonLoopbackTargets(urls) {
  const bad = [];
  for (const raw of urls ?? []) {
    let host;
    try {
      host = new URL(raw).hostname;
    } catch {
      bad.push(raw); // unparseable URL is itself a failure
      continue;
    }
    if (!LOOPBACK.has(host)) bad.push(raw);
  }
  return bad;
}

export function assertLoopbackOnly(urls, what = "run inputs") {
  const bad = nonLoopbackTargets(urls);
  if (bad.length > 0) {
    throw new Error(
      `isolation violation: non-loopback target(s) in ${what}: ${bad.join(", ")}`
    );
  }
}

// accessLog: rows from GET /__admin/access-log (or the JSONL file); expectedPaths:
// ATS paths the run claims to have called. Every expected path must have at least
// one request row.
export function assertServiceLogCovers(accessLog, expectedPaths) {
  const seen = new Set(
    (accessLog ?? []).filter((r) => r.type === "request").map((r) => r.path)
  );
  const missing = (expectedPaths ?? []).filter((p) => !seen.has(p));
  if (missing.length > 0) {
    throw new Error(
      `isolation violation: service access log is missing expected ATS call(s): ${missing.join(", ")}`
    );
  }
}
