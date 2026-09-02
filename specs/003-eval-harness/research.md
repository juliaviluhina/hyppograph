# Phase 0 Research: Pipeline Eval Harness

**Feature**: 003-eval-harness | **Date**: 2026-09-02

Input: [spec.md](./spec.md) and the design precursor `specs/001-intake-normalize-pipeline/eval-strategy.md`
(moves to `specs/003-eval-harness/eval-strategy.md` during this plan — FR-021). The spec carries no
`NEEDS CLARIFICATION` markers; this file resolves the still-open items from eval-strategy §7 and the
`/speckit-clarify` deferred list.

---

## D1 — Component-layer runtime

**Decision**: Plain Node with `node:test` + `node:assert`, ESM `.mjs`, no third-party test framework.
Whole suite target < 5 s, zero model calls, zero network.

**Rationale**: The pure helpers are dependency-free string/number logic. `node --test` is built in on
Node ≥ 20, needs no install, and gives TAP output and a non-zero exit on failure — enough for a
pre-commit hook or a `make`-style target (US1 scenario 3). Adding `vitest` now buys nothing the free
layer needs; Phase B of feature 001 can port these onto `vitest` if that stack is adopted there.

**Alternatives considered**: `vitest` (extra dependency, watch mode and mocking the free layer does
not use); a single ad-hoc assert script (loses per-case naming and discovery).

## D2 — Extracting helpers and prompts past the sandbox's no-import rule

**Decision**: `.claude/workflows/lib/intake-core.mjs` (pure helpers) and
`.claude/workflows/lib/prompts.mjs` (agent prompt text) are the **source of truth**. The workflow
file carries a **marker-delimited inlined copy** of each region
(`/* BEGIN inlined:intake-core */ … /* END inlined:intake-core */`). `evals/component/drift.test.mjs`
asserts the workflow's inlined region is **byte-identical** to the module's exported body (modulo the
export/import lines), and names the drift when it is not (FR-002, US1 scenario 2).

**Rationale**: The `Workflow`-tool runtime evaluates `intake-normalize.js` in a sandbox with
`// no imports in the sandbox` (line ~960), so it cannot `import` the modules at run time. The evals
run in ordinary Node and import the modules directly, so they exercise the real helpers and the real
prompt strings — no hand-maintained second copy in the eval tree. A byte-identity guard is a few
lines and fails loudly; drift risk is low because the regions are small and change rarely.

**Alternatives considered**: a build step that regenerates the whole workflow file from fragments
(heavier, and a generated committed file is awkward to review); leaving prompts inline and having the
evals re-declare them (violates FR-007 "the exact prompt the pipeline uses — not a copy").

**Follow-through for `/speckit-tasks`**: the extraction is one task per region (helpers, prompts),
each ending with the drift guard green; the workflow's observable behaviour must not change (an
integration-gate run before and after the extraction produces the same expected tree).

## D3 — Integration-gate dataset: fresh synthetic set

**Decision**: Author a fresh `tests/synthetic/data-dir/` of ~8 postings, one instance of each known
failure mode, plus a manual-drop file and a non-posting file. Leave `tests/fixtures/data-dir/` (16
records) untouched for occasional full runs. (Clarifications session — Q1:A; FR-003.)

**Rationale**: Every expected Job Record, company mapping, summary count, and provenance line must be
knowable in advance for the gate to be a real pass/fail. A trimmed copy of the 16-record fixture
carries incidental content that muddies the expected tree. The 8 postings are chosen to cover:
cross-source duplicate pair (bugs 3 & 4), company-suffix wobble (bug 5), excluded-location reject,
no-direction-overlap reject, clearance reject, non-English posting, low-completeness posting,
already-applied match.

**Alternatives considered**: shrink the existing fixture (drags in noise, and edits a fixture other
tasks depend on).

## D4 — Board URLs in the synthetic dataset are non-resolving

