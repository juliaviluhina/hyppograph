// 005 US1 (T010-T012) — full-flow assertion cases. The workflow itself runs in a
// Claude session; what node CAN test is the assertion layer: given a scratch dir
// shaped like a session run produced it, assertScratch must pass the good shape
// and fail each broken shape with the right note. Covers matrix (T010), summary
// consistency (T011), and service-log isolation (T012).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { makeScratch } from "../support/scratch.mjs";
import { assertScratch } from "../support/assert.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUN = path.join(HERE, "..", "run.mjs");

const ATS_PATHS = [
  "/v1/boards/acme-fixture/jobs/101",
  "/v0/postings/initech-fixture/abc123",
  "/posting-api/job-board/umbrella-fixture/def456",
  "/v1/boards/hyppograph-fixture-nonexistent-org/jobs/999999999",
];

function setMark(dir, key, mark, reason) {
  const f = path.join(dir, "outputs", "job-records", `${key}.md`);
  let text = fs.readFileSync(f, "utf8");
  text = text.replace(/^openStatus:.*$/m, `openStatus: "${mark}"`);
  text = text.replace(/^openStatusReason:.*$/m, `openStatusReason: "${reason}"`);
  text = text.replace(/^openStatusCheckedAt:.*$/m, `openStatusCheckedAt: "2026-09-14T00:00:00Z"`);
  fs.writeFileSync(f, text);
}

function writeEval(dir, key, verdict) {
  fs.writeFileSync(
    path.join(dir, "outputs", "evaluations", `${key}.md`),
    `---\njobRecordKey: "${key}"\noverallVerdict: "${verdict}"\n---\n\n# ${key}\n`
  );
}

function writeSummary(dir, { o, c, u, scored, skip, mid, apply }) {
  fs.writeFileSync(
    path.join(dir, "outputs", "last-run-summary-fit-screen.md"),
    [
      `Run 2026-09-14T00:00:00Z`,
      `  verified confirmed-open / confirmed-closed / unresolvable : ${o} / ${c} / ${u}`,
      `  scored                  : ${scored}`,
      `  verdicts (SKIP / APPLY-AND-SEE / APPLY) : ${skip} / ${mid} / ${apply}`,
      `  hard-constraint failures: 0`,
      ``,
    ].join("\n")
  );
}

function writeAccessLog(file, paths) {
  fs.writeFileSync(
    file,
    paths.map((p) => JSON.stringify({ at: "2026-09-14T00:00:00Z", type: "request", method: "GET", path: p, scenarioServed: "live", configured: "live" })).join("\n") + "\n"
  );
}

// Good shape: baseline (SKIPx3/APPLYx3) + acme APPLY + umbrella APPLY = 8 evals.
function goodScratch() {
  const s = makeScratch();
  setMark(s.dir, "acme--backend-engineer--remote-eu", "confirmed-open", "ATS API 200");
  setMark(s.dir, "initech--backend-engineer--remote-eu", "confirmed-closed", "ATS API not_found");
  setMark(s.dir, "umbrella--backend-engineer--remote-eu", "confirmed-open", "ATS API 200");
  writeEval(s.dir, "acme--backend-engineer--remote-eu", "APPLY");
  writeEval(s.dir, "umbrella--backend-engineer--remote-eu", "APPLY");
  writeSummary(s.dir, { o: 2, c: 2, u: 6, scored: 8, skip: 3, mid: 0, apply: 5 });
  const alog = path.join(s.dir, "access.jsonl");
  writeAccessLog(alog, ATS_PATHS);
  return { ...s, alog };
}

function verdictOf(cases, name) {
  return cases.find((c) => c.name === name)?.verdict;
}

test("full-flow: good session-shaped scratch passes everything", async () => {
  const s = goodScratch();
  try {
    const { cases, isolationProof } = await assertScratch(s.dir, s.alog);
    assert.ok(cases.length > 0);
    assert.deepEqual(cases.filter((c) => c.verdict !== "pass"), [], JSON.stringify(cases, null, 2));
    assert.ok(isolationProof.atsCallsInServiceLog >= ATS_PATHS.length);
  } finally {
    s.cleanup();
  }
});

test("full-flow: wrong verdict fails its matrix case", async () => {
  const s = goodScratch();
  try {
    writeEval(s.dir, "acme--backend-engineer--remote-eu", "SKIP");
    const { cases } = await assertScratch(s.dir, s.alog);
    assert.equal(verdictOf(cases, "matrix:acme--backend-engineer--remote-eu"), "unexpected-red");
  } finally {
    s.cleanup();
  }
});

test("full-flow: missing evaluation fails; evaluation on closed fails twice", async () => {
  let s = goodScratch();
  try {
    fs.rmSync(path.join(s.dir, "outputs", "evaluations", "acme--backend-engineer--remote-eu.md"));
    const { cases } = await assertScratch(s.dir, s.alog);
    assert.equal(verdictOf(cases, "matrix:acme--backend-engineer--remote-eu"), "unexpected-red");
  } finally {
    s.cleanup();
  }
  s = goodScratch();
  try {
    writeEval(s.dir, "initech--backend-engineer--remote-eu", "SKIP");
    const { cases } = await assertScratch(s.dir, s.alog);
    assert.equal(verdictOf(cases, "matrix:initech--backend-engineer--remote-eu"), "unexpected-red");
    assert.equal(verdictOf(cases, "summary:no-eval-on-closed"), "unexpected-red");
  } finally {
    s.cleanup();
  }
});

test("full-flow: summary mismatch and missing summary fail", async () => {
  let s = goodScratch();
  try {
    writeSummary(s.dir, { o: 2, c: 2, u: 6, scored: 999, skip: 3, mid: 0, apply: 5 });
    const { cases } = await assertScratch(s.dir, s.alog);
    assert.equal(verdictOf(cases, "summary:scored-matches-files"), "unexpected-red");
  } finally {
    s.cleanup();
  }
  s = goodScratch();
  try {
    fs.rmSync(path.join(s.dir, "outputs", "last-run-summary-fit-screen.md"));
    const { cases } = await assertScratch(s.dir, s.alog);
    assert.equal(verdictOf(cases, "summary:present"), "unexpected-red");
  } finally {
    s.cleanup();
  }
});

test("full-flow: incomplete access log and missing log file fail isolation", async () => {
  let s = goodScratch();
  try {
    writeAccessLog(s.alog, ATS_PATHS.slice(0, 2));
    const { cases } = await assertScratch(s.dir, s.alog);
    assert.equal(verdictOf(cases, "isolation:service-log-covers"), "unexpected-red");
  } finally {
    s.cleanup();
  }
  s = goodScratch();
  try {
    const { cases } = await assertScratch(s.dir, path.join(s.dir, "nope.jsonl"));
    assert.equal(verdictOf(cases, "isolation:access-log"), "unexpected-red");
  } finally {
    s.cleanup();
  }
});

test("--prep prints a valid session instruction block", async () => {
  const r = spawnSync(process.execPath, [RUN, "--prep"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const block = JSON.parse(r.stdout);
  assert.ok(fs.existsSync(path.join(block.dataDir, "inputs", "settings.json")));
  assert.deepEqual(
    Object.keys(block.atsApiBaseOverrides).sort(),
    ["api.ashbyhq.com", "api.lever.co", "boards-api.greenhouse.io"]
  );
  assert.ok(Object.values(block.atsApiBaseOverrides).every((o) => String(o).startsWith("127.0.0.1:")));
  assert.ok(block.service.includes("scenarios.json"));
  fs.rmSync(block.dataDir, { recursive: true, force: true });
});
