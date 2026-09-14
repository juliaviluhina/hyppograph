# Implementation Plan: Fit-Screen Gap Fixes

**Branch**: `006-fit-screen-gap-fixes` | **Date**: 2026-09-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/006-fit-screen-gap-fixes/spec.md` + intake
(`intake.md`: T024 red, F1 wire answer, F2 summary-ack bug, F3 mitigated).

## Summary

Fix what the 005 harness proves broken in 004's verify-then-score flow, with no new
pipeline behavior. Three work items: (1) skip-when-unchanged scoring via a code-owned
**input fingerprint** stored on each evaluation (T024/FR-009 — turns the harness's
expected-red green); (2) ack-checked, single-writer summary persistence (F2 — the
`write-run-summary` `{written:false}` silent drop); (3) close-out debt — matrix-vs-
transport scoping decision, throughput smoke, B1/B2 exit review (US3). The F1 wire
answer (WebFetch upgrades `http→https`) needs no code — only the scoping decision.

## Technical Context

**Language/Version**: Same two substrates as 004/005 — Claude Code dynamic-workflow
JavaScript (constrained: no `import`, no direct fs/shell, frozen clock via `args`)
for production changes; Node.js ≥ 20 stdlib-only for harness/test changes.

**Primary Dependencies**: None (unchanged).

**Storage**: Same `HYPPO_DATA_DIR` files. This feature adds ONE front-matter field to
Fit Evaluations (`inputFingerprint`, research.md R1) and changes no other schema.
Committed fixtures stay immutable; session validation runs on scratch dirs.

**Testing**: Proof is the 005 harness itself — `npm run harness` must go all-`pass`
(zero `expected-red`), plus the session halves (`--prep`/`--assert`, flip, live
smoke). New `node:test` coverage only for the fingerprint helper's node mirror
(same verbatim-mirror + sync-check convention as 005's `pure.mjs`).

**Target Platform**: Developer machine + Claude Code session (same as 004 Phase A).

**Project Type**: Build-time workflow fix + test-assertion updates (same repo).

**Performance Goals**: Unchanged re-run skips the mid-tier `hyppo-score` call
entirely per record (fingerprint short-circuit before any model call) — strictly
faster and cheaper than today; SC-014 (100 records < 30 min) must still hold for a
fully-changed run.

**Constraints**:
- No new pipeline behavior: every diff traces to a harness red or a 004 validation
  task (spec FR-004). The fingerprint is routing-grade metadata, not judgment.
- The frozen-clock rule stands: `scoredAt`/delegation timestamps keep using
  `args.runTimestamp`; the fingerprint design must be immune to clock movement
  (research.md R1 — volatile fields excluded by construction).
- Model nondeterminism (rephrased notes across runs) must not defeat idempotency:
  the skip decision is a function of INPUTS only, never of regenerated prose.

**Scale/Scope**: ~3 production edits in `.claude/workflows/fit-screen.js`, 1 agent-type
change, 1 expectations/contract amendment, close-out validations. No new services.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | This feature | Status |
|---|---|---|
| **I. Deterministic, Code-Driven Orchestration** | Fingerprint computation, comparison, and the skip decision are plain code before any model call; summary ack-check/retry is code-owned control flow. No agent gains flow discretion. | PASS |
| **II. Right-Tier Model Usage** | Skipping unchanged records REMOVES mid-tier calls; adds none. No tier changes anywhere. | PASS |
| **III. Evidence-Backed, Decision-Ready Output** | Fingerprint is metadata alongside the cited evaluation, never a substitute; skipped records keep their full prior evaluation. | PASS |
| **IV. The Human Owns the Last Mile** | No new capabilities, no tool-grant changes (the R8 tool-grant option stays rejected). | PASS |
| **V. Local Files Are the Only State** | Fingerprint stored in the evaluation file itself (the state it describes); provenance appended only for real writes — skipped records write nothing, which IS the fix. Fixtures stay fabricated. | PASS |
| **Architectural Boundaries** | No UI/browser/session changes; stays in the dynamic-workflow build-time substrate. | PASS |
| **Development Workflow** | Spec-driven; lands via PR; every diff traces to a red or a validation task. | PASS |

No violations. **Complexity Tracking stays empty.**

## Project Structure

### Documentation (this feature)

```text
specs/006-fit-screen-gap-fixes/
├── plan.md              # This file
├── research.md          # Phase 0 output (R1 fingerprint design, R2 summary-write, R3 transport scoping)
├── data-model.md        # Phase 1 output (InputFingerprint, amended FitEvaluation/HarnessReport)
├── quickstart.md        # Phase 1 output (idempotency proof, genuine-change proof, close-out runs)
├── contracts/           # Phase 1 output
│   ├── eval-fingerprint.md      # fingerprint field format + computation rule
│   ├── summary-write.md         # ack-checked overwrite protocol (single writer)
│   └── harness-report-amendment.md  # `blocked` verdict for transport-unreachable cases
└── tasks.md             # Created by /speckit-tasks (NOT in this phase)
```

### Source Code (repository root)

```text
.claude/workflows/
└── fit-screen.js   # (1) fingerprint compute/compare/skip in score phase
                    #     (2) summary via hyppo-readwrite + ack check + one retry
tests/harness/
├── support/pure.mjs         # gains fingerprint helper (mirrored + sync-checked)
├── support/expectations.mjs # gains requiresWire / transport-blocked marking
├── support/assert.mjs       # honors it as `blocked` (not red, not green)
└── run.mjs                  # reports `blocked` separately; exit unaffected
```

**Structure Decision**: Fix in place in the workflow script (same file 004/005 already
touch); no new modules, no new directories. The harness learns one verdict value.

## Complexity Tracking

> No Constitution Check violations. Section intentionally empty.
