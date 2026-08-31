# Feature Specification: Intake & Normalize Pipeline Steps

**Feature Branch**: `001-intake-normalize-pipeline`

**Created**: 2026-08-30

**Status**: Draft

**Input**: User description: "intake and normalize pipeline steps"

## Clarifications

### Session 2026-08-31

- Q: Where do the tracked boards, hard stops, and considered directions come from? → A: From the structured settings store `inputs/settings.json` (schema owned by feature 002, `specs/002-onboarding-settings/contracts/settings-store.md`) — sections `trackedBoards`, `hardStops`, `directions`. This replaces the hand-authored `boards.md`, `priorities.md` hard-stops block, and `directions/*.md` parsing. `applications.md` and the manual-postings drop remain hand-authored files. If `settings.json` is missing or `completeness.setupReady` is false, intake reports the unresolved required sections and exits without collecting.

### Session 2026-08-30

- Q: How should the system decide a re-seen role is the same Job Record and update it? → A: Deterministic key = canonical company + normalized role title + overlapping location set; new hits merge new source references into the existing record in place.
- Q: Should HyppoGraph throttle board collection, or leave rate control to the page-read provider? → A: HyppoGraph paces itself — configurable per-source delay between fetches plus a per-run fetch cap — independent of the page-read provider.
- Q: What throughput target makes an acceptable run measurable? → A: At least 100 postings processed end-to-end within 30 minutes, pacing delays included.
- Q: In what form should a Job Record be stored? → A: One Markdown file per record with a structured front-matter block for the fixed field set plus a human-readable body; the raw posting text is a linked sibling file.
- Q: Should intake collect everything or gate on relevance? → A: Collect all N latest verbatim (no relevance decision blocks storage), but apply board-native filters upstream so retrieval is already preliminarily scoped, and apply a cheap keep/reject pre-triage before normalization.
- Q: What does the pre-triage step decide, and with what? → A: A fast-tier (Haiku-class) yes/no keep decision per Raw Record — reject on hard stops (disallowed location, required clearance/work-authorization the user lacks) or no plausible match to any of the user's considered directions; keep otherwise. Full fit and gap analysis is a later pipeline step, not this feature.
- Q: What threshold makes a Job Record low-completeness? → A: ≥ 60% of fixed-field values are "unknown", or any of role title / canonical company / requirements list is unknown or empty (FR-017).

## User Scenarios & Testing *(mandatory)*

These are the opening steps of the HyppoGraph pipeline: collect, pre-triage,
normalize. Together they turn the messy, source-specific stream of job postings the
user is tracking into a clean set of comparable Job Records that every later step
(hard-filter, score, tier) can rely on, plus an archived reject pile with reasons.
Nothing here scores fit or contacts anyone; pre-triage only drops obvious
non-starters. The output is structured data plus a provenance trail.

### User Story 1 - Collect raw job postings from tracked sources (Priority: P1)

The job boards the user cares about — each a pre-tuned board search (its own keyword /
location / date / seniority filters) plus how deep to look — are recorded in the
settings store by the onboarding stage; the user may also drop in individual postings
they found themselves. When HyppoGraph runs, it opens each tracked source's filtered search through the
page-read provider, walks the filtered result set to the configured depth, retrieves
the full text of every posting it finds, and stores each one verbatim together with
where it came from, when it was seen, and how it was retrieved. Nothing relevant is
withheld from storage at this stage. The user can then see a count of what was
collected and open any raw posting.

**Why this priority**: Without a reliable, attributed capture of the raw postings,
there is nothing to normalize, score, or trust later. Raw capture with provenance is
independently valuable: the user gets a single dated archive of everything they were
exposed to, even before any structuring happens.

**Independent Test**: Point HyppoGraph at a small tracked-boards list (each entry a
filtered board search) plus one manually supplied posting, run intake, and confirm
every posting from the filtered result sets is stored verbatim with a source
reference, a first-seen timestamp, and a retrieval-method note, and that
`provenance-log.md` gained one entry per stored posting.

**Acceptance Scenarios**:

