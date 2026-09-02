# Implementation Plan: Intake & Normalize Pipeline Steps

**Branch**: `001-intake-normalize-pipeline` | **Date**: 2026-08-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-intake-normalize-pipeline/spec.md`

## Summary

Build the opening three steps of the HyppoGraph pipeline — **collect → pre-triage → normalize** — as
plain code that calls each step in a fixed order. Board postings are retrieved through HyppoVisor's MCP
page-read contract by opening user-authored filtered searches; every retrieved posting is stored
verbatim as a Raw Record with provenance. A single fast-tier model judgment per Raw Record assigns a
`kept`/`rejected` pre-triage mark against the user's hard stops and considered directions. Kept records
are converted by fast-tier extraction into Job Records — one Markdown file each, structured
front-matter for the fixed field set plus a readable body — with cross-source dedup and company-name
canonicalisation. All persistent state is plain files under `HYPPO_DATA_DIR`.

**Delivered in two phases** (see [Phasing](#phasing)):

- **Phase A — prototype as a Claude Code dynamic workflow.** The orchestration is a
  `.claude/workflows/intake-normalize.js` script whose top-level body sequences the work with
  `phase()` markers, serial `for` loops (collect, normalize), and `pipeline()` (triage); each unit of
  work is a bounded `agent()` subtask whose tool grant comes from a custom `agentType` definition in
  `.claude/agents/`. HyppoVisor is reached through the collect subagents' MCP tools. Iterated inside a
  Claude Code session, billed against the plan.
- **Phase B — optional port to the Claude Agent SDK.** Once the flow is proven, either drive the same
  workflow script from a thin Agent SDK harness via the `Workflow` tool, or rewrite the orchestration
  as plain TypeScript on `@anthropic-ai/claude-agent-sdk` (the constitution's stated stack) to get
  real unit/integration tests, CI, and hard idempotency guarantees.

The spec, data model, contracts, and success criteria are identical across both phases — only the
orchestration substrate changes.

## Technical Context

### Shared across phases

**Storage**: Plain files under the user-configured `HYPPO_DATA_DIR` (Markdown + CSV). No database, no
services, no cache that outlives a run. Provenance is the append-only `provenance-log.md`. The data
directory (inputs *and* outputs) lives entirely outside this repository; how it is stored, versioned,
backed up, retained, or pruned is the user's decision. In-repo `tests/fixtures/data-dir/` is synthetic
test data only.

**External dependencies**:
- **HyppoVisor**, reached only through its documented MCP page-read surface
  (`contracts/hyppovisor-page-read.md`). HyppoGraph holds no authenticated session and has no UI.
- **Feature 002 (onboarding & settings stage)** produces `HYPPO_DATA_DIR/inputs/settings.json`. This
  feature reads its `trackedBoards`, `hardStops`, and `directions` sections and checks
  `completeness.setupReady` before doing anything (FR-000). Schema:
  `specs/002-onboarding-settings/contracts/settings-store.md`. `applications.md` and the
  `manual-postings/` drop remain hand-authored files.

**Model tiers**: Only the **fast** tier (Haiku-class) is used by this feature — for pre-triage,
extraction/normalisation, dedup grouping, and company-name matching, per the constitution's model
table. `mid`/`top` are reserved for downstream steps. The tier is explicit at every judgment site.

**Performance Goals**: A run that collects 100 postings completes collect + pre-triage (all 100) +
normalize (kept subset) within 30 minutes including pacing (SC-009). Default pacing ≈ 1 fetch per 3 s
per source; per-run fetch cap configurable.

**Constraints**:
- No outward-facing actions during intake, pre-triage, or normalize (FR-018) — only HyppoVisor
  read/navigation tools are ever allow-listed.
- Orchestration control flow is code (a workflow script in Phase A, plain TS in Phase B), never a
  model choosing the next step.
- All writes land under `HYPPO_DATA_DIR`; inputs (`settings.json`, `applications.md`,
  `manual-postings/`) are read-only and never copied into the repo, logs, or telemetry.
- Re-runs are idempotent (SC-006): unchanged input ⇒ no new Raw Records, no changed triage marks, no
  new Job Records. Anchored on persisted identity keys + a triage-criteria hash, not on identical
  model output.

**Scale/Scope**: Tens of tracked sources; low-hundreds of postings per run; thousands of archived
Raw/Job Records accumulating over time.

### Phase A — dynamic workflow prototype

**Substrate**: A Claude Code dynamic workflow (`Workflow` tool). Script is constrained JavaScript —
no `import`, no direct fs/shell from the script body, `Date.now()` / `Math.random()` / argless
`new Date()` throw (pass a run timestamp via `args`). The body runs at top level (no default export)
and finishes with a top-level `return`. Orchestration primitives: `phase(title)` (void marker),
`pipeline(items, ...stages)` (no options arg; concurrency auto-caps at `min(16, CPUs-2)`),
`parallel(thunksArray)`, `agent(prompt, { schema, label, model, phase, agentType })`, `log()`. Caps:
≤ 16 concurrent agents, ≤ 4096 items per `pipeline`/`parallel`, ≤ 1000 agents per run. Because
`pipeline()` has no concurrency knob, `collect` (drives the user's HyppoVisor session, one source at a
time) and `normalize` (merges in place into shared Job Record files) are plain serial `for` loops;
only `triage` (disjoint per-record front-matter writes) uses `pipeline()`.

**Units of work**: Each `agent()` call is one bounded subtask with a task-specific prompt and a JSON
`schema`. Its tool grant is set by `agentType` — a custom subagent definition under `.claude/agents/`
(`hyppo-read`, `hyppo-write`, `hyppo-readwrite`, `hyppo-judge`, `hyppo-collect-list`,
`hyppo-collect-fetch`). There is no per-call `allowedTools`. No definition grants Edit, Bash, a
submit/send capability, or `mcp__hyppovisor-hyppograph__interact`. (A subagent whose tool list
resolves to nothing cannot launch, so the pure-judgment `hyppo-judge` is granted a nominal `Read` it
is instructed never to use.)

**HyppoVisor**: Registered as an MCP server in the Claude Code session by the committed `.mcp.json`
(the per-project named instance `hyppovisor-hyppograph`, literal endpoint, no env vars). Only the six
read/navigation tools are named — in the `hyppo-collect-*` agent definitions and in
`contracts/hyppovisor-page-read.md`; the `agent()` prompt names the exact tool and arguments to call.

**Testing**: Manual validation against `tests/fixtures/data-dir/` inside a Claude Code session, plus
the quickstart scenarios run by hand. No automated CI in this phase.

**Auth/billing**: Runs in the developer's Claude Code session, billed against the plan.

### Phase B — Agent SDK port (optional, when Phase A is proven)

**Substrate**: TypeScript 5.x on Node.js ≥ 20 (ESM), `@anthropic-ai/claude-agent-sdk`.

- **B1 (thin)**: keep `intake-normalize.js`; a small `src/index.ts` invokes it through the SDK's
  `Workflow` tool (`allowedTools: ["Workflow"]`). Lowest effort; keeps the workflow sandbox.
- **B2 (full)**: rewrite orchestration as plain TS — `main()` calls `collect()` → `triage()` →
  `normalize()`; each judgment is `query({ prompt, options: { model, maxTurns: 1, outputFormat, … } })`;
  `pipeline`/`parallel` become bounded `Promise.all` with `p-limit`. Removes the sandbox limits, adds
  `import`/npm/fs and a real clock.

**Primary Dependencies (B2)**: `@anthropic-ai/claude-agent-sdk`, `gray-matter` (front-matter),
`zod` (schema validation + input parsing), `vitest` (tests), `p-limit` (concurrency).

**Testing (B2)**: `vitest`. `model/` and `mcp/` sit behind interfaces; `tests/integration/` runs the
whole pipeline against fixtures with fakes, including the SC-006 re-run assertion. CI gate.

**Auth/billing (B)**: API-key auth (`ANTHROPIC_API_KEY` / `ant auth`). Per the Agent SDK terms,
subscription/claude.ai-login auth is not permitted for SDK-built products.

**Project Type**: Single-project CLI + library.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Phase A (workflow prototype) | Phase B (Agent SDK) | Status |
|---|---|---|---|
| **I. Deterministic, Code-Driven Orchestration** | The workflow **script body** sequences `phase()` markers → serial `for` loops / `pipeline()` → `agent()`; no model decides what runs next. Each `agent()` is a bounded subtask taking a structured payload and returning only its declared schema — state lives in script variables, not in agent context (tasks T011 e). *Looser point, accepted for a prototype:* a subagent runs multiple turns and has some latitude within its task, vs. a `maxTurns: 1` call. | `run.ts` is plain control flow; every judgment is `query({ maxTurns: 1 })` with no tools. No agent loop. | PASS (A: PASS-with-note) |
| **II. Right-Tier Model Usage** | Every `agent()` that makes a judgment sets `model: "haiku"` (fast tier) explicitly and it is the lowest tier that fits — a shared subagent-policy clause, audited in T041 (tasks T011 d). | `judge({ tier })` wrapper; `config` maps `fast → haiku`. Single audit point. | PASS |
| **III. Evidence-Backed, Decision-Ready Output** | Normalize subagents keep the Raw Record linked from every Job Record (FR-012) and emit `"unknown"` for unstated fields (FR-010); every `rejected` triage mark carries a reason. Same schemas as Phase B. | Same, enforced by zod schema. | PASS |
| **IV. The Human Owns the Last Mile** | Each `agent()` names a custom `agentType` whose `.claude/agents/*.md` grants only the tools that step needs; the `hyppo-collect-*` defs list exactly the six HyppoVisor read/navigation tools, and no def anywhere grants `interact`, a submit/send tool, Edit, or Bash. No outward action anywhere. | `allowedTools` for the MCP `query()` is the HyppoVisor read subset only; unit test asserts no non-read tool is ever listed. | PASS |
| **V. Local Files Are the Only State** | Subagents write only under `HYPPO_DATA_DIR` (paths passed in via the workflow `args`/prompts); append-only provenance; no DB. | `store/` is the only writer, with a path guard refusing anything outside `HYPPO_DATA_DIR`; `settingSources: []` on judgment calls. | PASS |
| **Architectural Boundaries** | No UI. HyppoVisor via MCP only. Prototype substrate is a Claude Code dynamic workflow — explicitly sanctioned build-time tooling in the constitution's Development Workflow section. | TS on the Claude Agent SDK — the constitution's stated stack. No runtime service, no datastore. | PASS |
| **Development Workflow** | Spec-driven (`spec.md` → this plan). Prototyping as a dynamic workflow is the sanctioned use of that tooling. | Plan carries this Constitution Check; review checklist maps to FR-018 / FR-010 / tier / provenance. | PASS |

No violations. The one note (Principle I, Phase A) is a deliberate, time-boxed prototype trade-off
that Phase B removes — **Complexity Tracking stays empty** (no permanent deviation to justify).

## Project Structure

### Documentation (this feature)

```text
specs/001-intake-normalize-pipeline/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output — run + validation for both phases
├── contracts/           # Phase 1 output — substrate-independent
│   ├── hyppovisor-page-read.md
│   ├── inputs-format.md
│   └── outputs-format.md
└── tasks.md             # Created by /speckit-tasks
```

### Phase A — dynamic workflow

```text
.claude/workflows/
└── intake-normalize.js          # export const meta + top-level body: phase("collect"/"triage"/"normalize") markers
                                 #   collect:   for (src of sources) { agent(open filtered search) ; for (ref) agent(fetch + write Raw Record) }  — serial
                                 #   triage:    pipeline(rawRecords, r => agent("keep/reject vs hard stops + directions") ; agent(write mark))
                                 #   normalize: for (rec of keptRecords) { agent("extract fixed field set; unknown if unstated") ; agent(create/merge Job Record) }  — serial
                                 #   dedup/canonicalise + write Job Records; append provenance; assemble RunSummary; top-level return

.claude/agents/                  # per-agent tool policy (Principle IV) — one custom subagent def each
├── hyppo-read.md                #   Read
├── hyppo-write.md               #   Write
├── hyppo-readwrite.md           #   Read, Write
├── hyppo-judge.md               #   Read (nominal; pure judgment, no tool use)
├── hyppo-collect-list.md        #   the six HyppoVisor read/navigation tools
└── hyppo-collect-fetch.md       #   those six + Write

.mcp.json                        # registers the named instance `hyppovisor-hyppograph` (literal endpoint, no env vars)

tests/fixtures/data-dir/         # synthetic inputs/ + expected outputs/ for manual validation
```

The workflow's intermediate results (source list, raw-record refs, triage marks) live in **script
variables**; only durable artifacts are written to `HYPPO_DATA_DIR` by subagents.

### Phase B — Agent SDK (target layout if/when B2 is done)

```text
src/
├── index.ts                 # CLI entry: parse args/env, run pipeline, print RunSummary  (B1: invoke Workflow tool)
├── config/index.ts          # HYPPO_DATA_DIR; pacing + fetch cap; tier→model-alias map
├── domain/types.ts          # RawRecord, JobRecord, TrackedSource, TriageMark, RunSummary, …
├── pipeline/
│   ├── run.ts               # deterministic orchestration: collect → triage → normalize
│   ├── collect.ts           # walk sources + manual drop; pace; store Raw Records; per-source failures
│   ├── triage.ts            # per Raw Record: fast-tier keep/reject; write marks
│   └── normalize.ts         # kept → Job Records; dedup key; company canonicalisation; applications link
├── model/judge.ts           # single entry to query(): { tier, systemPrompt, input, schema } → validated object
├── mcp/hyppovisor.ts        # adapter over the HyppoVisor page-read contract
└── store/                   # the ONLY writer, all paths rooted at HYPPO_DATA_DIR
    ├── dataDir.ts  settings.ts (reads inputs/settings.json + setupReady gate)  applications.ts
    ├── rawRecord.ts  jobRecord.ts  provenance.ts

tests/
├── unit/                    # parsers, dedup key, front-matter round-trip, tier map, path guard, allowed-tools
├── integration/             # full run against fixtures with faked mcp/ + model/ ; idempotency re-run
└── fixtures/{data-dir,mcp,model}/
```

**Structure Decision**: The three step boundaries, the `store/` write monopoly, and the `model/` +
`mcp/` seams are the same design in both phases; Phase A realises them as workflow phases + subagents,
Phase B realises them as modules + `query()`. Porting A→B is re-housing known pieces, not a redesign.

## Phasing

| | Phase A — prototype | Phase B — harden (optional) |
|---|---|---|
| Goal | Prove the collect→triage→normalize flow end-to-end on real postings, cheaply and interactively | Testable, CI-gated, reproducible implementation on the constitution's stack |
| Substrate | `.claude/workflows/intake-normalize.js` + Claude Code session | B1: SDK `Workflow` tool wrapping the same script · B2: plain TS on `@anthropic-ai/claude-agent-sdk` |
| Tests | Tier 1 pure-code unit (`node:test`) + Tier 3 golden synthetic integration run + manual quickstart — see [eval-strategy.md](./eval-strategy.md) | Tier 1/2/3 ported onto B2's stack: `vitest` unit + integration, SC-006 re-run assertion, CI |
| Billing | Plan / subscription (Claude Code session) | API key |
| Exit criteria | Quickstart scenarios 1–9 pass by hand against fixtures; one real run against a small live `settings.json` produces correct Job Records + provenance + summary; the `setupReady: false` precondition exit works; SC-007/SC-008 spot-checked | All quickstart scenarios automated and green; SC-006 idempotency test passes; `judge()` + `mcp/` behind interfaces with fixture fakes |
| Carried over A→B | Spec, data model, all `contracts/`, the JSON schemas used in `agent()` calls, prompt text, fixtures, the step decomposition | — |
| Decision point | After Phase A, choose B1 (keep script, thin harness) or B2 (full rewrite) based on whether the sandbox limits (`import`, clock, 16-agent cap, no CI) actually bite | — |

`/speckit-tasks` will generate Phase A tasks first; Phase B tasks are a separate, later slice gated on
the Phase A exit criteria.

## Complexity Tracking

> No Constitution Check violations. The Principle I note for Phase A is a time-boxed prototype
> trade-off removed by Phase B, not a standing deviation — section intentionally empty.
