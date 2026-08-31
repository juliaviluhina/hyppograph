# Contract: Settings Store

The canonical, structured configuration for HyppoGraph. **Owned by feature 002** (onboarding writes
it); **consumed by feature 001** (intake & normalize reads `trackedBoards`, `hardStops`, `directions`)
and by later pipeline steps. Single source of truth for the sections it holds.

- **Location**: `HYPPO_DATA_DIR/inputs/settings.json`
- **Format**: one JSON object. Every section key is always present. A section not yet configured has
  `status: "unset"`; an optional section the user skipped has `status: "skipped"`; a configured
  section has `status: "answered"` and its `value`.
- **Writes**: atomic per section (002 FR-020). A reader always sees a complete, valid object.
- **Human-readable rendering**: onboarding MAY also emit Markdown views for inspection; those are not
  a source of truth and no consumer parses them.

## Shape

```jsonc
{
  "version": 1,
  "sections": {
    "candidateBasics": {          // optional
      "status": "answered" | "skipped" | "unset",
      "value": {
        "displayName": "string",            // used on deliverables
        "contactLine": "string | null"      // optional
      },
      "profileFileExists": true | false     // advisory check of candidate-profile.md (002 FR-001a)
    },

    "locations": {                // required
      "status": "answered" | "unset",
      "value": {
        "preferred": ["string"],            // regions / cities, may be []
        "excluded": ["string"]              // hard-stop locations, may be []
      }
    },

    "workArrangement": {          // optional (default: "remote-or-hybrid")
      "status": "answered" | "skipped" | "unset",
      "value": { "preference": "remote" | "hybrid" | "on-site" | "remote-or-hybrid",
                 "onSiteTolerance": "string | null" }
    },

    "compensation": {            // optional
      "status": "answered" | "skipped" | "unset",
      "value": { "floor": number, "target": number | null,
                 "currency": "string", "benchmarkNotes": "string | null" }
    },

    "hardStops": {               // required
      "status": "answered" | "unset",
      "value": {
        "excludedLocations": ["string"],    // may duplicate locations.excluded; union is the effective set
        "lackedClearances": ["string"],
        "lackedWorkAuth": ["string"],
        "visaSponsorshipRequired": true | false
      }
    },

    "directions": {              // required
      "status": "answered" | "unset",
      "value": [
        {
          "name": "string",                 // unique within the list
          "description": "string",          // what roles this direction covers — used by 001 pre-triage
          "materialsPath": "string | null"  // e.g. "directions/platform-dx/" — folder of prepared-CV material, relative to inputs/
        }
      ]
    },

    "trackedBoards": {           // required
      "status": "answered" | "unset",
      "value": [
        {
          "name": "string",                 // unique within the list
          "filteredSearch": "string",       // tuned board search URL / params — opaque to HyppoGraph
          "depth": number                   // integer >= 1
        }
      ]
    },

    "collectionTuning": {        // optional (built-in defaults apply when unset/skipped)
      "status": "answered" | "skipped" | "unset",
      "value": { "pacingMs": number, "fetchCap": number, "defaultDepth": number }
    },

    "scoringWeightNotes": {      // optional
      "status": "answered" | "skipped" | "unset",
      "value": { "text": "string" }
    }
  },

  "completeness": {
    "setupReady": true | false,             // true iff every required section status == "answered"
    "unresolved": [ { "section": "string", "reason": "string" } ]
  }
}
```

## Required sections (gate `completeness.setupReady`)

`locations`, `hardStops`, `directions`, `trackedBoards` — 002 FR-015. Optional: `candidateBasics`,
`workArrangement`, `compensation`, `collectionTuning`, `scoringWeightNotes`.

## Feature 001's view

001 reads exactly:
- `sections.trackedBoards.value[]` → `{ name, filteredSearch, depth }` per source (was `boards.md`)
- `sections.hardStops.value` → `{ excludedLocations ∪ locations.excluded, lackedClearances, lackedWorkAuth, visaSponsorshipRequired }` (was the `## Hard stops` block in `priorities.md`)
- `sections.directions.value[]` → `{ name, description }` for the pre-triage judgment; `materialsPath`
  is ignored by 001 (used by downstream deliverables)

001 does **not** read this store for `applications.md` or the manual-postings drop — those remain
hand-authored files (see 001 `contracts/inputs-format.md`).

001 MUST treat `completeness.setupReady === false` (or a missing `settings.json`) as "not configured":
report which required sections are unresolved and exit without collecting.
