# Feature Specification: Pipeline Eval Harness

**Feature Branch**: `003-eval-harness`

**Created**: 2026-09-02

**Status**: Draft

**Input**: User description: "work with what we discussed" — formalise the eval strategy worked out for
the intake & normalize pipeline (see `specs/001-intake-normalize-pipeline/eval-strategy.md`) into its
own feature: a layered eval harness that catches component defects cheaply, gates integration on a
known-good synthetic example, keeps model choice and spend under explicit human control, and produces
committed eval evidence.

## Clarifications

### Session 2026-09-02

- Q: Should the integration-gate dataset be a fresh ~8-posting synthetic set or a trimmed copy of the
  existing 16-record feature-001 fixture? → A: A — author a fresh synthetic set (~8 postings), one per
  known failure mode; leave `tests/fixtures/data-dir/` unchanged for occasional full runs.
- Q: Should feature 001's inline agent prompts be moved to a shared module the per-component evals can
  read, accepting an edit to the committed workflow file? → A: A — yes; extract the pipeline's agent
  prompts into a shared module consumed by both the workflow and the evals.
- Q: Which assertions may the non-Claude model judge grade, with everything else deterministic? → A: B
  — extraction faithfulness and pre-triage reason soundness only, each graded against an explicit
  written criteria list (rubric); all other assertions (counts, keys, dedup outcome, enumeration,
  vocabulary membership, byte-equality) are deterministic.
- Q: Where should the committed eval reports and their index live? → A: A — `docs/eval-reports/`, a
  project-level directory, one file per run plus an index.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Catch a component defect without a full pipeline run (Priority: P1)

The developer changes a pure helper (a dedup-key component, a slug rule) or an agent's prompt/tool
grant, and wants to know within seconds-to-minutes whether it broke something — at the cheapest layer
that can express the defect — instead of launching the full pipeline (dozens of model subtasks, tens
of minutes) and reading a summary to guess.

**Why this priority**: This is the core value. The last five defects in the intake-normalize pipeline
were each found only by a full run; three were pure-function bugs findable in seconds, one was a single
agent's missing capability, one was fixture hygiene. The full run was the only instrument available.
A fast component layer removes that.

**Independent Test**: Introduce a known regression into a pure helper (e.g. make the dedup-key title
component case-sensitive again). Run the component test layer. It fails, names the helper and the
failing case, and completes with no model call and no network. Revert; it passes.

**Acceptance Scenarios**:

1. **Given** a pure-logic helper used by the pipeline, **When** its behaviour changes in a way that
   would split or misroute records, **Then** the component test layer fails with the input, expected,
   and actual values, in under 5 seconds, with zero model calls.
2. **Given** the pipeline's helper logic is maintained in two places (a shared module and an inlined
   copy the orchestration substrate requires), **When** the two drift apart, **Then** a guard check
   fails and names the drift.
3. **Given** all component tests pass, **When** the developer runs them, **Then** the run costs
   nothing and can be wired to run unattended (pre-commit / local `make`-style target).

---

### User Story 2 - Gate integration on a known-good synthetic example (Priority: P2)

The developer wants one command that runs the whole collect→triage→normalize flow over a small,
fully-understood synthetic dataset and checks the output against a committed expected result — so a
green result is a real pass/fail, not an eyeballed summary — and that re-running it over the same data
produces no further changes (idempotency).

**Why this priority**: This replaces the blind full-pipeline debug loop with a deterministic gate. The
synthetic set is small enough that every expected Job Record, company mapping, summary count, and
provenance line is known in advance, and it deliberately contains one instance of every failure mode
found so far (cross-source duplicate, company-name variance, hard-stop rejects, non-English posting,
low-completeness posting, already-applied match, a manual drop, a non-posting file).

**Independent Test**: Run the integration gate over the synthetic dataset copied to a scratch
location. The produced outputs match the committed expected tree exactly. Run it a second time over
the same scratch location; it adds no new records or marks and the provenance log is byte-unchanged.

**Acceptance Scenarios**:

