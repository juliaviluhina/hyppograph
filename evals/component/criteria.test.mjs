// evals/component/criteria.test.mjs — criteriaFingerprint, noTriageCriteria,
// effectiveExcludedLocations, completenessLevel (the low-completeness threshold rule).

import test from "node:test";
import assert from "node:assert/strict";
import {
  criteriaFingerprint,
  noTriageCriteria,
  effectiveExcludedLocations,
  completenessLevel,
} from "../../.claude/workflows/lib/intake-core.mjs";

test("effectiveExcludedLocations: unions hard-stop and locations-section lists, folded", () => {
  const union = effectiveExcludedLocations(
    { excludedLocations: [" Antarctica "] },
    ["antarctica", "The Moon"]
  );
  assert.deepEqual(union.sort(), ["antarctica", "antarctica", "the moon"].sort());
});

test("effectiveExcludedLocations: absent hardStops/locationsExcluded yields empty", () => {
  assert.deepEqual(effectiveExcludedLocations(undefined, undefined), []);
});

test("criteriaFingerprint: deterministic for the same criteria+directions", () => {
  const criteria = { excludedLocations: ["antarctica"], lackedClearances: [], lackedWorkAuth: [], visaSponsorshipRequired: false };
  const directions = [{ name: "backend", description: "backend platform roles" }];
  assert.equal(criteriaFingerprint(criteria, directions), criteriaFingerprint(criteria, directions));
});

test("criteriaFingerprint: direction order does not matter (sorted by description)", () => {
  const criteria = { excludedLocations: [], lackedClearances: [], lackedWorkAuth: [], visaSponsorshipRequired: false };
  const a = [
    { name: "backend", description: "backend platform roles" },
    { name: "infra", description: "infra roles" },
  ];
  const b = [
    { name: "infra", description: "infra roles" },
    { name: "backend", description: "backend platform roles" },
  ];
  assert.equal(criteriaFingerprint(criteria, a), criteriaFingerprint(criteria, b));
});

test("criteriaFingerprint: changes when a hard stop changes (forces re-triage, R6)", () => {
  const directions = [];
  const a = criteriaFingerprint({ excludedLocations: [], lackedClearances: [], lackedWorkAuth: [], visaSponsorshipRequired: false }, directions);
  const b = criteriaFingerprint({ excludedLocations: ["antarctica"], lackedClearances: [], lackedWorkAuth: [], visaSponsorshipRequired: false }, directions);
  assert.notEqual(a, b);
});

test("noTriageCriteria: true when no hard stops and no directions (FR-008d)", () => {
  const criteria = { excludedLocations: [], lackedClearances: [], lackedWorkAuth: [], visaSponsorshipRequired: false };
  assert.equal(noTriageCriteria(criteria, []), true);
  assert.equal(noTriageCriteria(criteria, undefined), true);
});

test("noTriageCriteria: false when any hard stop is set", () => {
  const withExcluded = { excludedLocations: ["antarctica"], lackedClearances: [], lackedWorkAuth: [], visaSponsorshipRequired: false };
  assert.equal(noTriageCriteria(withExcluded, []), false);
  const withVisa = { excludedLocations: [], lackedClearances: [], lackedWorkAuth: [], visaSponsorshipRequired: true };
  assert.equal(noTriageCriteria(withVisa, []), false);
});

test("noTriageCriteria: false when directions are configured, even with no hard stops", () => {
  const criteria = { excludedLocations: [], lackedClearances: [], lackedWorkAuth: [], visaSponsorshipRequired: false };
  assert.equal(noTriageCriteria(criteria, [{ name: "backend", description: "backend roles" }]), false);
});

const fullFields = {
  roleTitle: "Platform Engineer",
  locations: ["Berlin"],
  workArrangement: "hybrid",
  salaryAmountOrRange: "€80k-100k",
  salaryCurrency: "EUR",
  seniority: "senior",
  employmentType: "full-time",
  postingDate: "2026-09-01",
  requirements: ["5+ years backend experience"],
};

test("completenessLevel: \"ok\" when core fields are populated and requirements is non-empty", () => {
  assert.equal(completenessLevel(fullFields, "Acme"), "ok");
});

test("completenessLevel: \"low\" when >=60% of core fields are unknown", () => {
  const sparse = {
    roleTitle: "Platform Engineer",
    locations: ["unknown"],
    workArrangement: "unknown",
    salaryAmountOrRange: "unknown",
    salaryCurrency: "unknown",
    seniority: "unknown",
    employmentType: "unknown",
    postingDate: "unknown",
    requirements: ["5+ years backend experience"],
  };
  assert.equal(completenessLevel(sparse, "Acme"), "low");
});

test("completenessLevel: \"low\" when roleTitle is missing even if other fields are populated", () => {
  const noTitle = { ...fullFields, roleTitle: "unknown" };
  assert.equal(completenessLevel(noTitle, "Acme"), "low");
});

test("completenessLevel: \"low\" when canonicalCompany is unknown", () => {
  assert.equal(completenessLevel(fullFields, "unknown"), "low");
});

test("completenessLevel: \"low\" when requirements is empty (no-salary-no-location posting class)", () => {
  const noReqs = { ...fullFields, requirements: [] };
  assert.equal(completenessLevel(noReqs, "Acme"), "low");
});
