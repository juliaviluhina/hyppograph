# Implementation Plan: Onboarding & Settings Stage

**Branch**: `002-onboarding-settings` | **Date**: 2026-08-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-onboarding-settings/spec.md`

## Summary

A preliminary, explicitly-invoked stage that establishes the job seeker's configuration before the
pipeline runs and lets them revise it later. It walks an **ordered list of named sections** (candidate
basics, locations, work arrangement, compensation, eligibility hard stops, considered directions,
tracked boards, collection tuning, scoring-weight notes); for every question it shows a concrete
**default proposal** the user accepts or replaces; and it persists confirmed answers to the structured
settings store `HYPPO_DATA_DIR/inputs/settings.json` in the shape fixed by
[`contracts/settings-store.md`](./contracts/settings-store.md). Control flow is plain code stepping
through the section list — the human supplies every value, and nothing downstream is contacted. The
store's `completeness` block is the yes/no gate feature 001 already reads.

**Delivered in two phases** (see [Phasing](#phasing)), mirroring feature 001:

- **Phase A — interactive Claude Code command.** An `onboard` skill/command runs the Q&A
  conversationally in a Claude Code session: it reads any existing `settings.json` and hand-authored
  input files with `Read`, asks one section at a time via the session's question mechanism, validates
  each answer, and writes each section atomically with `Write`. No fan-out, no `.claude/workflows/*.js`
  workflow — onboarding is single-threaded and interactive, which is a different shape from 001's
  collect→triage→normalize pipeline.
- **Phase B — plain TypeScript CLI.** `src/onboarding/` on Node ≥ 20 with a prompt library; the
  section catalog, validators, defaults, atomic writer, and provenance appender become tested modules
  reusing 001's `store/` seam. A model is used at most for one bounded task — parsing a hand-authored
  input file into proposals (fast tier) — and even that has a pure-heuristic fallback.

The spec, the settings-store contract, the section/question catalog, defaults, and success criteria
are identical across both phases — only the Q&A substrate changes.

## Technical Context

### Shared across phases

**Language/Version**: TypeScript 5.x on Node.js ≥ 20 (ESM) for Phase B; Phase A is a Claude Code
skill (Markdown + the session's built-in `Read`/`Write`/question tools), no compiled code.

**Primary Dependencies**:
- Phase A: none beyond the Claude Code session.
- Phase B: `@anthropic-ai/claude-agent-sdk` (only if the hand-authored-file parser uses a model call —
  same `judge()` wrapper as 001), `zod` (settings-store schema validation + answer validation),
  a prompt library for the terminal Q&A (`@inquirer/prompts`), `vitest` (tests). `gray-matter` only
  if a Markdown rendering (FR-005a) is implemented.

**Storage**: One JSON file — `HYPPO_DATA_DIR/inputs/settings.json` — plus append-only
`HYPPO_DATA_DIR/provenance-log.md` (shared with 001, constitution Principle V). Optionally a
regenerated Markdown rendering (FR-005a). No database, no service, no cache outliving a run. The data
directory lives entirely outside this repo; `tests/fixtures/data-dir/` holds synthetic stores only.

**Testing**: Phase A — the quickstart scenarios run by hand in a session against
`tests/fixtures/data-dir/`. Phase B — `vitest` unit (validators, defaults, atomic write + rename,
provenance format, completeness computation, resume-point derivation, corrupt-store backup, dedup
no-op) and integration (a full accept-all first run; a one-section reconfigure asserting every other
section is byte-identical; a no-change re-run asserting zero writes / zero provenance lines).

**Target Platform**: Developer/user workstation — a terminal or a Claude Code session. No server.

**Project Type**: Single-project CLI + library (shared with 001).

**Performance Goals**: Not throughput-bound. SC-001 target: accept-all first run completes in under
5 minutes of wall-clock, nearly all of it the user reading proposals.

**Constraints**:
- **No outward-facing actions of any kind** (FR-021, Principle IV) — no MCP client, no network, no
  browser. The only I/O is the terminal/session Q&A and reads/writes under `HYPPO_DATA_DIR`.
- Control flow is code stepping through the ordered section list (Principle I); the user, not a model,
  decides every stored value. Any model call is confined to parsing one hand-authored file.
- All writes land under `HYPPO_DATA_DIR` and nowhere else — no copy of the user's answers into the
  repo, logs, or telemetry (FR-022, Principle V).
- Section saves are **atomic** (FR-020): write a temp file in the same directory, `fsync`, `rename`
  over `settings.json`. A concurrent pipeline read always sees a complete, valid store.
- A no-change run writes **zero bytes** and appends **zero** provenance lines (FR-009, SC-007).
- Runs only when explicitly invoked (FR-023); the pipeline may *read* `completeness.setupReady` but
  never launches onboarding.

**Scale/Scope**: 9 sections, ~20 questions total. Single user. The store is a few KB.

### Phase A — interactive Claude Code command

**Substrate**: An `onboard` skill (`.claude/skills/onboard/` or a slash command) run inside a Claude
Code session. Claude sequences the sections from the catalog in
[`contracts/onboarding.md`](./contracts/onboarding.md), asks each question with a visible default,
validates the reply against the same rules Phase B encodes, and writes each answered section to
`settings.json` with `Write` (read-modify-write the whole object, but only after a section is
confirmed). Existing `settings.json` and any hand-authored input files are pulled in with `Read`.

**Model usage**: The session model conducts the conversation, but it does not *choose* values — it
presents the catalog's defaults and records what the user confirms. Parsing a hand-authored file into
proposals (FR-012) is done inline by the same session. No subagents.

**Testing**: Manual — run the quickstart scenarios in a session against `tests/fixtures/data-dir/`.

**Auth/billing**: The developer's Claude Code session, billed against the plan.

**Constitution note**: an interactive session has more latitude than a compiled prompt-and-validate
loop — the same time-boxed Phase-A reading of Principle I that feature 001 records. Phase B removes it.

### Phase B — plain TypeScript CLI (when Phase A is proven)

**Substrate**: `node src/onboarding` (or `npm run onboard`). A deterministic driver iterates the
section catalog; `@inquirer/prompts` renders each question with its default; `zod` validates answers
and the assembled store; the atomic writer + provenance appender live in `store/`.

**Model usage (optional, bounded)**: `parseHandAuthored(file, sectionKind)` may call the shared
`judge()` wrapper (`maxTurns: 1`, fast tier, JSON-schema output) to turn a free-form board list or
hard-stops note into structured proposals, with a regex/line-based fallback when no credentials are
present. Unparseable entries are returned as `{ raw, error }` and surfaced as "couldn't read — please
re-enter" (FR-013), never dropped or guessed.

**Testing**: `vitest`. The prompt library and the file parser sit behind interfaces so tests drive
scripted answers and fixture files. CI gate.

**Auth/billing**: API-key auth only if the model-backed parser path is exercised; the default
heuristic path needs no credentials.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Phase A (interactive command) | Phase B (TS CLI) | Status |
|---|---|---|---|
| **I. Deterministic, Code-Driven Orchestration** | Claude steps through the fixed section catalog in order; resume point is derived from section `status`, not chosen. No agent decides the next step. *Looser point, accepted for a prototype:* the session conducts free-form conversation within a section. | A `for` loop over the catalog; `@inquirer/prompts` per question; no model in the control path. Optional file-parser call is `maxTurns: 1`, no tools. | PASS (A: PASS-with-note) |
| **II. Right-Tier Model Usage** | No judgment model calls; the session model only presents defaults and records confirmations. Hand-authored-file parsing is done inline and declared fast-tier work. | If the model-backed parser is used, it declares `tier: "fast"` via the shared `judge()` wrapper (same audit point as 001). Otherwise no model call. | PASS |
| **III. Evidence-Backed, Decision-Ready Output** | Not a scoring feature — it emits configuration. Every stored value is one the user explicitly confirmed, and every create/change writes one provenance entry stating what and why (FR-010). That traceability is the III analogue. | Same, enforced by the writer: no section is persisted without a matching provenance line. | PASS |
| **IV. The Human Owns the Last Mile** | Zero outward-facing actions (FR-021). No MCP client, no network. The only interaction is Q&A with the user, who confirms every value. | Same — no network client is constructed; a unit test asserts no outbound call site exists. | PASS |
| **V. Local Files Are the Only State** | Writes only `inputs/settings.json` (+ optional rendering) under `HYPPO_DATA_DIR`; appends to `provenance-log.md`; no DB. Answers are never copied into the repo/logs (FR-022). | `store/settings.ts` is the only writer, with a path guard refusing anything outside `HYPPO_DATA_DIR`; no telemetry. | PASS |
| **Architectural Boundaries** | No UI — a text Q&A per the project's no-UI constraint. No authenticated session, no HyppoVisor dependency (onboarding needs neither). | TS on Node; the CLI is a terminal Q&A, not a GUI. No runtime service, no datastore. | PASS |
| **Development Workflow** | Spec-driven (`spec.md` → this plan). Interactive command is the right build-time shape for an interactive feature. | Plan carries this Constitution Check; the review checklist maps to FR-021 / FR-010 / FR-020 / FR-022. | PASS |

No violations. The one note (Principle I, Phase A) is a deliberate, time-boxed prototype trade-off
that Phase B removes — **Complexity Tracking stays empty**.

## Project Structure

### Documentation (this feature)

```text
specs/002-onboarding-settings/
├── plan.md              # This file
├── research.md          # Phase 0 output — resolves the NEEDS CLARIFICATION items below
├── data-model.md        # Phase 1 output — the store, sections, questions, provenance, completeness
├── quickstart.md        # Phase 1 output — run + validation for both phases
├── contracts/
│   ├── settings-store.md   # EXISTS — the settings.json shape; owned here, read by 001
│   └── onboarding.md        # Phase 1 output — section/question catalog, defaults, CLI + query surface
├── checklists/
│   └── requirements.md      # EXISTS — spec quality checklist
└── tasks.md             # Created by /speckit-tasks
```

### Phase A — interactive command

```text
.claude/skills/onboard/           # (or a slash command) — the interactive onboarding flow
└── SKILL.md                      #   reads settings.json + hand-authored files; walks the section
                                  #   catalog; validates; writes each confirmed section atomically;
                                  #   appends one provenance line per create/change

tests/fixtures/data-dir/          # synthetic settings.json states: empty, complete, partial, corrupt,
                                  #   + hand-authored board list / hard-stops note for the pre-fill path
```

### Phase B — TypeScript CLI (target layout)

```text
src/
├── onboarding/
│   ├── run.ts                 # deterministic driver: load store → for each section → prompt → validate → save
│   ├── catalog.ts             # the ordered section + question catalog, defaults, required flags, validators
│   ├── prompts.ts             # thin wrapper over @inquirer/prompts (behind an interface for tests)
│   ├── prefill.ts             # read hand-authored input files → proposals; heuristic + optional judge() path
│   ├── completeness.ts        # compute completeness.{setupReady,unresolved} from section statuses
│   └── diff.ts                # store vs hand-authored-file disagreement report (FR-014)
├── store/
│   ├── settings.ts            # read + parse + schema-validate; ATOMIC per-section write (temp+rename); backup on corrupt
│   ├── provenance.ts          # shared with 001 — append-only, one entry per section create/change
│   └── dataDir.ts             # HYPPO_DATA_DIR root + path guard (shared with 001)
├── domain/
│   └── settings.ts            # SettingsStore, Section, Question, CompletenessResult types + zod schemas
└── index.ts                   # CLI entry: `onboard` subcommand (parse args/env, run, print completeness)

tests/
├── unit/                      # validators, defaults, atomic write+rename, provenance format, completeness,
│                              #   resume-point derivation, corrupt-store backup, duplicate no-op
├── integration/               # accept-all first run; one-section reconfigure (others byte-identical);
│                              #   no-change re-run (zero writes / zero provenance); pre-fill from files
└── fixtures/data-dir/         # shared with 001
```

**Structure Decision**: The section catalog, the validators, the atomic writer, and the completeness
computation are the same design in both phases; Phase A realises them as a skill's instructions +
session tools, Phase B as `src/onboarding/` modules over a shared `store/`. `store/settings.ts` and
`store/provenance.ts` are co-owned with feature 001 — this feature adds the write side that 001 only
reads. Porting A→B is re-housing known pieces, not a redesign.

## Phasing

| | Phase A — prototype | Phase B — harden (optional) |
|---|---|---|
| Goal | Prove the section catalog, defaults, validation messages, and pre-fill flow feel right with a real user, cheaply and interactively | Testable, CI-gated, reproducible CLI on the constitution's stack |
| Substrate | `.claude/skills/onboard/` in a Claude Code session | plain TS on Node ≥ 20, `@inquirer/prompts` |
| Tests | Manual — quickstart scenarios by hand | `vitest` unit + integration (byte-identical reconfigure, zero-write re-run), CI |
| Billing | Plan / subscription (Claude Code session) | None for the heuristic path; API key only if the model-backed file parser is used |
| Exit criteria | Quickstart scenarios 1–8 pass by hand against fixtures; one real accept-all run produces a store that validates against `contracts/settings-store.md` with `setupReady: true`; a one-section edit leaves the rest byte-identical; a no-change re-run writes nothing; feature 001 then runs against that store with no further questions (SC-010) | All quickstart scenarios automated and green; the reconfigure byte-identical assertion and the zero-write re-run assertion pass in CI; `prompts.ts` + `prefill.ts` behind interfaces with fixture fakes |
| Carried over A→B | Spec, `contracts/settings-store.md`, `contracts/onboarding.md` (catalog + defaults + messages), fixtures, the completeness rule | — |
| Decision point | After Phase A, confirm the catalog/defaults are stable, then port; no B1/B2 split — Phase B is a single plain-TS target (there is no workflow substrate to keep) | — |

`/speckit-tasks` generates Phase A tasks first; Phase B tasks are a later slice gated on the Phase A
exit criteria.

## Complexity Tracking

> No Constitution Check violations. The Principle I note for Phase A is a time-boxed prototype
> trade-off removed by Phase B, not a standing deviation — section intentionally empty.
