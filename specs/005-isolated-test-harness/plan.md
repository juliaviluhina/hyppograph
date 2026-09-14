# Implementation Plan: Isolated Test Harness

**Branch**: `005-isolated-test-harness` | **Date**: 2026-09-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/005-isolated-test-harness/spec.md`

## Summary

Build a zero-live-dependency test harness for feature 004's verify-then-score flow: a local
fixture REST service serving ATS posting-API scenarios, per-worker contract tests for every bounded
worker, a one-command full-flow run against a scratch copy of the synthetic data dir, and a labelled
regression case per 004 historical run (1–9). One additive, behavior-preserving seam makes routing
possible: an `ATS_API_BASE_OVERRIDES` host→origin map (empty by default; production byte-identical
without it). The known T024 idempotency gap stays red-by-design; its fix owns to 006.

## Technical Context

**Language/Version**: Node.js ≥ 20 (same as repo; `node:test`, `node:http` — stdlib only)

**Primary Dependencies**: None — `package.json` has zero dependencies and this feature keeps it
that way. Fixture service is `node:http`; tests are `node:test`; file ops are `node:fs`.

**Storage**: Flat files under `tests/harness/` (service + runner + contracts-as-fixtures) and a
scratch data dir copied per run (never the committed `tests/fixtures/data-dir` in place, so
committed fixtures stay stable and idempotency assertions measure only the run under test).

**Testing**: `node:test` directly (004's plan already named this pattern for pre-003 component
tests). New script `npm run harness` (service lifecycle + full matrix); `npm test` stays as-is.

**Target Platform**: Developer machine (macOS/Linux), loopback networking only.

**Project Type**: Single-project build-time tooling (same repo; this feature adds test
infrastructure, not pipeline logic).

**Performance Goals**: Full cycle (service start → all cases → stop) under 10 minutes on a
developer machine (spec SC-001); per-worker cases run in seconds.

**Constraints**:
- Zero non-loopback network contact in every case (spec FR-005); enforced by assertion, not trust.
- No production judgment/state logic changes: scoring, verdict roll-up, citation rules, and
  application-state reconciliation are untouched. The single exception is the additive routing seam
  below, which is behavior-preserving when unconfigured.
- All fixture content fabricated (Constitution Principle V; spec FR-010).

**Scale/Scope**: ~6 fixture Job Records (004's matrix) + 4 ATS scenarios + ~15 test cases. No new
persistent store, no CI gate (same posture as 004 Phase A: local runs by hand).

**The one seam (research.md R2)**: `buildAtsApiUrl` (`fit-screen.js:786-793`) keys board detection
on production hostnames, so a loopback fixture service cannot be reached through it unchanged. This
feature adds an `ATS_API_BASE_OVERRIDES` host→origin map (e.g.
`{"boards-api.greenhouse.io":"127.0.0.1:PORT"}`), read from args/env alongside the existing
`HYPPO_PACING_MS`/`HYPPO_FETCH_CAP` routing config. Empty/absent map ⇒ URLs byte-identical to
today. This is routing configuration in the same category as the pacing reuse (004 FR-002d), not a
test-only branch: no verdict, mark, or persistence path consults it.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | This feature | Status |
|---|---|---|
| **I. Deterministic, Code-Driven Orchestration** | Harness runner is plain code sequencing service-start → cases → report. No model decides test flow; production orchestration untouched. | PASS |
| **II. Right-Tier Model Usage** | Harness adds no model calls of its own; worker-contract cases invoke existing workers at their existing tiers. | PASS |
| **III. Evidence-Backed, Decision-Ready Output** | Regression cases assert citations resolve (verbatim-echo, raw-passthrough, non-blocking-audit) — the harness enforces III, it doesn't bypass it. | PASS |
| **IV. The Human Owns the Last Mile** | Fixture service serves GETs on loopback only; no new outbound capability is granted to any worker. Per-worker verify tests keep `WebFetch`-only grant, pointed at loopback. | PASS |
| **V. Local Files Are the Only State** | Scratch data dir per run; committed fixtures never mutated in place; all fixtures fabricated; harness report is a file under `tests/harness/`. The override map carries no personal data. | PASS |
| **Architectural Boundaries** | No UI, no authenticated session, no new runtime service in production. The fixture service is build-time test tooling (same standing as 004's dynamic workflows). | PASS |
| **Development Workflow** | Spec-driven (`spec.md` → this plan), work lands via PR. | PASS |

No violations. **Complexity Tracking stays empty.**

## Project Structure

### Documentation (this feature)

```text
specs/005-isolated-test-harness/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── fixture-service.md    # endpoints, scenario map, access-log assertion
│   ├── worker-contract.md    # per-worker case format: input, schema + role rule
│   ├── expected-matrix.md    # synthetic data dir contents + expected verdicts/flags
│   └── harness-report.md     # report format, exit-code rule, expected-red handling
└── tasks.md             # Created by /speckit-tasks (NOT in this phase)
```

### Source Code (repository root)

```text
tests/harness/
├── service.mjs          # node:http fixture REST service (ATS scenarios + access log)
├── run.mjs              # one-command runner: scratch dir → cases → report
├── worker-cases/        # per-worker contract cases (node:test)
├── regression-cases/    # run-1–9 regression cases incl. red-by-design idempotency
└── support/             # scratch-dir copy, port mgmt, network assertion helpers

tests/fixtures/
├── data-dir/            # EXTENDED, not rewritten: ATS-shaped sourceRefs stay production-
│                        #   faithful; loopback routing comes only from the override map
└── live/                # UNCHANGED (kept for the manual live smoke check; harness never uses it)
```

**Structure Decision**: Harness lives under `tests/harness/` (new), beside `tests/fixtures/`
(extended) — not under `evals/` (feature 003's harness is still scaffold-only; this feature does
not block on it, same stance as 004 research.md R8). The one production touch
(`ATS_API_BASE_OVERRIDES` in `.claude/workflows/fit-screen.js`) is a routing-config read at the
existing URL-construction site, defaulting to today's behavior.

## Complexity Tracking

> No Constitution Check violations. Section intentionally empty.
