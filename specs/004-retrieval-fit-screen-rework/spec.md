# Feature Specification: Retrieval Verification & Fit-Screen Rework

**Feature Branch**: `004-retrieval-fit-screen-rework`

**Created**: 2026-09-12

**Status**: Draft

**Input**: User description: "Rework HyppoGraph's pipeline past intake/normalize (feature 001) into
a deterministic Workflow-tool step that retrieves a job posting with a still-open check and a
named-outcome vocabulary, screens it for fit against the user's evidence base via a cited rubric
with hard constraints and a verdict, and reconciles application state — porting the validated
design from the already-anonymized, config-driven reference implementation at
`hyppoplugins/plugins/job-search` (skills: `job-posting-retrieval`, `job-fit-screen`,
`job-search-delegation`), not from the personal vault version this reference was itself derived
from."

## Clarifications

### Session 2026-09-12

- Q: Where do the fit-screen inputs (evidence base, hard constraints, seniority streams) come
  from, given feature 002 (onboarding & settings) is deferred pending this feature? → A: This
  feature reads and extends the same `inputs/settings.json` store feature 001 already reads
  (`trackedBoards`, `hardStops`, `directions`), adding the sections it needs (`evidenceBase`
  file paths, `hardConstraints.compFloor`, `targetRoles.streams`) directly to that file's schema.
  It does not invent a second config file, and does not depend on feature 002's onboarding UX
  existing — the file may continue to be hand-authored until 002 is reconsidered.
- Q: Is retrieval (re-fetching a posting's live page) in scope, or does this feature work only
  from what feature 001 already collected? → A: Out of scope. Feature 001's Raw Records and Job
  Records are the only input; this feature does not open a new page-read session. "Still-open"
  here means classifying the record's *existing* stored text and metadata (and, where the
  Job Record's source is a Greenhouse/Lever/Ashby posting, one stateless re-check of the ATS
  posting API) — never a fresh HyppoVisor navigation.
- Q: Is the interactive session model (process roles one at a time, stop conditions, resume) in
  scope? → A: No. This feature is a batch pass over Job Records feature 001 already produced,
  consistent with Constitution Principle I (deterministic, code-driven orchestration) and
  feature 001's own collect/pre-triage/normalize pattern. There is no standing loop and no
  mid-run question to the user; a Job Record that cannot be scored gets a named outcome and the
  run continues to the next record.

## User Scenarios & Testing *(mandatory)*

These are the next two ordered steps of the HyppoGraph pipeline after feature 001: verifying a
still-open status on the Job Records feature 001 already normalized, and scoring each verified,
kept Job Record for fit against the user's evidence base. Together they turn a set of comparable
but unscored Job Records into a set of cited, decision-ready evaluations — without inventing a
verdict for a record that cannot be reliably classified or scored, and without taking any
outward-facing action.

### User Story 1 - Score a Job Record for fit against cited evidence (Priority: P1)

For each kept, verified Job Record, the system scores every required qualification against the
user's evidence base — not a title match, not a vibe check. Each required item gets an explicit,
cited verdict (met / partially met / not met / unknown) referencing the specific evidence-file
section it rests on. Separately, the record is checked against hard constraints (minimum
compensation, disallowed locations, required clearance or work authorization the user lacks,
excluded role natures) that can fail a role outright regardless of qualification fit. A handful of
known failure patterns are checked explicitly: claiming credit for adjacent-but-different domain
experience, a title that outruns the actual requirements, and evidence that is old enough that a
"leadership" or "mentoring" requirement should be discounted rather than taken at face value.
The output is a fit verdict on a fixed scale, with every required item's row visible and every
claim traceable to its evidence.

**Why this priority**: This is the actual decision-support the whole pipeline exists to produce.
Everything upstream (collect, pre-triage, normalize) only prepares the input for this step; without
it, a Job Record is comparable data but not yet a decision.

**Independent Test**: Take a small set of verified Job Records — one a strong match on every
required item, one missing a required item, one that fails a hard constraint, one where the
posting's title outpaces its actual requirements — run scoring, and confirm each produces a
requirement-by-requirement table with cited evidence, a verdict consistent with that table, and
the hard-constraint failure surfaced separately from the qualification table.

