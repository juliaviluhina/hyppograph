# Feature Specification: Write-Fidelity Guardrails

**Feature Branch**: `007-write-fidelity-guardrails`

**Created**: 2026-09-14

**Status**: Draft (spec level only)

**Input**: User description: "006's live session runs caught two production bugs (F4, F5) that
the 005 harness's node-layer suite could not have caught, because it makes zero real model calls.
F4 in particular — `write-evaluation` non-deterministically dropping its own file's leading `---`
— was root-caused by observing the SAME prompt produce the SAME wrong output twice in a row. This
spec asks: can this class of bug be caught by cheaper, more atomic tests, before it needs a full
~90-agent live session run to surface?"

## Clarifications

### Session 2026-09-14

- Q: Where should the new atomic (Tier-2, real-model-call) write-fidelity tests live, and how should a developer run them? → A: New folder (e.g. `tests/fidelity/`, following existing `tests/harness/` naming) with its own `npm run test:fidelity` script, separate from `npm run harness`.
- Q: Should US3's convention-note document be a required deliverable with its own FR, or is the structural pin (FR-004) alone sufficient to close US3? → A: Require both — a new FR mandates the convention doc (e.g. `contracts/verbatim-write.md`), referenced from both scripts' module header comments, alongside FR-004's structural pin.
- Q: What should FR-004's structural pin check to confirm a call site uses the BEGIN-CONTENT/END-CONTENT marker convention? → A: Literal string check — grep/regex the prompt-builder function's source text for both literal markers, same style as the existing `hasRawSettingsPassthrough` pin (static, no execution).

## Background — the finding this spec is built on

006 T016/T017 (2026-09-14) ran `.claude/workflows/fit-screen.js` live three times via the Workflow
tool. The first run surfaced two `unexpected-red` findings that **no test in the 005 harness's
node-layer suite (60 cases, zero live model calls) could have caught**, because that suite proves
the workflow's *source code* asks the model to do the right thing — via structural regex pins like
`hasRawSettingsPassthrough()` — but never proves the model *actually complies* when a real fast-tier
`agent()` call executes that prompt.

- **F4**: `write-evaluation` (`hyppo-readwrite`, fast tier) dropped the leading `---` of the YAML
  front matter it was told to write, on 2 of 9 records. Confirmed non-deterministic-looking but
  actually **mechanically reproducible**: a retry with the byte-identical prompt produced the
  byte-identical wrong output a second time on the same record (`acme`). Root cause: the prompt's
  instruction text ended in a blank line immediately followed by the content's own opening `---`,
  and the model read that boundary as its own markdown formatting rather than data to transcribe.
  Fixed in 006 by wrapping the content in explicit `BEGIN-CONTENT`/`END-CONTENT` markers.
- **F5**: a harness assertion bug (`isolation:service-log-covers` didn't share the `blocked`
  exemption the matrix loop got), not a production bug — out of this spec's scope, already closed
  in 006.

F4 is the motivating case: a class of bug — call it **write-fidelity drift** — where a fast-tier
model call is trusted to transcribe content verbatim, and something about the prompt's own
formatting collides with the content's leading characters (`---`, `#`, `` ``` ``, `***`, a list
marker) closely enough that the model treats part of the payload as instruction chrome and drops
it. Static source-code pins cannot catch this; only exercising the real prompt against a real model
call can — and that currently costs a full session run (~80-90 agents, ~700k tokens, 10-13 minutes
in this environment) to even notice.

## Audit findings (2026-09-14) — FR-002 completed at spec time

Every `agent()` call in both workflow scripts that writes file content was inspected. Eight sites
total; three shapes:

