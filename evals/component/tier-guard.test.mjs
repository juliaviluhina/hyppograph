// evals/component/tier-guard.test.mjs — the system under test stays on the fast tier; nothing in
// evals/ may escalate it (FR-009). Static source checks, offline, deterministic.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const WORKFLOW_PATH = fileURLToPath(
  new URL("../../.claude/workflows/intake-normalize.js", import.meta.url)
);
const WORKFLOW_SRC = readFileSync(WORKFLOW_PATH, "utf8");

// The one place the fast-tier model id is declared (T011 clause d). Only "haiku" is the fast-tier
// alias the Workflow tool runtime resolves — anything else is a tier escalation.
test("tier-guard: FAST is declared exactly once, pinned to the fast-tier alias", () => {
  const matches = [...WORKFLOW_SRC.matchAll(/^const FAST = "([^"]+)";/gm)];
  assert.equal(matches.length, 1, "expected exactly one `const FAST = \"...\"` declaration");
  assert.equal(matches[0][1], "haiku");
});

// Every await agent(...) call site must pass model: FAST — never a literal model string, never a
// different tier.
test("tier-guard: every agent() call in the workflow passes model: FAST", () => {
  const callSites = [...WORKFLOW_SRC.matchAll(/await agent\(/g)].length;
  const fastUsages = [...WORKFLOW_SRC.matchAll(/model:\s*FAST\b/g)].length;
  assert.equal(fastUsages, callSites, `expected model: FAST at all ${callSites} agent() call sites, found ${fastUsages}`);

  // No call site may pass a literal model string for a tier OTHER than the fast one (e.g.
  // model: "sonnet", model: "opus") — a doc comment restating `model: "haiku"` is not an escalation.
  const escalatingLiterals = [...WORKFLOW_SRC.matchAll(/model:\s*"([^"]+)"/g)].filter((m) => m[1] !== "haiku");
  assert.deepEqual(escalatingLiterals.map((m) => m[0]), [], "no agent() call may pass a non-fast-tier literal model string");
});

// evals/ is build-time tooling that must never rewrite or shadow the SUT's tier (FR-009). No file
// under evals/ may reference FAST, HYPPO_MODEL_FAST, or reassign the model the workflow uses.
test("tier-guard: nothing under evals/ overrides the system-under-test's model tier", () => {
  const evalsRoot = fileURLToPath(new URL("../", import.meta.url));
  const offenders = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const abs = join(dir, entry);
      if (statSync(abs).isDirectory()) {
        walk(abs);
        continue;
      }
      if (!entry.endsWith(".mjs") || abs === fileURLToPath(import.meta.url)) continue;
      const src = readFileSync(abs, "utf8");
      if (/\bHYPPO_MODEL_FAST\b/.test(src) || /\bFAST\s*=\s*"(?!haiku")/.test(src)) {
        offenders.push(abs);
      }
    }
  })(evalsRoot);
  assert.deepEqual(offenders, []);
});