**Acceptance Scenarios**:

1. **Given** a verified Job Record whose required items are all supported by the evidence base,
   **When** scoring runs, **Then** each required item's row shows a "met" verdict with the specific
   evidence file and section it cites, and the overall verdict reflects a strong match.
2. **Given** a verified Job Record with one required item the evidence base does not support,
   **When** scoring runs, **Then** that item's row shows "not met" or "unknown" (never invented),
   and the overall verdict reflects the gap.
3. **Given** a verified Job Record that fails a hard constraint (e.g. a disallowed location, or a
   compensation range below the configured floor), **When** scoring runs, **Then** the hard
   constraint failure is reported in its own section, separate from the requirement table, and the
   overall verdict cannot be a positive match regardless of qualification fit.
4. **Given** a verified Job Record whose posting title implies materially more seniority or scope
   than its stated requirements support, **When** scoring runs, **Then** the title-vs-requirements
   mismatch is flagged and does not by itself raise the verdict.
5. **Given** a verified Job Record whose only supporting evidence for a leadership or mentoring
   requirement is old enough to fall outside the configured recency window, **When** scoring runs,
   **Then** that item's row is discounted rather than counted as a plain "met".
6. **Given** a Job Record already scored in a previous run with no material change to the record or
   the evidence base, **When** scoring runs again, **Then** the existing evaluation is left in place
   rather than duplicated.

---

### User Story 2 - Verify a Job Record is still open before it is scored (Priority: P2)

Before a Job Record is scored, the system checks whether the underlying posting is still open.
Search-indexed board pages keep resolving long after a role closes, so a stored page that fetched
cleanly at collection time is weak evidence by itself. The check uses the strongest available
signal already reachable without a new browsing session — an ATS posting-API re-check for
Greenhouse/Lever/Ashby-sourced records, or the record's own stored completeness/availability
metadata otherwise — and classifies the record as confirmed open, confirmed closed, or
unresolvable. A confirmed-closed record is not scored. An unresolvable record is scored but its
evaluation is flagged so the user never mistakes it for a confirmed-open opportunity.

**Why this priority**: Scoring effort spent on a closed role is wasted, and a fit evaluation that
implies a role is open when it is not is worse than no evaluation — it is exactly the "optimistic
verdict on incomplete input" failure the rest of the pipeline exists to avoid. It depends on
feature 001's Job Records existing, so it is ordered after nothing upstream of this feature.

**Independent Test**: Provide a set of Job Records including one whose ATS posting API confirms it
is still live, one whose ATS posting API returns a not-found/closed signal, and one with no ATS
signal available; run verification; confirm the first is marked confirmed-open and proceeds to
scoring, the second is marked confirmed-closed and is not scored, and the third is marked
unresolvable, is scored, and carries a visible flag on its evaluation.

**Acceptance Scenarios**:

1. **Given** a Job Record sourced from a Greenhouse/Lever/Ashby posting whose ATS posting API still
   returns the posting, **When** verification runs, **Then** the record is marked confirmed-open and
   scoring proceeds.
2. **Given** a Job Record whose ATS posting API returns not-found or an explicit closed signal,
   **When** verification runs, **Then** the record is marked confirmed-closed with that outcome,
   scoring does not run for it, and the reason is recorded.
3. **Given** a Job Record with no ATS posting-API signal available (a non-ATS source, or an
   unreachable API), **When** verification runs, **Then** the record is marked unresolvable, is
   still scored, and its evaluation output carries a visible "open status unverified" flag.
4. **Given** a Job Record already marked confirmed-open or confirmed-closed in a previous run with
   no re-check requested, **When** verification runs again, **Then** the existing mark is left in
   place rather than recomputed.

---

### User Story 3 - Reconcile application state on every evaluation (Priority: P3)

Every evaluation states where the user actually stands with that role — not just whether it looks
like a good fit. Before an evaluation implies a new application opportunity, the system checks the
existing applications tracker for a matching entry and carries forward its state rather than
guessing. The recorded state distinguishes "never looked at," "an application draft exists but was
not sent," "sent," "already had an existing application before this record existed," "withdrawn,"
"rejected," and "conflicting or unclear signals" — never collapsing all of these into a single
applied/not-applied flag, and never inferring "not applied" just because no tracker entry exists.

