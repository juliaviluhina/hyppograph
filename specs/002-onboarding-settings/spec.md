# Feature Specification: Onboarding & Settings Stage

**Feature Branch**: `002-onboarding-settings`

**Created**: 2026-08-31

**Status**: Draft

**Input**: User description: "onboarding and settings stage"

## Clarifications

### Session 2026-08-31

- Q: How do the onboarding settings hand off to the input files feature 001 already reads (`boards.md`, `priorities.md` hard stops, `directions/`)? → A: A structured settings store is the single source of truth; onboarding also regenerates the human-readable Markdown views so feature 001 works unchanged now, and feature 001's input parsing is later updated (a follow-up task on that feature) to read the structured store directly. The Markdown files become a generated, inspectable view — not a second source of truth and not hand-edited once onboarding owns the section.
- Q: Which sections are required for "setup ready" vs optional with a default? → A: Required = locations, eligibility hard stops, considered directions, tracked boards. Optional (built-in default, skippable) = work arrangement, compensation, scoring-weight notes, collection tuning (pacing / fetch cap / default depth).
- Q: What does the "candidate basics" section capture? → A: A small optional section — display name/handle for deliverables plus an optional contact line — and a non-blocking check that `candidate-profile.md` exists. The profile prose stays hand-authored and is not owned by onboarding.

## User Scenarios & Testing *(mandatory)*

A preliminary stage that establishes the job seeker's configuration before the pipeline runs: the
locations they will and won't take, the compensation floor, the clearances or work authorisations
they lack, the career directions they're pursuing, and the job boards to track (with how deep to
collect on each). It asks the important questions once, proposes a sensible default for every one,
and stores the answers where the pipeline and the model can read them. On later runs it shows what's
already set and lets the user change any part. It never contacts anyone; the only outward interaction
is presenting questions to the user, who confirms every stored value.

### User Story 1 - First-run guided setup with defaults (Priority: P1)

The user runs the onboarding stage for the first time. No settings exist yet. HyppoGraph walks
through each configuration section in order, and for every question shows a concrete **default
proposal** the user can accept as-is or replace. When the walkthrough finishes, a complete, valid
settings store exists and the user is told the setup is ready.

**Why this priority**: Nothing downstream can run without configuration, and hand-authoring a set of
structured files from a blank page is exactly the friction this feature removes. A guided first run
that produces a valid store from zero is the whole point.

**Independent Test**: Start from an empty data directory, run onboarding, accept every default, and
confirm a complete settings store exists with every required section marked answered, a provenance
entry per section written, and a "setup ready" confirmation shown.

**Acceptance Scenarios**:

