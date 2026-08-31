# Phase 0 Research: Onboarding & Settings Stage

Resolves the NEEDS CLARIFICATION items from the plan's Technical Context. Format per item:
Decision / Rationale / Alternatives considered.

---

## R0. Q&A substrate — phased

**Decision**: Phase A is an **interactive Claude Code command** (`.claude/skills/onboard/`) run in a
session; Phase B is a **plain TypeScript CLI** (`src/onboarding/`) on Node ≥ 20 with `@inquirer/prompts`.
Unlike feature 001, there is **no dynamic-workflow substrate and no B1/B2 split** — onboarding is
single-threaded, interactive, and has essentially no model judgment to fan out, so a `.claude/workflows/*.js`
workflow (built for bounded parallel subagents) is the wrong tool.

**Rationale**: The section catalog, the per-question defaults, the validation messages, and the
hand-authored-file pre-fill are what need real-user iteration; all of that is substrate-independent and
carries over verbatim. A skill lets that iteration happen in a conversation for the price of a session.
Phase B then adds `vitest`, CI, and the two assertions that a session can't make rigorously — a
one-section reconfigure leaving every other section **byte-identical**, and a no-change re-run writing
**zero bytes**.

**Alternatives considered**:
- *Dynamic workflow like 001* — rejected: fan-out primitives (`pipeline`, `parallel`, 16-agent cap)
  add nothing to a linear Q&A, and the sandbox (no `import`, frozen clock) blocks the atomic-write and
  provenance-timestamp work.
- *Go straight to Phase B* — more upfront cost before the catalog/defaults are validated with a user;
  the wording of proposals and error messages is exactly what a cheap interactive pass de-risks.
- *A GUI* — excluded by the project's no-UI constraint (constitution Architectural Boundaries;
  spec Assumptions "no graphical UI").

---

## R1. Store shape, section list, and required-vs-optional

**Decision**: The store is exactly [`contracts/settings-store.md`](./contracts/settings-store.md)
(already written, owned by this feature): one JSON object, `version: 1`, a `sections` map where every
section key is always present with `status` ∈ `unset` | `answered` | `skipped`, and a `completeness`
block. **Required** (gate `setupReady`): `locations`, `hardStops`, `directions`, `trackedBoards`.
**Optional** (default applies, may be `skipped`): `candidateBasics`, `workArrangement`, `compensation`,
`collectionTuning`, `scoringWeightNotes`. `status: "skipped"` is allowed **only** for optional sections
(FR-003).

**Rationale**: The contract is already the coordination point with feature 001, which reads
`trackedBoards`, `hardStops`, `directions`, and `completeness.setupReady` directly. The section list and
the required set come straight from the spec clarifications (Session 2026-08-31) and FR-001 / FR-015.

**Alternatives considered**: A flat key/value store — rejected: sections need an independent `status`
and independent atomic saves (FR-008, FR-020). Splitting the store into one file per section — rejected:
001 and the model want a single object to read, and cross-section invariants (`completeness`) want one
write point.

---

## R2. Atomic per-section write

**Decision**: `saveSection(key, value)` does a read-modify-write of the whole object, then persists via
**temp file + `rename`** in the same directory: write `inputs/.settings.json.<pid>.<ts>.tmp`, `fsync`
it, `fs.rename()` over `inputs/settings.json` (atomic on POSIX and on Windows for same-volume renames).
`completeness` is recomputed and included in that same write. No partial section is ever visible
(FR-020, SC — pipeline mid-edit sees last valid store).

**Rationale**: `rename` over the same filesystem is the standard atomic-publish primitive; a reader
either sees the old inode or the new one. Recomputing `completeness` in the same write keeps the gate
consistent with section statuses at all times.

**Alternatives considered**: In-place truncate + rewrite — rejected: a crash or a concurrent read mid-write
yields a truncated JSON file. A lockfile — unnecessary for a single-user, explicitly-invoked tool, and
it does not help a reader that ignores the lock; `rename` is simpler and sufficient.

---

## R3. Resumability without separate state

**Decision**: The resume point (FR-011) is **derived from the store itself**: on a first run
(`completeness.setupReady === false` and at least one required section `unset`), onboarding starts at
the first section in catalog order whose `status === "unset"`. Sections already `answered` / `skipped`
are shown as "already set — leave / change". No separate progress file.

**Rationale**: Principle V — the store is the only state. A section's `status` already encodes whether
it has been dealt with, so a second state file would be a redundant source of truth that could drift.

**Alternatives considered**: A `.onboarding-progress` marker — rejected as redundant state. Always
restart from section 1 — rejected: FR-011 requires resuming at the first *unanswered* section and
preserving answered ones.

