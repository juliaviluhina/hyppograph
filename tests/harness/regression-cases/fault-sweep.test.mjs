// 005 US4 (T028) — fault-injection sweep: every 004 run-1–9 fix pinned in one
// place. Each entry re-verifies the structural pin for its historical fault;
// the config-gate fault is additionally reintroduced LIVE against the gate
// mirror (mutated settings must yield a naming issue). Traceability:
//   run 1 (stripped prefix) ......... config-gate live fault below
//   run 2 (missing worker def) ...... worker-presence.test.mjs
//   run 3 (dishonest fixture) ....... fixture-honesty.test.mjs
//   run 4 (absolute paths) .......... settings-verbatim.test.mjs + live fault below
//   run 5 (batched evidence read) ... hasSingleFileEvidenceReads below
//   run 6 (transcribed settings) .... hasRawSettingsPassthrough below
//   run 7 (blocking audit) .......... hasNonBlockingAudit below
//   run 8 (green baseline) .......... full-flow.test.mjs good-shape case
//   run 9 + T024 (no idempotency) ... idempotency.test.mjs (expected-red → 006)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  hasRawSettingsPassthrough,
  hasSingleFileEvidenceReads,
  hasNonBlockingAudit,
} from "../support/structure.mjs";
import { checkConfigGate } from "../support/gate.mjs";
import { COMMITTED_DATA_DIR } from "../support/scratch.mjs";

test("fault-sweep: all green structural pins hold", () => {
  assert.ok(hasRawSettingsPassthrough(), "run-6 pin broken");
  assert.ok(hasSingleFileEvidenceReads(), "run-5 pin broken");
  assert.ok(hasNonBlockingAudit(), "run-7 pin broken");
});

test("fault-sweep: reintroduced run-1/run-4 faults yield naming issues", () => {
  const settings = JSON.parse(
    fs.readFileSync(path.join(COMMITTED_DATA_DIR, "inputs", "settings.json"), "utf8")
  );
  const reader = (rel) => {
    const c = fs.readFileSync(path.join(COMMITTED_DATA_DIR, rel), "utf8");
    return c.trim() === "" ? null : c;
  };
  const mutated = JSON.parse(JSON.stringify(settings));
  mutated.sections.evidenceBase.value.files = ["evidence/career-history.md"]; // run-1 fault
  assert.ok(
    checkConfigGate(mutated, reader).some((i) => /inputs\//.test(i)),
    "stripped prefix must fail the gate"
  );
  mutated.sections.evidenceBase.value.files = ["/abs/career-history.md"]; // run-4 fault
  assert.ok(
    checkConfigGate(mutated, reader).some((i) => /inputs\//.test(i)),
    "absolute path must fail the gate"
  );
});