| # | File : line | Call (label) | Shape | Classification | Reason |
|---|---|---|---|---|---|
| 1 | `fit-screen.js`, `buildEvaluationWritePrompt` (`write-evaluation`) | `write-evaluation` | Full overwrite, multi-line, content begins `---\n` | **At-risk — confirmed broken (F4), already fixed** | Model dropped the leading `---` on 2/9 live records; fixed on branch `006-fit-screen-gap-fixes` (commit `66c8e32`, not yet on `main`) with `BEGIN-CONTENT`/`END-CONTENT` markers. Needs FR-001's atomic regression test. Line numbers throughout this table are as of that commit — **this spec's implementation depends on 006 merging (or being rebased onto 006) first** (see Assumptions). |
| 2 | `fit-screen.js:1023` (branch `006-fit-screen-gap-fixes`, commit `66c8e32`) | `write-run-summary` | Full overwrite, multi-line, content = `renderSummary()`, first line always `Run <timestamp>` | **At-risk in principle, not yet guarded** | Same blank-line-then-content boundary shape as #1. Currently safe only because `renderSummary`'s first line happens to start with a letter, not because anything enforces it (spec Edge Cases). No incident observed yet — FR-003 target. |
| 3 | `intake-normalize.js:841` | `write-run-summary` (001's) | Full overwrite, multi-line, content = `renderSummary()`, first line always `Run <timestamp>` | **At-risk in principle, not yet guarded** | Same as #2, feature 001's counterpart. Never audited before this spec. FR-003 target. |
| 4 | `fit-screen.js:502` | `write-open-status` | Patch: "Update ONLY the YAML front-matter... leave body BYTE-FOR-BYTE unchanged" + a short list of keys/values to set | **Out-of-class** | The model composes the edit from instructions, not transcribes a literal blob — no instruction/content boundary to collide with. Different bug class (possible over-edit or key-drop), not this spec's scope. |
| 5 | `fit-screen.js:757` (branch `006-fit-screen-gap-fixes`) | `migrate-application-state` | Same patch shape as #4 | **Out-of-class** | Same reason as #4. |
| 6 | `intake-normalize.js:605` | `write-triage-mark` | Same patch shape as #4 | **Out-of-class** | Same reason as #4. |
| 7 | `fit-screen.js:851` (branch `006-fit-screen-gap-fixes`) | `provenance` (`appendProvenance`) | Append exactly one single-line string, no embedded newline | **Out-of-class** | A single appended line has no multi-line body and no leading-delimiter boundary — the collision this spec addresses is structurally impossible here. |
| 8 | `intake-normalize.js:1176` | `provenance` (`appendProvenance`) | Same append shape as #7 | **Out-of-class** | Same reason as #7. |

**Net scope for US1/US3**: 3 at-risk call sites total (#1 already fixed and needing only its
regression test; #2 and #3 needing both the marker fix and a new atomic test). 4 out-of-class sites
recorded with reasons, not touched by this spec.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Catch write-fidelity drift at the cost of one fast-tier call, not a full session run (Priority: P1)

A developer changes (or merely re-reads, months later) a "write this exact content" prompt in
`fit-screen.js` or `intake-normalize.js`. They want to know within seconds, for cents, whether the
real model still transcribes it byte-for-byte — including a leading delimiter line the model might
mistake for instruction formatting — without paying for a full pipeline run across every fixture.

**Why this priority**: This is the exact gap F4 exposed. It is the only story that directly
prevents a repeat of the actual incident.

**Independent Test**: Deliberately reintroduce the pre-fix `write-evaluation` prompt shape (content
starting with `---` right after a blank line, no BEGIN/END markers) against the real fast-tier
model. The new atomic test fails, naming the exact byte mismatch, in under the time and cost of one
`agent()` call — no fixture service, no scratch dir, no other agent calls. Revert; it passes.

**Acceptance Scenarios**:

1. **Given** a write prompt whose content begins with a markdown-collision-prone character
   (`-`, `#`, `` ` ``, `*`) immediately after the instruction's trailing blank line, **When** the
   atomic test runs it against the real fast-tier model, **Then** it asserts the written content is
   byte-identical to the intended payload — first line included — and fails with the actual-vs-
   expected diff if not.
2. **Given** the same prompt wrapped in `BEGIN-CONTENT`/`END-CONTENT` markers, **When** the test
   runs, **Then** it passes, proving the fix's mechanism (not just its absence-of-symptom) is what
   closes the gap.
3. **Given** the test suite runs unattended, **When** a developer asks "is this still fixed" months
   from now, **Then** the answer costs one real fast-tier call — not a live session.

---

### User Story 2 - Fix the two at-risk call sites the audit found beyond F4 (Priority: P2)

The audit (above, completed at spec time) found two more call sites sharing F4's exact boundary
shape — both `write-run-summary` prompts, in `fit-screen.js` and `intake-normalize.js` — that have
not yet failed only because their content's first line happens to be safe today, not because
anything guarantees it.

**Why this priority**: F4 was found by accident (a live session run happened to hit it on 2 of 9
records, on the one site that happened to have risky content). The audit shows the same shape
exists at two more sites that have simply not yet been exercised with unsafe content. Fixing only
the instance already hit leaves the class open at the other two.

**Independent Test**: Both `write-run-summary` prompts (audit #2, #3) wrapped in
`BEGIN-CONTENT`/`END-CONTENT` markers matching #1's already-shipped fix, each with its own
FR-001-style atomic test passing.

**Acceptance Scenarios**:

1. **Given** audit sites #2 and #3, **When** the marker fix lands, **Then** each gets its own
   atomic test (US1's pattern) proving byte-exact output, run against the real model.
2. **Given** the four out-of-class sites (#4-#8) recorded with reasons, **When** this story is
   scoped, **Then** none of them are touched — this spec does not invent new risk where the audited
   shape doesn't apply.

---

### User Story 3 - Make BEGIN/END-CONTENT the default shape for new verbatim-write prompts (Priority: P3)

Future write prompts (007 or any later feature) should not have to rediscover this failure mode.

**Why this priority**: Lowest priority because it blocks nothing today — it's a house-style
convention, not a runtime fix — but without it the class can reopen the next time someone adds a
new full-file-overwrite prompt.

**Independent Test**: A short, linkable convention note (e.g. a `contracts/verbatim-write.md` or a
constitution/README addendum) exists, is referenced from `fit-screen.js`'s and
`intake-normalize.js`'s module header comments, and a lightweight structural pin (mirroring 005's
`hasRawSettingsPassthrough`-style pins in `support/structure.mjs`) checks that every "write this
exact content" style prompt in both scripts uses the marker convention — catching a future
regression at the free, node-only tier even before US1's atomic test would.

**Acceptance Scenarios**:

1. **Given** a new verbatim-write prompt added without BEGIN/END markers, **When** the structural
   pin runs (free, `npm run harness`), **Then** it fails, naming the offending call site — before
   anyone needs to run a live session to find out the hard way.

### Edge Cases

- A call site's content is dynamically generated and could sometimes start with a safe character and
  sometimes a collision-prone one (e.g. `renderSummary`'s first line is currently always `Run
  <timestamp>`, but nothing enforces that) — treat any call site whose content shape is not
  *structurally guaranteed* safe as at-risk, not just ones observed failing.
- The atomic test itself costs a real (if fast-tier, cheap) model call — this spec does not claim
  zero cost, only "far cheaper than a full session run"; keep the atomic suite's total call count
  small and deliberate, consistent with 003-eval-harness's Tier 2 cost posture (cents, not dollars).
- A future model version might not exhibit this exact failure — the atomic test proves the prompt
  is *defended*, not that the underlying ambiguity can never resurface differently; keep the
  BEGIN/END convention even if the atomic test stays green for a long stretch.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: An atomic (single real fast-tier `agent()` call, no fixture service, no full pipeline)
  test MUST exist that exercises `fit-screen.js`'s `write-evaluation` prompt shape (audit #1) and
  asserts byte-exact output including the leading front-matter delimiter — regression-proofing F4.
- **FR-002**: DONE at spec time (see Audit findings above) — 8 call sites enumerated and classified:
  3 at-risk (#1 fixed/needs test only, #2/#3 need both fix and test), 4 out-of-class with reasons.
  Planning starts directly from this table; no further discovery needed.
- **FR-003**: Audit sites #2 (`fit-screen.js:922` `write-run-summary`) and #3
  (`intake-normalize.js:841` `write-run-summary`) MUST get the `BEGIN-CONTENT`/`END-CONTENT`
  treatment (matching #1's already-shipped fix) and a matching FR-001-style atomic test each — even
  though neither has an observed failure, both share #1's exact boundary shape (spec Edge Cases:
  "not structurally guaranteed safe" counts as at-risk).
- **FR-004**: A free, node-only structural pin (extend `tests/harness/support/structure.mjs`'s
  existing pin convention, e.g. `hasRawSettingsPassthrough`) MUST check that all three at-risk call
  sites (#1/#2/#3) use the marker convention, so a future regression there — or a new verbatim-write
  prompt added without markers — is caught before a live session is needed. Out-of-class sites
  #4-#8 get no pin (nothing to check). The check is a literal string match against the
  prompt-builder function's source text for both `BEGIN-CONTENT` and `END-CONTENT` markers — a
  static source-text check, not an AST parse or runtime execution, matching the existing pins'
  style and cost.
- **FR-005**: This spec MUST NOT change any scoring, verdict, verification, or persistence
  semantics — it is testing and prompt-formatting hardening only, matching 006's "no new pipeline
  behavior" discipline for anything touching production code paths.
- **FR-006**: A short, linkable convention note (e.g. `contracts/verbatim-write.md`) MUST exist
  documenting the BEGIN-CONTENT/END-CONTENT marker convention, and MUST be referenced from both
  `fit-screen.js`'s and `intake-normalize.js`'s module header comments — the human-readable half of
  US3, alongside FR-004's structural pin.

### Key Entities

- **Verbatim-Write Call Site**: One `agent()` call whose prompt instructs a full-content write or
  overwrite. Attributes: file (script + line), agent type/tier, typical/possible leading content
  character, current guard state (none / BEGIN-END markers / structurally-safe-by-construction).
- **Atomic Write-Fidelity Test**: A single-call, no-fixture-service test that sends one
  verbatim-write prompt to the real model and asserts byte-exact output — the new test tier this
  spec introduces, one level cheaper than 005's session-backed `--assert` runs.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The F4 regression (dropped leading `---`) is caught by an atomic test costing one
  real model call, not a full session run — verified by deliberately reverting the BEGIN/END fix
  and confirming the atomic test (not a session run) is what catches it.
- **SC-002**: 100% of verbatim-write call sites in `fit-screen.js` and `intake-normalize.js` are
  classified (FR-002); zero left unaudited.
- **SC-003**: Every at-risk call site from the audit carries both the marker fix and an atomic test
  — zero at-risk sites left unguarded.
- **SC-004**: The structural pin (FR-004) runs inside `npm run harness`'s existing free node-layer
  suite — no new cost tier for that layer.

## Assumptions

- The atomic tests from US1 need real (if inexpensive) model calls — they are NOT part of the
  existing zero-live-dependency `npm run harness` node suite, matching 003-eval-harness's own
  Tier 1 (free) vs Tier 2 (cheap, real calls) split; this spec's new tier sits alongside, not inside,
  005's existing harness. Concretely: a new folder (e.g. `tests/fidelity/`, mirroring
  `tests/harness/` naming) with its own `npm run test:fidelity` script, invoked separately from
  `npm run harness`.
- No new pipeline behavior — this is purely testing/prompt-formatting hardening on already-shipped
  006 behavior (Assumption carried from 006's own discipline).
- `intake-normalize.js`'s call sites are in scope for the audit (FR-002) even though its own fixes,
  if any are found at-risk, are a smaller addendum than fit-screen.js's — feature 001 predates this
  finding and was never audited for it.
- **Branch dependency**: this spec branches from `main`, which does not yet contain 006's F4 fix
  (that work lives on `006-fit-screen-gap-fixes`, commit `66c8e32`, not yet merged/PR'd at spec
  time). Audit line numbers for `fit-screen.js` (#1, #2, #4, #5, #7) are as of that commit.
  **Implementation (planning onward) should happen after 006 merges to `main`, or by rebasing this
  branch onto 006's branch** — building US1's atomic test against #1 requires the BEGIN/END fix to
  already exist to test against.
