// 005 US3 (T023) — signal wiring: every ATS-shaped fixture sourceRef maps to a
// configured service scenario. No service needed — pure URL/shape contract.
// Catches wiring rot (renamed fixture org, edited sourceRef, stale scenarios.json)
// without running anything.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildAtsApiUrl } from "../support/pure.mjs";
import { readFrontMatter } from "../support/assert.mjs";
import { COMMITTED_DATA_DIR } from "../support/scratch.mjs";

const HERE = path.dirname(new URL(import.meta.url).pathname);

const EXPECTED = {
  "acme--backend-engineer--remote-eu": { path: "/v1/boards/acme-fixture/jobs/101", scenario: "live" },
  "initech--backend-engineer--remote-eu": { path: "/v0/postings/initech-fixture/abc123", scenario: "closed" },
  "umbrella--backend-engineer--remote-eu": { path: "/posting-api/job-board/umbrella-fixture/def456", scenario: "flapping" },
  "hooli--closed-role--remote-eu": { path: "/v1/boards/hyppograph-fixture-nonexistent-org/jobs/999999999", scenario: "closed" },
};

test("signal-wiring: fixture sourceRefs resolve to configured scenarios", () => {
  const scenarios = JSON.parse(fs.readFileSync(path.join(HERE, "..", "scenarios.json"), "utf8"));
  for (const [key, exp] of Object.entries(EXPECTED)) {
    const fm = readFrontMatter(path.join(COMMITTED_DATA_DIR, "outputs", "job-records", `${key}.md`));
    const prod = buildAtsApiUrl(fm.__sourceRefs, {});
    assert.ok(prod, `${key}: no ATS URL recognized`);
    assert.equal(new URL(prod).pathname, exp.path, `${key}: service path drifted`);
    assert.equal(scenarios[exp.path], exp.scenario, `${key}: scenario drifted`);
  }
});