**Why this priority**: Without this, a scored shortlist cannot be trusted for its most basic
practical purpose — telling the user which roles are still actionable. It depends on a Job Record
existing (feature 001) and is naturally recorded alongside the fit verdict, but is conceptually
separable and independently testable from the scoring logic itself.

**Independent Test**: Provide Job Records including one with no matching applications-tracker
entry, one matching an entry marked as already submitted, one matching an entry with conflicting
dates/company-name evidence, and one whose match is genuinely ambiguous; run reconciliation; confirm
each gets the correct distinct state and none defaults to "not applied" without a positive basis.

**Acceptance Scenarios**:

1. **Given** a Job Record with no corresponding entry anywhere in the applications tracker,
   **When** its evaluation is produced, **Then** the application-state is recorded as "not applied"
   only when the tracker's absence is itself a reliable negative signal for that data set, and as
   "unknown" otherwise — the state is never asserted from a missing marker alone without that basis
   being recorded.
2. **Given** a Job Record matching an applications-tracker entry already marked submitted, **When**
   its evaluation is produced, **Then** the application-state is recorded as "submitted" (or the
   tracker's more specific state) and the evaluation does not imply a new application opportunity.
3. **Given** a Job Record whose match to a tracker entry is supported by conflicting evidence (e.g.
   company name matches but role title clearly differs), **When** its evaluation is produced,
   **Then** the application-state is recorded as "ambiguous" with a note, never resolved by guessing.
4. **Given** a Job Record already reconciled in a previous run with no change to the Job Record or
   the applications tracker, **When** reconciliation runs again, **Then** the existing state is left
   in place rather than recomputed into a conflicting value.

---

### User Story 4 - Consistent named outcomes for anything that isn't a clean result (Priority: P4)

When verification or scoring cannot produce a clean result — a record with no usable ATS signal, a
posting whose stored text turns out too sparse to score, an evidence base that cannot be read, an
ambiguous match to an existing application — the run records one specific, consistently-named
outcome rather than a mix of ad hoc failure text. Every such outcome names exactly what could not be
established, so a person or a later pipeline step reading the run summary never has to guess what
"failed" or "skipped" actually meant.

**Why this priority**: This does not add a new capability on its own, but it makes every other
story's failure paths uniform and auditable instead of each inventing its own wording — which is
what actually made the reference implementation's run history and provenance log usable. It rides
along with stories 1–3 rather than standing alone operationally, but is independently verifiable
against a fixed vocabulary.

**Independent Test**: Force each defined outcome (unresolved still-open signal, a Job Record too
sparse to score, an unreadable evidence base, an ambiguous application-tracker match, an evidence
base or hard-constraint config that is missing) and confirm the run summary and provenance log use
the corresponding named outcome from the fixed vocabulary in every case, never free-text.

**Acceptance Scenarios**:

1. **Given** any condition in this feature that prevents a clean confirmed-open/confirmed-closed
   verification, **When** it occurs, **Then** the record is tagged with the outcome
   `open.unresolved`, not free text.
2. **Given** a kept, verified Job Record too sparse (missing role title, requirements, or company)
   to score meaningfully, **When** scoring is attempted, **Then** the record is tagged
   `score.insufficient-input` and no fit verdict is produced for it.
3. **Given** the configured evidence-base files are missing or unreadable at the start of a run,
   **When** the run starts, **Then** it reports `config.evidence-unavailable`, scores nothing, and
   makes no writes.
4. **Given** an application-tracker match this feature cannot confidently resolve, **When**
   reconciliation runs, **Then** the outcome `state.ambiguous-match` is recorded alongside the
   "ambiguous" application-state value from User Story 3.
5. **Given** every outcome name used across a run, **When** the run summary is produced, **Then**
   every one of them is drawn from this feature's fixed named-outcome vocabulary (§ Key Entities —
   Named Outcome).

### Edge Cases

- The evidence base is present but empty (no files under the configured paths resolve to any
  content): the run reports `config.evidence-unavailable` and makes no writes, the same as a
  missing evidence base — an empty evidence base cannot support a cited verdict.
