// evals/component/credential-hygiene.test.mjs — the repository, its history-adjacent tracked
// files, and every eval report carry no credential material (FR-012, FR-017, US3 Independent Test
// "grep the repository ... for credential material — none is present").

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

function trackedFiles() {
  return execFileSync("git", ["ls-files"], { cwd: REPO_ROOT, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

// A live OpenCode Go key looks like `sk-<40+ hex/base62 chars>` (verified live 2026-09-14, see
// research.md D5). Flag anything matching that shape in a tracked file.
const SECRET_PATTERN = /\bsk-[A-Za-z0-9]{20,}\b/;

test("credential-hygiene: no tracked file contains a live-looking API key", () => {
  const offenders = [];
  for (const relPath of trackedFiles()) {
    const abs = `${REPO_ROOT}${relPath}`;
    if (!existsSync(abs)) continue; // deleted-but-staged edge case
    let content;
    try {
      content = readFileSync(abs, "utf8");
    } catch {
      continue; // binary file
    }
    if (SECRET_PATTERN.test(content)) offenders.push(relPath);
  }
  assert.deepEqual(offenders, []);
});

test("credential-hygiene: .env.example carries only placeholder names, no values", () => {
  const envExample = readFileSync(`${REPO_ROOT}.env.example`, "utf8");
  for (const line of envExample.split("\n")) {
    const m = line.match(/^HYPPO_JUDGE_API_KEY=(.*)$/);
    if (m) assert.equal(m[1].trim(), "", "HYPPO_JUDGE_API_KEY in .env.example must have no value");
  }
});

test("credential-hygiene: .env is gitignored (never tracked)", () => {
  const tracked = trackedFiles();
  assert.equal(tracked.includes(".env"), false);
});

test("credential-hygiene: no committed eval report contains a credential-shaped string", () => {
  const offenders = trackedFiles()
    .filter((f) => f.startsWith("docs/eval-reports/") && f.endsWith(".md"))
    .filter((f) => SECRET_PATTERN.test(readFileSync(`${REPO_ROOT}${f}`, "utf8")));
  assert.deepEqual(offenders, []);
});
