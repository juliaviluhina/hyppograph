// 005 — service self-test. Spawns service.mjs on fixed test-only port 8472
// (never the harness port 8471) and asserts every scenario + admin surface.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVICE = path.join(HERE, "service.mjs");
const PORT = 8472; // test-only; the harness itself always uses 8471 (ports.mjs)
const ORIGIN = `http://127.0.0.1:${PORT}`;

const GH = "/v1/boards/acme-fixture/jobs/101";
const LEVER = "/v0/postings/initech-fixture/abc123";
const ASHBY = "/posting-api/job-board/umbrella-fixture/def456";

let child;
async function admin(method, route, body) {
  const res = await fetch(ORIGIN + route, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}
async function setScenario(p, scenario) {
  const r = await admin("POST", "/__admin/scenario", { path: p, scenario });
  assert.equal(r.status, 200);
}

test.before(async () => {
  child = spawn(process.execPath, [SERVICE, "--port", String(PORT)], { stdio: ["ignore", "pipe", "inherit"] });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("service not ready")), 10000);
    child.stdout.on("data", (c) => {
      if (c.toString().includes("HARNESS_SERVICE")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on("exit", (code) => reject(new Error(`service exited: ${code}`)));
  });
});

test.after(async () => {
  child.kill();
});

test("unset path defaults to live with an ATS-shaped body", async () => {
  const res = await fetch(ORIGIN + GH);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.id, 101);
  assert.match(body.title, /Fixture posting/);
});

test("lever + ashby paths serve their own shapes", async () => {
  for (const [p, key] of [[LEVER, "text"], [ASHBY, "title"]]) {
    const res = await fetch(ORIGIN + p);
    assert.equal(res.status, 200);
    assert.ok((await res.json())[key], p);
  }
});

test("closed scenario returns 404", async () => {
  await setScenario(GH, "closed");
  const res = await fetch(ORIGIN + GH);
  assert.equal(res.status, 404);
  await setScenario(GH, "live");
});

test("malformed returns 200 with a wrong shape; error returns 500", async () => {
  await setScenario(GH, "malformed");
  let res = await fetch(ORIGIN + GH);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { surprise: "not-an-ats-shape" });
  await setScenario(GH, "error");
  res = await fetch(ORIGIN + GH);
  assert.equal(res.status, 500);
  await setScenario(GH, "live");
});

test("flapping serves live until flipped, flip is logged", async () => {
  await setScenario(ASHBY, "flapping");
  let res = await fetch(ORIGIN + ASHBY);
  assert.equal(res.status, 200);
  const flip = await admin("POST", "/__admin/scenario", { path: ASHBY, scenario: "closed" });
  assert.equal(flip.json.from, "flapping");
  res = await fetch(ORIGIN + ASHBY);
  assert.equal(res.status, 404);
  const log = await admin("GET", "/__admin/access-log");
  assert.ok(log.json.some((r) => r.type === "flip" && r.path === ASHBY));
  await setScenario(ASHBY, "live");
});

test("bad admin input is 400; unknown paths are 404", async () => {
  const bad = await admin("POST", "/__admin/scenario", { path: GH, scenario: "nope" });
  assert.equal(bad.status, 400);
  const res = await fetch(ORIGIN + "/nope/not-ats");
  assert.equal(res.status, 404);
});

test("access log records every request with its scenario", async () => {
  await fetch(ORIGIN + GH);
  const log = await admin("GET", "/__admin/access-log");
  const rows = log.json.filter((r) => r.type === "request" && r.path === GH);
  assert.ok(rows.length >= 1);
  assert.ok(rows.every((r) => typeof r.scenarioServed === "string"));
});