- A Job Record's hard-constraint-relevant fields (location, salary) are "unknown" from feature 001's
  normalization: the hard-constraint check cannot rule the record in or out on that axis, so it is
  recorded as "unknown" for that constraint (never assumed to pass) and scoring proceeds on the
  qualification table with that caveat visible.
- Two runs happen close together with no new Job Records and no evidence-base change: the second run
  produces zero new evaluations, zero changed application-state values, and zero changed still-open
  marks (idempotent re-run, mirroring feature 001's SC-006).
- A Job Record's still-open mark flips from confirmed-open to confirmed-closed on a later run
  (the role closed between runs): the existing evaluation, if any, is left in place and the record's
  still-open mark is updated with the new outcome and a note that the role closed after evaluation —
  it is not silently deleted or re-scored.
- The applications tracker is missing entirely (the user has not started one yet): every Job Record
  reconciles to "unknown" application-state, not "not applied" — an absent tracker is not a
  reliable negative signal.
- A required delegated sub-task (e.g. `evidence_match`, `citation_audit`) returns output the
  orchestrator's review gate rejects (uncited, identity-changing, or malformed): the step proceeds
  without that delegated result — computed directly by the step's own model call instead — and the
  rejection is noted in the delegation log, never silently accepted.
- The configured seniority streams or hard-constraint values are internally inconsistent (e.g. a
  stream with no seniority ceiling defined): the run reports `config.evidence-unavailable`-class
  configuration error naming the missing field and makes no writes, consistent with feature 001's
  `settings.json` FR-000 treatment of incomplete configuration.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-000**: At the start of a run the system MUST confirm the configured evidence-base file
  paths, hard-constraint values, and seniority-stream definitions (this feature's additions to
  `inputs/settings.json`) all resolve and are internally consistent. If any is missing, unreadable,
  empty, or inconsistent, the system MUST report the specific unresolved item and exit without
  verifying or scoring any Job Record.
- **FR-000a**: This repo MUST carry a committed, fabricated-persona settings template covering this
  feature's `inputs/settings.json` additions (`evidenceBase`, `hardConstraints.compFloor`,
  `targetRoles.streams`) alongside feature 001's existing sections, so a new data directory can be
  bootstrapped by copying and editing one file rather than reverse-engineering the test fixtures.
  The template MUST contain no real personal data — every value is invented, consistent with the
  existing `tests/fixtures/data-dir` convention.
- **FR-001**: The system MUST operate only on Job Records already produced by feature 001 (kept by
  pre-triage, normalized). It MUST NOT open a new page-read/navigation session and MUST NOT
  re-run collection.
- **FR-002**: Before scoring, the system MUST classify each Job Record's open status as
  confirmed-open, confirmed-closed, or unresolvable, using (a) a stateless re-check of the ATS
  posting API when the record's source is a Greenhouse/Lever/Ashby posting, or (b) the record's
  own stored completeness/availability metadata otherwise.
- **FR-002a**: A Job Record classified confirmed-closed MUST NOT be scored in this run; the outcome
  and reason MUST be recorded.
- **FR-002b**: A Job Record classified unresolvable MUST still be scored, and its evaluation output
  MUST carry a visible "open status unverified" flag.
- **FR-002c**: An open-status mark already set on a Job Record with no re-check requested MUST be
  left in place on a later run rather than recomputed.
- **FR-003**: For each confirmed-open or unresolvable, kept Job Record, the system MUST extract its
  required and preferred qualifications as discrete items (reusing feature 001's requirements list
  where already discrete) and score each required item against the configured evidence base with an
  explicit verdict (met / partially met / not met / unknown) and a citation to the specific
  evidence-file section it rests on.
- **FR-004**: The system MUST evaluate hard constraints (minimum compensation, disallowed
  locations, required clearance or work authorization the user lacks, excluded role natures) for
  each scored Job Record in a section separate from the qualification table, and a hard-constraint
  failure MUST prevent a positive overall verdict regardless of qualification fit.
- **FR-004a**: When a Job Record's field relevant to a hard constraint is "unknown," the system MUST
  record that constraint as "unknown" rather than assuming pass or fail, and MUST surface this
  caveat on the evaluation.
