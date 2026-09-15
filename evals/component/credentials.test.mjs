// evals/component/credentials.test.mjs — evals/lib/credentials.mjs's environment-only credential
// read (FR-016). Confirms: present -> values returned; absent -> the missing variable is named, not
// silently defaulted or prompted for.

import test from "node:test";
import assert from "node:assert/strict";
import { requireEnv, missingCredentialMessage, JUDGE_CREDENTIAL_VARS, JUDGE_CONFIG_VARS } from "../lib/credentials.mjs";

test("credentials: all present -> ok with their values", () => {
  const prev = { A: process.env.__EVAL_TEST_A, B: process.env.__EVAL_TEST_B };
  process.env.__EVAL_TEST_A = "1";
  process.env.__EVAL_TEST_B = "2";
  try {
    const r = requireEnv(["__EVAL_TEST_A", "__EVAL_TEST_B"]);
    assert.deepEqual(r, { ok: true, values: { __EVAL_TEST_A: "1", __EVAL_TEST_B: "2" } });
  } finally {
    if (prev.A === undefined) delete process.env.__EVAL_TEST_A; else process.env.__EVAL_TEST_A = prev.A;
    if (prev.B === undefined) delete process.env.__EVAL_TEST_B; else process.env.__EVAL_TEST_B = prev.B;
  }
});

test("credentials: absent variable is named, not silently defaulted (FR-016 — 'unset judge credential -> exit 2 naming the var')", () => {
  delete process.env.__EVAL_TEST_MISSING_VAR;
  const r = requireEnv(["__EVAL_TEST_MISSING_VAR"]);
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, ["__EVAL_TEST_MISSING_VAR"]);
  assert.match(missingCredentialMessage(r.missing), /__EVAL_TEST_MISSING_VAR/);
});

test("credentials: never accepts a credential from argv — requireEnv only reads process.env", () => {
  // requireEnv's signature takes variable NAMES only, never a value; there is no code path by which
  // a CLI argument could substitute for an unset environment variable.
  assert.equal(requireEnv.length, 1);
});

test("credentials: judge credential/config variable names match the documented set (data-model.md Credential)", () => {
  assert.deepEqual(JUDGE_CREDENTIAL_VARS, ["HYPPO_JUDGE_API_KEY"]);
  assert.deepEqual(JUDGE_CONFIG_VARS, ["HYPPO_JUDGE_BASE_URL", "HYPPO_JUDGE_MODEL", "HYPPO_JUDGE_EFFORT"]);
});
