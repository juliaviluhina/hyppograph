// 005 US4 (T027) — idempotency-unchanged-rerun: RED BY DESIGN until 006.
// The score phase re-scores unconditionally (004 T024 reopened 2026-09-14): the
// workflow never reads the existing evaluation before writing, so it cannot skip
// unchanged records. This case asserts the structural prerequisite (an existing-
// evaluation read in the score phase) and fails until 006 implements it.
// The runner maps exactly this case name to `expected-red`; see
// contracts/harness-report.md. Do NOT rename it without a spec amendment.
import test from "node:test";
import assert from "node:assert/strict";
import { hasIdempotencyGuard } from "../support/structure.mjs";

test("idempotency-unchanged-rerun: score phase reads existing evaluation before write", () => {
  assert.ok(
    hasIdempotencyGuard(),
    "T024 not implemented: no existing-evaluation read in the score phase (fix owns to 006)"
  );
});