**Decision**: `tests/synthetic/data-dir/inputs/settings.json` points tracked searches at a
non-resolving host (`boards.invalid` / `boards.example.com`). Collection over the synthetic dataset
resolves to nothing; the corpus is the pre-seeded `raw-*.md` files. The gate asserts no network
access occurred (FR-006, US2 scenario 3).

**Rationale**: All five known bugs lived in triage + normalize, not collect. A hermetic dataset makes
the gate reproducible and safe to run unattended-adjacent (it still needs the model layers, so it is
not actually wired unattended). `.invalid` is reserved by RFC 2606 and guaranteed not to resolve.

**Alternatives considered**: a mock HyppoVisor (more moving parts for a stage the bugs never touched).

## D5 — Judge model and access

**Decision**: The judge is the developer's **GPT Luna** access (non-Claude), reached with a thin
`fetch` wrapper reading its credential from the environment. It grades exactly two assertion types —
extraction faithfulness and pre-triage reason soundness — each against an explicit written rubric,
returning pass/fail per criterion (FR-010, FR-010a). Judge calls run on an account separate from any
metered Claude account, so they never consume the Claude eval budget.

**Rationale**: (a) cross-family judging removes the self-preference bias of a Claude judge grading
Claude output; (b) it is already paid for and off the Anthropic meter; (c) judge and system under
test stay independently swappable. Deterministic checks (regex / schema / keyword / byte-equality)
are still used wherever they suffice; the model judge covers only the genuinely fuzzy remainder.

**Alternatives considered**: a Claude judge (self-preference bias; also spends the eval budget); no
model judge at all (extraction faithfulness and reason soundness do not reduce cleanly to regex).

## D6 — Default substrate and the single real-spend decision point

**Decision**: The model-backed layers run on the Claude Code `Workflow` tool (subscription-billed,
~$0 to the user) for development and for authoring/locking the expected tree. The standalone metered
substrate (`@anthropic-ai/claude-agent-sdk` + a stored API credential) is built **only** as the final
milestone, after all free layers are green, and **only** after the user explicitly approves the
credit spend — the one recorded decision point (FR-019, FR-020, FR-023).

**Rationale**: No metered Claude dollar is spent until a run's *result* matters (reproducibility +
the portfolio artifact). Swapping the system under test to a cheaper model is not an option — the
model is the thing under test, so a different model invalidates every assertion. "Cheaper" therefore
means a cheaper *substrate* (the already-paid plan) or *no model* (the mock in D7).

**Alternatives considered**: build the standalone harness up front (spends credits during harness
iteration, before results matter); never build it (loses the reproducibility + portfolio evidence
that motivates FR-019).

## D7 — Debugging the model-backed plumbing without spending

**Decision**: `evals/lib/mock-agent.mjs` is a deterministic `agent()` stand-in that returns
fixture-canned JSON. The setup → invoke → read → diff → report plumbing of the per-component and
integration layers is debugged against the mock (zero cost, zero network). Real Haiku via the
`Workflow` tool is wired only when authoring and locking the `expected/` values and running N-run
stability checks.

**Rationale**: The plumbing is mechanism, not model behaviour; it should not cost anything to
iterate on. Pacing (`HYPPO_PACING_MS`, default 3000) is honoured on real runs.

## D8 — Layer build sequence

**Decision**: (1) component layer → (2) integration gate + idempotency → (3) per-component evals →
(4) *[gated]* standalone metered substrate.

**Rationale**: The component layer and the integration gate directly unblock feature 001's Phase A
validation (they retire bugs 3–5 permanently and give Phase A a real pass/fail gate + the SC-006
idempotency check). Per-component evals are additive coverage — they catch a subtask's missing
capability (bug 2) and pin model-derived values — and depend on the D2 prompt extraction, so they
come after the gate proves the extraction did not change behaviour. Step 4 is the FR-023 milestone,
untouched until its credit approval.

