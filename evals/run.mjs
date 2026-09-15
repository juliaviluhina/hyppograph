#!/usr/bin/env node
// evals/run.mjs — the single entry point for every eval layer (contracts/evals-cli.md).
// Handlers for non-`component` layers are filled in as each user story wires its layer (T021
// integration, T022 live-smoke, T038 per-component); until wired, a layer exits 2 naming itself
// unimplemented rather than silently no-opping.

import { parseArgs } from "node:util";
import { spawnSync } from "node:child_process";

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

// Dispatch table — one entry per contract layer token. `null` = not wired yet.
const handlers = {
  component: runComponent,
  enumerate: null,
  "pre-triage": null,
  extraction: null,
  "source-list": null,
  integration: null,
  "live-smoke": null,
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
