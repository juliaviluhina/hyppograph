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

### User Story 2 - Audit every other verbatim-write prompt for the same collision shape (Priority: P2)

Beyond the one call site 006 fixed, find every other prompt in `fit-screen.js` and
`intake-normalize.js` that asks a fast-tier agent to transcribe content verbatim, and determine
which share the same "blank line then content" boundary shape that made F4 possible.

**Why this priority**: F4 was found by accident (a live session run happened to hit it on 2 of 9
records). The same shape exists at other call sites that have simply not yet been exercised with
content starting in a collision-prone character. Fixing only the one instance already hit leaves
the class open.

**Independent Test**: A completed audit table (this spec's Key Entities) enumerating every
"write this exact content" and "write this exact text" call site in both workflow scripts, its
current content shape, and whether it is at-risk, already-guarded, or out-of-class (e.g. a
single-line append, or a patch to an existing file rather than a full overwrite).

**Acceptance Scenarios**:

1. **Given** the audit table, **When** a call site's typical content could plausibly start with a
   collision-prone character (even if it happens not to today), **Then** it gets the same
   `BEGIN-CONTENT`/`END-CONTENT` treatment as a defensive measure, and a matching atomic test from
   US1.
2. **Given** a call site that only ever appends one line or patches an existing file's front-matter
   keys in place, **When** the audit classifies it, **Then** it is recorded out-of-class with the
   reason (this spec does not invent new risk where the shape doesn't apply).

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
  test MUST exist that exercises `fit-screen.js`'s `write-evaluation` prompt shape and asserts
  byte-exact output including the leading front-matter delimiter — regression-proofing F4.
- **FR-002**: A completed audit (Key Entities: Verbatim-Write Call Site) MUST enumerate every
  "write this exact content/text" and "APPEND exactly one line" call site in both
  `.claude/workflows/fit-screen.js` and `.claude/workflows/intake-normalize.js`, classified
  at-risk / already-guarded / out-of-class with a stated reason for each.
- **FR-003**: Every call site FR-002 classifies at-risk MUST get the `BEGIN-CONTENT`/`END-CONTENT`
  (or equivalent unambiguous-boundary) treatment and a matching FR-001-style atomic test.
- **FR-004**: A free, node-only structural pin MUST check that every verbatim-write prompt in both
  scripts uses the marker convention, so a future regression is caught before a live session is
  needed.
- **FR-005**: This spec MUST NOT change any scoring, verdict, verification, or persistence
  semantics — it is testing and prompt-formatting hardening only, matching 006's "no new pipeline
  behavior" discipline for anything touching production code paths.

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
  005's existing harness.
- No new pipeline behavior — this is purely testing/prompt-formatting hardening on already-shipped
  006 behavior (Assumption carried from 006's own discipline).
- `intake-normalize.js`'s call sites are in scope for the audit (FR-002) even though its own fixes,
  if any are found at-risk, are a smaller addendum than fit-screen.js's — feature 001 predates this
  finding and was never audited for it.
