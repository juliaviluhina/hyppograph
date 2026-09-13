# Phase 1 Data Model: Retrieval Verification & Fit-Screen Rework

All entities are plain files under `HYPPO_DATA_DIR`, extending feature 001's model. Field
"unknown"/"unresolved" are literal sentinel strings, never a silent blank (FR-010 carried over,
FR-004a). See research.md for the decisions behind the shapes below.

---

## EvidenceBase  *(input — read-only)*

`sections.evidenceBase.value` in `inputs/settings.json` (this feature's addition, R4).

| Field | Type | Notes |
|---|---|---|
| `files` | string[] | Paths relative to `HYPPO_DATA_DIR`, e.g. `evidence/career-history.md`. At least one required; each MUST resolve to non-empty content or the run reports `config.evidence-unavailable` (FR-000). |

---

## HardConstraintSet  *(input — read-only, net-new values only)*

`sections.hardConstraints.value` in `inputs/settings.json` (R1). Location/clearance/work-
authorization constraints are **not** duplicated here — read from feature 001's existing
`sections.hardStops.value` (see `specs/001-intake-normalize-pipeline/data-model.md#hardstops`).

| Field | Type | Notes |
|---|---|---|
| `compFloor` | `{ amount: number, currency: string }` \| null | A posted range clears only at/above its midpoint reaching this floor (ported rubric rule); `null` ⇒ no comp floor configured (not a config error — a user may legitimately not have one). |
| `excludedRoleNatures` | string[] | Free-text role-nature exclusions (e.g. "on-call rotation", "people management"), matched by the mid-tier scoring judgment against the posting's responsibilities text. |

---

## TargetRoleStreams  *(input — read-only)*

`sections.targetRoles.value` in `inputs/settings.json` (R2).

| Field | Type | Notes |
|---|---|---|
| `streams[]` | `{ name, seniorityCeiling, description }` | One evaluation track each; `seniorityCeiling` gates the seniority-band check. Required, non-empty (FR-000). |
| `recencyWindowYears` | integer | Single feature-wide value; leadership/mentoring evidence older than this is downgraded one verdict level (FR-005). Required, no default (R2). |

---

## JobRecord  *(amended — see contracts/job-record-amendments.md for the exact diff)*

Feature 001's Job Record file, with new/changed front-matter fields this feature owns:

| Key | Type | Notes |
|---|---|---|
| `openStatus` | `"confirmed-open"` \| `"confirmed-closed"` \| `"unresolvable"` \| `null` | `null` until this feature's first `verify` pass touches the record. Re-checked every run unless `"confirmed-closed"` (terminal, FR-002c). |
| `openStatusCheckedAt` | ISO 8601 string \| null | Timestamp of the last re-check, whether or not the mark changed. |
| `openStatusReason` | string \| null | One line naming the signal that produced the current mark (e.g. `"ATS API 404"`, `"non-ATS source, no signal available"`). |
| `applicationState` | one of the 8 values below | **Replaces** feature 001's `alreadyApplied` boolean (R9) — computed fresh on every `score` pass touching the record; `appliedEntryRef` (feature 001) is retained unchanged as the link, when known. |

State transitions: `openStatus` — `null → confirmed-open | confirmed-closed | unresolvable`;
`confirmed-open ⇄ unresolvable` freely on re-check; `confirmed-closed` is a one-way terminal state
(FR-002a/FR-002c). `applicationState` — recomputed each `score` pass from the applications tracker;
not a terminal state (a role can go `not_applied → application_prepared → submitted`, etc., as the
tracker changes, but this feature never writes to the tracker itself — it only reads and reconciles).

---

## FitEvaluation  *(output — one Markdown file per scored Job Record)*

Stored under `outputs/evaluations/<job-record-key>.md` (same `key` as the Job Record it scores).
Written only for Job Records marked `confirmed-open` or `unresolvable` and kept by feature 001's
pre-triage.

**Front-matter:**

| Key | Type | Notes |
|---|---|---|
| `jobRecordKey` | string | FK to the scored Job Record's `key` |
| `openStatus` | mirrors the Job Record's mark at scoring time | Denormalized for a self-contained evaluation file |
| `overallVerdict` | `"SKIP"` \| `"APPLY-AND-SEE"` \| `"APPLY"` | FR-006 |
| `requirementTable[]` | `{ requirement, verdict, evidenceFile, evidenceSection, note? }` | `verdict` ∈ `Strong`/`Partial`/`Fails`/`Absent`/`Unknown` (FR-003) |
| `hardConstraints[]` | `{ constraint, state, note? }` | `state` ∈ pass/fail/`unresolved` (FR-004/FR-004a), reported separately from `requirementTable` |
| `antiPatternFlags[]` | `{ type, detail }` | `type` ∈ `domain-crossover-overclaim` / `title-vs-requirements` / `recency-discount` (FR-005) |
| `applicationState` | one of the 8 values | Mirrors the Job Record's field at scoring time (FR-007) |
| `namedOutcome` | string \| null | Set when this evaluation carries a flag from the fixed vocabulary (e.g. `open.unresolved` on an unresolvable record) rather than being a clean result |
| `delegations[]` | `DelegationLogEntry[]` | Inline audit trail for this evaluation's FR-010 sub-tasks (FR-011) |
| `scoredAt` | ISO 8601 string | |
| `evidenceFilesUsed` | string[] | The exact `EvidenceBase.files` entries read for this evaluation — an audit trail if the evidence base changes later |

**Body:** a human-readable rendering of the requirement table, hard-constraint section, and
anti-pattern findings (FR-012), plus a link back to the Job Record.

State transitions: created on first score; a later `score` pass for the same `jobRecordKey`
**overwrites** the file in place (this is evaluation, not accretion — unlike a Job Record, there's
exactly one current evaluation per role, not a merge of sources). Idempotent when nothing material
changed (FR-009).

---

## ApplicationStateValue  *(enumeration)*

`unknown` · `not_applied` · `application_prepared` · `submitted` · `existing_application` ·
`withdrawn` · `rejected` · `ambiguous` (FR-007). See research.md R3 for the `not_applied`-vs-
`unknown` resolution rule.

---

## NamedOutcome  *(enumeration — this feature's additions to feature 001's vocabulary)*

`open.unresolved` · `score.insufficient-input` · `config.evidence-unavailable` ·
`state.ambiguous-match` (FR-008). Feature 001's existing outcomes are unaffected and continue to
apply to records that never reach this feature (e.g. a `configError` tracked source).

---

## DelegationLogEntry  *(embedded in FitEvaluation.delegations[])*

| Field | Type | Notes |
|---|---|---|
| `taskType` | `"extraction"` \| `"normalization"` \| `"evidence_match"` \| `"citation_audit"` \| `"evaluation_critique"` \| `"still_open_scan"` | FR-010 |
| `inputScope` | string | One-line description of what was handed to the delegated call, not the full payload |
| `modelTier` | `"fast"` | Every FR-010 delegated sub-task in this feature runs fast-tier |
| `timestamp` | ISO 8601 string | |
| `reviewStatus` | `"pending"` \| `"accepted"` \| `"corrected"` \| `"rejected"` | FR-011 |
| `note` | string \| null | Citation/uncertainty note when relevant |

---

## ProvenanceLogEntry  *(output — append-only, extends feature 001's shared log)*

Same shape as feature 001's (`at`, `run`, `what`, `how`, `why`); this feature appends one line per
open-status mark **set or changed** (not per re-check that reproduces the existing mark, FR-009),
per Fit Evaluation written, and per `applicationState` value recorded (FR-015).

---

## RunSummary  *(output — per run, this feature's own summary alongside feature 001's)*

| Field | Type |
|---|---|
| `run` | string |
| `verifiedConfirmedOpen` / `verifiedConfirmedClosed` / `verifiedUnresolvable` | integer |
| `scored` | integer |
| `verdictCounts` | `{ SKIP, "APPLY-AND-SEE", APPLY }` → integer |
| `hardConstraintFailures` | integer |
| `applicationStateCounts` | Record<ApplicationStateValue, integer> |
| `namedOutcomeCounts` | Record<NamedOutcome, integer> |
