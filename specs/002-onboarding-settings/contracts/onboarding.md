# Contract: Onboarding Flow — Section & Question Catalog

The ordered configuration catalog the onboarding stage walks, the default proposal for every question,
the validation rule for every answer, and the invocation / completeness-query surface. **Owned by
feature 002.** The catalog is substrate-independent — Phase A (the `onboard` skill) and Phase B (the
`src/onboarding` CLI) both realise exactly this. Output shape is [`settings-store.md`](./settings-store.md).

## Invocation surface

| | Phase A | Phase B |
|---|---|---|
| Run onboarding | invoke the `onboard` skill / `/onboard` | `node src/onboarding` · `npm run onboard` |
| Completeness check only | ask the skill "is setup ready?" | `npm run onboard -- --check` (prints `completeness`, exits 0 ready / 1 incomplete; no writes) |
| Auto-start | **never** — explicit invocation only (FR-023). The pipeline reads `completeness.setupReady` but has no path that launches onboarding. |

Every stored value is one the user explicitly accepted or entered. The stage takes **no** outward
action (FR-021): no network, no MCP client, no browser.

## Run modes

- **First run** — `settings.json` absent, or present with ≥ 1 required section `unset` and
  `completeness.setupReady === false`. Walk sections from the first `unset` one in catalog order (R3);
  `answered` / `skipped` sections shown as "already set — leave / change".
- **Reconfigure** — `settings.json` present and valid. Show every section's current value; offer
  **change a section** / **change everything** / **leave as is** (FR-007). Editing pre-fills that
  section's questions with current values as the defaults (FR-008). Only edited sections are re-written;
  all others stay **byte-identical** (SC-003). "Leave as is" ⇒ no write, no provenance (FR-009, SC-007).
- **Corrupt store** — parse/schema failure ⇒ report, offer backup to `inputs/settings.json.bak-<ISO8601>`
  then fresh guided setup; never overwrite without confirmation (FR-019, R8).

## Per-answer rules (all sections)

1. Every question shows a concrete default proposal; the user accepts or replaces it (FR-002, SC-002).
2. An invalid answer is rejected **before storage** with a message naming the offending field, and the
   question is re-asked (FR-006, SC-008). Nothing invalid is written.
3. A duplicate entry in a list section is a no-op with a note (FR-018, R10) — identity keys: location
   string (case-folded), clearance / work-auth string (case-folded), `directions[].name`,
   `trackedBoards[].name`.
4. A section save is atomic (temp + `rename`); `completeness` is recomputed in the same write (FR-020, R2).
5. A section that is created or changed appends exactly one `provenance-log.md` line (FR-010, R4).

## Section catalog (in order)

Legend — **R** required (gates `setupReady`), **O** optional (`skip` allowed, default applies).

### 1. `candidateBasics` — O

| Q | Prompt | Default | Type | Validation |
|---|---|---|---|---|
| `displayName` | Name/handle for deliverables | *(skip section)* | string | non-empty if answered |
| `contactLine` | One-line contact block (optional) | `null` | string \| null | — |
| *(auto)* `profileFileExists` | — | — | boolean | non-blocking check of `inputs/candidate-profile.md`; advisory only, never blocks `setupReady` (FR-001a) |

Onboarding does **not** create or edit `candidate-profile.md` prose.

### 2. `locations` — R

| Q | Prompt | Default | Type | Validation |
|---|---|---|---|---|
| `preferred` | Preferred locations / regions (may be empty) | `[]` | string[] | entries trimmed; dedup case-insensitive |
| `excluded` | Hard-stop excluded locations (may be empty) | `[]` | string[] | same; unioned with `hardStops.excludedLocations` downstream |

Pre-fill: a hard-stops note contributes `excluded` proposals (R6).

### 3. `workArrangement` — O

| Q | Prompt | Default | Type | Validation |
|---|---|---|---|---|
| `preference` | Work arrangement | `remote-or-hybrid` | enum: `remote` \| `hybrid` \| `on-site` \| `remote-or-hybrid` | one of the enum |
| `onSiteTolerance` | On-site tolerance note (optional) | `null` | string \| null | — |

### 4. `compensation` — O

| Q | Prompt | Default | Type | Validation |
|---|---|---|---|---|
| `floor` | Salary floor | *(skip section)* | number | number > 0 (SC-008) |
| `target` | Target salary (optional) | `null` | number \| null | if set, ≥ `floor` |
| `currency` | Currency code | `USD` | string | non-empty |
| `benchmarkNotes` | Benchmark notes (optional) | `null` | string \| null | — |

