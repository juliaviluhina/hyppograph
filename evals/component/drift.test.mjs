// evals/component/drift.test.mjs — for each shared module (intake-core, prompts), assert the
// workflow's marker-delimited inlined copy is byte-identical to the module's exported body (modulo
// export/import lines). On failure, prints a unified diff and names the region (FR-002, US1
// scenario 2). Contract: contracts/prompt-module.md.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const WORKFLOW_PATH = fileURLToPath(
  new URL("../../.claude/workflows/intake-normalize.js", import.meta.url)
);
const WORKFLOW_SRC = readFileSync(WORKFLOW_PATH, "utf8");

function extractInlinedRegion(name) {
  const beginRe = new RegExp(`/\\* BEGIN inlined:${name}[^\\n]*\\n`);
  const beginMatch = WORKFLOW_SRC.match(beginRe);
  assert.ok(beginMatch, `no BEGIN marker for inlined:${name} in ${WORKFLOW_PATH}`);
  const endMarker = `/* END inlined:${name} */`;
  const start = beginMatch.index + beginMatch[0].length;
  const end = WORKFLOW_SRC.indexOf(endMarker, start);
  assert.ok(end !== -1, `no END marker for inlined:${name} in ${WORKFLOW_PATH}`);
  return WORKFLOW_SRC.slice(start, end).trim();
}

// Module content minus `export `/`import` lines — the transform the contract specifies.
function stripModule(source) {
  return source
    .split("\n")
    .filter((line) => !line.trim().startsWith("import "))
    .map((line) => line.replace(/^export (function|const)/, "$1"))
    .join("\n")
    .trim();
}

function unifiedDiff(expected, actual) {
  const a = expected.split("\n");
  const b = actual.split("\n");
  const max = Math.max(a.length, b.length);
  const lines = [];
  for (let i = 0; i < max; i++) {
    if (a[i] !== b[i]) {
      lines.push(`  line ${i + 1}:`);
      lines.push(`    - ${a[i] ?? "<no line>"}`);
      lines.push(`    + ${b[i] ?? "<no line>"}`);
    }
  }
  return lines.join("\n");
}

function assertRegionMatchesModule(regionName, modulePath) {
  const moduleSrc = readFileSync(fileURLToPath(new URL(modulePath, import.meta.url)), "utf8");
  const expected = stripModule(moduleSrc);
  const actual = extractInlinedRegion(regionName);
  if (expected !== actual) {
    throw new assert.AssertionError({
      message: `drift in inlined:${regionName} — workflow's inlined copy no longer matches ${modulePath}\n${unifiedDiff(expected, actual)}`,
    });
  }
}

test("drift guard: inlined:intake-core matches .claude/workflows/lib/intake-core.mjs", () => {
  assertRegionMatchesModule("intake-core", "../../.claude/workflows/lib/intake-core.mjs");
});

test("drift guard: inlined:prompts matches .claude/workflows/lib/prompts.mjs", () => {
  assertRegionMatchesModule("prompts", "../../.claude/workflows/lib/prompts.mjs");
});
