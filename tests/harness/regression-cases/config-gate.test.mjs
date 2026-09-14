// 005 US4 (T024) — config-gate mirror (run-1 class).
// Applies the FR-000 rules to parsed settings + a file probe: the committed
// settings pass clean; each historical fault class (stripped prefix, absolute
// path, settings-as-evidence, empty file, missing recency window, malformed
// compFloor, empty streams) yields a naming issue. The committed
// settings.missing-recency-window.json fixture is itself a case.
// SESSION (manual T044): the workflow reports config.evidence-unavailable with
// zero writes for each of these.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { checkConfigGate } from "../support/gate.mjs";
import { COMMITTED_DATA_DIR } from "../support/scratch.mjs";

const INPUTS = path.join(COMMITTED_DATA_DIR, "inputs");
const realReader = (rel) => {
  const c = fs.readFileSync(path.join(COMMITTED_DATA_DIR, rel), "utf8");
  return c.trim() === "" ? null : c;
};
const goodSettings = () => JSON.parse(fs.readFileSync(path.join(INPUTS, "settings.json"), "utf8"));

test("config-gate: committed settings pass with zero issues", () => {
  assert.deepEqual(checkConfigGate(goodSettings(), realReader), []);
});

test("config-gate: missing-recency fixture names its missing field", () => {
  const bad = JSON.parse(fs.readFileSync(path.join(INPUTS, "settings.missing-recency-window.json"), "utf8"));
  const issues = checkConfigGate(bad, realReader);
  assert.ok(issues.length >= 1, "expected at least one issue");
  assert.ok(issues.some((i) => i.includes("recencyWindowYears")), JSON.stringify(issues));
});

test("config-gate: each historical fault class yields a naming issue", () => {
  const cases = [
    ["stripped inputs/ prefix (run 1)", { files: ["evidence/career-history.md"] }, /inputs\//],
    ["absolute path (run 4)", { files: ["/tmp/x/career-history.md"] }, /inputs\//],
    ["settings.json as evidence (run 6)", { files: ["inputs/settings.json"] }, /settings\.json itself/],
    ["empty evidence file", { files: ["inputs/evidence/career-history.md"] }, /missing or empty/],
    ["malformed compFloor", null, /compFloor/, { compFloor: { amount: -5, currency: "" } }],
    ["empty streams", null, /streams/, null, []],
  ];
  for (const [name, filesOverride, pattern, hcOverride, streamsOverride] of cases) {
    const s = goodSettings();
    if (filesOverride) s.sections.evidenceBase.value.files = filesOverride.files;
    if (hcOverride) s.sections.hardConstraints.value.compFloor = hcOverride.compFloor;
    if (streamsOverride !== undefined) s.sections.targetRoles.value.streams = streamsOverride;
    const reader = name === "empty evidence file" ? () => null : realReader;
    const issues = checkConfigGate(s, reader);
    assert.ok(issues.some((i) => pattern.test(i)), `${name}: got ${JSON.stringify(issues)}`);
  }
});
