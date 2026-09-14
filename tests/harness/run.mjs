#!/usr/bin/env node
// 005 T008 — harness runner. Modes:
//   test (default)  start service -> node --test over tests/harness/**/*.test.mjs -> report -> stop
//   --serve         foreground fixture service (for session-backed workflow runs)
//   --prep          create scratch dir + print the session instruction block (args JSON)
//   --assert        check a session-run scratch dir against support/expectations.mjs
// Report rule (contracts/harness-report.md): exit 0 iff every case passes, except the
// single hardcoded EXPECTED_RED_CASE which may report expected-red.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { harnessPort, assertPortFree } from "./support/ports.mjs";
import { makeScratch } from "./support/scratch.mjs";
import { assertLoopbackOnly } from "./support/isolation.mjs";
import { EXPECTED_RED_CASE, overrideMap } from "./support/expectations.mjs";
import { assertScratch } from "./support/assert.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVICE = path.join(HERE, "service.mjs");
const SCENARIOS = path.join(HERE, "scenarios.json");
const REPORT = path.join(HERE, "last-report.md");

function usage() {
  console.log(`usage: run.mjs [test] [--case=name] | --serve [--port N] | --prep | --assert --dir <scratch> --access-log <file> [--service-origin <origin>]`);
  process.exit(2);
}

// ---- report ----
function writeReport(cases, isolationProof) {
  const unexpected = cases.filter((c) => c.verdict === "unexpected-red");
  const lines = [
    `# Harness report`,
    ``,
    `at: ${new Date().toISOString()}`,
    ``,
    ...cases.map(
      (c) => `- ${c.verdict === "pass" ? "[x]" : "[ ]"} ${c.name}${c.tracesTo ? ` (traces to ${c.tracesTo})` : ""} — ${c.verdict}${c.note ? `: ${c.note}` : ""}`
    ),
    ``,
    `isolation: atsCallsInServiceLog=${isolationProof.atsCallsInServiceLog}, nonLoopbackTargetsObserved=${isolationProof.nonLoopbackTargetsObserved}`,
    ``,
    unexpected.length === 0 ? `result: GREEN` : `result: RED (${unexpected.length} unexpected-red)`,
    ``,
  ];
  fs.writeFileSync(REPORT, lines.join("\n"));
  console.log(lines.join("\n"));
  return unexpected.length === 0 ? 0 : 1;
}

// ---- service lifecycle ----
function startService(port, accessLog) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVICE, "--port", String(port), "--scenarios", SCENARIOS, ...(accessLog ? ["--access-log", accessLog] : [])], { stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    const timer = setTimeout(() => reject(new Error("service did not become ready in time")), 10000);
    child.stdout.on("data", (c) => {
      out += c;
      const m = /HARNESS_SERVICE origin=(\S+)/.exec(out);
      if (m) {
        clearTimeout(timer);
        resolve({ child, origin: m[1] });
      }
    });
    child.on("exit", (code) => {
      if (!out.includes("HARNESS_SERVICE")) {
        clearTimeout(timer);
        reject(new Error(`service exited early with code ${code}`));
      }
    });
  });
}

function stopService(child) {
  return new Promise((resolve) => {
    child.on("exit", () => resolve());
    child.kill();
    setTimeout(() => {
      try { child.kill("SIGKILL"); } catch { /* already gone */ }
      resolve();
    }, 3000).unref?.();
  });
}

// ---- node:test discovery + TAP parse ----
function discoverTests(dir) {
  const found = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) found.push(...discoverTests(p));
    else if (e.isFile() && e.name.endsWith(".test.mjs")) found.push(p);
  }
  return found;
}

