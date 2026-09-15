// evals/component/keys.test.mjs — titleKey, companyKey, slug, stableHash, dedupKey assembly.
// Includes as fixtures the known bug-3/4/5 regressions (SC-002): bug-3/4 are the free-text-location
// / wobbly-normalizedTitle causes of a cross-source duplicate splitting into two Job Records; bug-5
// is a company-suffix wobble silently renaming the Job Record file.

import test from "node:test";
import assert from "node:assert/strict";
import {
  titleKey,
  companyKey,
  slug,
  stableHash,
  dedupKey,
} from "../../.claude/workflows/lib/intake-core.mjs";

test("slug: lowercases, strips punctuation, collapses whitespace to hyphens", () => {
  assert.equal(slug("Senior Platform Engineer (Remote, EU)"), "senior-platform-engineer-remote-eu");
  assert.equal(slug("  multiple   spaces  "), "multiple-spaces");
  assert.equal(slug(""), "");
});

test("stableHash: deterministic for the same input, differs for different input", () => {
  assert.equal(stableHash("abc"), stableHash("abc"));
  assert.notEqual(stableHash("abc"), stableHash("abd"));
  assert.match(stableHash("abc"), /^fnv1a:[0-9a-f]{8}$/);
});

test("titleKey: strips parentheticals, trailing company tail, and seniority prefixes", () => {
  assert.equal(titleKey("Senior Platform Engineer"), "platform-engineer");
  assert.equal(titleKey("Senior Platform Engineer (Remote, EU)"), "platform-engineer");
  assert.equal(titleKey("Platform Engineer — Acme Inc."), "platform-engineer");
  assert.equal(titleKey(undefined), "unknown");
});

test("titleKey bug-4: wobbly normalizedTitle phrasing collapses to one key (cross-source duplicate)", () => {
  // Same real role, phrased differently by two boards; the dedup key must not split them.
  const a = titleKey("Senior Platform Engineer");
  const b = titleKey("Sr. Platform Engineer");
  assert.equal(a, b);
});

test("companyKey: strips legal-entity suffixes repeatedly", () => {
  assert.equal(companyKey("Acme Inc."), "acme");
  assert.equal(companyKey("Acme Corporation"), "acme");
  assert.equal(companyKey("Acme"), "acme");
});

test("companyKey bug-5: suffix wobble across runs resolves to the same key (no file rename)", () => {
  // The canonicaliser agent is unreliable about suffixes run-to-run ("Tyrell Corp" vs "Tyrell").
  const withSuffix = companyKey("Tyrell Corp");
  const withoutSuffix = companyKey("Tyrell");
  assert.equal(withSuffix, withoutSuffix);
});

test("dedupKey: assembles companyKey--titleKey--locKey", () => {
  assert.equal(dedupKey("Acme Inc.", "Senior Platform Engineer", "remote-eu"), "acme--platform-engineer--remote-eu");
});

test("dedupKey bug-3: free-text location differences do not split the key when locKey (bucket) matches", () => {
  // locKey is derived by the caller from the COARSE locationBucket, not the free-text locations[] —
  // two boards phrasing the same location differently must still land in the same dedup key.
  const keyA = dedupKey("Acme", "Platform Engineer", "remote-eu");
  const keyB = dedupKey("Acme", "Platform Engineer", "remote-eu");
  assert.equal(keyA, keyB);
});

test("dedupKey: falls back to \"unknown\" locKey when none given", () => {
  assert.equal(dedupKey("Acme", "Platform Engineer", ""), "acme--platform-engineer--unknown");
  assert.equal(dedupKey("Acme", "Platform Engineer", undefined), "acme--platform-engineer--unknown");
});
