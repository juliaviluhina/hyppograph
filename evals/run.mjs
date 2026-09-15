#!/usr/bin/env node
// evals/run.mjs — the single entry point for every eval layer (contracts/evals-cli.md).
// Handlers for non-`component` layers are filled in as each user story wires its layer (T021
// integration, T022 live-smoke, T038 per-component); until wired, a layer exits 2 naming itself
// unimplemented rather than silently no-opping.

import { parseArgs } from "node:util";
import { spawnSync, execFileSync } from "node:child_process";
import { isAbsolute, resolve } from "node:path";
import { runIntegrationLayer } from "./integration/run-layer.mjs";
import { makePerComponentHandler } from "./per-component/run-layer.mjs";
import { writeReport } from "./lib/report.mjs";

const LAYERS = [
  "component",
  "enumerate",
  "pre-triage",
  "extraction",
  "source-list",
  "integration",
  "live-smoke",
];

function usage() {
  return `Usage: node evals/run.mjs <layer> [options]\nLayers: ${LAYERS.join(" | ")}`;
}

export function parseCli(argv) {
  const layer = argv[0];
  const rest = layer !== undefined && !layer.startsWith("-") ? argv.slice(1) : argv;
  const { values } = parseArgs({
    args: rest,
    options: {
      substrate: { type: "string", default: "workflow-tool" },
      "confirm-spend": { type: "boolean", default: false },
      ceiling: { type: "string" },
      runs: { type: "string" },
      scratch: { type: "string" },
      "no-report": { type: "boolean", default: false },
    },
    allowPositionals: false,
    strict: true,
  });
  return {
    layer,
    substrate: values.substrate,
    confirmSpend: values["confirm-spend"],
    ceiling: values.ceiling !== undefined ? Number(values.ceiling) : undefined,
    runs: values.runs !== undefined ? Number(values.runs) : undefined,
    scratch: values.scratch,
    noReport: values["no-report"],
  };
}

// component is always free (contracts/evals-cli.md) — never imports the judge client, the SDK, or
// anything that opens a socket. Delegates straight to `node --test`.
function runComponent() {
  const res = spawnSync(process.execPath, ["--test", "evals/component/"], { encoding: "utf8" });
  process.stdout.write(res.stdout || "");
  process.stderr.write(res.stderr || "");
  const combined = (res.stdout || "") + (res.stderr || "");
  const total = Number(combined.match(/ℹ tests (\d+)/)?.[1] ?? 0);
  const pass = Number(combined.match(/ℹ pass (\d+)/)?.[1] ?? 0);
  const fail = total - pass;
  return {
    exitCode: res.status === 0 ? 0 : 1,
    report: {
      scope: "component",
      methodology: { layer: "component", judge: "none", substrate: "n/a" },
      underTest: { modelIds: "n/a", fixture: "none (inline unit cases + static checks)", run: "manual (npm test)" },
      results: [{ case: `${total} node:test cases`, expected: "all pass", actual: `${pass}/${total} pass`, verdict: fail === 0 ? "pass" : "fail" }],
      cost: { tokensIn: 0, tokensOut: 0, dollarCost: "$0" },
      findings: [],
      indexResult: `${fail === 0 ? "pass" : "fail"} (${pass}/${total})`,
      indexCost: "$0",
    },
  };
}

// live-smoke (contracts/evals-cli.md): a shallow real run against a HyppoVisor board search,
// scratch REQUIRED and MUST be outside the repo, requires --confirm-spend, output hand-judged.
// The `Workflow` tool's `agent()` global only exists inside a Claude Code session — this plain-Node
// script cannot drive it — so this handler enforces the CLI-level guardrails and hands off to a
// human/Claude session for the actual run (US2 scenario 4).
function runLiveSmoke(opts) {
  if (!opts.scratch) {
    console.error("live-smoke: --scratch is required and must be OUTSIDE the repo.");
    return 2;
  }
  const abs = isAbsolute(opts.scratch) ? opts.scratch : resolve(opts.scratch);
  const repoRoot = resolve(new URL("..", import.meta.url).pathname);
  if (abs === repoRoot || abs.startsWith(repoRoot + "/")) {
    console.error(`live-smoke: --scratch (${abs}) must be outside the repo (${repoRoot}).`);
    return 2;
  }
  if (!opts.confirmSpend) {
    console.log("live-smoke: plan-billed on the Workflow tool. Pass --confirm-spend to proceed.");
    return 0;
  }
  console.log(
    [
      "live-smoke: this layer is driven manually — automation cannot invoke the Workflow tool.",
      `  1. In a Claude Code session, run .claude/workflows/intake-normalize.js via the Workflow tool`,
      `     with args.dataDir = ${abs}, against a real (shallow) HyppoVisor board search.`,
      "  2. Hand-judge the output against the quickstart scenarios.",
      "  3. Hand-assemble the eval report per contracts/eval-report.md \"Generation\".",
    ].join("\n")
  );
  return 0;
}

// Dispatch table — one entry per contract layer token. `null` = not wired yet.
const handlers = {
  component: runComponent,
  enumerate: makePerComponentHandler("enumerate"),
  "pre-triage": makePerComponentHandler("pre-triage"),
  extraction: makePerComponentHandler("extraction"),
  "source-list": makePerComponentHandler("source-list"),
  integration: runIntegrationLayer,
  "live-smoke": runLiveSmoke,
};

// FR-019/FR-023, contracts/evals-cli.md step 1: `--substrate metered` is refused for EVERY layer
// until the standalone SDK substrate is built (the gated T049 milestone) — checked centrally here
// so no individual handler can forget it (T027).
function checkMeteredSubstrateBuilt(opts) {
  if (opts.substrate !== "metered") return null;
  console.error(
    `${opts.layer}: --substrate metered is not built yet — it is the FR-023 milestone (T049), gated on explicit user credit approval. Use --substrate workflow-tool or --substrate mock.`
  );
  return 2;
}

function gitShortSha() {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export async function run(argv) {
  const opts = parseCli(argv);
  if (!opts.layer || !(opts.layer in handlers)) {
    console.error(usage());
    return 2;
  }
  const meteredBlock = checkMeteredSubstrateBuilt(opts);
  if (meteredBlock !== null) return meteredBlock;
  const handler = handlers[opts.layer];
  if (!handler) {
    console.error(`layer ${JSON.stringify(opts.layer)} is not wired yet`);
    return 2;
  }

  const outcome = await handler(opts);
  const { exitCode, report } = typeof outcome === "number" ? { exitCode: outcome, report: null } : outcome;

  // SC-009: every REAL run leaves a report; a no-op (spend estimate printed, precondition failure,
  // manual live-smoke handoff) has nothing to report and is skipped. --no-report is local-iteration
  // only (contracts/evals-cli.md).
  if (report && !opts.noReport) {
    const date = todayIso();
    const commit = gitShortSha();
    try {
      const path = writeReport({ ...report, date, commit, underTest: { ...report.underTest, commit } });
      console.log(`report written: ${path}`);
    } catch (err) {
      console.error(err.message);
      return 1;
    }
  }

  return exitCode;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  run(process.argv.slice(2)).then((code) => process.exit(code ?? 0));
}
