// 005 US4 (T025) — worker-presence (run-2 class).
// The run-2 crash was a worker definition missing at run start. This pins the
// repo side: both agent defs exist with least-privilege grants, and the workflow
// actually references both agent types. (Runtime registration inside a session is
// covered by the manual T020/T033 runs.)
import test from "node:test";
import assert from "node:assert/strict";
import { readAgentDef, workflowSource } from "../support/structure.mjs";

test("worker-presence: hyppo-verify is WebFetch-only, default (fast) tier", () => {
  const def = readAgentDef("hyppo-verify");
  assert.equal(def.tools, "WebFetch");
  assert.ok(!("model" in def), "hyppo-verify must not escalate tiers");
  for (const banned of ["Edit", "Bash", "Write", "interact"]) {
    assert.ok(!String(def.tools).includes(banned), `banned grant: ${banned}`);
  }
});

test("worker-presence: hyppo-score is Read/Glob, sonnet, never writes", () => {
  const def = readAgentDef("hyppo-score");
  assert.equal(def.tools, "Read, Glob");
  assert.equal(def.model, "sonnet");
  for (const banned of ["Edit", "Bash", "Write", "WebFetch", "interact"]) {
    assert.ok(!String(def.tools).includes(banned), `banned grant: ${banned}`);
  }
});

test("worker-presence: workflow references both agent types", () => {
  const src = workflowSource();
  assert.ok(src.includes('agentType: "hyppo-verify"'), "no hyppo-verify call site");
  assert.ok(src.includes('agentType: "hyppo-score"'), "no hyppo-score call site");
});
