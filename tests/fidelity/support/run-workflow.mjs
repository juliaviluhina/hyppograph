// 007 T003 — shells out to a live Claude Code session to exercise a real agent() call.
// agent()/the Workflow tool only exist inside a live session (no headless
// `claude workflow run <script>`); this is the one place in the Tier-2 fidelity tier that
// crosses that boundary. See specs/007-write-fidelity-guardrails/research.md R1.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIDELITY_DIR = path.resolve(HERE, "..");

// Deliberately one throwaway temp FILE, not a scratch-copied fixture directory (spec 007 US1:
// "no fixture service, no scratch dir, no other agent calls").
export function runFidelityWorkflow(workflowRelPath, args = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hyppo-fidelity-"));
  const tempFilePath = path.join(tmpDir, "output.md");
  const workflowPath = path.resolve(FIDELITY_DIR, workflowRelPath);
  const fullArgs = { ...args, outputPath: tempFilePath };

  const prompt = [
    "ultracode: use the Workflow tool to run exactly the script at the path below, then reply",
    'with only the word "DONE" once it completes. Do not summarize or explain.',
    "",
    `Script: ${workflowPath}`,
    `args: ${JSON.stringify(fullArgs)}`,
  ].join("\n");

  let stdout;
  try {
    // Scoped to this repo, invoking a workflow script that only ever writes inside tmpDir —
    // --dangerously-skip-permissions is what makes this runnable non-interactively (no TTY to
    // approve the agent's own Write tool call). Never use this pattern against untrusted input.
    //
    // KNOWN ENVIRONMENT CONSTRAINT: when this wrapper is itself invoked from inside a Claude Code
    // agent session with auto-mode's classifier active, spawning `claude -p
    // --dangerously-skip-permissions` is denied outright ("Create Unsafe Agents") — the child
    // process still exits 0, printing the denial as its --print response, so stdout MUST be
    // captured and checked, never piped to "ignore". A human running `npm run test:fidelity`
    // directly from their own terminal (not from inside an agent's Bash tool) is not subject to
    // that classifier and is the intended way to run this suite.
    stdout = execFileSync("claude", ["-p", prompt, "--dangerously-skip-permissions"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
      timeout: 120_000,
    });
  } catch (e) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw new Error(`claude -p failed running ${workflowRelPath}: ${e.message}`);
  }

  if (!fs.existsSync(tempFilePath)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw new Error(
      `claude -p exited 0 but never wrote ${tempFilePath} running ${workflowRelPath} — ` +
        `the session likely didn't execute the Workflow tool. Its response was:\n${stdout}`
    );
  }

  return {
    tempFilePath,
    cleanup() {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}
