# Phase 1 Data Model: Fit-Screen Gap Fixes

Amends 004's model (fields) and 005's report model (one verdict value). Nothing else
changes shape.

---

## InputFingerprint *(new — metadata, computed in code)*

| Field | Type | Notes |
|---|---|---|
| `algorithm` | literal `"fnv1a-hex"` | FNV-1a over UTF-16 code units, hex-encoded; implementable in the workflow sandbox (no imports) and mirrored in `tests/harness/support/pure.mjs` |
| `inputs` | ordered concatenation | Canonical `JSON.stringify` of the parsed Job Record fields hyppo-score is shown (`roleTitle`, `canonicalCompany`, `locations`, `salaryAmountOrRange`, `salaryCurrency`, `responsibilitiesSummary`, `requirements`, `openStatus` — the same shape `buildScorePrompt` serializes; T002 decision, not raw file text) + `\n---\n` + each evidence file's text in `evidenceBase.files` order joined by `\n---\n` + `\n---\n` + tracker text or `"NO_TRACKER"` + `\n---\n` + canonical `JSON.stringify` of `{hardConstraints, hardStops, targetRoles}` |
| `value` | hex string | Stored; compared for equality only, never parsed |

Determinism notes: evidence order is the settings list order (not filesystem order);
tracker absence is an explicit sentinel (file-missing vs file-empty stay distinct —
an empty tracker file hashes as `""`, absent hashes as `"NO_TRACKER"`); clock values
never enter the hash (R1).

---

## FitEvaluation *(amended — 004 § FitEvaluation front-matter gains one key)*

| Key | Type | Notes |
|---|---|---|
| `inputFingerprint` | hex string | Written on every score; read-before-write on every later run. Missing (pre-006 files) ⇒ treated as mismatch ⇒ re-score once, then carry the field forever after. |

State transitions: created with fingerprint → later run recomputes: equal ⇒ file
untouched (no write, no provenance, counted `skipped-idempotent`); different ⇒
overwrite in place with the new fingerprint (existing 004 semantics).

---

## RunSummary *(amended — 004 § RunSummary gains one counter)*

| Field | Type | Notes |
|---|---|---|
| `skippedIdempotent` | integer | Records skipped by fingerprint equality this run. Rendered in `last-run-summary` beside `scored`. |

---

## HarnessReport *(amended — 005 report verdict set gains one value)*

`pass` · `expected-red` · `unexpected-red` · **`blocked`**. `blocked` applies only to
expectations marked `requiresWire: true` when the run environment cannot exercise
the wire (isolated loopback per 005 R8). Listed in its own report section with the
reason; counted in neither pass nor fail; exit code unaffected. Leaving/entering
`blocked` needs no spec amendment — it derives per run from the environment.
