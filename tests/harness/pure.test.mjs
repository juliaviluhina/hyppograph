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
  for (const name of ["applyAtsBaseOverride", "buildAtsApiUrl", "mapSignalToMark", "isInsufficientInput", "computeOverallVerdict"]) {
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
