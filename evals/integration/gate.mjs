// evals/integration/gate.mjs — copy tests/synthetic/data-dir/ to a scratch dir, run the pipeline,
// byte-compare every file under outputs/ (plus the root provenance-log.md) against
// tests/synthetic/expected/, and report file-level diffs (FR-004, contracts/expected-tree.md).
//
// `mock` substrate actually runs the pipeline (evals/integration/mock-pipeline.mjs) end to end —
// zero cost, zero network (research D7). `workflow-tool` is the real substrate: it cannot be driven
// from this plain-Node script (the `Workflow` tool's `agent()` global only exists inside a Claude
// Code session), so for that substrate the gate expects the scratch dir's outputs/ to already have
// been populated by a human/Claude session driving the real workflow, and goes straight to
// comparison — printing clear setup instructions if it finds nothing there yet.

import { readFileSync, existsSync, mkdirSync, cpSync, rmSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { runMockPipeline } from "./mock-pipeline.mjs";

export const DATASET_DIR = new URL("../../tests/synthetic/data-dir/", import.meta.url).pathname;
export const EXPECTED_DIR = new URL("../../tests/synthetic/expected/", import.meta.url).pathname;

// The subtrees the contract requires the gate to compare (contracts/expected-tree.md, corrected
// 2026-09-14): the full `outputs/` tree (job records, their raw sources with written triage,
// companies.md, last-run-summary.md) plus the root `provenance-log.md`. `inputs/` is never compared.
const COMPARED_ROOTS = ["outputs", "provenance-log.md"];

export function copyDataset(datasetDir, scratchDir) {
  if (existsSync(scratchDir)) rmSync(scratchDir, { recursive: true, force: true });
  mkdirSync(scratchDir, { recursive: true });
  cpSync(datasetDir, scratchDir, { recursive: true });
}

export function listFilesRecursive(root) {
  const out = [];
  (function walk(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir).sort()) {
      const abs = join(dir, entry);
      if (statSync(abs).isDirectory()) walk(abs);
      else out.push(abs);
    }
  })(root);
  return out;
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

// Compares { scratchDir } against { expectedDir } over COMPARED_ROOTS. Returns
// { pass, fileSetMismatch: {missing[], extra[]}, diffs: [{path, diff}] }.
export function compareTrees(scratchDir, expectedDir) {
  const expectedFiles = new Set();
  const scratchFiles = new Set();

  for (const root of COMPARED_ROOTS) {
    const expAbs = join(expectedDir, root);
    const scrAbs = join(scratchDir, root);
    const expIsFile = existsSync(expAbs) && statSync(expAbs).isFile();
    if (expIsFile) {
      expectedFiles.add(root);
      if (existsSync(scrAbs)) scratchFiles.add(root);
      continue;
    }
    for (const f of listFilesRecursive(expAbs)) expectedFiles.add(relative(expectedDir, f));
    for (const f of listFilesRecursive(scrAbs)) scratchFiles.add(relative(scratchDir, f));
  }

  const missing = [...expectedFiles].filter((f) => !scratchFiles.has(f)).sort();
  const extra = [...scratchFiles].filter((f) => !expectedFiles.has(f)).sort();

  const diffs = [];
  for (const relPath of [...expectedFiles].filter((f) => scratchFiles.has(f)).sort()) {
    const expected = readFileSync(join(expectedDir, relPath), "utf8");
    const actual = readFileSync(join(scratchDir, relPath), "utf8");
    if (expected !== actual) diffs.push({ path: relPath, diff: unifiedDiff(expected, actual) });
  }

  return {
    pass: missing.length === 0 && extra.length === 0 && diffs.length === 0,
    fileSetMismatch: { missing, extra },
    diffs,
  };
}

// Orchestrates one gate pass: copy (only on the first pass — the caller controls that), run,
// compare. `scratch` is required and never defaults inside the repo tree.
export async function runGate({ scratch, substrate = "workflow-tool", skipCopy = false }) {
  if (!scratch) throw new Error("gate: --scratch is required");

  if (!skipCopy) copyDataset(DATASET_DIR, scratch);

  if (substrate === "mock") {
    await runMockPipeline({ dataDir: scratch });
  } else if (substrate === "workflow-tool") {
    const outputsDir = join(scratch, "outputs", "job-records");
    if (!existsSync(outputsDir)) {
      return {
        pass: false,
        setupRequired: true,
        message: [
          `gate: substrate=workflow-tool needs a human/Claude session to run the real workflow first.`,
          `  1. Point a Claude Code session at the Workflow tool with args.dataDir = ${scratch}`,
          `  2. Run .claude/workflows/intake-normalize.js over it (args.runTimestamp frozen to match`,
          `     tests/synthetic/fixtures/mock-answers.mjs's RUN_TIMESTAMP if comparing to the locked tree).`,
          `  3. Re-run this gate with --skip-copy so it goes straight to comparison.`,
        ].join("\n"),
      };
    }
  } else {
    throw new Error(`gate: unsupported substrate ${JSON.stringify(substrate)}`);
  }

  const result = compareTrees(scratch, EXPECTED_DIR);
  return { pass: result.pass, ...result };
}
