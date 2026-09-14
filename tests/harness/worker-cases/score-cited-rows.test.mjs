// 005 US2 (T015) — hyppo-score contract, node-runnable half: fixture honesty.
// Run-3 class: the fixtures must honestly support exactly what they claim — a
// fabricated gap must be a REAL gap (disclaimer-bounded), never an accident.
// SESSION (manual T020): the worker's per-row verdicts + citations on these inputs.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readFrontMatter } from "../support/assert.mjs";
import { COMMITTED_DATA_DIR } from "../support/scratch.mjs";

const JR = path.join(COMMITTED_DATA_DIR, "outputs", "job-records");
const EV = path.join(COMMITTED_DATA_DIR, "inputs", "evidence");
const SCORING_KEYS = [
  "globex--senior-backend-engineer--onsite-usa",
  "initrode--staff-platform-engineer--remote-eu",
  "soylent--engineering-manager--remote-eu",
  "stark--head-of-platform-engineering--remote-eu",
  "vandelay--senior-platform-engineer--berlin",
  "wayne--fintech-platform-engineer--remote-eu",
  "acme--backend-engineer--remote-eu",
  "umbrella--backend-engineer--remote-eu",
];

function evidenceText() {
  return fs.readFileSync(path.join(EV, "career-history.md"), "utf8") + "\n" + fs.readFileSync(path.join(EV, "cv-content.md"), "utf8");
}

test("score-cited-rows: every scored fixture is genuinely scorable", () => {
  for (const key of SCORING_KEYS) {
    const fm = readFrontMatter(path.join(JR, `${key}.md`));
    assert.ok(fm.roleTitle && fm.roleTitle !== "unknown", `${key}: roleTitle`);
    assert.ok(fm.canonicalCompany && fm.canonicalCompany !== "unknown", `${key}: company`);
  }
  // Requirements live in the body list; spot-check the body parses non-empty.
  const body = fs.readFileSync(path.join(JR, "vandelay--senior-platform-engineer--berlin.md"), "utf8");
  assert.match(body, /## Requirements\n\n(- .+\n?)+/);
});

test("score-cited-rows: wayne domain gap is disclaimer-bounded, not accidental", () => {
  const text = evidenceText();
  // Every AML/KYC / banking-license / fintech-compliance mention must sit inside
  // an explicit disclaimer ("No ...", "never ...") — the run-3 honesty rule: the
  // adjacent domain is documented as NOT covered, so the Fails row is designed.
  const re = /AML\/KYC|banking-license|fintech regulatory compliance/gi;
  let m;
  let count = 0;
  while ((m = re.exec(text)) !== null) {
    count++;
    const window = text.slice(Math.max(0, m.index - 60), m.index);
    assert.match(window, /[Nn]o |never|not |n't/i, `gap token at offset ${m.index} lacks a disclaimer`);
  }
  assert.ok(count >= 2, "expected at least the two known disclaimer mentions");
});

test("score-cited-rows: initrode operator gap carries its explicit disclaimer", () => {
  const ch = fs.readFileSync(path.join(EV, "career-history.md"), "utf8").replace(/\s+/g, " ");
  assert.match(ch, /no experience authoring Kubernetes operators or CRDs/i);
});
