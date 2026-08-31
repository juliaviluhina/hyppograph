# Contract: Inputs read by this feature

All under `HYPPO_DATA_DIR`, **read-only** here.

- **Configuration** (tracked boards, hard stops, considered directions) comes from the structured
  settings store `inputs/settings.json` — schema owned by feature 002, at
  `specs/002-onboarding-settings/contracts/settings-store.md`. Feature 001 assumes it is well-formed
  when `completeness.setupReady` is true (feature 002's onboarding validates it on write).
- **`inputs/applications.md`** and the **`inputs/manual-postings/`** drop remain hand-authored files,
  parsed tolerantly by this feature.

---

## `inputs/settings.json` — run precondition (FR-000)

At run start:
1. Load `inputs/settings.json`. Missing / unreadable ⇒ report "settings not found — run onboarding
   (feature 002)" and exit with zero writes.
2. If `completeness.setupReady !== true` ⇒ print `completeness.unresolved` (each `{ section, reason }`)
   and exit with zero writes.
3. Otherwise proceed, reading the sections below.

## `inputs/settings.json` → `TrackedSource[]`

From `sections.trackedBoards.value[]`. Each entry:

| Field | Rule |
|---|---|
| `filteredSearch` | Non-empty string — the tuned board search URL / params, used opaquely. Empty ⇒ `configError`, source skipped (FR-002a). |
| `depth` | Integer ≥ 1. Non-positive or missing ⇒ `configError`, source skipped. |
| `name` | Display name; falls back to the `filteredSearch` host. |

## `inputs/settings.json` → `HardStops`

From `sections.hardStops.value`: `{ excludedLocations[], lackedClearances[], lackedWorkAuth[],
visaSponsorshipRequired }`. Effective excluded locations = `excludedLocations ∪
sections.locations.value.excluded`. All arrays empty and `visaSponsorshipRequired` false ⇒ no hard
stops (with `directions` also empty, FR-008d applies).

## `inputs/settings.json` → `ConsideredDirection[]`

From `sections.directions.value[]`. Each: `{ name, description }` — `description` is the text the
pre-triage judgment matches a posting against. `materialsPath` is present on the entry but ignored
here.

---

## `inputs/applications.md` → `ApplicationsTrackerEntry[]`

Hand-authored applications tracker. Parsed tolerantly for `{ company, role, ref }` rows (Markdown
table or bullet list). Used only for `alreadyApplied` linking (FR-016) and to seed `CanonicalCompany`.
Never written.

## `inputs/manual-postings/` → Raw Records

Hand-authored drop folder. Each file = one posting to ingest with `retrievalMethod: "manual"` and
`sourceRef` = the file path. A file that isn't a job posting is skipped with a run-summary note
(FR-003, spec edge case).