1. **Given** the synthetic dataset and its committed expected-output tree, **When** the integration
   gate runs, **Then** every produced file matches expected exactly, and any mismatch is reported as a
   file-level diff.
2. **Given** a completed integration run, **When** it runs again over the same data, **Then** zero new
   raw records, triage marks, or Job Records are written and the provenance log is byte-identical
   (satisfies feature 001 SC-006).
3. **Given** the synthetic dataset, **When** the gate runs, **Then** it performs no network access —
   collection resolves to nothing and the corpus is the pre-seeded synthetic records.
4. **Given** a live board search the developer is signed into, **When** they run the separate live
   smoke check at shallow depth against a scratch location outside the repository, **Then** it
   produces plausible Job Records, provenance, and a summary, judged by hand.

---

### User Story 3 - Keep model choice and spend under explicit human control (Priority: P2)

The developer wants every run that spends real money to be something they started by hand, with a
visible estimate and a hard ceiling, and wants credentials handled so they never land in the
repository, logs, or evidence.

**Why this priority**: The whole reason for the layered approach is to keep evaluation cheap. An
automated trigger can spend money on a run nobody asked for; a loop bug can rack up spend; a leaked
key is a standing liability.

**Independent Test**: Invoke a metered eval without the explicit confirmation flag — it prints the
estimated cost and exits without calling any paid service. Set the per-run ceiling low and invoke a
run that would exceed it — it aborts before exceeding. Grep the repository and any produced report for
credential material — none is present.

**Acceptance Scenarios**:

1. **Given** a metered eval command, **When** it is invoked without an explicit spend confirmation,
   **Then** it prints the estimated cost and exits without any paid call.
2. **Given** a per-run spend ceiling, **When** a run would exceed it, **Then** the run aborts and
   reports how far it got.
3. **Given** the harness needs a credential that is not present in the environment, **When** it
   starts, **Then** it fails immediately with a clear message and never prompts for one or accepts one
   as a command-line argument.
4. **Given** the repository, its history, the provenance log, and every eval report, **When**
   inspected, **Then** none contains a credential, an auth header, or a request body.
5. **Given** the project, **When** its automation configuration is inspected, **Then** no
   push-triggered, scheduled, or otherwise unattended job runs a metered eval; only the free component
   layer may run unattended.

---

### User Story 4 - Run per-component evals for the model-backed steps (Priority: P3)

The developer wants a small fixture table per model-backed subtask (pre-triage keep/reject, field
extraction, record enumeration, source-list parsing) that asserts on the subtask's structured output
in isolation, including stability across repeated runs for values that feed deterministic downstream
keys.

**Why this priority**: One subtask's missing capability (a reader with no way to enumerate a
directory) silently zeroed a whole stage and took a full run plus a restart to find. A one-subtask
eval finds that in seconds. It also pins the model-derived values that must stay stable.

**Independent Test**: Point the record-enumeration eval at a directory of synthetic records; it
asserts the expected count comes back. Remove the enumeration capability from that subtask's
definition; the eval fails clearly. Run the extraction eval's location-bucket case several times;
it asserts the value stays within the allowed vocabulary and does not change between runs.

**Acceptance Scenarios**:

1. **Given** a directory of synthetic raw records, **When** the enumeration eval runs, **Then** it
   asserts the exact expected set of records is returned, and fails clearly if the subtask cannot
   enumerate.
2. **Given** a fixture posting, **When** the pre-triage eval runs it, **Then** it asserts the
   keep/reject outcome and the reason category, and re-running N times yields the same outcome.
3. **Given** a fixture posting, **When** the extraction eval runs, **Then** the coarse location bucket
   stays within its fixed vocabulary and is identical across repeated runs.

---

### User Story 5 - Keep committed eval evidence (Priority: P3)

The developer wants every eval run — free or metered — to leave a dated, human-readable report in the
repository: what was tested, against which pipeline version and fixtures, the pass/fail results, and
the measured cost; with an index that doubles as a running spend ledger.

**Why this priority**: This is the "nice to have on a real project" artifact — evidence that testing
was real, methodology was deliberate, and spend was tracked. It is also how the estimated per-run cost
gets replaced with a measured one.

