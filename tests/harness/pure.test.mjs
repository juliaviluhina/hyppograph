// 005 — pure-helper tests + sync-check against .claude/workflows/fit-screen.js.
// Rule: fix the workflow file first, re-copy verbatim here, never the reverse.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyAtsBaseOverride,
  buildAtsApiUrl,
  mapSignalToMark,
  isInsufficientInput,
  computeOverallVerdict,
  fnv1aHex,
  computeInputFingerprint,
  parseSalaryRange,
  evaluateCompFloor,
} from "./support/pure.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKFLOW = path.resolve(HERE, "..", "..", ".claude", "workflows", "fit-screen.js");
const PURE = path.join(HERE, "support", "pure.mjs");

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `function ${name} not found`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1).replace(/^export\s+/, "").trim();
    }
  }
  throw new Error(`unbalanced braces in ${name}`);
}

test("sync-check: pure.mjs mirrors fit-screen.js verbatim", () => {
  const workflow = fs.readFileSync(WORKFLOW, "utf8");
  const pure = fs.readFileSync(PURE, "utf8");
  for (const name of [
    "applyAtsBaseOverride",
    "buildAtsApiUrl",
    "mapSignalToMark",
    "isInsufficientInput",
    "computeOverallVerdict",
    "fnv1aHex",
    "computeInputFingerprint",
    "parseSalaryRange",
    "evaluateCompFloor",
  ]) {
    assert.equal(extractFunction(pure, name), extractFunction(workflow, name), `${name} diverged — fix fit-screen.js, then re-copy`);
  }
});

test("buildAtsApiUrl recognizes the three boards, rejects the rest", () => {
  assert.equal(buildAtsApiUrl(["https://boards.greenhouse.io/acme/jobs/101"], {}), "https://boards-api.greenhouse.io/v1/boards/acme/jobs/101");
  assert.equal(buildAtsApiUrl(["https://job-boards.greenhouse.io/acme/jobs/101"], {}), "https://boards-api.greenhouse.io/v1/boards/acme/jobs/101");
  assert.equal(buildAtsApiUrl(["https://jobs.lever.co/initech/abc123"], {}), "https://api.lever.co/v0/postings/initech/abc123");
  assert.equal(buildAtsApiUrl(["https://jobs.ashbyhq.com/umbrella/def456"], {}), "https://api.ashbyhq.com/posting-api/job-board/umbrella/def456");
  assert.equal(buildAtsApiUrl(["https://careers.example.com/x/y"], {}), null);
  assert.equal(buildAtsApiUrl([], {}), null);
  assert.equal(buildAtsApiUrl(["https://careers.example.com/x", "https://boards.greenhouse.io/acme/jobs/101"], {}), "https://boards-api.greenhouse.io/v1/boards/acme/jobs/101");
});

test("overrides: empty map is byte-identical; mapped hosts rewrite; rest pass through", () => {
  const prod = "https://boards-api.greenhouse.io/v1/boards/acme/jobs/101";
  const map = { "boards-api.greenhouse.io": "127.0.0.1:8471" };
  assert.equal(buildAtsApiUrl(["https://boards.greenhouse.io/acme/jobs/101"], {}), prod);
  assert.equal(buildAtsApiUrl(["https://boards.greenhouse.io/acme/jobs/101"], map), "http://127.0.0.1:8471/v1/boards/acme/jobs/101");
  assert.equal(
    buildAtsApiUrl(["https://jobs.lever.co/initech/abc123"], map),
    "https://api.lever.co/v0/postings/initech/abc123"
  );
  assert.equal(applyAtsBaseOverride(prod, null), prod);
  assert.equal(applyAtsBaseOverride(prod, { "boards-api.greenhouse.io": "" }), prod);
});

test("mapSignalToMark follows research.md R6", () => {
  assert.equal(mapSignalToMark("found"), "confirmed-open");
  assert.equal(mapSignalToMark("not_found"), "confirmed-closed");
  assert.equal(mapSignalToMark("http_error"), "unresolvable");
  assert.equal(mapSignalToMark("unparseable"), "unresolvable");
});

test("isInsufficientInput catches sparse records (T041)", () => {
  const ok = { roleTitle: "X", canonicalCompany: "Y", requirements: ["a", "b"] };
  assert.equal(isInsufficientInput(ok), false);
  assert.equal(isInsufficientInput({ ...ok, roleTitle: "" }), true);
  assert.equal(isInsufficientInput({ ...ok, canonicalCompany: "unknown" }), true);
  assert.equal(isInsufficientInput({ ...ok, requirements: [] }), true);
  assert.equal(isInsufficientInput({ ...ok, requirements: ["unknown"] }), true);
});

test("computeOverallVerdict follows FR-006/FR-004a (T021)", () => {
  const req = (v, x = {}) => ({ verdict: v, ...x });
  const hc = (s, l = null) => ({ state: s, likelyOutcome: l });
  const strong2 = [req("Strong"), req("Strong")];
  assert.equal(computeOverallVerdict(strong2, []), "APPLY");
  assert.equal(computeOverallVerdict([req("Strong"), req("Fails")], []), "SKIP");
  assert.equal(computeOverallVerdict([req("Strong"), req("Absent", { narrowAdjacentException: true })], []), "APPLY-AND-SEE");
  assert.equal(computeOverallVerdict([req("Partial"), req("Partial")], []), "APPLY-AND-SEE");
  assert.equal(computeOverallVerdict(strong2, [hc("fail")]), "SKIP");
  assert.equal(computeOverallVerdict(strong2, [hc("unresolved", "likely-fail")]), "SKIP");
  assert.equal(computeOverallVerdict(strong2, [hc("unresolved", "even")]), "APPLY-AND-SEE");
  assert.equal(computeOverallVerdict(strong2, [hc("unresolved", "likely-pass")]), "APPLY-AND-SEE");
});