1. **Given** a tracked-boards list with two boards, each defined by a filtered board search, at collection depth N and a reachable page-read provider, **When** intake runs, **Then** up to N postings per board are retrieved from that board's filtered result set and each is stored as a raw posting with source URL, source name, first-seen timestamp, and retrieval method.
2. **Given** a folder where the user has placed two job postings by hand, **When** intake runs, **Then** both are ingested as raw postings with retrieval method "manual" and the file they came from recorded.
3. **Given** intake has already run today and is run again with no new postings available, **When** intake runs, **Then** no duplicate raw postings are created and the run reports zero new items.
4. **Given** a tracked board that is unreachable, **When** intake runs, **Then** the other boards are still processed, the failure is recorded in the run summary and provenance log, and the run does not abort.
5. **Given** a tracked source whose filtered search returns no results, **When** intake runs, **Then** the run records zero postings for that source without error and continues with the other sources.

### User Story 2 - Normalize raw postings into consistent Job Records (Priority: P2)

Each raw posting is converted into a Job Record with the same set of fields regardless
of which board it came from: role title, canonical company name, locations, work
arrangement (remote / hybrid / on-site), salary range and currency, seniority,
employment type, a concise responsibilities summary, an explicit requirements list,
posting date, and the source reference. Any field the source does not state is marked
"unknown" rather than guessed or left blank. The original raw text is kept and linked
from the Job Record.

**Why this priority**: Later steps compare postings against the user's priorities and
against each other; that only works if every posting exposes the same fields with the
same meaning. Normalization is what makes the shortlist comparable.

**Independent Test**: Take a set of stored raw postings from three different boards,
run normalize, and confirm each produces one Job Record with every required field
present or explicitly "unknown", the requirements expressed as discrete items, and a
working link back to the raw text.

**Acceptance Scenarios**:

1. **Given** a raw posting that states title, company, one location, a salary band, and a bulleted requirements list, **When** normalize runs, **Then** the Job Record carries all of those values in the standard fields and the requirements appear as discrete items.
2. **Given** a raw posting with no salary and no explicit location, **When** normalize runs, **Then** the salary and location fields are set to "unknown" and no value is inferred.
3. **Given** a raw posting written in a language other than English, **When** normalize runs, **Then** the Job Record fields are populated in English and the original language is recorded on the record.
4. **Given** a raw posting that has already been normalized and is unchanged, **When** normalize runs again, **Then** the existing Job Record is left in place rather than duplicated.
5. **Given** a raw posting so sparse it only links out to an external page ("see our careers site"), **When** normalize runs, **Then** a Job Record is still produced with the known fields filled, the rest "unknown", and the record flagged as low-completeness.

### User Story 3 - Pre-triage stored postings before normalization (Priority: P3)

Between collection and normalization, each stored Raw Record gets a cheap keep-or-reject
decision so that normalization budget is spent only on postings that could plausibly
matter. A single lightweight relevance judgment reads the raw posting against the user's hard
stops (locations they will not take, security clearance or work authorization they do
not have) and the list of career directions they are considering. If the posting trips a
hard stop, or shows no plausible overlap with any considered direction, it is marked
rejected with a one-line reason. Everything else is marked kept. Nothing is deleted;
the rejected pile stays in the archive with its reasons, and normalization processes
only the kept records.

**Why this priority**: Board-level filters cut volume but still let through postings
that are clearly wrong for this person. Normalizing those costs time and money and
inflates the throughput target. Pre-triage is a coarse, high-recall gate — it removes
obvious non-starters, not close calls, which are left to the downstream fit/gap
analysis. It depends on stories 1 and 2 but makes the 30-minute run target realistic
on busy boards.

**Independent Test**: Provide stored Raw Records including one in an excluded location,
one requiring a clearance the user lacks, one unrelated to every considered direction,
and two plausible matches; run pre-triage; confirm the first three are marked rejected
with reasons, the last two are marked kept, none are deleted, and normalization then
runs on exactly the two kept records.

**Acceptance Scenarios**:

1. **Given** a Raw Record whose only location is one the user's hard stops exclude, **When** pre-triage runs, **Then** it is marked rejected with the reason naming the location hard stop and is not normalized.
2. **Given** a Raw Record that requires a security clearance or work authorization the user's inputs say they do not have, **When** pre-triage runs, **Then** it is marked rejected with the reason naming that hard stop.
3. **Given** a Raw Record with no plausible overlap with any of the user's considered directions, **When** pre-triage runs, **Then** it is marked rejected with reason "no direction match".
4. **Given** a Raw Record that plausibly matches at least one considered direction and trips no hard stop, **When** pre-triage runs, **Then** it is marked kept and passed to normalization.
5. **Given** a Raw Record the pre-triage judgment cannot confidently classify, **When** pre-triage runs, **Then** it is marked kept (the gate errs toward keeping) and flagged for attention in the run summary.
6. **Given** pre-triage has already marked a Raw Record, **When** the run repeats with unchanged inputs, **Then** the existing mark is left in place rather than recomputed into a duplicate.

