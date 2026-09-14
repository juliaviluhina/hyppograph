// 005 US4 (T026) — fixture-honesty pins (run-3 class).
// Run 3's bug was a fixture claiming more than its evidence supports ("5+ years"
// vs 3 years of platform work) plus overlapping employment dates. These pins make
// that exact fault class red: no inflated year-counts in any requirement, and the
// hard-fail fixture genuinely fails on exactly its designed axis.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { COMMITTED_DATA_DIR } from "../support/scratch.mjs";

const JR = path.join(COMMITTED_DATA_DIR, "outputs", "job-records");

function recordFiles() {
  return fs.readdirSync(JR).filter((f) => f.endsWith(".md")).map((f) => path.join(JR, f));
}

function requirementLines(text) {
  const m = /## Requirements\n\n((?:- .+\n?)+)/.exec(text);
  return m ? m[1].split("\n").filter(Boolean) : [];
}

test("fixture-honesty: no inflated year-counts in any fixture requirement", () => {
  // The fabricated persona supports at most ~3-year spans; "5+" in a requirement
  // is the exact run-3 fault (rewritten to "3+" in the fix).
  for (const f of recordFiles()) {
    for (const line of requirementLines(fs.readFileSync(f, "utf8"))) {
      assert.ok(!/5\+\s*years/i.test(line), `${path.basename(f)}: inflated requirement: ${line}`);
    }
  }
});

test("fixture-honesty: hard-fail fixture fails on its designed axis only", () => {
  const globex = fs.readFileSync(path.join(JR, "globex--senior-backend-engineer--onsite-usa.md"), "utf8");
  assert.match(globex, /United States.*on-site|on-site.*USA/i, "location must hit the excluded axis");
  const settings = JSON.parse(
    fs.readFileSync(path.join(COMMITTED_DATA_DIR, "inputs", "settings.json"), "utf8")
  );
  const excluded = settings.sections.hardStops.value.excludedLocations.join(" | ");
  assert.match(globex, /United States/, `record location must match an excluded location (${excluded})`);
});
