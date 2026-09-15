#!/usr/bin/env node
// evals/run.mjs — the single entry point for every eval layer (contracts/evals-cli.md).
// Handlers for non-`component` layers are filled in as each user story wires its layer (T021
// integration, T022 live-smoke, T038 per-component); until wired, a layer exits 2 naming itself
// unimplemented rather than silently no-opping.

import { parseArgs } from "node:util";
import { spawnSync } from "node:child_process";
import { isAbsolute, resolve } from "node:path";
import { runIntegrationLayer } from "./integration/run-layer.mjs";

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
  const res = spawnSync(process.execPath, ["--test", "evals/component/"], { stdio: "inherit" });
  return res.status === 0 ? 0 : 1;
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
  enumerate: null,
  "pre-triage": null,
  extraction: null,
  "source-list": null,
  integration: runIntegrationLayer,
  "live-smoke": runLiveSmoke,
};

export async function run(argv) {
  const opts = parseCli(argv);
  if (!opts.layer || !(opts.layer in handlers)) {
    console.error(usage());
    return 2;
  }
  const handler = handlers[opts.layer];
  if (!handler) {
    console.error(`layer ${JSON.stringify(opts.layer)} is not wired yet`);
    return 2;
  }
  return handler(opts);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  run(process.argv.slice(2)).then((code) => process.exit(code ?? 0));
}