---

### User Story 4 - Deduplicate and canonicalize across sources (Priority: P4)

The same role is often posted on several boards, listed more than once, or already
sitting in the user's applications tracker under a slightly different company name.
Normalization resolves company-name variants to one canonical company and groups
postings that describe the same role at the same company and location into a single
Job Record that lists all the places it was seen. Postings already represented in the
applications tracker are linked to that existing entry instead of being treated as
new.

**Why this priority**: Duplicates inflate the shortlist and waste the user's review
time and the project's scoring budget. It is valuable but depends on collection and
normalization being in place first, so it comes after the other stories.

**Independent Test**: Feed in the same role from two boards plus a near-duplicate
company-name variant, run intake and normalize, and confirm one Job Record results,
it lists both source URLs, and the company name matches the canonical form used
elsewhere in the user's data.

**Acceptance Scenarios**:

1. **Given** the same role at the same company captured from two different boards, **When** normalize runs, **Then** one Job Record exists and it records both source references.
2. **Given** postings listing the company as "Acme", "Acme Inc." and "Acme Corporation", **When** normalize runs, **Then** all three resolve to one canonical company name.
3. **Given** a captured posting whose company and role match an entry already in the applications tracker, **When** normalize runs, **Then** the Job Record is linked to that application entry and marked as already-applied.
4. **Given** two postings with the same title at the same company but clearly different locations and descriptions, **When** normalize runs, **Then** they remain two separate Job Records.

### Edge Cases

