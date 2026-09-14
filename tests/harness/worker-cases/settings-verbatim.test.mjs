// 005 US2 (T016) — settings-reader contract (runs 1/4/6 class).
// Node-runnable: raw settings text parses in code; every evidenceBase.files entry
// is echoed byte-for-byte (verbatim), data-dir-relative, and never the settings
// path itself. Plus the structural pin: the workflow returns raw text and parses
// via JSON.parse (R12) — transcription is structurally impossible, not unlikely.
// SESSION (manual T020): hyppo-read echoing an exact tricky path unchanged.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { checkConfigGate } from "../support/gate.mjs";
import { hasRawSettingsPassthrough } from "../support/structure.mjs";
import { COMMITTED_DATA_DIR } from "../support/scratch.mjs";

const SETTINGS = path.join(COMMITTED_DATA_DIR, "inputs", "settings.json");

function readFile(rel) {
  const p = path.join(COMMITTED_DATA_DIR, rel);
  const content = fs.readFileSync(p, "utf8");
  return content.trim() === "" ? null : content;
}

test("settings-verbatim: committed settings pass the gate with zero issues", () => {
  const raw = fs.readFileSync(SETTINGS, "utf8");
  const settings = JSON.parse(raw); // code owns config parsing (R12)
  assert.deepEqual(checkConfigGate(settings, readFile), []);
});

test("settings-verbatim: every files entry is verbatim, relative, and sane", () => {
  const raw = fs.readFileSync(SETTINGS, "utf8");
  const { files } = JSON.parse(raw).sections.evidenceBase.value;
  for (const f of files) {
    assert.ok(f.startsWith("inputs/"), `missing inputs/ prefix (run-1 class): ${f}`);
    assert.ok(!path.isAbsolute(f), `absolute path (run-4 class): ${f}`);
    assert.notEqual(f, "inputs/settings.json", "settings path echoed as evidence (run-6 class)");
    assert.ok(!f.includes("data-dir/"), `doubled data-dir prefix (run-4 class): ${f}`);
    const content = readFile(f);
    assert.ok(content && content.length > 0, `unreadable/empty: ${f}`);
  }
});

test("settings-verbatim: workflow returns raw text, parses in code", () => {
  assert.ok(hasRawSettingsPassthrough(), "rawFileReadSchema + JSON.parse pin missing");
});