**Independent Test**: Run any eval layer. A new dated report file appears with methodology, the
pipeline commit identifier, the model identifiers used, a fixture identifier, a per-case results
table, and a cost figure (zero for the free layer). The index gains a row.

**Acceptance Scenarios**:

1. **Given** a completed eval run, **When** it finishes, **Then** a dated report is written containing
   methodology, version/model/fixture provenance, a per-case results table, failure diffs if any, and
   a cost figure.
2. **Given** several eval reports, **When** the index is read, **Then** each run appears with its
   date, scope, result, and cost, and the metered runs sum to a reconstructable total spend.
3. **Given** a report, **When** it is inspected, **Then** it contains model identifiers and token
   counts but no credential material and no personal data (synthetic fixtures only).

---

### Edge Cases

- **Model output varies run-to-run.** Any assertion on a model-backed value must check stability
  across repeated runs, not a single sample; a value that feeds a deterministic downstream key and
  wobbles is a defect the eval must surface.
- **Substrate change shifts model behaviour.** Moving the same model from one execution wrapper to
  another (different surrounding system prompt / harness) can change outputs even though the model is
  unchanged; the expected-output tree needs a one-time re-lock at that point, and this must be a
  recognised, logged step, not a surprise failure.
- **A fixture reaches the live internet.** The synthetic integration dataset must be hermetic;
  collection over it must resolve to nothing. A fixture that resolves to a real site is itself a
  defect.
- **Credential absent or malformed.** The harness fails fast with a clear message; it never proceeds
  with a partial run, never prompts interactively, never reads a credential from a command-line
  argument.
- **Spend ceiling hit mid-run.** The run stops cleanly at the ceiling and the report records a
  partial result rather than silently continuing.
- **Pipeline gains or renames a field.** The shared helper module, its inlined copy, the expected
  tree, and the fixture tables all need updating together; the drift guard (US1) and the integration
  diff (US2) must both catch a partial update.
- **The synthetic dataset and the larger existing fixture set diverge.** The larger set stays for
  occasional full runs; the synthetic set is the routine gate. Neither is the other's source of truth.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The harness MUST provide a **component test layer** covering the pipeline's pure,
  deterministic logic (key derivation, slugging, hashing, set-folding, summary rendering, criteria
  fingerprinting, the "insufficient data" completeness rule, the tracked-search-to-source mapping),
  runnable with no model call and no network.
- **FR-002**: Where pipeline helper logic must exist both as a shared unit and as an inlined copy
  demanded by the orchestration substrate, the harness MUST include a check that fails when the two
  diverge.
- **FR-003**: The harness MUST provide a **newly authored synthetic integration dataset** (~8
  postings, one instance each of every failure mode observed to date, plus a manual-drop file and a
  non-posting file) and a committed **expected-output tree** (Job Records, company canonicalisation,
  run summary counts, provenance lines) small enough that every expected value is known in advance.
  The existing 16-record `tests/fixtures/data-dir/` fixture is left unchanged and remains available
  for occasional full runs; it is not the integration-gate dataset.
- **FR-004**: The integration check MUST run the full collect→triage→normalize flow over a scratch
  copy of the synthetic dataset and report every deviation from the expected tree as a file-level
  diff.
- **FR-005**: The integration check MUST include an **idempotency assertion**: a second run over the
  same scratch location writes no new raw records, triage marks, or Job Records, and leaves the
  provenance log byte-identical (feature 001 SC-006).
- **FR-006**: The synthetic integration dataset MUST be hermetic — no network access, collection
  resolves to nothing, the corpus is pre-seeded synthetic records.
- **FR-007**: The harness MUST provide **per-component evals** for the model-backed subtasks
  (pre-triage keep/reject, field extraction, record enumeration, source-list parsing), each asserting
  on that subtask's structured output in isolation against a fixture table, using the **exact prompt
  the pipeline uses** — not a copy.
- **FR-007a**: The intake & normalize pipeline's inline agent prompt text MUST be moved into a shared
  module that both the pipeline workflow and the per-component evals consume, so FR-007 tests real
  behaviour without prompt duplication. This edit to feature 001's workflow file is in scope for this
  feature.
