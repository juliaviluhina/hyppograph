// 005 US4 (T027) — idempotency-unchanged-rerun. Was RED BY DESIGN until 006 (004 T024
// reopened 2026-09-14: the score phase re-scored unconditionally, never reading the
// existing evaluation before writing). 006 T004 implemented the read-before-write
// fingerprint guard; this case is now an ordinary structural pin like the others in
// structure.mjs — no special-cased verdict in run.mjs (006 T009 retired that passthrough).
import test from "node:test";
import assert from "node:assert/strict";
import { hasIdempotencyGuard } from "../support/structure.mjs";

test("idempotency-unchanged-rerun: score phase reads existing evaluation before write", () => {
  assert.ok(hasIdempotencyGuard(), "no existing-evaluation read found in the score phase");
});
