// 005 — support-module unit tests (ports, scratch, isolation).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { harnessPort, assertPortFree } from "./support/ports.mjs";
import { makeScratch, COMMITTED_DATA_DIR } from "./support/scratch.mjs";
import { nonLoopbackTargets, assertLoopbackOnly, assertServiceLogCovers } from "./support/isolation.mjs";

test("harnessPort defaults to 8471 and validates overrides", () => {
  delete process.env.HYPPO_HARNESS_PORT;
  assert.equal(harnessPort(), 8471);
  process.env.HYPPO_HARNESS_PORT = "9999";
  assert.equal(harnessPort(), 9999);
  process.env.HYPPO_HARNESS_PORT = "nope";
  assert.throws(() => harnessPort(), /not a valid port/);
  delete process.env.HYPPO_HARNESS_PORT;
});

test("assertPortFree rejects a held port, resolves a freed one", async () => {
  const server = net.createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const held = server.address().port;
  await assert.rejects(() => assertPortFree(held), /already in use/);
  await new Promise((r) => server.close(r));
  await assertPortFree(held);
});

test("nonLoopbackTargets allows loopback only", () => {
  assert.deepEqual(nonLoopbackTargets(["http://127.0.0.1:8471/x", "http://localhost:8471/y"]), []);
  assert.deepEqual(nonLoopbackTargets(["https://boards-api.greenhouse.io/x"]), ["https://boards-api.greenhouse.io/x"]);
  assert.equal(nonLoopbackTargets(["::not a url::"]).length, 1);
  assert.throws(() => assertLoopbackOnly(["https://example.com/"]), /isolation violation/);
});

test("assertServiceLogCovers requires every expected path", () => {
  const log = [{ type: "request", path: "/a" }, { type: "flip", path: "/b" }];
  assertServiceLogCovers(log, ["/a"]);
  assert.throws(() => assertServiceLogCovers(log, ["/a", "/missing"]), /missing expected ATS/);
});

test("makeScratch copies fixtures and cleanup removes the copy", () => {
  const s = makeScratch();
  assert.ok(fs.existsSync(path.join(s.dir, "inputs", "settings.json")));
  assert.notEqual(s.dir, COMMITTED_DATA_DIR);
  s.cleanup();
  assert.ok(!fs.existsSync(s.dir));
});