test("parseSalaryRange (issue 004): text -> comparable numbers, or null/hourly when it can't", () => {
  assert.equal(parseSalaryRange(""), null);
  assert.equal(parseSalaryRange("unknown"), null);
  assert.equal(parseSalaryRange(null), null);
  assert.deepEqual(parseSalaryRange("$90,000"), { low: 90000, high: 90000 });
  assert.deepEqual(parseSalaryRange("$90,000 - $110,000"), { low: 90000, high: 110000 });
  assert.deepEqual(parseSalaryRange("90k-120k"), { low: 90000, high: 120000 });
  assert.deepEqual(parseSalaryRange("$45/hr"), { hourly: true });
  assert.deepEqual(parseSalaryRange("Competitive hourly rate"), { hourly: true });
  assert.equal(parseSalaryRange("Competitive"), null);
});

test("evaluateCompFloor (issue 004): midpoint-clears-a-low-floor rule, deterministic, never assumed pass", () => {
  assert.deepEqual(evaluateCompFloor("120k", "USD", null), {
    constraint: "compFloor",
    state: "pass",
    likelyOutcome: null,
    note: null,
  });

  // low end below the floor, but midpoint clears it -> pass (data-model.md compFloor rule)
  let r = evaluateCompFloor("$90,000 - $130,000", "USD", { amount: 100000, currency: "USD" });
  assert.equal(r.state, "pass");
  assert.equal(r.constraint, "compFloor");
  assert.equal(r.likelyOutcome, null);

  // midpoint below the floor -> fail
  r = evaluateCompFloor("$80,000 - $90,000", "USD", { amount: 100000, currency: "USD" });
  assert.equal(r.state, "fail");

  // currency mismatch -> unresolved, never assumed pass/fail
  r = evaluateCompFloor("$150,000", "EUR", { amount: 100000, currency: "USD" });
  assert.equal(r.state, "unresolved");
  assert.equal(r.likelyOutcome, "even");

  // unparseable text -> unresolved
  r = evaluateCompFloor("Competitive", "USD", { amount: 100000, currency: "USD" });
  assert.equal(r.state, "unresolved");

  // hourly rate vs an annual floor -> unresolved, not a false comparison
  r = evaluateCompFloor("$60/hr", "USD", { amount: 100000, currency: "USD" });
  assert.equal(r.state, "unresolved");
});

test("fnv1aHex is deterministic and 8 hex chars", () => {
  assert.equal(fnv1aHex("hello"), fnv1aHex("hello"));
  assert.match(fnv1aHex("hello"), /^[0-9a-f]{8}$/);
  assert.notEqual(fnv1aHex("hello"), fnv1aHex("hellp"));
});

test("computeInputFingerprint (006 T007/contracts/eval-fingerprint.md): equal inputs -> equal hash, any change -> different hash, clock-immune", () => {
  const base = {
    rec: {
      roleTitle: "Backend Engineer",
      canonicalCompany: "Acme",
      locations: ["remote-eu"],
      salaryAmountOrRange: "120k",
      salaryCurrency: "USD",
      responsibilitiesSummary: "Build things.",
      requirements: ["Node.js", "Postgres"],
      openStatus: "confirmed-open",
    },
    evidenceFiles: [{ path: "cv.md", content: "CV text" }],
    applications: { exists: true, content: "tracker row" },
    hardConstraints: { compFloor: null, excludedRoleNatures: [] },
    hardStops: { excludedLocations: [], lackedClearances: [], lackedWorkAuth: [], visaSponsorshipRequired: false },
    targetRoles: { streams: [], recencyWindowYears: 5 },
  };
  const clone = JSON.parse(JSON.stringify(base));
  assert.equal(computeInputFingerprint(base), computeInputFingerprint(clone), "identical inputs must hash identically");

  const changedRec = { ...base, rec: { ...base.rec, roleTitle: "Staff Engineer" } };
  assert.notEqual(computeInputFingerprint(base), computeInputFingerprint(changedRec), "changed Job Record field must change the hash");

  const changedEvidence = { ...base, evidenceFiles: [{ path: "cv.md", content: "different CV text" }] };
  assert.notEqual(computeInputFingerprint(base), computeInputFingerprint(changedEvidence), "changed evidence must change the hash");

  const noTracker = { ...base, applications: { exists: false, content: "" } };
  assert.notEqual(computeInputFingerprint(base), computeInputFingerprint(noTracker), "tracker absence (NO_TRACKER sentinel) must differ from an empty-but-present tracker");

  const emptyTracker = { ...base, applications: { exists: true, content: "" } };
  assert.notEqual(computeInputFingerprint(noTracker), computeInputFingerprint(emptyTracker), "absent tracker and empty-but-present tracker must hash differently (data-model.md determinism note)");
});
