// 005 US2 (T014) — hyppo-verify contract, node-runnable half.
// Missing piece (SESSION, manual T020): the worker itself returning only the raw
// signal. What node CAN pin: the fixture ground truth the worker must agree with —
// every scenario URL's status/shape, the signal derivation per research.md R6, the
// signal→mark mapping, and that non-ATS sources never reach the worker.
// SESSION: in-session, prompt hyppo-verify with each URL below and assert the
// returned signal matches; assert it never emits confirmed-*/unresolvable.
import test from "node:test";
import assert from "node:assert/strict";
import { fetchFixture, setScenario, harnessOrigin } from "../support/fetch.mjs";
import { buildAtsApiUrl, mapSignalToMark } from "../support/pure.mjs";
import { readFrontMatter } from "../support/assert.mjs";
import { COMMITTED_DATA_DIR } from "../support/scratch.mjs";
import path from "node:path";

const PATHS = {
  acme: "/v1/boards/acme-fixture/jobs/101",
  initech: "/v0/postings/initech-fixture/abc123",
  umbrella: "/posting-api/job-board/umbrella-fixture/def456",
};

// Mirrors the hyppo-verify contract + research.md R6 (the worker's only job).
function deriveSignal(status, body) {
  if (status === 200 && body && typeof body === "object" && ("title" in body || "text" in body || "id" in body) && !("surprise" in body)) return "found";
  if (status === 404) return "not_found";
  if (status === 200) return "unparseable";
  return "http_error";
}

function recordSourceRefs(key) {
  const fm = readFrontMatter(path.join(COMMITTED_DATA_DIR, "outputs", "job-records", `${key}.md`));
  return fm.__sourceRefs;
}

test("verify-signal: self-configure scenarios, then assert ground truth", async () => {
  await setScenario(PATHS.acme, "live");
  await setScenario(PATHS.initech, "closed");
  await setScenario(PATHS.umbrella, "flapping");

  let res = await fetchFixture(PATHS.acme);
  assert.equal(deriveSignal(res.status, await res.json()), "found");
  res = await fetchFixture(PATHS.initech);
  assert.equal(res.status, 404);
  assert.equal(deriveSignal(res.status, await res.json()), "not_found");
  res = await fetchFixture(PATHS.umbrella);
  assert.equal(deriveSignal(res.status, await res.json()), "found"); // flapping starts live

  await setScenario(PATHS.acme, "malformed");
  res = await fetchFixture(PATHS.acme);
  assert.equal(deriveSignal(res.status, await res.json()), "unparseable");
  await setScenario(PATHS.acme, "error");
  res = await fetchFixture(PATHS.acme);
  assert.equal(deriveSignal(res.status, await res.json()), "http_error");

  await setScenario(PATHS.acme, "live"); // restore defaults for other files
});

test("verify-signal: mapping + non-ATS short-circuit", () => {
  assert.equal(mapSignalToMark("found"), "confirmed-open");
  assert.equal(mapSignalToMark("not_found"), "confirmed-closed");
  assert.equal(mapSignalToMark("http_error"), "unresolvable");
  assert.equal(mapSignalToMark("unparseable"), "unresolvable");
  // Non-ATS sourceRefs never reach the worker: null URL, no call spent (R5).
  assert.equal(buildAtsApiUrl(recordSourceRefs("vandelay--senior-platform-engineer--berlin"), {}), null);
  // ATS fixtures route through the override map to this service's paths.
  const origin = harnessOrigin().replace(/^http:\/\//, "");
  const apiUrl = buildAtsApiUrl(recordSourceRefs("acme--backend-engineer--remote-eu"), {
    "boards-api.greenhouse.io": origin,
  });
  assert.equal(new URL(apiUrl).pathname, PATHS.acme);
});
