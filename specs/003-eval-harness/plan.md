# Implementation Plan: Pipeline Eval Harness

**Branch**: `003-eval-harness` | **Date**: 2026-09-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-eval-harness/spec.md`

## Summary

Stand up a layered eval harness for the intake & normalize pipeline (feature 001) so component
defects are caught at the cheapest layer that can express them, integration is gated on a small
fully-understood synthetic dataset with an idempotency check, model choice and spend stay under
explicit human control, and every run leaves committed evidence.

Technical approach: plain Node (`node:test`) for the free component layer; the existing Claude Code
`Workflow` tool as the default substrate for the model-backed layers (subscription-billed, ~$0 to the
user); a non-Claude model (the developer's GPT Luna access, off the Anthropic meter) for the two
rubric-graded judge assertion types; a standalone metered substrate built only as a final,
credit-approval-gated milestone. Feature 001's inline `agent()` helper logic and prompt text move into
shared modules under `.claude/workflows/lib/`; because the workflow sandbox forbids `import`, the
workflow keeps a marker-delimited inlined copy and a byte-identity guard test catches drift.

## Technical Context

**Language/Version**: Node.js ≥ 20 (built-in `node:test`, `node:assert`, global `fetch`), ESM
(`.mjs`). No transpile step.

**Primary Dependencies**:
- Component layer: none (Node built-ins only).
- Model-backed layers, default substrate: the Claude Code `Workflow` tool (already present) driving
  `.claude/workflows/intake-normalize.js`.
- Judge: a non-Claude model client (developer's GPT Luna access) — a thin `fetch` wrapper, credential
  from environment.
- Final milestone only, gated: `@anthropic-ai/claude-agent-sdk` for the standalone metered substrate.
  Not installed until the FR-020 decision point.

**Storage**: local files only (constitution V). Fixtures under `tests/`; committed expected-output
tree under `tests/synthetic/expected/`; eval reports and index under `docs/eval-reports/`;
credentials outside the repo tree (gitignored `.env`, keychain, or shell profile), repo carries only
`.env.example` placeholders.

**Testing**: `node --test evals/component/` for the free layer. The per-component and integration
layers are their own runner scripts under `evals/` invoked through `evals/run.mjs`; each writes a
report as its last step.

**Target Platform**: the developer's macOS/Linux workstation, manual invocation. No hosted runtime.

**Project Type**: single project — build-time developer tooling / CLI scripts. Does not relax
constitution Principle I (which governs HyppoGraph's runtime, not its build tools).

**Performance Goals**:
- Component layer: whole suite < 5 s, zero model calls, zero network (SC-001).
- Integration gate: the full collect→triage→normalize flow over ~8 synthetic postings, roughly
  90–100 `agent()` calls, ~10–12 min on the `Workflow` substrate.
- Routine re-check cost after a change trends to zero (component layer only) (SC-004).

**Constraints**:
- No network in the component or integration layers; the synthetic dataset is hermetic and collection
  over it resolves to nothing (FR-006).
- No push-triggered, scheduled, or unattended job runs a metered eval; only the free component layer
  may run unattended (FR-018).
- Every metered run requires an explicit per-invocation confirmation flag; without it the command
  prints an estimate and exits without a paid call (FR-014).
- A per-run spend ceiling aborts the run before it is exceeded and records a partial result (FR-015).
- Credentials are read from the environment only, never prompted, never passed as a CLI argument
  (FR-016); never written to any report, log, or the provenance log (FR-012).
- The system under test stays on the fast tier; evals must not change its tier (FR-009).

**Scale/Scope**: ~8-posting synthetic integration dataset (one instance of each of the 5 known
failure modes + a manual-drop file + a non-posting file); 4 model-backed subtasks under
per-component eval (pre-triage keep/reject, field extraction, record enumeration, source-list
parsing); ~5 groups of pure helpers (key derivation, slug/hash, set-folding, summary rendering,
criteria fingerprint + completeness rule + tracked-search→source map). Scoped to feature 001 only;
built to extend to later pipeline steps but no later step is specified here (FR-022).

## Constitution Check

*GATE: evaluated against `.specify/memory/constitution.md`.*

| Principle | Gate | Status |
|---|---|---|
| I. Deterministic, code-driven orchestration | The harness is plain code with fixed control flow; no self-directing agent loop. Model calls happen only inside a step of the system under test, unchanged by this feature. Build-time tooling carve-out (Development Workflow) also applies. | **PASS** |
| II. Right-tier model usage | System under test stays on the fast tier (FR-009). The judge role is a declared, deliberate non-Claude choice limited to two rubric-graded assertion types (FR-010/010a); everything else is deterministic. No tier escalation. | **PASS** |
| III. Evidence-backed, decision-ready output | Every eval run emits a dated report with methodology, version/model/fixture provenance, a per-case pass/fail table, failure diffs, and a measured cost (FR-011); the index doubles as a spend ledger (FR-013). | **PASS** |
| IV. The human owns the last mile | No outward-facing action. Every metered run is a human-typed command carrying a confirmation flag (FR-014); a spend ceiling bounds it (FR-015); real spend is committed at exactly one recorded decision point (FR-020, FR-023). | **PASS** |
| V. Local files are the only state; no personal data in repo/logs/telemetry | In-repo fixtures and expected trees are synthetic (FR-003, Assumptions). Live/real runs use scratch locations outside the repo (US2 scenario 4). Credentials live outside the repo tree; repo carries only placeholder names (FR-017). No credential or personal data in any report or the provenance log (FR-012, SC-007). | **PASS** |
| Development Workflow — branch per spec + PR | Developed on `003-eval-harness`, lands on `main` via PR at milestone boundaries (Assumptions). | **PASS** |
| Development Workflow — CI expectation | This feature deliberately runs **no** CI / triggered / scheduled job for any metered layer, indefinitely (FR-018). Recorded as a justified entry in Complexity Tracking. | **PASS with justification** |
| Architectural Boundaries — "stack is TypeScript on the Claude Agent SDK" | That clause governs HyppoGraph's **runtime**. This harness is build-time developer tooling (Development Workflow carve-out) written in plain Node ESM (`.mjs`, no transpile) so the free layer can use the built-in `node:test` runner with zero runtime deps. It adds no runtime service, datastore, or Agent-SDK coupling; the standalone metered substrate at the gated FR-023 milestone is the only place `@anthropic-ai/claude-agent-sdk` appears, in `devDependencies`. | **PASS** |

No unjustified violations. Re-checked after Phase 1 design: no change — the design adds only plain
Node scripts, synthetic fixtures, shared modules with a drift guard, and committed Markdown reports.

## Project Structure

### Documentation (this feature)

```text
specs/003-eval-harness/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── evals-cli.md         # the `evals/run.mjs` command surface + exit codes + spend-control behaviour
│   ├── eval-report.md       # report file schema + index-row schema
│   ├── expected-tree.md     # integration-gate expected-output tree layout
│   ├── prompt-module.md     # shared prompt/helper module interface + workflow inlined-copy + drift guard
│   └── judge-rubric.md      # judge rubric file format + judge request/response contract
├── eval-strategy.md     # companion design notes — moved here from specs/001-… during this plan (FR-021)
└── tasks.md             # /speckit-tasks output — NOT created here
```

### Source Code (repository root)

```text
evals/
├── run.mjs                  # CLI entry: dispatch a layer, enforce confirmation + ceiling, write the report
├── component/               # free layer — pure logic, node:test, $0, no network
│   ├── keys.test.mjs            # titleKey / companyKey / dedup-key assembly / slug / stableHash
│   ├── folding.test.mjs         # foldSet, set-folding, summary rendering, bumpReason, provenanceLine
│   ├── criteria.test.mjs        # criteriaFingerprint, noTriageCriteria, effectiveExcludedLocations, completeness rule
│   ├── sources.test.mjs         # trackedBoards → sources map
│   └── drift.test.mjs           # byte-identity guard: lib modules vs. the workflow's inlined copies
├── per-component/           # model-backed subtask evals, one subtask in isolation
│   ├── enumerate.mjs            # point hyppo-read at a synthetic raw/ dir → assert exact record set
│   ├── pre-triage.mjs           # keep/reject + reason bucket, N-run stability, judge: reason soundness
│   ├── extraction.mjs           # field extraction, locationBucket vocabulary + N-run stability, judge: faithfulness
│   ├── source-list.mjs          # source-list parsing from a saved fixture
│   ├── fixtures/                # per-subtask fixture tables: input + deterministic expected
│   └── rubrics/                 # judge rubric files (one per judge-graded assertion type)
├── integration/            # full flow over the synthetic dataset
│   ├── gate.mjs                # copy tests/synthetic → scratch, run the workflow, diff vs. expected/
│   └── idempotency.mjs         # second run over the same scratch: no new writes, provenance byte-identical
└── lib/
    ├── report.mjs              # assemble + write a dated report; append the index row
    ├── spend.mjs               # confirmation flag + per-run ceiling guard + cost estimate/measure
    ├── judge.mjs               # non-Claude judge client: (rubric, sample) → pass/fail per criterion
    └── mock-agent.mjs          # deterministic fixture-canned agent() for plumbing debug (no model)

