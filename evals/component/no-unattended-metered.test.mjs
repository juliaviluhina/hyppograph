// evals/component/no-unattended-metered.test.mjs — no push-triggered, scheduled, or otherwise
// unattended job may run a metered eval; only the free `component` layer may run unattended
// (FR-018, Complexity Tracking row a). Verified 2026-09-14: no .github/workflows/, no active git
// hooks beyond the sample templates, and package.json's only test-adjacent script resolves to
// `component`.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

test("no-unattended-metered: no .github/workflows/ directory exists", () => {
  assert.equal(existsSync(`${REPO_ROOT}.github/workflows`), false);
});

test("no-unattended-metered: no active (non-sample) git hooks", () => {
  const hooksDir = `${REPO_ROOT}.git/hooks`;
  if (!existsSync(hooksDir)) return; // nothing to check
  const active = readdirSync(hooksDir).filter((f) => !f.endsWith(".sample"));
  assert.deepEqual(active, []);
});

test("no-unattended-metered: package.json's `test` script resolves to the component layer only", () => {
  const pkg = JSON.parse(readFileSync(`${REPO_ROOT}package.json`, "utf8"));
  assert.match(pkg.scripts.test, /node --test evals\/component\//);
  // `eval` is a manual passthrough to evals/run.mjs, not auto-wired to anything — npm never
  // invokes it on its own (no "pretest"/"posttest"/lifecycle hook chains into it).
  assert.equal(pkg.scripts.pretest, undefined);
  assert.equal(pkg.scripts.posttest, undefined);
});