- **FR-005**: The system MUST check each scored Job Record for: domain-crossover overclaim (crediting
  qualification for adjacent-but-different domain experience), title-versus-requirements mismatch
  (a title implying more seniority/scope than the stated requirements support), and a recency
  discount on leadership/mentoring evidence older than the configured recency window. Each check's
  result MUST be visible in the evaluation output and MUST NOT be silently folded into the
  requirement table's raw verdicts.
- **FR-006**: The system MUST produce one overall fit verdict per scored Job Record on a fixed
  scale, reconciled with (not contradicting) the requirement-by-requirement table and the
  hard-constraint section.
- **FR-007**: Before an evaluation is finalized, the system MUST reconcile application state against
  the applications tracker, using exactly the value set: `unknown`, `not_applied`,
  `application_prepared`, `submitted`, `existing_application`, `withdrawn`, `rejected`,
  `ambiguous`. The system MUST NOT infer `not_applied` from a merely absent tracker entry unless the
  tracker's absence is itself established as a reliable negative signal for that data set; otherwise
  it MUST record `unknown`.
- **FR-007a**: When the tracker match is supported by conflicting evidence, the system MUST record
  `ambiguous` with a note rather than resolving it by guessing.
- **FR-008**: Every condition that prevents a clean result MUST be recorded using this feature's
  fixed named-outcome vocabulary (§ Key Entities — Named Outcome), never free-text failure
  descriptions.
- **FR-009**: Verification, scoring, and application-state reconciliation runs MUST be idempotent:
  re-running with no new Job Records, no evidence-base change, and no applications-tracker change
  MUST NOT create duplicate evaluations, change existing open-status marks, or change existing
  application-state values.
- **FR-010**: The system MUST allow a bounded delegated sub-task (extraction, normalization,
  evidence matching, citation audit, evaluation critique, still-open classification) to run on a
  fast-tier model call, but MUST treat its output as advisory: the orchestrating step MUST verify
  source fidelity, resolve every citation, and own the final completeness decision, identity
  confirmation, score, verdict, and every write. Rejected delegated output MUST NOT be silently
  accepted or substituted with a guess.
- **FR-011**: Every delegated sub-task MUST be recorded in a delegation log entry (task type, input
  scope, model tier, timestamp, review status) so which parts of an evaluation were fast-tier
  drafted versus orchestrator-computed is auditable after the run.
- **FR-012**: The system MUST write each evaluation as a single file per Job Record under the
  user-configured data directory, referencing the Job Record it scores; the evaluation MUST expose
  the requirement table, hard-constraint section, anti-pattern check results, overall verdict,
  application-state value, open-status mark, and citations — never only a bare score.
- **FR-013**: Each run MUST end with a summary stating counts of Job Records verified (confirmed-open
  / confirmed-closed / unresolvable), records scored, verdicts by category, hard-constraint
  failures, application-state values assigned, and a breakdown of named outcomes encountered.
- **FR-014**: The system MUST NOT contact any job poster, submit any application, or take any other
  outward-facing action during verification, scoring, or reconciliation.
- **FR-015**: The system MUST append one provenance-log entry per open-status mark set, per
  evaluation written, and per application-state value recorded, stating what was decided, how, and
  why — consistent with feature 001's provenance-log contract.

### Key Entities *(include if feature involves data)*

- **Evidence Base**: The user's career-history and CV-content files, referenced by path from this
  feature's `inputs/settings.json` additions. Read-only; the source every cited requirement verdict
  must point back to.
- **Hard Constraint Set**: This feature's configured non-negotiables — minimum compensation,
  disallowed locations, required clearance/work-authorization the user lacks, excluded role
  natures. Distinct from feature 001's pre-triage `hardStops` (which gates collection volume, not
  fit); may share underlying values but is evaluated in its own section here.
- **Seniority Stream**: One evaluation track with its own seniority ceiling, used by the
  seniority-band and title-check logic, configured per this feature's settings additions.
- **Fit Evaluation**: The per-Job-Record output — requirement table with citations, hard-constraint
  section, anti-pattern check results (overclaim, title check, recency discount), overall verdict,
  open-status mark, reconciled application-state value, and a link back to the scored Job Record.
  One file per Job Record.