- **FR-008**: Per-component evals for values that feed deterministic downstream keys MUST assert
  **stability across repeated runs**, not a single sample.
- **FR-009**: The **system under test** — the pipeline's in-step model calls — MUST remain on the
  fast tier, per constitution Principle II. Evals MUST NOT alter the tier of the system under test.
- **FR-010**: The **judge role** MUST use a non-Claude model and MUST be limited to exactly two
  assertion types: (1) extraction faithfulness — does the extracted Job Record faithfully represent
  the source posting; (2) pre-triage reason soundness — is the keep/reject reason sound given the
  posting and the configured criteria. Every other assertion (record counts, dedup keys, dedup
  outcome, record enumeration, vocabulary membership, byte-equality, provenance stability) MUST be
  deterministic.
- **FR-010a**: Each judge-graded assertion type MUST be graded against an **explicit written criteria
  list (rubric)** stored with the eval; the judge is given the rubric and returns a pass/fail per
  criterion, not an open-ended opinion.
- **FR-011**: Every eval run MUST emit a **dated report** under `docs/eval-reports/` (one file per
  run) containing: which layer ran, methodology, the pipeline version identifier, the model
  identifiers used, a fixture identifier, a per-case pass/fail table, failure diffs where present,
  and a cost figure (zero for free layers).
- **FR-012**: Eval reports MUST be committed to the repository, human-readable, and contain only
  synthetic data, model identifiers, and token counts — never credentials, auth headers, request
  bodies, or personal data.
- **FR-013**: The harness MUST maintain a **report index** at `docs/eval-reports/` that lists every
  run with date, scope, result, and cost, such that total metered spend is reconstructable from it.
- **FR-014**: Any eval run that incurs metered cost MUST require an **explicit per-invocation
  confirmation**; without it, the command prints an estimate and exits without any paid call.
- **FR-015**: The harness MUST enforce a **per-run spend ceiling** that aborts the run before it is
  exceeded, recording a partial result.
- **FR-016**: The harness MUST read every credential from the environment, fail fast with a clear
  message when one is absent, and never prompt for one or accept one as a command-line argument.
- **FR-017**: Credentials MUST be stored outside the repository tree; the repository MUST carry only a
  placeholder template with names and no values.
- **FR-018**: No push-triggered, scheduled, or otherwise unattended job may run a metered eval. Only
  the free component test layer may be wired to run unattended.
- **FR-019**: The harness MUST support two execution substrates for the model-backed layers — the
  interactive Claude Code workflow substrate (subscription-billed, the default for development and for
  authoring the expected tree) and a standalone metered substrate — and MUST document that a move
  between them requires a one-time re-lock of the expected tree.
- **FR-020**: The feature MUST record a single point at which committing real spend is decided (the
  move to the standalone metered substrate), reached only after the free layers are green and only if
  the metered/portfolio path is chosen; everything before it costs nothing on a metered account.
- **FR-021**: The design precursor `specs/001-intake-normalize-pipeline/eval-strategy.md` MUST be
  moved into this feature's directory as a companion design-notes file, with a one-line pointer left
  at the 001 location, so this spec is the single source of truth. The move is executed during
  planning/implementation, not by this spec.
- **FR-022**: This feature is scoped to evaluating the **intake & normalize pipeline (feature 001)**
  only. The harness structure (layers, evidence reports, spend controls, judge policy) MUST be built
  so a later feature can extend it to subsequent pipeline steps, but no later step is specified here.
- **FR-023**: The standalone metered substrate IS in scope for this feature, but **gated as the final
  milestone**: all free layers (component tests, per-component evals, integration gate on the Claude
  Code workflow substrate) MUST be green first, and the standalone substrate MUST NOT be built or run
  until the user has explicitly approved the associated credit spend (the FR-020 decision point).

### Key Entities

- **Eval layer**: one of — component test layer (pure logic, free), per-component eval (one
  model-backed subtask in isolation), integration gate (full flow over the synthetic dataset), live
  smoke (manual, real board, scratch location outside the repo).