- A posting is delisted between being discovered and being retrieved: it is recorded as seen-but-unavailable, with whatever metadata was captured, and not retried in the same run.
- Collection depth is larger than the number of postings a board actually has: intake takes what exists and reports the shortfall without error.
- The page-read provider is entirely unavailable at the start of the run: intake of board sources is skipped, manually supplied postings are still processed, and the run summary states that board intake did not happen.
- A raw posting exceeds a sane size (e.g. an entire page dump): it is stored, and normalization works from the portion identified as the posting body.
- Salary is stated as a single number, an hourly rate, or a range with no currency: normalize captures what is stated and marks the missing parts "unknown" rather than converting or assuming.
- A manually supplied file is not a job posting at all: it is skipped with a note in the run summary and provenance log, not turned into a Job Record.
- Two runs happen close together: the second run sees the first run's raw postings and Job Records and adds only what is genuinely new (idempotent re-runs).
- A previously "unknown" field becomes available because the source posting was re-captured with more detail: covered only if re-capture is in scope (see Assumptions — out of scope for this version).
- A tracked source's filtered search is stale or rejected by the board (e.g. the board changed its URL scheme): the source is recorded as failed in the run summary and provenance log, and the run continues with the other sources.
- A tracked source's filtered search returns zero postings: recorded as zero for that source, no error, run continues.
- Pre-triage rejects every posting in a run: normalization does nothing, the run summary reports zero kept and lists the reject reasons so the user can tell their hard stops or directions are too tight.
- `settings.json` is missing, unreadable, or `completeness.setupReady` is false: intake reports the unresolved required sections and exits before collecting anything — no partial run (FR-000). The user is pointed at the onboarding stage (feature 002).
- Hard stops are all empty and `directions` is empty: pre-triage keeps every Raw Record and the run summary notes that no triage criteria were configured (this can only occur if `settings.json` was hand-edited past onboarding's validation, since `directions` is a required non-empty section).
- A posting is rejected by pre-triage but the user later widens their directions or hard stops: the rejected Raw Record is still in the archive and can be re-triaged on a later run (re-triage of stored records is in scope; re-fetching the posting is not).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-000**: At the start of a run the system MUST load the settings store `inputs/settings.json` (per `specs/002-onboarding-settings/contracts/settings-store.md`). If the store is absent or its `completeness.setupReady` is false, the system MUST report every unresolved required section and exit without collecting, storing, or normalising anything.
- **FR-001**: The system MUST read the tracked-board list from the `trackedBoards` section of the settings store — each entry a `{ name, filteredSearch, depth }`, where `filteredSearch` is the user-authored tuned board search (search URL and/or native filter parameters) and `depth` is a positive integer collection depth.
- **FR-002**: The system MUST retrieve job postings from each tracked board source through the external page-read provider by opening that source's filtered board search and walking its result set, up to the configured collection depth per source.
- **FR-002a**: The system MUST apply board-native filters upstream — by navigating the user-authored filtered search — and MUST NOT browse a board unfiltered and discard postings afterward. If a `trackedBoards` entry has an empty `filteredSearch` or a non-positive `depth`, the system MUST record it as a configuration error for that source and skip it.
- **FR-002b**: The system MUST NOT withhold any posting retrieved from a filtered result set from raw storage; relevance narrowing at intake happens only through the board-native filter, not by dropping fetched postings.
- **FR-003**: The system MUST ingest job postings that the user has placed in a designated manual-input location, in addition to tracked-board postings.
- **FR-004**: The system MUST store every collected posting as a raw record that preserves the original posting text unchanged.
- **FR-005**: Each raw record MUST carry: source name, source reference (URL or file), first-seen timestamp, retrieval method, and the run that produced it.
- **FR-006**: The system MUST continue processing remaining sources when one source fails, and MUST record each failure in the run summary and the provenance log.
- **FR-006a**: The system MUST pace board collection independently of the page-read provider: a configurable minimum delay between fetches per source and a configurable per-run cap on total postings fetched. Defaults MUST be conservative enough to avoid triggering source-side rate limiting.
- **FR-007**: The system MUST append one provenance-log entry per stored raw record, per pre-triage mark (kept or rejected, with reason), and per created or updated Job Record, stating what was added or decided, how, and why.
- **FR-008**: Intake, pre-triage, and normalize runs MUST be idempotent: re-running with no new input MUST NOT create duplicate raw records, duplicate triage marks, or duplicate Job Records.
- **FR-008a**: Before normalization, the system MUST assign each Raw Record a pre-triage mark of "kept" or "rejected" via a single lightweight relevance judgment per record, and MUST record a one-line reason for every "rejected" mark.
- **FR-008b**: Pre-triage MUST mark a Raw Record "rejected" when the posting trips a hard stop from the settings store's `hardStops` section — a location in `excludedLocations` (unioned with `locations.excluded`), a clearance in `lackedClearances`, a work authorization in `lackedWorkAuth`, or (when `visaSponsorshipRequired` is true) a posting that offers no sponsorship — or when the posting shows no plausible overlap with any entry in the settings store's `directions` section (matched on each direction's `name` + `description`).
- **FR-008c**: Pre-triage MUST mark a Raw Record "kept" whenever it trips no hard stop and plausibly overlaps at least one considered direction, and MUST default to "kept" (flagging it in the run summary) when it cannot classify the record confidently. Pre-triage MUST NOT delete or alter any Raw Record.
- **FR-008d**: When the effective hard stops are all empty (no excluded locations, clearances, or lacked work authorizations, and `visaSponsorshipRequired` false), pre-triage evaluates direction overlap only; if `directions` is also empty, pre-triage MUST mark every Raw Record "kept" and the run summary MUST note that no triage criteria were configured.
- **FR-008e**: Normalization MUST process only Raw Records marked "kept". "Rejected" Raw Records MUST remain in the archive with their reason and MUST be eligible for re-triage on a later run if the user's hard stops or directions change.
- **FR-009**: The system MUST convert each raw record into a Job Record exposing a fixed field set: role title, canonical company name, location(s), work arrangement, salary amount/range, salary currency, seniority, employment type, responsibilities summary, requirements list, posting date, and source reference(s).
- **FR-009a**: The system MUST store each Job Record as a single Markdown file whose structured front-matter block carries the full fixed field set (each field present or explicitly "unknown") and whose body holds the human-readable summary. Each linked Raw Record MUST be a separate sibling file referenced from the Job Record.
- **FR-010**: The system MUST mark any field not stated by the source as "unknown" and MUST NOT infer, convert, or fabricate a value for it.
- **FR-011**: The system MUST express each Job Record's requirements as discrete, individually referenceable items.
- **FR-012**: The system MUST keep the original raw text for every Job Record and provide a link from the record to that text.
- **FR-013**: The system MUST produce Job Record field values in English and record the source posting's original language when it is not English.
- **FR-014**: The system MUST resolve differing spellings and forms of the same company to one canonical company name, consistent with company names already present in the user's data.
- **FR-015**: The system MUST identify a Job Record by the deterministic key {canonical company, normalized role title, overlapping location set}, and MUST merge every posting matching that key into the one Job Record — adding each new source reference to the existing record in place rather than creating a new record.
- **FR-016**: The system MUST link a Job Record to an existing applications-tracker entry when the company and role match, and mark that record as already-applied.
- **FR-017**: The system MUST flag a Job Record as low-completeness when at least 60% of its fixed-field-set values are "unknown", or when any of role title, canonical company, or the requirements list is unknown or empty.
- **FR-018**: The system MUST NOT contact any job poster, submit any application, or take any outward-facing action during intake, pre-triage, or normalize.
- **FR-019**: The system MUST write all raw records, Job Records, and provenance entries only into the user-configured data directory, and MUST NOT copy the user's personal input data elsewhere.
- **FR-020**: Each run MUST end with a summary stating counts of postings collected, new raw records, records kept and rejected by pre-triage (with a breakdown of reject reasons), low-confidence triage marks, new Job Records, duplicates merged, sources failed, and items skipped.

### Key Entities *(include if feature involves data)*

- **Settings Store**: `inputs/settings.json`, the structured configuration owned by feature 002 (`settings-store.md`). Feature 001 reads three sections of it — `trackedBoards`, `hardStops`, `directions` — and its `completeness.setupReady` flag. Read-only here.
- **Tracked Source**: One entry in the settings store's `trackedBoards` section — `{ name, filteredSearch, depth }`. `filteredSearch` is a user-authored tuned board search; HyppoGraph treats it opaquely.
- **Manual Posting Drop**: A designated folder (`inputs/manual-postings/`) where the user places individual postings for ingestion. Hand-authored, not part of the settings store.
- **Raw Record**: One collected posting stored verbatim, with source name, source reference, first-seen timestamp, retrieval method, originating run, and a pre-triage mark ("kept" or "rejected" plus a one-line reason, set before normalization). The verbatim text is immutable once written; the triage mark may be recomputed on a later run.
- **Triage Criteria**: What pre-triage judges against — the settings store's `hardStops` section (excluded locations, lacked clearances, lacked work authorizations, visa-sponsorship-required flag) and its `directions` section. Read-only for this feature.
- **Considered Direction**: One entry in the settings store's `directions` section — `{ name, description }` (the `materialsPath` pointer to per-direction CV material is ignored here). The coarse "does this posting plausibly relate to anything I want?" reference for pre-triage.
- **Job Record**: The normalized, comparable representation of one role — fixed field set (title, canonical company, locations, arrangement, salary + currency, seniority, employment type, responsibilities summary, requirements list, posting date), a completeness flag, original language, links to one or more Raw Records, and an optional link to an applications-tracker entry. Identified by the deterministic key {canonical company, normalized role title, overlapping location set}; re-seen postings matching that key update it in place. Consumed by every later pipeline step.
- **Canonical Company**: The single agreed name and identity for a company that multiple postings and applications may reference under varying spellings.
- **Applications Tracker Entry**: An existing record of a role the user has already applied to; used as a dedup and "already-applied" reference, not modified here.
- **Provenance Log Entry**: An append-only note recording each addition to the data directory — what, how, why, and which run.
- **Run Summary**: The per-run report of counts and failures for intake, pre-triage, and normalize.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a tracked-sources list where postings are reachable, at least 95% of the postings available within the configured collection depth of each source's filtered search are captured as Raw Records in a single run.
- **SC-002**: 100% of stored Raw Records carry a source reference, a first-seen timestamp, and a retrieval method.
- **SC-002a**: For every tracked board source, 100% of its collected postings come from that source's filtered board search; no postings are collected from unfiltered browsing.
- **SC-003**: 100% of additions to the data directory and 100% of pre-triage marks during a run have a matching provenance-log entry.
- **SC-004**: After normalization, 100% of Job Records expose every field in the fixed field set, each either populated or explicitly "unknown".
- **SC-005**: In a review sample of normalized Job Records, at least 90% have title, company, location, and requirements that a human judges to faithfully match the source posting, with no invented values.
- **SC-006**: Re-running intake, pre-triage, and normalize immediately, with no new input and unchanged triage criteria, creates zero new Raw Records, zero changed triage marks, and zero new Job Records.
- **SC-006a**: On a labelled test set, pre-triage rejects at least 85% of seeded true non-starters (hard-stop violations and no-direction-overlap postings) and wrongly rejects no more than 2% of seeded plausible matches.
- **SC-006b**: 100% of Raw Records normalized in a run were marked "kept" by pre-triage; no "rejected" Raw Record is normalized.
- **SC-007**: For a test set containing known cross-board duplicates and company-name variants, at least 90% of true duplicates are merged into a single Job Record and no more than 2% of distinct roles are wrongly merged.
- **SC-008**: Every captured posting whose company and role match an applications-tracker entry is linked to it and marked already-applied (100% of the known-match test set).
- **SC-009**: A run that collects 100 postings completes end-to-end — collection, pre-triage of all 100, and normalization of the kept subset — within 30 minutes (configured pacing delays included), without manual intervention, and produces a summary with all required counts.
- **SC-010**: Zero outward-facing actions (messages, applications, connection requests) occur during intake, pre-triage, or normalize.
- **SC-011**: When `settings.json` is missing or `completeness.setupReady` is false, the run makes zero writes to the data directory and its output names every unresolved required section.

## Dependencies

- **Feature 002 (onboarding & settings stage)** produces `inputs/settings.json`. This feature reads its
  `trackedBoards`, `hardStops`, and `directions` sections and its `completeness.setupReady` flag. A
  real run requires setup to be complete; fixtures include a hand-written `settings.json`. Schema:
  `specs/002-onboarding-settings/contracts/settings-store.md`.
- **HyppoVisor** — page reads / navigation only, via the MCP contract (`contracts/hyppovisor-page-read.md`).
- **The data directory** (`HYPPO_DATA_DIR`) — shared with feature 002 and HyppoVisor. This feature adds
  `outputs/job-records/**` and appends `provenance-log.md`; it reads `settings.json`, `applications.md`,
  and the `manual-postings/` drop.

## Assumptions

- **Sources**: The tracked-boards list comes from the settings store's `trackedBoards` section (`inputs/settings.json`), produced by the onboarding stage (feature 002). Each entry is a user-authored filtered board search plus a collection depth. HyppoGraph passes the filter through opaquely; it does not synthesise or infer board filters. Board postings are retrieved via the HyppoVisor MCP page-read contract; HyppoGraph has no authenticated session of its own.
- **Board filter capabilities vary**: Each board supports a different set of native filters. The user authors a working filtered search per board (via onboarding); HyppoGraph treats it opaquely as "the URL/params to open".
- **Pre-triage criteria**: Hard stops and considered directions come from the settings store's `hardStops` and `directions` sections. Both are read-only here. Pre-triage is a coarse, high-recall keep/reject gate, not a fit assessment.
- **Manual input**: A designated location in the data directory lets the user add individual postings by hand; these are treated as first-class inputs with retrieval method "manual".
- **Trigger**: Intake and normalize run when the orchestrating code invokes them (an explicit run), not on a continuous background schedule. Scheduling, if any, is external.
- **One-time capture**: A posting is captured once. Detecting and re-syncing changes to an already-captured posting is out of scope for this version.
- **Dedup key**: Job Record identity is the deterministic key {canonical company, normalized role title, overlapping location set} (FR-015); postings not matching an existing key produce a distinct record. Separately, an identical canonical source URL identifies the same Raw Record and is used for intake idempotency (FR-008).
- **Applications tracker & connections store** are hand-authored files that already exist in the inputs directory (not part of the settings store) and are read-only for this feature.
- **Output location**: Raw Records and Job Records are written under `outputs/job-records/` in the user-configured data directory. A Job Record is one Markdown file (structured front-matter + readable body); each Raw Record is a sibling file it links to. The provenance log is the append-only `provenance-log.md` at the data-directory root.
- **Scope boundary**: This feature covers collection, coarse keep/reject pre-triage, and normalization. Full hard-filtering with fit and gap analysis, scoring, warm-path enrichment, tiering, and deliverables are explicitly downstream and out of scope. Pre-triage here only removes obvious non-starters so normalization budget is not wasted; it does not rank or score.
- **Language**: Source postings may be in any language; Job Record fields are normalized to English for downstream comparison.
- **Model usage**: Per the project constitution, the judgment inside these steps — pre-triage keep/reject, extraction, normalization, dedup, and company-name matching — runs on fast-tier (Haiku-class) model calls; control flow stays in code. Pre-triage in particular is designed as a single cheap yes/no call per Raw Record. This is an implementation constraint, not a user-facing requirement.
