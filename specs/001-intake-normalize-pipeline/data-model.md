# Phase 1 Data Model: Intake & Normalize Pipeline Steps

All entities are plain files under `HYPPO_DATA_DIR`. Types live in `src/domain/types.ts`. Field
"unknown" is a literal sentinel string; fields are never silently blank (FR-010).

---

## SettingsStore  *(input — read-only)*

`inputs/settings.json`, produced and validated by feature 002 (schema:
`specs/002-onboarding-settings/contracts/settings-store.md`). Feature 001 reads:

| Path | Used for |
|---|---|
| `completeness.setupReady` | run precondition (FR-000) — false ⇒ report unresolved sections, exit |
| `sections.trackedBoards.value[]` | the `TrackedSource` list |
| `sections.hardStops.value` | `TriageCriteria` hard stops |
| `sections.locations.value.excluded` | unioned into effective excluded locations |
| `sections.directions.value[]` | `ConsideredDirection` list |

---

## TrackedSource  *(input — read-only)*

One entry of `sections.trackedBoards.value[]` in the settings store.

| Field | Type | Notes |
|---|---|---|
| `name` | string | Display name; defaults to the search URL's host if absent |
| `filteredSearch` | string | User-authored filtered board search — a tuned search URL (and/or native params). Opaque to HyppoGraph (R3, R5). |
| `depth` | integer ≥ 1 | Collection depth — how many results to walk within the filtered set |
| `configError` | string \| null | Set when `filteredSearch` is empty or `depth` is non-positive (FR-002a); source is then skipped and reported in `RunSummary.sourcesFailed` |

---

## ManualPostingDrop  *(input — read-only)*

A designated directory (default `inputs/manual-postings/` under the data dir). Each file = one posting
to ingest with `retrievalMethod: "manual"`. Non-posting files are skipped with a run-summary note
(spec edge case).

---

## RawRecord  *(output — verbatim text immutable once written)*

Stored under `outputs/job-records/raw/`. One file per posting.

| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable identity: canonical source URL (board) or absolute file path (manual). Idempotency key (R6). |
| `sourceName` | string | From TrackedSource, or `"manual"` |
| `sourceRef` | string | URL or originating file path |
| `firstSeenAt` | ISO 8601 string | Set once, on first store |
| `retrievalMethod` | `"mcp-page-read"` \| `"manual"` | |
| `run` | string | Run id that produced it |
| `text` | string | Full verbatim posting text; **immutable** |
| `availability` | `"ok"` \| `"unavailable"` | `unavailable` = delisted between discovery and fetch (metadata kept, no text) |
| `triage` | TriageMark \| null | Assigned before normalization; may be recomputed on a later run |

### TriageMark  *(embedded in RawRecord)*

| Field | Type | Notes |
|---|---|---|
| `decision` | `"kept"` \| `"rejected"` | |
| `reason` | string | One line. Required for `rejected`; for `kept` may name the matched direction or `"low-confidence default keep"` |
| `confidence` | `"normal"` \| `"low"` | `low` ⇒ defaulted to `kept` and flagged in the run summary (FR-008c) |
| `criteriaHash` | string | Hash of (hard stops + directions + raw text). Re-triage only when this changes (R6). |
| `decidedAt` | ISO 8601 string | |

State transitions: `null → kept | rejected`; `(kept|rejected) → kept | rejected` only when
`criteriaHash` differs. Never deletes or edits `text`.

---

## JobRecord  *(output — one Markdown file, front-matter + body)*

Stored under `outputs/job-records/`. File = `gray-matter` front-matter (the fixed field set) + a
human-readable body. Written only for RawRecords with `triage.decision === "kept"`.

**Front-matter (fixed field set — every key present, value or `"unknown"`):**