1. **Given** a data directory with no settings, **When** onboarding runs, **Then** each configuration section is presented in turn, every question carries a visible default proposal, and the user can accept or override each.
2. **Given** the user accepts every default, **When** the walkthrough completes, **Then** a settings store is written under the data directory with all required sections marked answered and one provenance entry per section.
3. **Given** the user overrides a default with an invalid value (e.g. a salary floor that isn't a number, a board entry with no search URL), **When** that answer is submitted, **Then** the value is rejected with a specific reason and the question is re-asked; nothing invalid is stored.
4. **Given** the user exits the walkthrough partway, **When** onboarding is run again, **Then** it resumes at the first unanswered section, keeping the sections already answered.
5. **Given** an optional section (e.g. free-text scoring-weight notes), **When** the user chooses to skip it, **Then** it is recorded as explicitly skipped and does not block "setup ready".

### User Story 2 - Review and reconfigure existing settings (Priority: P2)

The user runs the onboarding stage when settings already exist. HyppoGraph shows the current value of
each section and lets the user pick one section (or all) to change. Editing a section re-runs just
that section's questions, pre-filled with the current values as the defaults. Sections the user
doesn't touch are left exactly as they were.

**Why this priority**: Priorities, salary expectations, and tracked boards change over time. Editing a
structured store by hand is error-prone; a guided reconfigure keeps it valid.

**Independent Test**: With a complete settings store, run onboarding, change one section (e.g. add an
excluded location), and confirm only that section's stored values changed, every other section is
byte-identical, and a provenance entry records the change.

**Acceptance Scenarios**:

1. **Given** a complete settings store, **When** onboarding runs, **Then** the current value of every section is shown and the user is offered "change a section", "change everything", or "leave as is".
2. **Given** the user selects one section to change, **When** they edit it, **Then** that section's questions are pre-filled with the current values as defaults and only that section is re-written on save.
3. **Given** the user chooses "leave as is", **When** onboarding exits, **Then** the settings store is unchanged and no provenance entry is written.
4. **Given** the user removes the last entry from a required list section (e.g. deletes every tracked board), **When** they try to save, **Then** the save is refused with a reason and the section stays in edit.

### User Story 3 - Pre-fill from existing hand-authored input files (Priority: P3)

The user already keeps some inputs as hand-written files (a board list, hard-stop notes, a directions
folder). When onboarding runs and finds those files, it reads them and uses their contents as the
proposed answers, so the user is confirming and refining rather than re-entering.

**Why this priority**: Early users of HyppoGraph maintain these files by hand. Onboarding should adopt
what's there, not ignore it, or it forces duplicate work and risks the store diverging from the
files.

**Independent Test**: Place a hand-authored board list and a hard-stops note in the data directory,
run onboarding, and confirm the board and eligibility sections are proposed pre-filled from those
files, with any unparseable entries flagged for the user to fix rather than silently dropped.

**Acceptance Scenarios**:

1. **Given** a hand-authored board list file in the data directory, **When** onboarding reaches the tracked-boards section, **Then** each parseable entry is shown as a pre-filled proposal and the user confirms or edits it.
2. **Given** a hard-stops note listing excluded locations and lacked clearances, **When** onboarding reaches the eligibility section, **Then** those values are the proposed defaults.
3. **Given** an entry in a hand-authored file that can't be parsed, **When** onboarding presents that section, **Then** the entry is listed as "couldn't read — please re-enter", not dropped and not guessed.
4. **Given** no hand-authored files exist, **When** onboarding runs, **Then** it falls back to the built-in default proposals with no error.

### User Story 4 - Completeness check and gap report (Priority: P4)

At the end of any onboarding run, and on demand, HyppoGraph reports which required sections are still
unset or invalid and states plainly that the pipeline cannot run until they're resolved. Optional
sections that are unset are listed separately as "not set (optional)".

**Why this priority**: A partially configured store that silently lets the pipeline run produces
misleading results. A clear gap report is the guardrail.

**Independent Test**: Leave one required section unanswered, run the completeness check, and confirm
the output names that exact section, marks setup "incomplete", and that a downstream consumer asking
"is setup ready?" gets "no" with the same reason.

**Acceptance Scenarios**:

1. **Given** every required section is answered or an optional one is skipped, **When** the completeness check runs, **Then** it reports "setup ready".
2. **Given** a required section is unset or holds an invalid value, **When** the completeness check runs, **Then** it reports "setup incomplete" and names each unresolved section with the reason.
3. **Given** setup is incomplete, **When** a downstream step asks whether setup is ready, **Then** the answer is "no" with the list of unresolved sections.

### Edge Cases

- The data directory itself doesn't exist or isn't writable: onboarding reports the problem and makes no partial writes.
- The settings store exists but is corrupt / not in the expected shape: onboarding reports it, offers to back it up and start a fresh guided setup, and never silently overwrites.
- A hand-authored input file and the settings store disagree (e.g. different board lists): onboarding surfaces the difference and asks the user which to keep; it does not merge silently.
- The user provides a location, clearance, or direction that duplicates an existing entry: the duplicate is ignored with a note, not stored twice.
- A tracked-board search URL is malformed: rejected at entry with a reason (the board section is a required list; it can't be saved with an invalid entry).
- The user runs onboarding, changes nothing, and exits: no writes, no provenance entry.
- Two onboarding runs happen back-to-back with no changes: the second writes nothing.
- A downstream pipeline run starts while onboarding is mid-edit: the pipeline sees the last saved, valid settings (edits are written atomically on section save, not mid-question).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST present configuration as an ordered set of named sections: candidate basics (optional), locations (required), work arrangement (optional), compensation (optional), eligibility hard stops (required), considered directions (required), tracked job boards (required), plus optional collection-tuning and scoring-weight-notes sections.
- **FR-001a**: The candidate basics section MUST capture only a display name/handle for deliverables and an optional contact line, and MUST perform a non-blocking check that `candidate-profile.md` exists in the data directory (reported as advisory, never blocking `setup ready`). Onboarding MUST NOT own or rewrite the candidate profile prose.
- **FR-002**: For every question, the system MUST display a concrete default proposal and let the user accept it unchanged or replace it.
- **FR-003**: The system MUST mark each section as one of `unset`, `answered`, or `skipped`, and MUST allow `skipped` only for sections declared optional.
- **FR-004**: The system MUST persist answers to a settings store located under the user-configured data directory.
- **FR-005**: The settings store MUST be machine-readable in a structured form the pipeline and the model can consume directly, and it is the single source of truth for the configuration it owns.
- **FR-005a**: On every save, the system MUST regenerate the human-readable Markdown views that feature 001 consumes (a board list, a hard-stops note, a directions folder) from the settings store, so those files stay a faithful rendering of the store and are not hand-edited for sections onboarding owns.
- **FR-006**: The system MUST validate each answer against its type and constraints (e.g. compensation floor is a number with a currency; each tracked board has a non-empty search reference and a positive depth) and MUST reject an invalid answer with a specific reason without storing it.
- **FR-007**: On a run where a settings store already exists, the system MUST show the current value of every section and offer to change one section, change all, or leave everything unchanged.
- **FR-008**: When the user edits a section, the system MUST pre-fill that section's questions with the current stored values as the defaults, and MUST write only the edited section(s) on save — all other sections MUST remain byte-identical.
- **FR-009**: When the user leaves settings unchanged, the system MUST write nothing and MUST NOT add a provenance entry.
- **FR-010**: The system MUST append one provenance-log entry per section created or changed, stating what changed, that it came from onboarding, and why (first-run vs reconfigure).
- **FR-011**: The system MUST be resumable: an interrupted first run MUST continue from the first unanswered section on the next run, preserving already-answered sections.
- **FR-012**: When hand-authored input files for a section exist in the data directory (a board list, hard-stop notes, a directions folder), the system MUST read them and present their parseable contents as the proposed defaults for that section.
- **FR-013**: The system MUST list any hand-authored entry it cannot parse as "couldn't read — please re-enter" and MUST NOT drop it silently or guess a value.
- **FR-014**: When a hand-authored file and an existing settings store disagree for the same section, the system MUST surface the difference and ask the user which to keep; it MUST NOT merge them silently.
- **FR-015**: The system MUST provide a completeness check that reports `setup ready` only when every required section (locations, eligibility hard stops, considered directions, tracked boards) is `answered`, and otherwise reports `setup incomplete` naming each unresolved section and the reason. Optional sections (work arrangement, compensation, scoring-weight notes, collection tuning) being `unset` or `skipped` MUST NOT block `setup ready`.
- **FR-016**: The system MUST expose the completeness result to downstream steps so a consumer can ask "is setup ready?" and get a yes/no with the list of unresolved sections.
- **FR-017**: The system MUST reject a save that would leave a required list section (tracked boards, considered directions) empty, with a stated reason.
- **FR-018**: The system MUST treat a duplicate entry within a list section (same location, clearance, direction name, or board search) as a no-op with a note, not store it twice.
- **FR-019**: If the settings store is present but not in the expected shape, the system MUST report it, offer to back it up before starting a fresh guided setup, and MUST NOT overwrite it without confirmation.
- **FR-020**: The system MUST write section saves atomically, so a concurrent or subsequent read always sees a complete, valid store — never a half-written section.
- **FR-021**: The system MUST NOT take any outward-facing action (no messages, applications, connection requests, page fetches). Its only interaction is the question-and-answer exchange with the user.
- **FR-022**: The system MUST write only within the user-configured data directory and MUST NOT copy the user's answers or personal data anywhere else (repo, logs, telemetry).
- **FR-023**: The system MUST run only when explicitly invoked; it MUST NOT start automatically as a side effect of a pipeline run.

### Key Entities *(include if feature involves data)*

- **Settings Store**: The canonical, structured record of all configuration, under the data directory. Read by onboarding, the pipeline, and the model. Has a schema/shape the completeness check validates against.
- **Settings Rendering**: A human-readable view of the Settings Store the user can read and sanity-check (kept in sync with the store, not a second source of truth).
- **Setting Section**: One named group of related settings (locations, compensation, tracked boards, …) with a status (`unset` / `answered` / `skipped`), a `required` flag, and its values.
- **Question**: One prompt within a section, with a default proposal, a type/constraint, and a `required` flag.
- **Candidate Basics**: Optional. A display name/handle used on deliverables and an optional contact line. Plus an advisory flag for whether `candidate-profile.md` exists. Does not hold profile prose.
- **Location Preference**: Preferred locations/regions and hard-stop excluded locations.
- **Compensation Preference**: Salary floor, optional target, currency, optional benchmark notes.
- **Eligibility Hard Stop**: Clearances the user does not hold; work authorisations the user lacks; whether visa sponsorship is required.
- **Considered Direction**: A named career direction with a short description of the roles it covers; optionally a pointer to prepared-CV material for that direction.
- **Tracked Board**: A filtered board search (search reference + optional native filter notes) and a collection depth.
- **Hand-Authored Input File**: An existing user-written file for a section (board list, hard-stop note, directions folder) used to pre-fill proposals; not owned or rewritten wholesale by onboarding unless the user confirms.
- **Provenance Log Entry**: Append-only note of each section create/change — what, that it was via onboarding, and why (first-run / reconfigure).
- **Completeness Result**: `setup ready` or `setup incomplete` plus the list of unresolved required sections with reasons; queryable by downstream steps.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Starting from an empty data directory, a user completes first-run setup by accepting defaults in under 5 minutes, ending with a settings store where 100% of required sections are `answered`.
- **SC-002**: 100% of questions presented during any run display a default proposal.
- **SC-003**: After a reconfigure that edits one section, 100% of the other sections in the store are byte-identical to before the run.
- **SC-004**: 100% of section creates and changes have a matching provenance-log entry; a run that changes nothing produces zero new provenance entries.
- **SC-005**: When hand-authored input files are present, at least 90% of the entries they contain that are individually valid appear as pre-filled proposals (the rest are listed as "couldn't read").
- **SC-006**: A downstream step querying "is setup ready?" gets a correct yes/no matching the completeness check in 100% of cases across a test matrix of complete, partially complete, and invalid stores.
- **SC-007**: Re-running onboarding immediately with no user changes writes zero bytes to the settings store and zero provenance entries.
- **SC-008**: An invalid answer (wrong type, empty required list, malformed board search) is rejected before storage in 100% of the tested cases, with a message naming the offending field.
- **SC-009**: Zero outward-facing actions occur during any onboarding run.
- **SC-010**: After first-run setup completes, the intake/normalize pipeline runs to completion using only the stored settings, with no additional configuration questions asked of the user.
- **SC-011**: After any save, the regenerated Markdown views parse cleanly under feature 001's existing input rules and represent 100% of the corresponding store entries.

## Assumptions

- **Interaction model**: Onboarding is a text question-and-answer exchange (no graphical UI, per the project's no-UI constraint), run from a command in a session or terminal. Each stored value is one the user explicitly accepted or entered.
- **Trigger**: Explicit invocation only. The pipeline may *check* whether setup is ready, but never launches onboarding itself.
- **Location & lifecycle**: The settings store and its human-readable rendering live under `HYPPO_DATA_DIR`, entirely outside this repository; how the user backs it up, versions, or edits it by hand is their concern.
- **Ownership boundaries**: The candidate profile prose, the merged connections store, and the applications tracker remain separate hand-authored files (per the project README's `inputs/` tree). Onboarding may read the connections/applications files for context but does not own or rewrite them; it *does* own the locations / work-arrangement / compensation / eligibility / directions / boards configuration.
- **Single user**: Only the job seeker runs this; no multi-user or role model.
- **Required vs optional sections**: Required (setup is not "ready" until all are `answered`) — locations, eligibility hard stops, considered directions, tracked boards. Optional (a built-in default applies and the section may be `skipped`) — candidate basics, work arrangement, compensation, free-text scoring-weight notes, and collection-tuning overrides (pacing, fetch cap, default depth).
- **Downstream consumers**: The structured settings store is the single source of truth for the configuration onboarding owns (locations, work arrangement, compensation, eligibility hard stops, considered directions, tracked boards). Onboarding regenerates the Markdown views feature 001 currently reads (`boards.md`, `priorities.md` hard stops, `directions/`) from the store on every save, so 001 keeps working with no change; a follow-up task on feature 001 updates its input parsing to read the structured store directly, after which the Markdown files remain only an inspectable rendering.
- **Defaults source**: Built-in default proposals are sensible starting points (e.g. work arrangement = "remote or hybrid", excluded locations = none, collection depth = 25, pacing = conservative); they are not personalised guesses about the user.

## Dependencies

- **Feature 001 (intake & normalize)** is the primary consumer of the sections onboarding owns. It
  currently reads hand-authored Markdown; onboarding regenerates that Markdown from the store
  (FR-005a) so 001 is unaffected on delivery. A follow-up task on feature 001 — tracked there, not
  here — switches its parsing to the structured store.
- The **data directory** (`HYPPO_DATA_DIR`) and its layout are shared with feature 001 and HyppoVisor;
  onboarding adds the settings store and its rendered views, and reads the connections / applications
  files for context only.