.claude/workflows/
├── intake-normalize.js     # EDITED: inline helper bodies + agent() prompt text replaced by
│                           #   marker-delimited copies generated from lib/ ; behaviour unchanged
└── lib/
    ├── intake-core.mjs        # NEW: extracted pure helpers (source of truth; imported by evals/component)
    └── prompts.mjs            # NEW: extracted agent() prompt text (source of truth; imported by evals/per-component)

tests/
├── fixtures/data-dir/      # UNCHANGED — existing 16-record fixture, kept for occasional full runs
├── fixtures/live/          # UNCHANGED — live-smoke settings
└── synthetic/             # NEW — hermetic ~8-posting integration dataset
    ├── data-dir/               # pre-seeded raw-*.md + inputs/ + settings.json with non-resolving board URLs
    └── expected/               # committed expected-output tree: Job Records, companies.md, last-run-summary.md, provenance-log.md

docs/eval-reports/
├── README.md              # index table = spend ledger (date, scope, result, cost, commit)
└── NNNN-YYYY-MM-DD-<scope>.md   # one per run; <scope> ∈ component | eval-<subtask> | integration | integration-idem | live-smoke

package.json               # NEW — private, "type":"module", scripts for the free layer only; no runtime deps
.env.example               # EDITED — add placeholder names for the judge credential (and, later, the metered substrate)
```

**Structure Decision**: Single project. A new top-level `evals/` tree holds the harness (runner,
four layer directories, shared lib). Shared source-of-truth modules live beside the workflow they
serve under `.claude/workflows/lib/`. Synthetic fixtures and their committed expected tree live under
`tests/synthetic/`, leaving the existing `tests/fixtures/` untouched. Evidence lives under
`docs/eval-reports/`. This matches the layers and entities in the spec and the four-directory shape
keeps each eval layer independently runnable.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| No CI / no triggered or scheduled job for any metered eval layer, indefinitely (against the constitution's general Phase-B CI expectation) | An automated trigger can spend real money on a run the user did not start and cannot easily stop; the whole point of the layered approach is that spend stays deliberate and human-initiated (FR-018, US3). | A manual-dispatch-only job with a spend-cap secret was considered (eval-strategy §6.3) and left explicitly out of scope: it still adds a spend surface outside the developer's terminal for no benefit at this stage. The free component layer *may* run unattended — it touches no model. |
| Pipeline helper logic and prompt text exist in two places — a shared `lib/` module (source of truth) and a marker-delimited inlined copy in the workflow | The workflow sandbox forbids `import` (`// no imports in the sandbox`), so the `Workflow`-tool runtime cannot consume the module directly; the evals need the real helpers and the real prompts, not a hand-copy. | Keeping helpers only inline blocks the free component layer entirely (bugs 3–5 would stay full-run-only). A build step that regenerates the whole workflow file was rejected as heavier than a byte-identity guard test (`evals/component/drift.test.mjs`) that fails on any divergence. |
