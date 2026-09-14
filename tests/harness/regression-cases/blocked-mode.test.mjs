// 006 R3/T014 — blocked-verdict scoping. An isolated run (default) cannot exercise the live
// wire (WebFetch upgrades http->https; 005 R8) for the three ATS-backed fixtures, so their
// matrix cases must report `blocked` — counted in neither pass nor fail, exit code unaffected —
// instead of silently passing or permanently failing. `--wire live` restores real assertion.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { makeScratch } from "../support/scratch.mjs";
import { assertScratch } from "../support/assert.mjs";

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

function goodScratch() {
  const s = makeScratch();
  setMark(s.dir, "acme--backend-engineer--remote-eu", "confirmed-open");
  setMark(s.dir, "initech--backend-engineer--remote-eu", "confirmed-closed");
  setMark(s.dir, "umbrella--backend-engineer--remote-eu", "confirmed-open");
  writeEval(s.dir, "acme--backend-engineer--remote-eu", "APPLY");
  writeEval(s.dir, "umbrella--backend-engineer--remote-eu", "APPLY");
  fs.writeFileSync(
    path.join(s.dir, "outputs", "last-run-summary-fit-screen.md"),
    [
      `Run 2026-09-14T00:00:00Z`,
      `  verified confirmed-open / confirmed-closed / unresolvable : 2 / 2 / 6`,
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

test("blocked-mode: default (isolated) wire reports the three ATS matrix cases as blocked, not pass/fail", async () => {
  const s = goodScratch();
  try {
    const { cases } = await assertScratch(s.dir, s.alog);
    for (const key of ["acme--backend-engineer--remote-eu", "initech--backend-engineer--remote-eu", "umbrella--backend-engineer--remote-eu"]) {
      const c = cases.find((c) => c.name === `matrix:${key}`);
      assert.equal(c?.verdict, "blocked", `${key} should be blocked, not asserted, on an isolated run`);
      assert.match(c?.note ?? "", /transport/);
    }
    assert.equal(cases.filter((c) => c.verdict === "unexpected-red").length, 0, "blocked cases must never surface as unexpected-red");
  } finally {
    s.cleanup();
  }
});

test("blocked-mode: --wire live asserts the ATS matrix cases for real", async () => {
  const s = goodScratch();
  try {
    const { cases } = await assertScratch(s.dir, s.alog, undefined, null, "live");
    const acme = cases.find((c) => c.name === "matrix:acme--backend-engineer--remote-eu");
    assert.equal(acme?.verdict, "pass");
    assert.equal(cases.some((c) => c.verdict === "blocked"), false, "no case should be blocked once wire is live");
  } finally {
    s.cleanup();
  }
});

// 006 T017 — found live in the 2026-09-14 session run: the isolation check independently expected
// the three requiresWire ATS paths in the service log, which an isolated run can never produce
// (the exact wire gap R3 names) — it was permanently red on every isolated session run until fixed.
test("blocked-mode: isolation:service-log-covers does not expect requiresWire paths when isolated", async () => {
  const s = makeScratch();
  setMark(s.dir, "acme--backend-engineer--remote-eu", "confirmed-open");
  setMark(s.dir, "initech--backend-engineer--remote-eu", "confirmed-closed");
  setMark(s.dir, "umbrella--backend-engineer--remote-eu", "confirmed-open");
  writeEval(s.dir, "acme--backend-engineer--remote-eu", "APPLY");
  writeEval(s.dir, "umbrella--backend-engineer--remote-eu", "APPLY");
  fs.writeFileSync(
    path.join(s.dir, "outputs", "last-run-summary-fit-screen.md"),
    [
      `Run 2026-09-14T00:00:00Z`,
      `  verified confirmed-open / confirmed-closed / unresolvable : 0 / 0 / 9`,
      `  scored                  : 9`,
      `  verdicts (SKIP / APPLY-AND-SEE / APPLY) : 3 / 0 / 6`,
      `  hard-constraint failures: 0`,
      ``,
    ].join("\n")
  );
  const alog = path.join(s.dir, "access.jsonl");
  fs.writeFileSync(alog, ""); // empty — no ATS call ever reached the service, exactly like the isolated live-session run
  try {
    const { cases } = await assertScratch(s.dir, alog);
    const c = cases.find((c) => c.name === "isolation:service-log-covers");
    assert.equal(c?.verdict, "pass", "an empty access log must not fail isolation on an isolated run when only requiresWire paths were expected");
  } finally {
    s.cleanup();
  }
});
