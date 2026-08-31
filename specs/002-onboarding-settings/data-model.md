# Phase 1 Data Model: Onboarding & Settings Stage

The one durable artifact is `HYPPO_DATA_DIR/inputs/settings.json` — shape fixed by
[`contracts/settings-store.md`](./contracts/settings-store.md). The entities below are the in-memory
model the onboarding driver works with (Phase B: `src/domain/settings.ts` + `zod` schemas; Phase A:
the same structure, held in the session). Nothing here is a new file format beyond the store and the
shared `provenance-log.md`.

---

## SettingsStore  *(output — this feature owns the write side)*

`inputs/settings.json`. One JSON object, written atomically (temp + `rename`, research R2).

| Field | Type | Notes |
|---|---|---|
| `version` | `1` | Schema version; bump only via a coordinated contract change with 001 |
| `sections` | `Record<SectionKey, Section>` | Every key always present (see catalog below) |
| `completeness` | `CompletenessResult` | Recomputed on every write (R9) |

`SectionKey` = `candidateBasics` \| `locations` \| `workArrangement` \| `compensation` \| `hardStops`
\| `directions` \| `trackedBoards` \| `collectionTuning` \| `scoringWeightNotes`.

---

## Section  *(in-memory + persisted)*

| Field | Type | Notes |
|---|---|---|
| `status` | `"unset"` \| `"answered"` \| `"skipped"` | `"skipped"` allowed only when `required === false` (FR-003) |
| `value` | section-specific object \| array \| null | `null`/absent while `unset`; shape per `settings-store.md` |
| `required` | boolean | Not persisted — from the catalog; `true` for locations / hardStops / directions / trackedBoards |
| extra advisory fields | — | `candidateBasics.profileFileExists` is the only one (FR-001a) |

State transitions per section:

```
unset ──answer──▶ answered ──edit──▶ answered      (value replaced; one provenance entry)
  │                                     ▲
  └──skip (optional only)──▶ skipped ───┘ (answer)
answered/skipped ──"leave as is"──▶ (unchanged; NO write, NO provenance)   (FR-009)
```

---

## Question  *(catalog only — not persisted)*

One prompt within a section. Full list in [`contracts/onboarding.md`](./contracts/onboarding.md).

| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable within a section |
| `prompt` | string | Shown to the user |
| `default` | value \| `SKIP` | Concrete proposal (R5); `SKIP` only for optional sections |
| `type` | `string` \| `number` \| `enum` \| `string[]` \| `list<record>` | Drives validation |
| `constraint` | predicate + message | e.g. "a number > 0", "non-empty", "valid absolute or https URL" |
| `required` | boolean | A required question inside an optional section blocks only that section's *answer*, not `skip` |
| `prefillFrom` | file-kind \| null | Which hand-authored file pre-fills this (R6): board list, hard-stops note, directions folder |

---

## Per-section `value` shapes

Exactly as `contracts/settings-store.md` — summarised here for the validators:

| Section | `value` | Validation highlights |
|---|---|---|
| `candidateBasics` | `{ displayName, contactLine: string\|null }` + sibling `profileFileExists: boolean` | `displayName` non-empty if `answered`; `profileFileExists` is a non-blocking advisory check of `inputs/candidate-profile.md` (FR-001a) |
| `locations` | `{ preferred: string[], excluded: string[] }` | both may be `[]`; entries trimmed, de-duplicated case-insensitively (R10) |
| `workArrangement` | `{ preference: enum, onSiteTolerance: string\|null }` | `preference` ∈ remote \| hybrid \| on-site \| remote-or-hybrid; default `remote-or-hybrid` |
| `compensation` | `{ floor: number, target: number\|null, currency: string, benchmarkNotes: string\|null }` | `floor` a positive number; `currency` a non-empty code; `target ≥ floor` if set (FR-006, SC-008) |
| `hardStops` | `{ excludedLocations: string[], lackedClearances: string[], lackedWorkAuth: string[], visaSponsorshipRequired: boolean }` | lists may be `[]`; `visaSponsorshipRequired` defaults `false`; union with `locations.excluded` is the effective exclusion set |
| `directions` | `[{ name, description, materialsPath: string\|null }]` | **≥ 1 entry to be `answered`** (FR-017); `name` unique (R10); `description` non-empty (used by 001 pre-triage); `materialsPath` relative to `inputs/` if set |
| `trackedBoards` | `[{ name, filteredSearch, depth }]` | **≥ 1 entry to be `answered`** (FR-017); `name` unique; `filteredSearch` non-empty and URL-shaped; `depth` integer ≥ 1 (FR-006, SC-008) |
| `collectionTuning` | `{ pacingMs: number, fetchCap: number, defaultDepth: number }` | all positive integers; default `{ 3000, 300, 25 }` (R5) |
| `scoringWeightNotes` | `{ text: string }` | free text; non-empty if `answered` |

---

## CompletenessResult  *(field of the store; recomputed every write — R9)*

| Field | Type | Rule |
|---|---|---|
| `setupReady` | boolean | `true` iff `sections.{locations,hardStops,directions,trackedBoards}.status === "answered"` (FR-015) |
| `unresolved` | `[{ section, reason }]` | one per required section not `answered`; `reason` = `"unset"` or the failing validation message |

Optional sections being `unset` / `skipped` never appear in `unresolved` and never affect `setupReady`
(FR-015). Consumers read this block straight from the file (FR-016, feature 001 FR-000).

---

## ProvenanceEntry  *(append-only, shared `provenance-log.md` — R4)*

Not a struct this feature stores — a formatted line it appends. One per section `created` / `changed`:

```
- 2026-08-31T14:07:22Z  settings/trackedBoards  changed (reconfigure) — added board "dice-ai-engineer-remote-us"
- 2026-08-31T14:02:10Z  settings/compensation   created (first-run)  — floor 156000 USD, target 180000
```

Fields encoded: ISO-8601 UTC timestamp · `settings/<sectionKey>` · `created`|`changed` · trigger
`first-run`|`reconfigure` · one-line what-changed. A no-change run and every "leave as is" append
nothing (FR-009, SC-004, SC-007). A corrupt-store backup (R8) also appends one line
(`settings/<store>  backed-up — inputs/settings.json.bak-<ts>`).

---

## HandAuthoredInputFile  *(input — read-only, pre-fill only — R6)*

| Kind | Default location | Feeds | Parse |
|---|---|---|---|
| Board list | `inputs/boards.md` (or a bullet list the user points at) | `trackedBoards` proposals | heuristic (bullet + URL + optional `depth:`); optional `judge()` in Phase B |
| Hard-stops note | `inputs/hard-stops.md` or a `## Hard stops` block | `hardStops` + `locations.excluded` proposals | heuristic list parse |
| Directions folder | `inputs/directions/<name>/` | one `directions` proposal per subfolder | folder name → `name`; `materialsPath` = `directions/<name>/` |

Never owned or rewritten wholesale (spec Assumptions). Unparseable entries surface as
`{ raw, error }` → "couldn't read — please re-enter" (FR-013). Absent files ⇒ R5 defaults, no error.

---

## DisagreementReport  *(transient — FR-014, R7)*

Built when an existing store section and a hand-authored file for the same section differ after
normalisation (trim, case-fold, stable sort). Holds `{ section, storeValue, fileValue, fields[] }` and
drives a **keep-store / take-file / edit-from-here** prompt. Never auto-merged. Not persisted.
