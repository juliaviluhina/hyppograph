// 005 US3 (T022) — service-stopped fail-fast.
// Fixed test-only port 8473 below (service.test.mjs owns 8472; node --test runs
// files in parallel, so each spawning file needs its own port).
// Every harness entry point must fail with the standard "fixture service
// unreachable" message when the service is down — never fall back to a live host.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchFixture, setScenario, loadAccessLog } from "../support/fetch.mjs";
import { makeScratch } from "../support/scratch.mjs";
import { assertScratch } from "../support/assert.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const DEAD = "http://127.0.0.1:9"; // discard port: connection refused, immediately

test("stopped-service: reads and admin calls fail with the standard message", async () => {
  process.env.HYPPO_HARNESS_ORIGIN = DEAD;
  try {
    await assert.rejects(() => fetchFixture("/v1/boards/acme-fixture/jobs/101"), /fixture service unreachable/);
    await assert.rejects(() => setScenario("/x", "live"), /fixture service unreachable/);
  } finally {
    delete process.env.HYPPO_HARNESS_ORIGIN;
  }
});

test("stopped-service: access log falls back to the live service", async () => {
  const child = spawn(process.execPath, [path.join(HERE, "..", "service.mjs"), "--port", "8473"], { stdio: ["ignore", "pipe", "inherit"] });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("service not ready")), 10000);
      child.stdout.on("data", (c) => {
        if (c.toString().includes("HARNESS_SERVICE")) { clearTimeout(timer); resolve(); }
      });
      child.on("exit", (code) => reject(new Error(`service exited: ${code}`)));
    });
    process.env.HYPPO_HARNESS_ORIGIN = "http://127.0.0.1:8473";
    try {
      await fetchFixture("/v1/boards/acme-fixture/jobs/101");
      const { rows, source } = await loadAccessLog({ file: "/nonexistent/access.jsonl", origin: "http://127.0.0.1:8473" });
      assert.equal(source, "service");
      assert.ok(rows.some((r) => r.type === "request"), "live log must contain the request");
    } finally {
      delete process.env.HYPPO_HARNESS_ORIGIN;
    }
  } finally {
    child.kill();
  }
});

test("stopped-service: --assert names the unreachable service, not a crash", async () => {
  const s = makeScratch();
  try {
    const { cases } = await assertScratch(s.dir, "/nonexistent/access.jsonl");
    const c = cases.find((x) => x.name === "isolation:access-log");
    assert.equal(c?.verdict, "unexpected-red");
    assert.match(c?.note ?? "", /fixture service unreachable/);
  } finally {
    s.cleanup();
  }
});
