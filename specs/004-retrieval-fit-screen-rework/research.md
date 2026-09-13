# Phase 0 Research: Retrieval Verification & Fit-Screen Rework

The spec's own Clarifications session resolved the three highest-impact ambiguities (verdict scale,
open-status re-check cadence, re-check pacing). This document resolves the remaining
implementation-shaped decisions needed to reach a concrete data model and contracts, flagged as
"Outstanding — low impact, resolve during planning" in the `/speckit-clarify` completion report.

---

### R1 — Where do the new settings sections live, and exactly what do they contain?

**Decision**: Extend `inputs/settings.json` with three new top-level sections —
`evidenceBase`, `hardConstraints`, `targetRoles` — following the same
`{ status, value }` shape feature 002's existing sections use. `hardConstraints` holds only the
**net-new** values (`compFloor`, `excludedRoleNatures`); location/clearance/work-authorization
constraints are *read from feature 001's existing `hardStops` section* rather than duplicated, since
they're the same underlying values evaluated in a different report section (per spec's Hard
Constraint Set entity note).

**Rationale**: Avoids a second, drifting copy of location/clearance/work-auth data. Matches the
spec's Clarifications answer that this feature extends, not replaces, `inputs/settings.json`.

**Alternatives considered**: A fully separate `hardConstraints` section duplicating `hardStops` —
rejected, two sources of truth for the same fact is exactly what feature 001's dedup-key bugs (see
`next-steps` memory) were caused by in a different form. A separate config file
(`job-search.config.yaml`-style, per the reference) — rejected per the spec's explicit Clarifications
answer.

---

### R2 — What does `targetRoles.streams` need, and where does the anti-pattern recency window live?

**Decision**: `targetRoles.value = { streams: [{ name, seniorityCeiling, description }],
recencyWindowYears }`. `recencyWindowYears` is a single feature-wide value (not per-stream) — the
reference rubric applies one recency rule to leadership/mentoring evidence regardless of stream. It
is **required**, not defaulted: FR-000's config-validation gate treats a missing
`recencyWindowYears` the same as a missing `compFloor` or an empty `streams` list — an unresolved
item named in the exit report, zero writes. No silent default (e.g. "3 years") is invented, matching
the rest of this feature's strict-validation posture and Constitution Principle V (no HyppoGraph-
authored personal-preference values).

**Rationale**: A silently-defaulted recency window would be exactly the kind of un-cited,
un-sourced number Constitution Principle III forbids in an evaluation's reasoning.

**Alternatives considered**: A per-stream recency window — rejected as unsupported complexity; the
reference rubric doesn't vary it by stream and no requirement in the spec asks for that.

---

### R3 — What is the "reliable negative signal" rule for `not_applied` vs. `unknown` (FR-007)?

**Decision**: If `inputs/applications.md` exists and parses as a tracker (per feature 001's tolerant
parsing), its absence of a matching row for a Job Record IS a reliable negative signal →
`not_applied`. If the file is missing entirely, every Job Record reconciles to `unknown` (already
stated as an Edge Case in spec.md). A tracker that exists but is empty (no rows at all) is treated
the same as present-but-non-matching → `not_applied`, not `unknown` — an intentionally empty tracker
is still a real answer ("I haven't applied to anything yet"), consistent with the applications
tracker being "the source of truth for recorded contact and application activity" per the ported
`job-search-policy.md` design.

**Rationale**: Makes FR-007's "unless the tracker's absence is itself established as a reliable
negative signal" testable without another clarification round — the only distinction that matters
operationally is file-missing vs. file-present.

**Alternatives considered**: Treating an empty tracker as `unknown` (file exists but has zero
signal) — rejected; it collapses a real "nothing yet" answer into the same bucket as "we don't know,"
which is the exact conflation FR-007 was written to prevent.

---

### R4 — Where does the evidence base live, and how is it named in settings?

**Decision**: `inputs/evidence/` (new directory, sibling to `inputs/manual-postings/`).
`evidenceBase.value = { files: ["evidence/career-history.md", "evidence/cv-content.md", ...] }` —
paths relative to `HYPPO_DATA_DIR`, opaque list, at least one entry required (empty list ⇒
`config.evidence-unavailable`, per spec FR-000/Edge Cases).

