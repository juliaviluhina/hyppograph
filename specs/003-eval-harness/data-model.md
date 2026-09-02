# Phase 1 Data Model: Pipeline Eval Harness

**Feature**: 003-eval-harness | **Date**: 2026-09-02

The harness has no database. "Entities" here are the file artifacts and in-memory records the eval
scripts read, produce, and assert on. Field lists are the contract the runner and the report writer
depend on.

---

## Eval layer

One of four. Each is independently runnable and produces one report per run.

| Layer | Scope token | Model calls | Network | Substrate |
|---|---|---|---|---|
| Component test layer | `component` | none | none | plain Node |
| Per-component eval | `eval-<subtask>` | one subtask, N× per case | none (judge call excepted) | `Workflow` tool (default) / mock / metered |
| Integration gate | `integration`, `integration-idem` | full flow (~90–100) | none | `Workflow` tool (default) / metered |
| Live smoke | `live-smoke` | full flow, shallow depth | HyppoVisor reads | `Workflow` tool; manual; scratch dir outside repo |

**Rules**
- Only `component` may be wired to run unattended (FR-018).
- `integration-idem` is the second pass of an `integration` run over the same scratch location, not a
  separate dataset.

## Synthetic integration dataset  (`tests/synthetic/data-dir/`)

Pre-seeded, hermetic. Structure mirrors a real `HYPPO_DATA_DIR`.

| Path | Content |
|---|---|
| `inputs/settings.json` | tracked searches pointed at a non-resolving host (`*.invalid`); criteria (directions, excluded locations, clearance rule) chosen so each reject reason fires exactly once |
| `inputs/priorities.md`, other inputs | minimal synthetic context needed by triage |
| `raw/raw-*.md` | ~8 pre-seeded raw records + 1 manual-drop file + 1 non-posting (`NOTES-*.md`) |

**Failure-mode coverage** (one instance each): cross-source duplicate pair (same role, two sources,
different phrasing); company-suffix wobble case; excluded-location reject; no-direction-overlap
reject; clearance reject; non-English posting (`originalLanguage` set); low-completeness posting
(no salary, no location → `completeness: low`); already-applied match.

**Invariants**: no field references a resolvable URL; total size small enough that every expected
output value is hand-derivable.

## Expected-output tree  (`tests/synthetic/expected/`)

The committed known-correct result of running the integration gate over the synthetic dataset.
Byte-compared file by file; any mismatch is reported as a file-level diff (FR-004).

| Path | Asserted content |
|---|---|
| `outputs/jobs/<company>-<role>.md` | one file per kept posting; exact front-matter (dedup key, completeness, originalLanguage, applied status) and body |
| `outputs/companies.md` | canonicalisation table — display names and the key each maps to |
| `outputs/last-run-summary.md` | exact counts: `newJobRecords`, `duplicatesMerged`, per-bucket reject counts |
| `outputs/provenance-log.md` | exact provenance lines, in order |

**Re-lock**: moving the model-backed layers between substrates (FR-019) or a deliberate pipeline
field change (edge case) requires regenerating this tree; each re-lock is a logged step in an eval
report's *Findings*, never a silent test edit.

## System under test

The intake & normalize pipeline (`.claude/workflows/intake-normalize.js`) at a pinned commit. Its
in-step `agent()` calls stay on the fast tier (`FAST` / `claude-haiku-4-5`). This feature edits it
only to extract helpers and prompt text into `.claude/workflows/lib/` (D2); observable behaviour is
unchanged, verified by an integration-gate run before and after.

## Shared source-of-truth modules  (`.claude/workflows/lib/`)

| Module | Exports | Consumed by |
|---|---|---|
| `intake-core.mjs` | pure helpers: `titleKey`, `companyKey`, `slug`, `stableHash`, `foldSet`, dedup-key assembly, `criteriaFingerprint`, `noTriageCriteria`, `effectiveExcludedLocations`, completeness threshold, `renderSummary`, `newRunSummary`, `bumpReason`, `provenanceLine`, `trackedBoards → sources` map | `evals/component/*.test.mjs` (import); workflow (inlined copy) |
| `prompts.mjs` | the `agent()` prompt text for each model-backed subtask, keyed by subtask id | `evals/per-component/*.mjs` (import); workflow (inlined copy) |