**Alternatives considered**: per-component evals before the gate (blocks Phase A longer on the
prompt-extraction refactor); all three free layers before any further workflow run (delays the
Phase A gate for no gain).

## D9 — `package.json`

**Decision**: Add a minimal `package.json` — `"private": true`, `"type": "module"`, `scripts` for the
free layer only (`"test": "node --test evals/component/"`, `"eval": "node evals/run.mjs"`), **no
runtime dependencies**. The eventual `@anthropic-ai/claude-agent-sdk` goes in `devDependencies` at
the FR-023 milestone, not before.

**Rationale**: Gives a stable entry point (`npm test`) and a documented home for the one future
dependency, without pulling a toolchain into a repo that has been build-tool-free. `.mjs` is treated
as ESM by Node regardless, so nothing breaks if a contributor ignores `npm`.

**Alternatives considered**: no `package.json` (works, but leaves the future SDK dependency with
nowhere declared and `npm test` undefined).

## D10 — Report file naming and index

**Decision**: `docs/eval-reports/NNNN-YYYY-MM-DD-<scope>.md`, zero-padded 4-digit sequence, where
`<scope>` ∈ `component` | `eval-<subtask>` | `integration` | `integration-idem` | `live-smoke`.
`docs/eval-reports/README.md` holds the index table: `| NNNN | date | scope | result | cost | commit |`.
(FR-011, FR-013; report location from Clarifications Q4:A.)

**Rationale**: Sequence-first sorts chronologically and gives each run a short handle; the scope
token makes the ledger readable at a glance. The index is the spend ledger — metered rows sum to a
reconstructable total (SC-008).

## D11 — SC-008 "small margin"

**Decision**: The report index's summed metered cost must match the account's recorded spend for the
same runs within **10% or $1, whichever is larger**.

**Rationale**: The report figure is derived from `usage` token counts × published per-token price;
the account figure includes request-level overhead and rounding the token math does not model. 10%/$1
absorbs that without hiding a real discrepancy (e.g. a run that spent but was not logged).

**Alternatives considered**: exact match (fails on unavoidable rounding); a fixed $ tolerance only
(too loose for a $2 run, too tight for a $40 total).

## D12 — Dev-substrate pacing / throttling behaviour

**Decision**: Real model-backed runs honour `HYPPO_PACING_MS` (default 3000 ms between `agent()`
calls, already in `.env.example`). The mock substrate (D7) ignores pacing. The per-run spend ceiling
(FR-015) is checked before each metered `agent()` call and aborts with a partial-result report if the
next call would cross it.

**Rationale**: Reuses the knob the pipeline already exposes; keeps the mock fast; makes the ceiling a
pre-call check so it never overshoots.

---

## Resolved open items (from eval-strategy §7 and `/speckit-clarify` deferred)

| Item | Resolution |
|---|---|
| Doc scope (§7.1) | This feature exists; eval-strategy.md becomes companion design notes here (FR-021). |
| Prompt extraction (§7.2) | Yes — D2; shared module + inlined copy + drift guard (FR-007a). |
| Golden vs. shrunk fixture (§7.3) | Fresh `tests/synthetic/` (D3; FR-003). |
| `package.json` (§7.4) | Minimal, no deps — D9. |
| Portfolio / standalone harness timing (§7.5) | Final gated milestone — D6 (FR-023). |
| Layer sequencing (§7.6) | component → integration → per-component → *[gated]* metered — D8. |
| Report location (§7.7) | `docs/eval-reports/` — D10 (Clarifications Q4:A). |
| Dev-substrate throttling behaviour (clarify deferred) | Honour `HYPPO_PACING_MS`; pre-call ceiling check — D12. |
| Report file-naming scheme (clarify deferred) | `NNNN-YYYY-MM-DD-<scope>.md` — D10. |
| SC-008 "small margin" (clarify deferred) | 10% or $1, whichever is larger — D11. |

No `NEEDS CLARIFICATION` remain. Proceed to Phase 1.