- **Synthetic integration dataset**: a small set of pre-seeded synthetic postings plus manual-drop and
  non-posting files, deliberately containing one instance of every known failure mode; hermetic.
- **Expected-output tree**: the committed known-correct result for the synthetic dataset — Job
  Records, company canonicalisation, run-summary counts, provenance lines.
- **System under test**: the intake & normalize pipeline at a pinned version; its in-step model calls
  stay on the fast tier.
- **Judge**: a non-Claude model used only for assertions that cannot be made deterministic; runs
  outside any metered Claude account.
- **Eval report**: a dated, committed record of one run — methodology, version/model/fixture
  provenance, per-case results, failure diffs, cost.
- **Report index / spend ledger**: the list of all runs with date, scope, result, cost.
- **Spend controls**: the per-invocation confirmation and the per-run ceiling.
- **Credential**: an auth secret for a metered substrate or the judge; environment-only, never in the
  repo or a report.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A regression in any pure pipeline helper is caught by the component test layer in under
  5 seconds, with no model call and no network.
- **SC-002**: Each of the five previously-observed defect classes (cross-source duplicate not merged,
  duplicate merge non-deterministic, record file renamed between runs, a stage silently zeroed by a
  missing subtask capability, a fixture reaching the live internet) is caught by at least one eval
  layer that is cheaper than a full pipeline run.
- **SC-003**: The integration gate over the synthetic dataset produces a result that matches the
  committed expected tree exactly, and a second run over the same location changes nothing and leaves
  the provenance log byte-identical.
- **SC-004**: Reaching a validated state for the intake & normalize pipeline (component layer green,
  integration gate green including idempotency) costs no more than the price of roughly five
  integration runs, and the routine cost of re-checking after a change trends to zero.
- **SC-005**: No eval run that spends money can be started other than by an explicit human invocation
  carrying a confirmation; this is demonstrable by inspecting the project's automation configuration
  and by invoking a metered command without confirmation and observing it not spend.
- **SC-006**: A per-run spend ceiling, set low, stops a run that would exceed it before it does.
- **SC-007**: The repository, its history, the provenance log, and every eval report contain no
  credential material, verified by inspection.
- **SC-008**: After the first metered run, the per-run cost figure in its report replaces the prior
  estimate, and the report index sums metered runs to a total that matches the account's recorded
  spend within a small margin.
- **SC-009**: Every eval run, of every layer, leaves a committed dated report and an index row.

## Assumptions

- **Synthetic data only in-repo.** Per constitution Principle V, in-repository fixtures and expected
  trees are synthetic. Live/real runs use scratch locations outside the repository and are not
  committed.
- **Scope is feature 001.** The intake & normalize pipeline is the only system under test; the
  harness is built to be extensible to later pipeline steps, which are out of scope here (FR-022).
- **Design precursor.** `specs/001-intake-normalize-pipeline/eval-strategy.md` captures the worked-out
  strategy (three layers, non-Claude judge, spend controls, evidence reports, substrate split) and is
  the input to this spec; it moves into `specs/003-eval-harness/` during planning with a pointer left
  behind (FR-021).
- **Judge access.** A non-Claude model is available to the developer for the judge role, on an account
  separate from any metered Claude account, so judge calls do not consume the Claude eval budget.
- **Default development substrate.** The model-backed layers run on the interactive Claude Code
  workflow substrate (subscription-billed) during development and while authoring the expected tree;
  no metered Claude spend occurs before the single decision point in FR-020.
- **Metered credit sizing.** If the metered substrate is built, an initial credit top-up on the order
  of a few tens of dollars is expected to be sufficient for validation; heavy iteration on the
  standalone substrate itself could roughly double that.
- **Fast tier only.** The pipeline under test uses only the fast model tier (Principle II); the
  harness does not exercise mid/top-tier behaviour, which belongs to later pipeline steps out of
  scope here.
- **Branch/PR workflow.** This feature is developed on branch `003-eval-harness` and lands on `main`
  via pull request at milestone boundaries, per the constitution's Development Workflow.
