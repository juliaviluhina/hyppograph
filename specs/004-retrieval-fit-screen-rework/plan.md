# Implementation Plan: Retrieval Verification & Fit-Screen Rework

**Branch**: `004-retrieval-fit-screen-rework` | **Date**: 2026-09-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/004-retrieval-fit-screen-rework/spec.md`

## Summary

Add the next two steps of the HyppoGraph pipeline — **verify → score** — as a second dynamic
workflow that runs after feature 001's collect/pre-triage/normalize, reading its Job Records
read-only. `verify` re-checks each non-terminal Job Record's open status every run (a stateless ATS
posting-API signal, paced like feature 001's board collection); `score` runs a mid-tier, cited
fit evaluation against the user's evidence base for every confirmed-open/unresolvable, kept Job
Record — required-item table, hard-constraint gate, anti-pattern checks, one overall verdict on the
ported reference rubric's exact scale, and reconciled application state. Every step that can't
produce a clean result uses a fixed named-outcome vocabulary instead of free text. All logic is
ported as *structure* from the anonymized `hyppoplugins/plugins/job-search` reference
(`job-posting-retrieval`, `job-fit-screen`, `job-search-delegation`) into HyppoGraph's deterministic
Workflow-tool substrate — no interactive session, no new browsing.

**Delivered in the same two phases as feature 001** (see [Phasing](#phasing)), reusing its
substrate and subagent boundary rather than inventing a second one:

- **Phase A — extend the dynamic-workflow prototype.** A new script,
  `.claude/workflows/fit-screen.js`, with `phase("verify")` / `phase("score")` markers. Reuses
  feature 001's `hyppo-read` / `hyppo-readwrite` / `hyppo-judge` subagents; adds two new ones
  (`hyppo-verify`, `hyppo-score`) for the two capabilities feature 001 had no need for: a stateless
  public-API fetch, and a mid-tier cited-judgment call.
- **Phase B — optional port to the Claude Agent SDK.** Same decision point as feature 001: once
  Phase A is proven, either wrap `fit-screen.js` behind the SDK's `Workflow` tool (B1) or add
  `pipeline/verify.ts` + `pipeline/score.ts` modules beside feature 001's B2 layout (B2).

## Technical Context

### Shared across phases

**Storage**: Same `HYPPO_DATA_DIR` as feature 001 (Markdown + CSV, no database). This feature adds
`outputs/evaluations/**`, a new `inputs/evidence/` read location, and new/changed fields on the
existing Job Record file (see [data-model.md](./data-model.md) and
[contracts/job-record-amendments.md](./contracts/job-record-amendments.md)). No new persistent
store type.

**External dependencies**:
- **Feature 001's output** — Job Records under `outputs/job-records/`, read-only except for the
  amended fields this feature owns (`openStatus`, `openStatusCheckedAt`, `openStatusReason`,
  `applicationState`, replacing `alreadyApplied`).
- **The ATS posting APIs** (Greenhouse/Lever/Ashby), reached by a single stateless, unauthenticated
  `WebFetch` per re-check — never HyppoVisor, never a new browsing session (spec Assumption "No new
  browsing"). No dependency on feature 002; `inputs/settings.json` is extended in place (see
  [contracts/settings-additions.md](./contracts/settings-additions.md)).

**Model tiers**: **Fast** (Haiku-class) for the ATS re-check signal (`hyppo-verify`) and any FR-010
bounded delegated sub-task (`hyppo-judge`, reused from feature 001). **Mid** (per constitution
Principle II, "mid for scoring with cited evidence") for the actual scoring judgment
(`hyppo-score`) — required-item verdicts, hard-constraint evaluation, anti-pattern checks, overall
verdict, application-state reconciliation. No `top`-tier call in this feature (reserved for
downstream deliverable-generation steps, out of scope here).

**Performance Goals**: A run that verifies 100 non-terminal Job Records and scores the confirmed-
open/unresolvable subset completes within 30 minutes including FR-002d pacing — the same target
shape as feature 001's SC-009, applied to this feature's own step boundary (recorded as SC-014,
added to spec.md in this planning pass — see [research.md](./research.md) R7).

**Constraints**:
- No outward-facing actions (FR-014); only a stateless public-API `WebFetch` and file reads/writes
  are ever allow-listed.
- Orchestration control flow is code, never a model choosing the next step (Principle I) — same
  discipline as feature 001's workflow script.
- All writes land under `HYPPO_DATA_DIR`; the evidence base and applications tracker are read-only
  and never copied into the repo, logs, or telemetry (Principle V; spec's Golden Calibration Set
  assumption extends this to the external rubric-tuning set).
- `verify` (FR-002c) is **not** idempotent by design — it re-runs every time for non-terminal
  records — but MUST NOT write a duplicate mark/provenance entry when the signal is unchanged
  (FR-009). `score` and reconciliation remain idempotent in the ordinary sense.

**Scale/Scope**: Same order of magnitude as feature 001 — low-hundreds of Job Records per run,
accumulating over time; the evidence base is a handful of Markdown files, not a corpus.

### Phase A — dynamic workflow extension

**Substrate**: A second Claude Code dynamic workflow, `.claude/workflows/fit-screen.js`, run after
`intake-normalize.js` (`Workflow({scriptPath: ".../fit-screen.js", args: {...}})`), same sandbox
constraints as feature 001 (no `import`, no direct fs/shell, no ambient clock — pass `runTimestamp`
via `args`). Two `phase()` markers: `verify`, `score`.

- `verify` is a **serial `for` loop** (like feature 001's `collect`/`normalize`) — it mutates the
  open-status fields on an existing, shared Job Record file, so it needs the same in-place-merge
  safety as feature 001's normalize step.
- `score` uses **`pipeline()`** (like feature 001's `triage`) — each Job Record gets its own,
  disjoint new evaluation file; no shared-file race.

**New subagents** (`.claude/agents/`), alongside feature 001's `hyppo-read` / `hyppo-write` /
`hyppo-readwrite` / `hyppo-judge` (reused unchanged) and `hyppo-collect-*` (not used by this
feature):

| Agent | Tools | Tier | Role |
|---|---|---|---|
| `hyppo-verify` | `WebFetch` only | fast | One stateless GET against an ATS posting-API URL the *script* constructs from the Job Record's source reference; returns a raw signal (`found` / `not_found` / `http_error` / `unparseable`), never the final `open.unresolved`/`confirmed-*` disposition — the script maps the signal to the mark (mirrors the reference's `still_open_scan` boundary: a signal, not a disposition). |
| `hyppo-score` | `Read, Glob` | mid | Given exact evidence-file paths, the Job Record's fields, and the applications-tracker content (all named in the prompt), returns the full structured `FitEvaluation` judgment (§ data-model.md) in one call: per-item verdicts with citations, hard-constraint state, anti-pattern flags, overall verdict, application-state value. Never writes. |

FR-010's other bounded delegated sub-tasks (`extraction`, `normalization`, `evidence_match`,
`evaluation_critique`) reuse the existing zero-tool `hyppo-judge` (fast tier, input handed entirely
in the prompt) — no new agent type needed for those. Phase A concretely wires up **`citation_audit`**
as the one delegated post-check actually run every time a `score` call produces 2+ citations in the
same batch (mirroring the reference's "required when 2+ evaluations persisted in the same session
batch" rule) via `hyppo-judge`; the other task types are available through the same mechanism for a
later iteration but are not required to fire on every run.

**Persistence**: `hyppo-readwrite` (reused, unchanged) writes the amended Job Record fields, the new
Fit Evaluation file, the delegation log entries (inline in the Fit Evaluation front matter), and the
provenance-log lines — same single-writer discipline as feature 001.

**HyppoVisor**: Not used by this feature at all — confirmed by the spec's "No new browsing"
assumption. `hyppo-verify`'s `WebFetch` is the built-in tool, not an MCP call.

**Testing**: Manual validation against a new `tests/fixtures/data-dir/` extension (evidence files +
amended Job Records) inside a Claude Code session, plus the quickstart scenarios run by hand — same
posture as feature 001 Phase A. Feature 003's eval-harness *pattern* (component / integration-golden
/ spend-gated tiers) is the intended shape for this feature's own tests, but its `evals/` scaffolding
is directories only as of this plan (no `run.mjs`, no test files committed) — see research.md R8.
This feature does not depend on 003 being finished; it may implement `node:test` component tests
directly under `tests/unit/` (pure helpers: signal→mark mapping, verdict-tally logic,
application-state reconciliation rules) the same way, or fold into 003's harness once it exists.

### Phase B — Agent SDK port (optional, when Phase A is proven)

**Substrate**: Same TypeScript/Agent-SDK target as feature 001 Phase B. Adds, beside feature 001's
`src/pipeline/{collect,triage,normalize}.ts`:

```text
src/pipeline/
├── verify.ts   # per non-terminal Job Record: ATS-API WebFetch (or equivalent), signal→mark mapping, pacing (shares config with collect.ts)
└── score.ts    # per confirmed-open/unresolvable Job Record: mid-tier query() with evidence+tracker context → FitEvaluation; citation_audit delegation call
src/store/
└── evaluation.ts   # the only writer for outputs/evaluations/**
```

`model/judge.ts`'s tier map gains `mid` (e.g. a Sonnet-class alias); `verify.ts` reuses
`collect.ts`'s pacing helper rather than a second implementation (FR-002d).

**Testing (B2)**: `vitest`, same interface-fake pattern as feature 001 — `mcp/`-equivalent for the
ATS fetch, `model/` for the mid-tier judge — plus a re-run assertion covering FR-002c's "re-check
every time, write only on change" behavior (distinct from feature 001's stricter idempotency, per
this feature's Constraints above).

**Project Type**: Single-project CLI + library (same repo as feature 001; this feature adds files,
does not fork the project).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Phase A (workflow extension) | Phase B (Agent SDK) | Status |
|---|---|---|---|
| **I. Deterministic, Code-Driven Orchestration** | `fit-screen.js`'s top-level body sequences `phase("verify")` (serial `for`) → `phase("score")` (`pipeline()`); no agent decides what runs next. `hyppo-verify` and `hyppo-score` are bounded, single-purpose calls returning only their declared schema — the script owns every mark/verdict assignment and every write (FR-002/FR-006/FR-010's review-gate language). | `verify.ts`/`score.ts` are plain control flow calling bounded `query()`s. | PASS |
| **II. Right-Tier Model Usage** | `hyppo-verify` and delegated FR-010 sub-tasks via `hyppo-judge` are `model: "haiku"` (fast); `hyppo-score` is the one `mid`-tier call in this feature, matching the constitution's "mid for scoring with cited evidence" clause exactly. No `top`-tier call. | Same split via `judge({ tier })`. | PASS |
| **III. Evidence-Backed, Decision-Ready Output** | Every required-item verdict cites a specific evidence-file section (FR-003); hard constraints are their own section (FR-004); a `citation_audit` delegation checks citations resolve before persistence. This is the feature that makes Principle III concretely true for the first time in this repo — 001 only prepared the input. | Same, enforced by the `FitEvaluation` schema + a citation-resolution unit check. | PASS |
| **IV. The Human Owns the Last Mile** | `hyppo-verify` gets only `WebFetch` (a public, unauthenticated GET) — no submit/send capability exists to grant. `hyppo-score` gets `Read, Glob` only, no `Write`. No agent anywhere in this feature can take an outward-facing action or write a file. | Same allow-list shape enforced in `query()` options. | PASS |
| **V. Local Files Are the Only State** | All new/amended fields live in the existing Job Record file or the new `outputs/evaluations/**` files, both under `HYPPO_DATA_DIR`; provenance appended per FR-015. The Golden Calibration Set (real rubric-tuning data) is explicitly excluded from this repo (spec Assumption). | `store/evaluation.ts` is the only writer, same path-guard pattern as feature 001's `store/`. | PASS |
| **Architectural Boundaries** | No UI, no authenticated browser session — this feature is the first to *not* need HyppoVisor at all. Stays inside the sanctioned dynamic-workflow build-time tooling. | TS on the Claude Agent SDK, same stack as feature 001 Phase B. | PASS |
| **Development Workflow** | Spec-driven (`spec.md` → this plan), branch `004-retrieval-fit-screen-rework`. | Plan carries this Constitution Check; review checklist maps to FR-014 / FR-003 / tier / provenance, same shape as feature 001's. | PASS |

No violations. **Complexity Tracking stays empty.**

## Project Structure

### Documentation (this feature)

```text
specs/004-retrieval-fit-screen-rework/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output — run + validation for both phases
├── contracts/             # Phase 1 output
│   ├── settings-additions.md      # inputs/settings.json new sections (evidenceBase, hardConstraints, targetRoles)
│   ├── job-record-amendments.md   # delta to feature 001's Job Record front matter
│   └── evaluation-format.md       # the new Fit Evaluation file schema
└── tasks.md              # Created by /speckit-tasks
```

### Phase A — dynamic workflow extension

```text
.claude/workflows/
└── fit-screen.js                 # export const meta + top-level body: phase("verify") / phase("score")
                                    #   verify: for (rec of nonTerminalJobRecords) { agent(construct ATS URL from rec, hyppo-verify) ; map signal→mark ; agent(hyppo-readwrite: update mark+provenance) }  — serial, paced (FR-002d, shares 001's pacing helper)
                                    #   score:  pipeline(scorableRecords, rec => agent(hyppo-score: evidence+record+tracker → FitEvaluation) ; agent(hyppo-judge: citation_audit) ; agent(hyppo-readwrite: write evaluation + amended Job Record fields + provenance))
                                    #   assemble RunSummary (FR-013); top-level return

.claude/agents/                   # feature 001's hyppo-read/write/readwrite/judge REUSED UNCHANGED; two additions:
├── hyppo-verify.md                #   WebFetch only
└── hyppo-score.md                 #   Read, Glob (mid-tier judgment call target)

tests/fixtures/data-dir/          # extended: inputs/evidence/*.md, settings.json's new sections, amended Job Record fixtures
```

### Phase B — Agent SDK (target layout if/when B2 is done)

See feature 001's `src/` layout; this feature adds `pipeline/verify.ts`, `pipeline/score.ts`,
`store/evaluation.ts`, and a `mid` tier entry in `model/judge.ts`'s tier map — no new top-level
directory.

**Structure Decision**: A second workflow script, not a phase bolted onto `intake-normalize.js` —
this feature's input is feature 001's *finished output*, not an in-flight pipeline state, and it
introduces a genuinely new capability (a mid-tier judgment call, a non-idempotent re-check step)
that doesn't belong inside feature 001's script or its Constitution Check. The subagent boundary is
shared and extended, not duplicated.

## Phasing

| | Phase A — prototype extension | Phase B — harden (optional) |
|---|---|---|
| Goal | Prove verify→score end-to-end against real Job Records feature 001 already produced, cheaply and interactively | Testable, CI-gated, reproducible implementation on the constitution's stack |
| Substrate | `.claude/workflows/fit-screen.js` + Claude Code session | B1: SDK `Workflow` tool wrapping the same script · B2: `pipeline/verify.ts` + `pipeline/score.ts` on `@anthropic-ai/claude-agent-sdk` |
| Tests | Manual quickstart scenarios + optional `node:test` component tests for pure helpers (signal→mark, verdict tally, application-state rule) — see research.md R8 for the 003-eval-harness relationship | Ports onto B2's `vitest` suite alongside feature 001's, plus a re-check-not-idempotent assertion |
| Billing | Plan / subscription (Claude Code session) | API key |
| Exit criteria | Quickstart scenarios 1–9 pass by hand against fixtures; one real run against a small set of real Job Records produces correct Fit Evaluations + amended Job Record fields + provenance + summary; SC-004/SC-006/SC-007/SC-008 spot-checked | All quickstart scenarios automated and green; the FR-002c re-check-cadence behavior has a dedicated test; `judge()` + the ATS fetch behind interfaces with fixture fakes |
| Carried over A→B | Spec, data model, all `contracts/`, the JSON schemas used in `agent()` calls, prompt text, fixtures, the step decomposition | — |
| Decision point | Same as feature 001: after Phase A, choose B1 or B2 based on whether the sandbox limits actually bite | — |

`/speckit-tasks` will generate Phase A tasks first; Phase B tasks are a separate, later slice gated
on the Phase A exit criteria, same convention as feature 001.

## Complexity Tracking

> No Constitution Check violations. Section intentionally empty.