---

## R4. Provenance entries for section create/change

**Decision**: Each section create or change appends **one** entry to `HYPPO_DATA_DIR/provenance-log.md`
(the shared append-only log from Principle V / feature 001). Format: a timestamped bullet naming the
section, the action (`created` | `changed`), the trigger (`first-run` | `reconfigure`), and a one-line
what-changed summary (e.g. `added excluded location "Montana"`; `set compensation floor 156000 USD`).
A run that changes nothing appends nothing (FR-009). "Leave as is" appends nothing (FR-009, SC-007).

**Rationale**: The constitution mandates provenance for every addition to the data directory; reusing
the one log keeps 001 and 002 auditable in one place. One entry per section (not per question) matches
FR-010 and keeps the log readable.

**Alternatives considered**: A structured `provenance.json` — rejected: the constitution names
`provenance-log.md` and 001 already appends prose bullets there; two formats would fragment the audit
trail. One entry per question — rejected as noise; FR-010 is explicitly per-section.

---

## R5. Built-in default proposals

**Decision**: Every question has a concrete default in the catalog
([`contracts/onboarding.md`](./contracts/onboarding.md)). Defaults are **generic sensible starting
points, not personalised guesses** (spec Assumptions "Defaults source"): work arrangement =
`remote-or-hybrid`; `locations.excluded` = `[]`; `hardStops` = no clearances/auth lacked,
`visaSponsorshipRequired: false`; `collectionTuning` = `{ pacingMs: 3000, fetchCap: 300, defaultDepth: 25 }`
(matching `.env.example` and 001's config defaults); `compensation`, `scoringWeightNotes`,
`candidateBasics` default to *skip*. Required list sections (`directions`, `trackedBoards`) have **no
usable blank default** — the user must supply at least one entry, and a save that would leave them empty
is refused (FR-017, SC starting condition).

**Rationale**: Defaults exist to remove blank-page friction (Priority-P1 rationale), not to fabricate a
profile. Aligning tuning defaults with `.env.example` / `src/config` avoids a third place that can drift.

**Alternatives considered**: Inferring locations/comp from `candidate-profile.md` — rejected: onboarding
does not own or parse the profile prose (FR-001a), and a wrong guess is worse than an explicit prompt.
Seeding `trackedBoards` with a canned board list — rejected: board URLs are user-tuned and market-specific
(see the hand-authored pre-fill path, R6).

---

## R6. Pre-fill from hand-authored input files

**Decision**: When files exist under `HYPPO_DATA_DIR/inputs/` for a section, onboarding reads them and
presents their parseable contents as that section's proposals (FR-012):
- a board list file (e.g. `inputs/boards.md` / `inputs/manual-postings`-adjacent notes) → `trackedBoards`
  proposals `{ name, filteredSearch, depth }`;
- a hard-stops note (a `## Hard stops` block or a `hard-stops.md`) → `hardStops` + `locations.excluded`;
- a `inputs/directions/` folder → one `directions` proposal per subfolder (`name` = folder,
  `materialsPath` = `directions/<folder>/`, `description` prompted).
Parsing is **heuristic first** (line/bullet/URL regexes); Phase B MAY additionally call the shared
`judge()` wrapper (fast tier, `maxTurns: 1`, JSON-schema output) for messy free-form text. Any entry
that does not parse is returned as `{ raw, error }` and shown as **"couldn't read — please re-enter"**
(FR-013) — never dropped, never guessed. With no such files, onboarding falls back to R5 defaults with
no error (FR-012 last scenario).

**Rationale**: Early users maintain these files by hand (Priority-P3 rationale); ignoring them forces
duplicate entry and invites drift. Heuristic-first keeps the no-credentials path working; the optional
model call only improves recall on prose.

**Alternatives considered**: Model-only parsing — rejected: needs credentials for a core flow and is
non-deterministic for something the user will re-confirm anyway. Silently importing everything —
rejected: FR-013 requires unparseable entries be surfaced individually.

---

## R7. Store ↔ hand-authored-file disagreement (FR-014)

**Decision**: When both an existing `settings.json` section and a hand-authored file for that section
are present and their normalised contents differ, onboarding shows a **side-by-side diff** (store value
vs file value) and asks the user to pick **keep store** / **take file** / **edit from here**. It never
merges silently. Normalisation for the comparison: trim, case-fold display strings, sort lists by a
stable key (board `name`, direction `name`, location string) so ordering-only differences are not
flagged.

**Rationale**: FR-014 is explicit that a disagreement is a user decision, not an automatic merge. A
stable normalisation avoids false "disagreements" from list reordering.

**Alternatives considered**: Store always wins / file always wins — rejected: FR-014 forbids a silent
resolution either way. Three-way merge — over-engineered for a single user confirming values by hand.

---

## R8. Corrupt / unexpected-shape store (FR-019)

**Decision**: On load, `settings.json` is JSON-parsed then validated against the `zod` schema mirroring
`contracts/settings-store.md`. On parse failure or schema mismatch, onboarding: (1) reports what is
wrong, (2) offers to copy the file to `inputs/settings.json.bak-<ISO8601>` and start a fresh guided
setup, (3) **never overwrites without that confirmation**. A backup copy is itself a data-dir write and
gets a provenance line.

**Rationale**: FR-019 + edge case "settings store exists but is corrupt". A timestamped backup is
recoverable and cheap; refusing to proceed silently protects a store the user may have hand-edited.

**Alternatives considered**: Auto-repair to the nearest valid shape — rejected: guessing at a corrupt
personal-config file risks silently discarding real answers. Refuse and exit with no recovery path —
worse UX than the backup-and-restart offer.

---

## R9. Completeness result and how downstream reads it (FR-015, FR-016)

**Decision**: `completeness` is a **field of the store**, recomputed on every write:
`setupReady === true` iff all four required sections have `status === "answered"`; `unresolved` lists
`{ section, reason }` for each required section not yet `answered` (reason: `"unset"` or a validation
message). Downstream consumers (feature 001, FR-000) read `settings.json` and inspect
`completeness.setupReady` / `completeness.unresolved` directly — there is **no separate API, service, or
query command**. Onboarding also prints this block at the end of every run and on demand via
`onboard --check` (Phase B) / asking the skill "is setup ready?" (Phase A).

**Rationale**: The store is already the coordination contract with 001, which reads it as a file. A
service would violate "local files are the only state". Recompute-on-write keeps the flag honest.

**Alternatives considered**: A `setup-ready` sentinel file — redundant with the `completeness` block.
Computing readiness lazily in each consumer — rejected: duplicates the required-section rule across
codebases; the rule lives once, in this feature's writer.

---

## R10. Duplicate entries within a list section (FR-018)

**Decision**: Adding an entry whose identity key already exists in the list is a **no-op with a note**,
not a second stored copy. Identity keys: `locations` strings (case-folded, trimmed),
`hardStops.lackedClearances` / `lackedWorkAuth` strings (case-folded), `directions[].name`,
`trackedBoards[].name`. A duplicate `trackedBoards[].filteredSearch` under a different `name` is also
flagged (likely a mistake) but the user may keep it.

**Rationale**: FR-018 + edge case "duplicates an existing entry". Name-based identity for directions and
boards matches how 001 refers to them.

**Alternatives considered**: Reject the whole save on a duplicate — heavier than needed; a no-op-with-note
lets the user continue. Silent dedup with no note — rejected: FR-018 wants the user told.

---

## R11. Markdown rendering of the store (FR-005a, FR-005b — optional)

**Decision**: **Out of scope for Phase A; optional and off by default in Phase B.** If implemented, a
renderer regenerates `inputs/settings.md` (or `inputs/settings/*.md`) from the store on every save; it
is a pure view, never parsed by any consumer, never hand-edited for sections onboarding owns
(FR-005a). No consumer — including feature 001 — reads it.

**Rationale**: The spec marks it `MAY` (FR-005a); nothing depends on it. Deferring keeps Phase A small
and avoids a second artifact to keep in sync during catalog iteration.

**Alternatives considered**: Make it mandatory — rejected: no consumer needs it and it is pure
maintenance cost. Let the user hand-edit the Markdown and parse it back — explicitly forbidden by
FR-005a ("not hand-edited for sections onboarding owns", "no consumer parses them").

---

## R12. Invocation surface and the "never auto-start" guarantee (FR-023)

**Decision**: Phase A — an explicit skill/command the user runs (`/onboard` or invoking the skill).
Phase B — `onboard` is its own CLI subcommand (`node src/onboarding` / `npm run onboard`), separate from
`npm run pipeline`. The pipeline entry (`src/index.ts` pipeline path) only ever **reads**
`completeness.setupReady`; it has no code path that spawns onboarding. A unit test asserts the pipeline
module does not import the onboarding driver.

**Rationale**: FR-023 + Principle IV posture — configuration is a deliberate human act. Keeping the
entry points separate makes the guarantee structural, not conventional.

**Alternatives considered**: A combined `setup && run` command — rejected: blurs the line FR-023 draws
and risks an accidental reconfigure on every pipeline run.