**Rationale**: Mirrors the reference's `evidence/career-history.md` + `evidence/cv-content.md`
convention closely enough that the fabricated-persona settings template (FR-000a) can point at
directly analogous file names, while staying a flat, opaque list so the user can add/rename files
without a schema change.

---

### R5 — How does `hyppo-verify` construct the ATS posting-API URL without a browsing session?

**Decision**: The **orchestrating script**, not the subagent, derives the ATS API URL from the Job
Record's `sources[].sourceRef` — reusing feature 001's existing board-token extraction logic
(`trackedBoardsToSources`-adjacent parsing, R3 in feature 001's own research.md) to recognize
Greenhouse/Lever/Ashby URLs and build `boards-api.greenhouse.io/…`, `api.ashbyhq.com/…`, or
`api.lever.co/…` — then passes only the fully-formed API URL to `hyppo-verify` in the prompt. A
non-ATS `sourceRef` never reaches `hyppo-verify`; the script marks it `unresolvable` directly in
code, no agent call spent.

**Rationale**: Keeps board detection in code (Principle I — "no model call may decide the next
step"), matches the reference's `job-posting-retrieval` step 2 ("detect the board... discard any
previously loaded board reference") reimplemented as code rather than a per-call judgment, and
avoids granting `hyppo-verify` any tool beyond `WebFetch`.

---

### R6 — What counts as a "signal" from `hyppo-verify`, and how does the script map it to a mark?

**Decision**: `hyppo-verify` returns one of `found` (200 + posting body present) / `not_found`
(404, or 200 with an explicit "no longer accepting applications"/closed marker) / `http_error` (any
other non-200, timeout, or network failure) / `unparseable` (200 but the body doesn't match the
expected ATS JSON shape). The script maps: `found` → `confirmed-open`; `not_found` → `confirmed-
closed`; `http_error` or `unparseable` → `unresolvable`. This mirrors the reference's
`still_open_scan` delegation contract (a signal, never a disposition) exactly, adapted to a JSON API
response instead of a rendered page.

**Rationale**: Keeps the fast-tier subagent from ever making the final open/closed call (Principle I
and the reference's own delegation-boundary rule: "must never... assign final... dispositions").

---

### R7 — Performance target for this feature's own step boundary

**Decision**: Added as spec.md SC-014 during this planning pass: verifying 100 non-terminal Job
Records and scoring the confirmed-open/unresolvable subset completes within 30 minutes including
FR-002d pacing — the same shape as feature 001's SC-009, scoped to this feature's steps.

**Rationale**: The spec's `/speckit-clarify` pass flagged the absence of an explicit throughput
target as a low-impact Outstanding item; reusing feature 001's proven target shape (rather than
inventing a new number) keeps the two features' capacity expectations comparable without requiring
new measurement infrastructure.

---

### R8 — Relationship to feature 003 (eval-harness)

**Finding**: `package.json` (committed, `c22df37`) and empty `evals/{component,integration,lib,
per-component}/` directories exist, but no `evals/run.mjs` or test file has been committed — feature
003's harness is specced and directory-scaffolded, not implemented. This feature does not block on
003; Phase A testing (per plan.md) uses manual quickstart validation and, optionally, direct
`node:test` files under `tests/unit/` for this feature's pure helpers (signal→mark mapping, verdict
tally, application-state reconciliation), following the same pattern feature 001 used before 003
existed. If 003 is implemented before or during this feature's Phase A, these tests should move into
its `evals/component/` layer instead of being duplicated.

**Rationale**: Avoids either blocking this feature on unfinished tooling or quietly duplicating
003's intended structure without acknowledging it.

---

### R9 — Job Record schema migration (`alreadyApplied` boolean → `applicationState` enum)

**Decision**: This feature's `verify`/`score` run, on encountering a Job Record still carrying the
old boolean `alreadyApplied` field (written by a feature-001-only run predating this feature), MUST
replace it with the computed `applicationState` value (§ contracts/job-record-amendments.md) rather
than carrying both fields forward. There is no dual-write or deprecation window — Constitution
Principle V treats the data directory as the single source of truth with no consumer outside this
repo's own pipeline, so a clean field replacement on next-touch is safe.

**Rationale**: Avoids two competing "have I applied" fields on the same file, which is precisely the
kind of confusion FR-007 exists to eliminate.
