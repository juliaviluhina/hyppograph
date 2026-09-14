// 005 US3 (T021) — flapping mark update, node-runnable half.
// Service-level flip mechanics are proven in service.test.mjs; what this pins is
// the harness's flip-awareness: a post-flip scratch (umbrella confirmed-closed
// WITH its run-1 evaluation intact) passes under flipped expectations and fails
// under default ones. The live two-run session (run → flip → re-run) is manual
// (quickstart scenario 3); --prep + --assert are its rails.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { makeScratch } from "../support/scratch.mjs";
import { assertScratch } from "../support/assert.mjs";
import { SIGNAL_EXPECTATIONS } from "../support/expectations.mjs";

const FLIPPED = {
  ...SIGNAL_EXPECTATIONS,
  "umbrella--backend-engineer--remote-eu": { mark: "confirmed-closed", evaluated: true },
};

function setMark(dir, key, mark) {
  const f = path.join(dir, "outputs", "job-records", `${key}.md`);
  let text = fs.readFileSync(f, "utf8");
  text = text.replace(/^openStatus:.*$/m, `openStatus: "${mark}"`);
  fs.writeFileSync(f, text);
}

function writeEval(dir, key, verdict) {
  fs.writeFileSync(
    path.join(dir, "outputs", "evaluations", `${key}.md`),
    `---\njobRecordKey: "${key}"\noverallVerdict: "${verdict}"\n---\n\n# ${key}\n`
  );
}

function postFlipScratch() {
  const s = makeScratch();
  setMark(s.dir, "acme--backend-engineer--remote-eu", "confirmed-open");
  setMark(s.dir, "initech--backend-engineer--remote-eu", "confirmed-closed");
  setMark(s.dir, "umbrella--backend-engineer--remote-eu", "confirmed-closed"); // flipped after run 1
  writeEval(s.dir, "acme--backend-engineer--remote-eu", "APPLY");
  writeEval(s.dir, "umbrella--backend-engineer--remote-eu", "APPLY"); // run-1 file, untouched
  fs.writeFileSync(
    path.join(s.dir, "outputs", "last-run-summary-fit-screen.md"),
    [
      `Run 2026-09-14T00:00:00Z`,
      `  verified confirmed-open / confirmed-closed / unresolvable : 1 / 3 / 6`,
      `  scored                  : 8`,
      `  verdicts (SKIP / APPLY-AND-SEE / APPLY) : 3 / 0 / 5`,
      `  hard-constraint failures: 0`,
      ``,
    ].join("\n")
  );
  const alog = path.join(s.dir, "access.jsonl");
  const paths = [
    "/v1/boards/acme-fixture/jobs/101",
    "/v0/postings/initech-fixture/abc123",
    "/posting-api/job-board/umbrella-fixture/def456",
    "/v1/boards/hyppograph-fixture-nonexistent-org/jobs/999999999",
  ];
  fs.writeFileSync(alog, paths.map((p) => JSON.stringify({ at: "x", type: "request", method: "GET", path: p, scenarioServed: "live", configured: "live" })).join("\n") + "\n");
  return { ...s, alog };
}

test("flapping: post-flip scratch passes flipped expectations, fails default ones", () => {
  const s = postFlipScratch();
  try {
    const flipped = assertScratch(s.dir, s.alog, FLIPPED);
    assert.deepEqual(flipped.cases.filter((c) => c.verdict !== "pass"), [], JSON.stringify(flipped.cases, null, 2));
    const def = assertScratch(s.dir, s.alog);
    assert.equal(
      def.cases.find((c) => c.name === "matrix:umbrella--backend-engineer--remote-eu")?.verdict,
      "unexpected-red"
    );
  } finally {
    s.cleanup();
  }
});
