# Implementation Plan: Write-Fidelity Guardrails

**Branch**: `007-write-fidelity-guardrails` | **Date**: 2026-09-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-write-fidelity-guardrails/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Guard against "write-fidelity drift" — a fast-tier `agent()` call silently dropping a leading
delimiter character (`---`, `#`, `` ` ``, `*`) when a verbatim-write prompt's instruction text
butts up against the content's own opening line (006's F4 incident). Three at-risk call sites were
identified by a completed audit (#1 `write-evaluation`, #2/#3 `write-run-summary` in both
workflows); #1 is already fixed on 006. This plan: (1) apply the same `BEGIN-CONTENT`/`END-CONTENT`
marker fix to #2/#3, (2) add a new Tier-2 test class — one real fast-tier `agent()` call per
at-risk site, no fixture service, no full pipeline — under `tests/fidelity/` + `npm run
test:fidelity`, (3) add a free node-only structural pin (extending
`tests/harness/support/structure.mjs`) checking all three sites for the marker convention, and
(4) document the convention in a new `contracts/verbatim-write.md`, referenced from both
workflow scripts' module headers.

## Technical Context

**Language/Version**: Node.js (ESM, `"type": "module"`), runtime tested on v26.8.1; no build step.

**Primary Dependencies**: None beyond Node's `node:test`/`node:assert` (existing `tests/harness`
convention) and the `claude` CLI (`claude -p`) to invoke the Workflow tool for the new Tier-2
tests — see research.md R1 for why a real `agent()` call cannot be made from a bare Node process.

**Storage**: Files only — each atomic test targets one throwaway temp file (`fs.mkdtempSync` + one
filename), not a scratch-copied fixture directory (spec US1: "no fixture service, no scratch dir").
No new persistent storage (FR-005).

**Testing**: Two tiers, both new-to-this-spec structure but existing-to-the-repo pattern: (1) a
free, node-only structural pin extending `tests/harness/support/structure.mjs`, run via the
existing `npm run harness`; (2) a new Tier-2 atomic-fidelity suite under `tests/fidelity/`, run via
new `npm run test:fidelity` (Clarifications, 2026-09-14) — one real fast-tier `agent()` call per
in-class site, matching 003-eval-harness's Tier 2 (cheap, real calls) cost posture.

**Target Platform**: Developer's local machine / CI running this repo's build-time tooling — not
part of HyppoGraph's own runtime pipeline (this spec touches only prompt text and test tooling).

**Project Type**: Single project — build-time developer tooling for an existing pipeline
(`.claude/workflows/*.js`), matching the repo's existing `tests/harness` structure.

**Performance Goals**: N/A (test tooling, not a runtime path). Per-test cost/latency governed by
SC-001's "one real model call, not a full session run" and the Edge Cases' "cents, not dollars."

**Constraints**: FR-005 — no scoring/verdict/verification/persistence semantics change; changes are
confined to prompt-builder text, a new test tier, and documentation.

**Scale/Scope**: 3 in-class call sites (audit #1/#2/#3), 3 new atomic tests, 1 structural pin
extension, 1 new convention doc. 4 out-of-class sites (#4–#8) explicitly untouched.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Deterministic, Code-Driven Orchestration** — PASS. No control-flow change; the atomic tests
  and structural pin are outside the pipeline's own control flow entirely (build-time tooling), and
  the marker-fix change to #2/#3's prompts does not alter what runs next, only what text a
  `hyppo-readwrite` call is asked to transcribe.
- **II. Right-Tier Model Usage** — PASS. The new atomic tests reuse the target call sites' existing
  tier (`FAST`/`hyppo-readwrite`) — no tier is escalated or downgraded; this spec adds no new
  production `agent()` calls at all (FR-005).
- **III. Evidence-Backed, Decision-Ready Output** — N/A. This spec touches no scored-match output.
- **IV. The Human Owns the Last Mile** — PASS. No outward-facing action; test tooling only.
- **V. Local Files Are the Only State** — PASS. Atomic tests write only to a single throwaway temp
  file (never `HYPPO_DATA_DIR` or the committed fixture), deleted after each run; no new persistent
  state anywhere.

No violations. Complexity Tracking left empty.

**Post-Phase-1 re-check**: Unchanged — research.md's R1 decision (a `.workflow.js` script per
atomic test, invoked via `claude -p`) still respects Principle I: each atomic-test workflow script
is a fixed, single-`agent()`-call sequence with no branching, and it is dev tooling, not part of
HyppoGraph's own runtime pipeline (constitution's Development Workflow section explicitly carves
out "Claude Code dynamic workflows" as a build-time tool). PASS, unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/007-write-fidelity-guardrails/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/
│   ├── atomic-fidelity-test.md   # Phase 1 output — Tier-2 test shape (FR-001, FR-003)
│   └── verbatim-write.md         # Phase 1 output — the marker convention itself (FR-006)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

Single project — build-time developer tooling for an existing pipeline, matching the repo's
existing `tests/harness` layout.

```text
.claude/workflows/
├── fit-screen.js            # #1 write-evaluation (marker fix already shipped, 006),
│                             # #2 write-run-summary (marker fix, FR-003)
└── intake-normalize.js      # #3 write-run-summary (marker fix, FR-003)

tests/
├── harness/
│   └── support/
│       └── structure.mjs    # extended: new pin(s) for #1/#2/#3 marker convention (FR-004)
└── fidelity/                 # NEW — Tier-2 atomic write-fidelity tests (FR-001, FR-003)
    ├── write-evaluation.workflow.js       # #1 regression test's workflow half
    ├── write-evaluation.test.mjs          # #1 regression test's Node assertion half
    ├── write-run-summary-fit-screen.workflow.js
    ├── write-run-summary-fit-screen.test.mjs
    ├── write-run-summary-intake.workflow.js
    └── write-run-summary-intake.test.mjs

specs/007-write-fidelity-guardrails/contracts/verbatim-write.md   # FR-006 convention doc
```

**Structure Decision**: Single project, no new top-level directory beyond `tests/fidelity/`
(sibling to the existing `tests/harness/`, matching its `.workflow.js` + `.test.mjs` split per
contracts/atomic-fidelity-test.md). `package.json` gains one script: `test:fidelity`. No changes
to `src/`-shaped layout — this repo has no `src/`; the analogous production code is
`.claude/workflows/*.js`, edited in place for the marker fix only.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