- **Open-Status Mark**: `confirmed-open` · `confirmed-closed` · `unresolvable`, set on a Job Record
  before scoring, re-settable only on an explicit re-check.
- **Application-State Value**: One of `unknown`, `not_applied`, `application_prepared`,
  `submitted`, `existing_application`, `withdrawn`, `rejected`, `ambiguous` — reconciled against the
  applications tracker for every Fit Evaluation.
- **Named Outcome**: One of `open.unresolved`, `score.insufficient-input`,
  `config.evidence-unavailable`, `state.ambiguous-match`, plus feature 001's existing outcome
  vocabulary for anything upstream. The fixed set every non-clean condition in this feature must use.
- **Delegation Log Entry**: One record per bounded fast-tier sub-task run inside this feature's
  step — task type, input scope, model tier, timestamp, review status
  (`pending`/`accepted`/`corrected`/`rejected`), citations and uncertainty notes when relevant.
  Advisory audit trail, not canonical evaluation content.
- **Settings Template**: A committed, fabricated-persona example of `inputs/settings.json` covering
  every section feature 001 and this feature read (FR-000a). Copyable to bootstrap a new data
  directory; never contains real personal data.
- **Golden Calibration Set**: A set of real, previously-produced posting-and-evaluation pairs used
  to hand-tune and sanity-check the rubric's anti-pattern checks against genuine edge cases (as
  distinct from this repo's own synthetic `tests/`-tree fixtures, which stay fabricated). Lives
  outside this repo entirely; see Assumptions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a batch of kept, verified Job Records, 100% receive either a fit evaluation or a
  named outcome explaining why one was not produced — never neither.
- **SC-002**: 100% of required-qualification rows in a produced evaluation carry an explicit verdict
  and a citation to a specific evidence-file section, or are marked "unknown" — none are left blank
  or unsupported.
- **SC-003**: In a review sample of evaluations, at least 90% of verdicts and cited evidence are
  judged by a human to accurately reflect the requirement table and the underlying evidence, with no
  invented qualifications.
- **SC-004**: For a labelled test set containing known hard-constraint failures, 100% are reported
  in the hard-constraint section and none produce a positive overall verdict.
- **SC-005**: For a labelled test set seeded with title-inflation, domain-crossover, and stale-
  leadership-evidence cases, at least 85% are correctly flagged by the corresponding anti-pattern
  check.
- **SC-006**: For a labelled test set of ATS-sourced Job Records with a known live/closed ground
  truth, at least 90% are correctly classified confirmed-open or confirmed-closed; the remainder are
  marked unresolvable, never misclassified as the wrong definite state.
- **SC-007**: 100% of Job Records confirmed-closed are excluded from scoring in that run.
- **SC-008**: For a labelled test set with known applications-tracker matches, 100% resolve to the
  correct application-state value (or `ambiguous`/`unknown` when the test case is deliberately
  underdetermined) — none default to `not_applied` without a recorded positive basis.
- **SC-009**: Re-running verification, scoring, and reconciliation immediately, with no new Job
  Records, no evidence-base change, and no tracker change, creates zero new evaluations and zero
  changed open-status or application-state values.
- **SC-010**: 100% of non-clean conditions recorded during a run use a name from this feature's fixed
  Named Outcome vocabulary; zero free-text failure descriptions appear in the run summary or
  provenance log.
- **SC-011**: Zero outward-facing actions occur during verification, scoring, or reconciliation.
- **SC-012**: When the evidence base, hard-constraint set, or seniority-stream configuration is
  missing or inconsistent at the start of a run, the run makes zero writes and its output names the
  specific unresolved item.
- **SC-013**: A person unfamiliar with this feature can bootstrap a working data directory by
  copying the committed settings template and editing it, without reading the schemas or fixtures
  first.

## Dependencies

- **Feature 001 (intake & normalize pipeline)** — this feature's sole source of Job Records; read-
  only for this feature. No dependency on feature 001's collection or pre-triage running again.
- **`inputs/settings.json`** — extended, not replaced, by this feature's additions (`evidenceBase`,
  `hardConstraints.compFloor`, `targetRoles.streams`). Feature 002 (onboarding & settings), which
  would otherwise own authoring this file, is deferred; the file may be hand-authored until 002 is
  reconsidered against this feature's actual schema needs.