### 5. `hardStops` — R

| Q | Prompt | Default | Type | Validation |
|---|---|---|---|---|
| `excludedLocations` | Locations that are a hard stop | `[]` | string[] | dedup case-insensitive |
| `lackedClearances` | Clearances you do NOT hold | `[]` | string[] | dedup case-insensitive |
| `lackedWorkAuth` | Work authorisations you lack | `[]` | string[] | dedup case-insensitive |
| `visaSponsorshipRequired` | Do you require visa sponsorship? | `false` | boolean | — |

`answered` even if every list is empty and the boolean is `false` (an explicit "no hard stops" is a
valid configured state). Pre-fill: a hard-stops note (R6).

### 6. `directions` — R  (list, ≥ 1 entry)

Per entry:

| Field | Prompt | Default | Validation |
|---|---|---|---|
| `name` | Direction name | *(none — user supplies)* | non-empty, unique in list |
| `description` | Roles this direction covers | *(none)* | non-empty (feeds 001 pre-triage) |
| `materialsPath` | Prepared-CV folder under `inputs/` (optional) | `null` | if set, a path relative to `inputs/` |

A save leaving the list empty is refused with a reason (FR-017). Pre-fill: one proposal per
`inputs/directions/<name>/` subfolder (R6).

### 7. `trackedBoards` — R  (list, ≥ 1 entry)

Per entry:

| Field | Prompt | Default | Validation |
|---|---|---|---|
| `name` | Board name | *(none — user supplies)* | non-empty, unique in list |
| `filteredSearch` | Tuned board search URL / params | *(none)* | non-empty, URL-shaped (`https://…` or explicit params); malformed ⇒ rejected at entry (FR-006, edge case) |
| `depth` | Collection depth | `collectionTuning.defaultDepth` (25 if unset) | integer ≥ 1 |

A save leaving the list empty is refused (FR-017). Pre-fill: a board-list file (R6). `filteredSearch`
is opaque to HyppoGraph — not fetched or validated for *results* here, only for shape.

### 8. `collectionTuning` — O

| Q | Prompt | Default | Validation |
|---|---|---|---|
| `pacingMs` | Delay between fetches (ms) | `3000` | integer > 0 |
| `fetchCap` | Max fetches per run | `300` | integer > 0 |
| `defaultDepth` | Depth for a board with no explicit depth | `25` | integer ≥ 1 |

Defaults match `.env.example` / feature 001 `src/config` (R5).

### 9. `scoringWeightNotes` — O

| Q | Prompt | Default | Validation |
|---|---|---|---|
| `text` | Free-text notes on what matters most when ranking | *(skip section)* | non-empty if answered |

## Completeness rule (FR-015, R9)

```
setupReady = locations.status == "answered"
          && hardStops.status == "answered"
          && directions.status == "answered"
          && trackedBoards.status == "answered"
unresolved = [ { section, reason } for each of those four not "answered" ]   // reason: "unset" | <validation message>
```

Optional sections (`candidateBasics`, `workArrangement`, `compensation`, `collectionTuning`,
`scoringWeightNotes`) being `unset` or `skipped` never appear in `unresolved` and never change
`setupReady`. Printed at the end of every run and by the check-only mode. Feature 001 reads
`completeness.setupReady` / `completeness.unresolved` straight from `settings.json` (FR-016).

## Hand-authored pre-fill (FR-012, FR-013, R6)

| File kind | Default location | Fills |
|---|---|---|
| Board list | `inputs/boards.md` | `trackedBoards` |
| Hard-stops note | `inputs/hard-stops.md` or a `## Hard stops` block | `hardStops`, `locations.excluded` |
| Directions folder | `inputs/directions/<name>/` | `directions` |

Parseable entries become pre-filled proposals the user confirms/edits. Unparseable entries are listed
individually as **"couldn't read — please re-enter"** — never dropped, never guessed. No such files ⇒
built-in defaults, no error. If a file and an existing store section disagree, show a side-by-side diff
and ask keep-store / take-file / edit — never merge silently (FR-014, R7).

## Non-goals

- No Markdown rendering of the store in Phase A; optional and off by default in Phase B (FR-005a, R11).
- Onboarding does not read or write `candidate-profile.md` prose, the connections store, or
  `applications.md` (it may *read* the latter two for context only) — spec Assumptions.
- `filteredSearch` URLs are not opened, fetched, or results-validated here.
