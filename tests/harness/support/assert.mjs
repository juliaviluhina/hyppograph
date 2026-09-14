// 005 T010/T011 — session-run assertion library (also used by run.mjs --assert).
// Checks a scratch dir produced by an in-session fit-screen.js run against
// support/expectations.mjs (per-record matrix, T010), the run summary's internal
// consistency with the files on disk (T011), and the service access log (T012).
import fs from "node:fs";
import path from "node:path";
import { SIGNAL_EXPECTATIONS } from "./expectations.mjs";
import { buildAtsApiUrl } from "./pure.mjs";
import { assertServiceLogCovers } from "./isolation.mjs";

// Tiny front-matter reader (workflow files only; not a YAML parser).
export function readFrontMatter(file) {
  const text = fs.readFileSync(file, "utf8");
  const m = /^---\n([\s\S]*?)\n---/.exec(text);
  const fm = {};
  if (!m) return fm;
  for (const line of m[1].split("\n")) {
    const kv = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line.trim());
    if (kv) fm[kv[1]] = kv[2].replace(/^"(.*)"$/, "$1");
  }
  fm.__sourceRefs = [...text.matchAll(/sourceRef:\s*"([^"]+)"/g)].map((x) => x[1]);
  return fm;
}

function readRecords(dir) {
  const jrDir = path.join(dir, "outputs", "job-records");
  const records = {};
  for (const f of fs.readdirSync(jrDir)) {
    if (!f.endsWith(".md")) continue;
    const fm = readFrontMatter(path.join(jrDir, f));
    if (fm.key) records[fm.key] = fm;
  }
  return records;
}

function readEvaluations(dir) {
  const evDir = path.join(dir, "outputs", "evaluations");
  const verdicts = {};
  if (!fs.existsSync(evDir)) return verdicts;
  for (const f of fs.readdirSync(evDir)) {
    if (!f.endsWith(".md")) continue;
    const fm = readFrontMatter(path.join(evDir, f));
    if (fm.jobRecordKey) verdicts[fm.jobRecordKey] = fm.overallVerdict;
  }
  return verdicts;
}

function findSummary(dir) {
  for (const name of ["last-run-summary-fit-screen.md", "last-run-summary.md"]) {
    const p = path.join(dir, "outputs", name);
    if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
  }
  return null;
}

function parseSummary(text) {
  const num = (re) => {
    const m = re.exec(text);
    return m ? m.slice(1).map(Number) : null;
  };
  return {
    verified: num(/verified confirmed-open \/ confirmed-closed \/ unresolvable\s*:\s*(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)/),
    scored: num(/scored\s*:\s*(\d+)/)?.[0] ?? null,
    verdicts: num(/verdicts \(SKIP \/ APPLY-AND-SEE \/ APPLY\)\s*:\s*(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)/),
  };
}

// Full check. Returns { cases, isolationProof } per contracts/harness-report.md.
export function assertScratch(dir, accessLogFile) {
  const cases = [];
  const fail = (name, note) => cases.push({ name, verdict: "unexpected-red", note });
  const pass = (name) => cases.push({ name, verdict: "pass" });

  let records;
  try {
    records = readRecords(dir);
  } catch (e) {
    fail("matrix:records", `cannot read job records: ${e.message}`);
    return { cases, isolationProof: { atsCallsInServiceLog: "unknown", nonLoopbackTargetsObserved: "unknown" } };
  }
  const evalVerdicts = readEvaluations(dir);

  // T010 — per-record matrix on the signal fixtures.
  for (const [key, exp] of Object.entries(SIGNAL_EXPECTATIONS)) {
    const name = `matrix:${key}`;
    const rec = records[key];
    if (!rec) { fail(name, "job record missing from scratch dir"); continue; }
    if (rec.openStatus !== exp.mark) { fail(name, `mark is ${rec.openStatus ?? "null"}, expected ${exp.mark}`); continue; }
    const verdict = evalVerdicts[key];
    if (exp.evaluated && verdict === undefined) { fail(name, "expected evaluation file, none found"); continue; }
    if (!exp.evaluated && verdict !== undefined) { fail(name, "expected no evaluation file, one exists"); continue; }
    if (exp.verdict && verdict !== exp.verdict) { fail(name, `verdict is ${verdict}, expected ${exp.verdict}`); continue; }
    pass(name);
  }

  // T011 — summary consistency: verdicts sum to scored; scored equals evaluation
  // files on disk; no evaluation sits on a confirmed-closed record.
  const summaryText = findSummary(dir);
  if (!summaryText) {
    fail("summary:present", "no last-run-summary file in scratch outputs/ (T045 requires one)");
  } else {
    const s = parseSummary(summaryText);
    if (!s.verdicts || s.scored === null) {
      fail("summary:parse", "summary file does not contain the required counts lines");
    } else {
      const [sk, mid, ap] = s.verdicts;
      if (sk + mid + ap !== s.scored) fail("summary:verdicts-sum", `verdicts ${sk}/${mid}/${ap} sum != scored ${s.scored}`);
      else pass("summary:verdicts-sum");
      const evalCount = Object.keys(evalVerdicts).length;
      if (evalCount !== s.scored) fail("summary:scored-matches-files", `scored ${s.scored} != ${evalCount} evaluation files on disk`);
      else pass("summary:scored-matches-files");
    }
  }
  const closedWithEval = Object.keys(evalVerdicts).filter((k) => records[k]?.openStatus === "confirmed-closed");
  if (closedWithEval.length > 0) fail("summary:no-eval-on-closed", `evaluations exist for confirmed-closed: ${closedWithEval.join(", ")}`);
  else pass("summary:no-eval-on-closed");

  // T012 — isolation, session-run form: every ATS-derived mark must have a matching
  // local service-log request for its posting path (prod-API path == service path).
  let accessLog;
  try {
    accessLog = fs.readFileSync(accessLogFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  } catch (e) {
    fail("isolation:access-log", `cannot read access log: ${e.message}`);
    return { cases, isolationProof: { atsCallsInServiceLog: "unknown", nonLoopbackTargetsObserved: "unknown" } };
  }
  try {
    const expectedPaths = [];
    for (const rec of Object.values(records)) {
      const prod = buildAtsApiUrl(rec.__sourceRefs ?? [], {});
      if (prod) expectedPaths.push(new URL(prod).pathname);
    }
    assertServiceLogCovers(accessLog, expectedPaths);
    pass("isolation:service-log-covers");
  } catch (e) {
    fail("isolation:service-log-covers", e.message);
  }
  const requests = accessLog.filter((r) => r.type === "request");
  return { cases, isolationProof: { atsCallsInServiceLog: requests.length, nonLoopbackTargetsObserved: "n/a (session run: routing came only from the printed override map)" } };
}
