// 005 US3 (T022) — service-stopped fail-fast.
// Every harness entry point must fail with the standard "fixture service
// unreachable" message when the service is down — never fall back to a live host.
import test from "node:test";
import assert from "node:assert/strict";
import { fetchFixture, setScenario } from "../support/fetch.mjs";
import { makeScratch } from "../support/scratch.mjs";
import { assertScratch } from "../support/assert.mjs";

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

test("stopped-service: --assert names the unreachable service, not a crash", () => {
  const s = makeScratch();
  try {
    const { cases } = assertScratch(s.dir, "/nonexistent/access.jsonl");
    const c = cases.find((x) => x.name === "isolation:access-log");
    assert.equal(c?.verdict, "unexpected-red");
    assert.match(c?.note ?? "", /fixture service unreachable/);
  } finally {
    s.cleanup();
  }
});