function runNodeTests(filter) {
  const files = discoverTests(HERE).filter((f) => !filter || f.includes(filter));
  if (files.length === 0) {
    return { cases: [{ name: "(no cases)", verdict: "unexpected-red", note: "no test files discovered" }] };
  }
  const r = spawnSync(process.execPath, ["--test", "--test-reporter=tap", ...files], { encoding: "utf8" });
  const cases = [];
  for (const line of (r.stdout + r.stderr).split("\n")) {
    let m = /^not ok \d+(?: - (.*))?/.exec(line.trim());
    if (m) { cases.push({ name: m[1] ?? "(unnamed)", verdict: "unexpected-red" }); continue; }
    m = /^ok \d+(?: - (.*))?/.exec(line.trim());
    if (m) cases.push({ name: m[1] ?? "(unnamed)", verdict: "pass" });
  }
  if (r.status !== 0 && cases.length === 0) {
    cases.push({ name: "(runner)", verdict: "unexpected-red", note: "node --test crashed with no TAP output" });
  }
  return { cases };
}

// ---- main ----
const argv = process.argv.slice(2);
if (argv.includes("--serve")) {
  const pi = argv.indexOf("--port");
  const port = pi >= 0 ? Number(argv[pi + 1]) : harnessPort();
  await assertPortFree(port);
  const child = spawn(process.execPath, [SERVICE, "--port", String(port), "--scenarios", SCENARIOS, ...argv.includes("--access-log") ? ["--access-log", argv[argv.indexOf("--access-log") + 1]] : []], { stdio: "inherit" });
  child.on("exit", (c) => process.exit(c ?? 1));
} else if (argv.includes("--prep")) {
  const port = harnessPort();
  const scratch = makeScratch();
  const origin = `127.0.0.1:${port}`;
  const block = {
    dataDir: scratch.dir,
    runTimestamp: new Date().toISOString(),
    atsApiBaseOverrides: overrideMap(origin),
    service: `node tests/harness/service.mjs --port ${port} --scenarios tests/harness/scenarios.json --access-log ${path.join(scratch.dir, "access.jsonl")}`,
    note: "1) start the service cmd above  2) run fit-screen.js in-session with dataDir/runTimestamp/atsApiBaseOverrides  3) Tanner: node tests/harness/run.mjs --assert --dir <dataDir> --access-log <dataDir>/access.jsonl  (scratch kept until you delete it)",
  };
  console.log(JSON.stringify(block, null, 2));
} else if (argv.includes("--assert")) {
  const dir = argv[argv.indexOf("--dir") + 1];
  const alog = argv[argv.indexOf("--access-log") + 1];
  const soi = argv.indexOf("--service-origin");
  const origin = soi >= 0 ? argv[soi + 1] : null;
  if (!dir || !alog) usage();
  const { cases, isolationProof } = await assertScratch(dir, alog, undefined, origin);
  process.exit(writeReport(cases, isolationProof));
} else {
  // default: node test suite with managed service (T008 checkpoint: "no cases" is RED)
  const ci = argv.indexOf("--case");
  const filter = ci >= 0 ? argv[ci + 1] : null;
  if (ci >= 0 && !filter) usage();
  const port = harnessPort();
  await assertPortFree(port);
  const accessLog = path.join(os.tmpdir(), `hyppo-harness-${Date.now()}.jsonl`);
  const { child, origin } = await startService(port, accessLog);
  // node-run cases must only ever target loopback: assert the origin itself first.
  try {
    assertLoopbackOnly([origin + "/"], "service origin");
  } catch (e) {
    await stopService(child);
    process.exit(writeReport([{ name: "isolation:origin", verdict: "unexpected-red", note: e.message }], { atsCallsInServiceLog: 0, nonLoopbackTargetsObserved: 1 }));
  }
  const { cases } = runNodeTests(filter);
  // expected-red passthrough: exactly one case ID may claim it (006 owns the fix).
  for (const c of cases) {
    if (c.name.includes(EXPECTED_RED_CASE) && c.verdict === "unexpected-red") {
      c.verdict = "expected-red";
      c.note = "T024 → 006";
    }
  }
  await stopService(child);
  process.exit(writeReport(cases, { atsCallsInServiceLog: "see service self-test", nonLoopbackTargetsObserved: 0 }));
}