The workflow carries a marker-delimited inlined copy of each; `evals/component/drift.test.mjs`
asserts byte-identity (FR-002).

## Per-component fixture table  (`evals/per-component/fixtures/<subtask>.json`)

One table per model-backed subtask.

| Field | Meaning |
|---|---|
| `id` | case identifier, appears in the report row |
| `input` | the posting text / directory / saved fixture handed to the subtask |
| `expected` | deterministic expected structure (keep/reject + reason bucket; extracted fields; record set; parsed refs) |
| `stability` | `true` when the value feeds a deterministic downstream key → assert identical across N runs (FR-008) |
| `judge` | optional: which rubric (`extraction-faithfulness` \| `pre-triage-reason`) grades the fuzzy part of this case |
| `runs` | N for the stability / N-run assertion (default 3) |

## Judge rubric  (`evals/per-component/rubrics/<type>.md`)

| Field | Meaning |
|---|---|
| `type` | `extraction-faithfulness` \| `pre-triage-reason` — the only two permitted (FR-010) |
| `criteria[]` | explicit written checks; the judge returns pass/fail per criterion, not a free opinion (FR-010a) |
| `pass_rule` | how per-criterion results combine into a case pass/fail (default: all criteria pass) |

## Judge exchange (in-memory)

- **Request**: `{ rubric.criteria[], source_posting, produced_output }` → non-Claude model. No
  credential in the payload it logs; credential is a transport header only.
- **Response**: `{ results: [{ criterion, verdict: "pass"|"fail", note }] }`.

## Eval report  (`docs/eval-reports/NNNN-YYYY-MM-DD-<scope>.md`)

Written by the harness as its last step (FR-011). Committed, human-readable, synthetic-data-only.

| Section | Fields |
|---|---|
| Methodology | which layer; the layered-pyramid context; whether a non-Claude judge was used and for which cases |
| Under test | workflow commit SHA; model IDs (`claude-haiku-4-5`, judge model ID); fixture dir + a hash of it; run timestamp / run id; substrate (`workflow-tool` \| `mock` \| `metered`) |
| Results | per-case pass/fail table; for failures, actual-vs-expected diff |
| Cost | tokens in / out; derived dollar cost (`0` for `component` and `workflow-tool` runs; measured figure for `metered`) |
| Findings | any bug caught + link to its fix commit; any expected-tree re-lock and why; partial-result note if the ceiling aborted the run |

**Forbidden content** (FR-012, SC-007): credentials, auth headers, request bodies, personal data.

## Report index / spend ledger  (`docs/eval-reports/README.md`)

Table, one row per run: `| NNNN | date | scope | result | cost | commit |`. Metered rows sum to a
total reconstructable within 10% or $1 of the account's recorded spend (SC-008 / D11).

## Spend controls  (`evals/lib/spend.mjs`)

| Control | Behaviour |
|---|---|
| Per-invocation confirmation | a metered run requires an explicit `--confirm-spend`; without it the command prints the cost estimate and exits 0 with no paid call (FR-014) |
| Per-run ceiling | `--ceiling <dollars>` (with a built-in default); checked before each metered `agent()` call; if the next call would cross it, abort and write a partial-result report (FR-015 / D12) |
| Estimate | pre-run figure from case count × blended per-call cost; replaced in the report by the measured figure after the first metered run (SC-008) |

## Credential

| Property | Value |
|---|---|
| Source | environment only; read once at start; fail fast with a clear message if absent (FR-016) |
| Never | prompted interactively; passed as a CLI argument; written to a report, log, or the provenance log |
| Storage | outside the repo tree (gitignored `.env`, OS keychain, or shell profile); repo carries only `.env.example` placeholder names, no values (FR-017) |
| Used by | the judge client always; the standalone metered substrate at the FR-023 milestone only |