| Key | Type | Notes |
|---|---|---|
| `key` | string | Deterministic identity: `slug(canonicalCompany)--titleKey(roleTitle)--locationBucket` (FR-015). `titleKey` is a **code** transform (strip parentheticals, a trailing " — Company", leading seniority words) — never the LLM's `normalizedTitle`, which wobbles run-to-run and would split one role into two records |
| `roleTitle` | string | As stated |
| `normalizedTitle` | string | Lowercased/canonical form — **display only**, not part of `key` |
| `canonicalCompany` | string | Resolved via CanonicalCompany (FR-014) |
| `locations` | string[] | Human-readable, as stated; may be `["unknown"]`. **Not** used in `key` |
| `locationBucket` | string | Coarse dedup key component: `"remote-<region>"` (e.g. `remote-eu`), a `"<city>"`, or `"unknown"`. Collapses board-specific phrasings ("Remote (EU)" / "(Remote, EU)" / "EU-remote" → `remote-eu`) so one role seen on two boards does not split into two Job Records |
| `workArrangement` | `"remote"` \| `"hybrid"` \| `"on-site"` \| `"unknown"` | |
| `salaryAmountOrRange` | string | Verbatim as stated, or `"unknown"` — never converted (FR-010) |
| `salaryCurrency` | string | or `"unknown"` |
| `seniority` | string | or `"unknown"` |
| `employmentType` | string | or `"unknown"` |
| `postingDate` | ISO 8601 string \| `"unknown"` | |
| `originalLanguage` | string | `"en"` unless the source posting was another language (FR-013) |
| `completeness` | `"ok"` \| `"low"` | `low` when ≥ 60% of fixed-field values are `"unknown"`, or when `roleTitle` / `canonicalCompany` / the requirements list is unknown or empty (FR-017) |
| `sources` | SourceLink[] | One per place the role was seen: `{ sourceName, sourceRef, rawRecordId }` |
| `appliedEntryRef` | string \| null | Link to an ApplicationsTrackerEntry when company+role match (FR-016) |
| `alreadyApplied` | boolean | `true` iff `appliedEntryRef` set |

**Body:** `responsibilitiesSummary` (prose) + `requirements` (a Markdown list — each item individually
referenceable, FR-011) + a link to each linked RawRecord's file (FR-012).

State transitions: created from first kept posting; a later posting whose derived `key` matches merges
its `SourceLink` into `sources` in place — no duplicate file (FR-015). Front-matter fields may be
enriched if a later source states a field that was `"unknown"`; a stated value is never overwritten
with `"unknown"`.

---

## CanonicalCompany  *(output — canonicalisation index)*

Stored as `outputs/job-records/companies.md` (or equivalent). Maps observed company-name variants to
one canonical name, seeded from names already present in the user's data (applications tracker,
existing Job Records). Consistency requirement: FR-014.

| Field | Type |
|---|---|
| `canonical` | string |
| `variants` | string[] |

---

## ApplicationsTrackerEntry  *(input — read-only)*

Read from `inputs/applications.md`. Used only to set `appliedEntryRef` / `alreadyApplied` and to seed
CanonicalCompany. Never modified by this feature.

| Field | Type |
|---|---|
| `company` | string |
| `role` | string |
| `ref` | string (stable pointer back into applications.md) |

---

## ConsideredDirection  *(input — read-only)*

One entry of `sections.directions.value[]` in the settings store. Coarse "does this posting relate to
anything I want?" reference for pre-triage (FR-008b).

| Field | Type | Notes |
|---|---|---|
| `name` | string | Unique within the list |
| `description` | string | What roles this direction covers — the text the triage judgment matches against |

(`materialsPath` exists on the store entry but is not read by this feature.)

---

## HardStops  *(input — read-only)*

`sections.hardStops.value` in the settings store.

| Field | Type | Notes |
|---|---|---|
| `excludedLocations` | string[] | Effective set = this ∪ `sections.locations.value.excluded`. Triage rejects a posting whose only location(s) fall here |
| `lackedClearances` | string[] | Triage rejects a posting requiring one of these |
| `lackedWorkAuth` | string[] | Triage rejects a posting requiring work authorisation the user lacks |
| `visaSponsorshipRequired` | boolean | When true, triage rejects a posting that offers no sponsorship |

All arrays empty + `visaSponsorshipRequired` false ⇒ no hard stops; with `directions` also empty,
FR-008d applies.

---

## ProvenanceLogEntry  *(output — append-only)*

One line appended to `provenance-log.md` per: stored RawRecord, triage mark (kept/rejected + reason),
and created-or-updated JobRecord (FR-007).

| Field | Type |
|---|---|
| `at` | ISO 8601 string |
| `run` | string |
| `what` | string (entity id / path) |
| `how` | string (`"mcp-page-read"`, `"manual"`, `"pre-triage"`, `"normalize"`, ...) |
| `why` | string (short) |

---

## RunSummary  *(output — per run)*

Written at end of run and printed by `index.ts` (FR-020).

| Field | Type |
|---|---|
| `run` | string |
| `postingsCollected` | integer |
| `newRawRecords` | integer |
| `triageKept` / `triageRejected` | integer |
| `triageRejectReasons` | Record<string, integer> (breakdown) |
| `triageLowConfidence` | integer |
| `newJobRecords` | integer |
| `duplicatesMerged` | integer |
| `sourcesFailed` | { source: string; reason: string }[] |
| `itemsSkipped` | { ref: string; reason: string }[] |
| `noTriageCriteria` | boolean (FR-008d note) |