- **The applications tracker** — a hand-authored file in the data directory, read-only for this
  feature, used for application-state reconciliation.
- **The data directory (`HYPPO_DATA_DIR`)** — shared with feature 001. This feature adds
  `outputs/evaluations/**` and appends `provenance-log.md`; it reads Job Records, the evidence-base
  files, and the applications tracker.
- **The reference implementation** (`hyppoplugins/plugins/job-search`, specifically the
  `job-posting-retrieval`, `job-fit-screen`, and `job-search-delegation` skills and their
  `references/rubric.md`) is the design source this feature ports from. It is a reference for
  *what* the rubric, outcome vocabulary, and delegation boundary must cover — not a dependency this
  feature calls into at runtime; HyppoGraph re-implements the equivalent logic as a Workflow-tool
  step with its own tiered subagents, per Constitution Principle I.
- **The Golden Calibration Set** (real posting/evaluation pairs used to hand-tune the rubric —
  currently the vault's `specs/010-job-fit-screen-decision-tree-rework/golden-examples`) is consulted
  only during manual development/calibration of this feature's scoring logic. It is never copied into
  this repo and is not part of any automated test this repo runs; see Assumptions.

## Assumptions

- **No new browsing**: This feature never opens a page-read session of its own. The still-open check
  is limited to a stateless ATS-posting-API re-check (already-public JSON endpoints, not a
  HyppoVisor navigation) or the Job Record's existing stored metadata.
- **No interactive session**: Unlike the reference implementation's `job-search-session`, this
  feature is a single batch pass with no stop conditions, no resume state, and no mid-run question
  to the user — consistent with feature 001's own run model and Constitution Principle I.
- **Settings ownership**: This feature's config additions live in the same `inputs/settings.json`
  feature 001 already reads, not a separate file. Feature 002's onboarding UX for authoring that
  file is deferred and out of scope here; a real run requires the file to be hand-authored (or
  produced by a future 002) with this feature's required sections present.
- **Discovery is out of scope**: The reference implementation's `job-discovery` (ATS-scoped
  `WebSearch` sourcing) is a separate, not-yet-decided sourcing strategy and is not part of this
  feature. This feature only ever consumes Job Records feature 001 already produced, however they
  were sourced.
- **Anonymized reference, not personal data**: Every rubric clause, hard-constraint category, and
  anti-pattern check ported from the reference implementation is ported as *structure* (what to
  check, what shape the output takes) — never as a specific person's thresholds, titles, or
  evidence content. Those live only in the user's own data directory.
- **Model usage**: Per the project constitution, mid-tier model calls own the cited scoring and
  verdict; fast-tier (Haiku-class) calls are used only for the bounded, advisory sub-tasks in
  FR-010, reviewed by the orchestrating step before use. This is an implementation constraint, not
  a user-facing requirement.
- **Real calibration data stays external, same principle as settings**: the rubric's anti-pattern
  checks (FR-005) are validated during development against a real, personal Golden Calibration Set
  (currently the vault's `specs/010-job-fit-screen-decision-tree-rework/golden-examples` — real
  postings scored against real evidence). That set is treated exactly like `settings.json`'s real
  values: read from an external, gitignored location, never committed to this repo. This repo's own
  automated tests use only fabricated data, following feature 001/003's existing `tests/fixtures/`
  and `tests/golden/` convention (synthetic postings, invented personas) — the two golden concepts
  are deliberately separate: this repo's `tests/golden/` proves the *pipeline* is correct on made-up
  data; the external Golden Calibration Set is how the *rubric's judgment* gets tuned against real
  cases, by a human, outside any CI or committed test run.
- **Delegation boundary carries forward feature 001's subagent pattern**: the fast-tier delegated
  sub-tasks in FR-010/FR-011 are expected to run as `agent()` calls to `hyppo-*`-style subagents
  inside this feature's Workflow script, extending rather than replacing feature 001's
  `hyppo-judge`/`hyppo-read`/`hyppo-readwrite` boundary; the exact subagent set is a planning
  decision, not specified here.
