# Eval Strategy: Intake & Normalize Pipeline

**Feature**: 001-intake-normalize-pipeline | **Status**: design / not yet implemented | **Date**: 2026-09-02

Companion to [plan.md](./plan.md) § Phasing. Elaborates the **Tests** row for both phases and adds a
cheaper eval layer that also serves the Phase A exit criteria. Not a new feature spec — if the harness
work grows past a few files it should be promoted to `specs/003-eval-harness/` via `/speckit-specify`.

---

## 1. Motivation

Phase A validation to date has been a single loop: **edit the workflow → re-run the whole thing →
read the summary → guess**. Every component-level defect surfaced only through a full
`.claude/workflows/intake-normalize.js` run — **~89 `agent()` calls, ~25 min** against the 16-record
fixture — and several also needed a **session restart** (`.claude/agents/*.md` is scanned at session
startup, so a mid-session tool-grant edit is ignored).

Five bugs found this way, and where each actually lived:

| # | Bug | Layer | Commit |
|---|-----|-------|--------|
| 1 | Collect hit the live internet | fixture hygiene (`settings.json` had real URLs) | `131203d7` era |
| 2 | triage/normalize silently produced 0 | one agent's tool grant (`hyppo-read`/`hyppo-readwrite` lacked `Glob`, `Read` errors on a dir) | `46abbf3` |
| 3 | Acme dedup miss (`duplicatesMerged: 0`) | pure string logic (key slugged free-text `locations[]`) | `46abbf3` |
| 4 | Acme dedup non-determinism | pure string logic (key exact-matched the judge's wobbly `normalizedTitle`) | `c264d28` |
| 5 | Company-suffix wobble renamed the Job Record file between runs | pure string logic (`companyKey` suffix stripping) | `4682c71` |

Bugs 3–5 are **pure functions**. Bug 2 is **one agent, one grant**. Bug 1 is **fixture setup**. None
needed 89 agents to find, yet the 89-agent run was the only instrument we had. Bugs 4 and 5 are still
**unverified** — the fix landed but no run has re-exercised them.

## 2. Goals / non-goals

**Goals**
- Catch each of the five known bug classes at the cheapest layer that can express it.
- Make the marginal cost of re-checking after a change approach zero.
- Give Phase A a real pass/fail gate instead of eyeballing a summary.
- Fold in the two open validation items: 7d idempotency (SC-006) and 7e live smoke.
- Produce reusable eval infrastructure that carries into Phase B (plan.md § Phasing "Carried over A→B").

**Non-goals**
- Testing model *quality* of downstream (mid/top-tier) steps — out of scope for feature 001.
- Replacing the manual quickstart walkthrough entirely in Phase A — the golden run supplements it.
- CI wiring in Phase A (Phase B concern).

## 3. The three-tier pyramid

### Tier 1 — pure-code unit tests

- **Runtime**: plain Node (`node:test` + `node:assert`), zero dependencies, milliseconds, **$0** (no model).
- **Covers**: `titleKey`, `companyKey`, `slug`, `stableHash`, `foldSet`, the dedup-key assembly
  (`companyKey--titleKey--locKey`), `criteriaFingerprint`, `noTriageCriteria`,
  `effectiveExcludedLocations`, `renderSummary`, `newRunSummary`, `bumpReason`, `provenanceLine`, the
  `trackedBoards → sources` map, the `completeness: low` threshold.
- **Would have caught**: bugs 3, 4, 5 — in seconds each. Also directly re-verifies `c264d28` and
  `4682c71` with no workflow run.
- **Obstacle**: the workflow is one monolith with `// no imports in the sandbox` (line ~960) — it
  can't be `require()`d. **Resolution (option a)**: factor the pure helpers into
  `.claude/workflows/lib/intake-core.mjs` (plain ESM), `import` it into tests; the workflow keeps an
  inlined copy with a **guard test asserting the two regions are byte-identical**. Low drift risk;
  the lib file becomes the Phase B seed.

### Tier 2 — single-agent evals

- **Runtime**: one tiny script per agent — a top-level `for` loop pushing each fixture through a
  **single `agent()` call** (same `agentType`, same Haiku tier), logging a pass/fail table against
  expected JSON. Seconds per case, **cents per suite**.
- **Covers, per agent**:
  - `hyppo-read` — point at the fixture `raw/` dir, **assert 16 records returned** (bug 2, catchable
    in ~10 s instead of a full run + restart).
  - `hyppo-judge` triage — the 16 `raw-*.md` fixtures → assert keep/reject + reason bucket; run each
    N× and assert stable.
  - `hyppo-judge` extraction — assert `locationBucket` stays in `{remote-<region> | <city> | unknown}`
    and is stable across runs (the one remaining LLM axis in the dedup key).
  - `hyppo-readwrite` — merge-in-place into a scratch record → assert `## Sources` links resolve.
  - `hyppo-collect-list` — a saved HTML fixture → assert posting refs parsed.
- **Dependency**: the `agent()` prompt strings must be reachable from the eval — motivates factoring
  the inline prompt text out of `intake-normalize.js` into a shared module both consume. This is a
  real refactor of a committed file and is the main cost of Tier 2.

### Tier 3 — golden synthetic integration run

- **Runtime**: the full workflow via the `Workflow` tool over a **small, fully-known** fixture.
  ~45–50 `agent()` calls, ~10–12 min, **~$1** on API (or subscription tokens in Claude Code).
- **Fixture** — `tests/golden/`:
  - 2–3 synthetic board fixtures, ~8 postings total (vs. 16 in `tests/fixtures/data-dir/`).
  - Collect is a **no-op** (non-resolving `boards.example.com`) — the corpus is pre-seeded
    `raw-*.md`. Hermetic, no HyppoVisor. All five bugs lived in triage+normalize, not collect.
  - The 8 postings deliberately cover: a dedup pair (same role, 2 boards, different phrasing —
    bugs 3 & 4); a company-suffix wobble case (bug 5); an excluded-location reject; a
    no-direction-overlap reject; a clearance reject; a non-english posting (`originalLanguage`); a
    no-salary-no-location posting (`completeness: low`); an already-applied match. Plus a manual drop
    and a `NOTES-` non-posting.
  - `tests/golden/expected/` — committed expected output tree: every Job Record, `companies.md`,
    `last-run-summary.md` (exact `duplicatesMerged: 1`, `newJobRecords: 6`, reject buckets),
    `provenance-log.md`.
- **The test**: copy `golden/` → scratch, invoke the `Workflow`, `diff` scratch output against
  `expected/`. **Idempotency (7d / SC-006) folds in**: run a second time over the same scratch dir,
  assert the diff is empty and `provenance-log.md` is byte-identical.
- **Demotes** the 16-record `tests/fixtures/data-dir/` run to "occasionally, by hand".

### 7e — live smoke (unchanged, kept separate)

One real run: copy `tests/fixtures/live/settings.json` to a scratch dir **outside the repo**, point at
a board search the user is logged into via HyppoVisor, depth 5. ~30 agents + HyppoVisor reads, ~$1.
Not automated; asserts by hand that Job Records + provenance + summary are sane.

## 4. Model independence

Principle II binds **model calls inside the pipeline** — the system under test. Evals are build-time
tooling (Development Workflow carve-out) and are **not** constitutionally bound to Claude. Three roles:

| Role | Model | Locked? |
|---|---|---|
| System under test — the workflow's `agent()` calls | Claude Haiku 4.5 (`FAST`) | **Yes**, by Principle II. That is the thing under test. |
| Assertions — structural diffs, schema checks, byte-equality | none | N/A. All of Tier 1 and Tier 3. |
| Judge — only fuzzy Tier 2 checks (extraction faithfulness, triage-reason soundness) | **non-Claude — GPT Luna** (resolved 2026-09-02) | **Locked to non-Claude.** Deterministic rubric checks (regex / schema / keyword presence) are still preferred wherever they suffice; a model judge is used only for the genuinely fuzzy remainder, and when used it is GPT Luna — never a Claude model. |

**Why non-Claude for the judge**: (a) cross-family judging removes self-preference bias — a Claude judge grading Claude output flatters it; (b) it runs on the user's existing GPT Luna access, so judge calls never touch the Anthropic meter (the $25 credit budget in §5 is for the SUT runs only); (c) it keeps the judge and the SUT independently swappable.

The standalone Agent SDK harness (if built) drives only the SUT; its own orchestration is plain code, and the judge stays a separate GPT Luna call outside it.

## 5. Cost & budget

Haiku 4.5: **$1.00 / 1M input · $5.00 / 1M output**. Per-`agent()`-call estimate (structural, ±2×,
not yet measured): light (no tools) ~$0.007, medium (1 read/glob) ~$0.015, heavy (readwrite merge)
~$0.035 — blended **~$0.02/call**.

| Run | Calls | Est. | Range |
|-----|-------|------|-------|
| Tier 1 full suite | 0 | **$0** | $0 |
| Tier 2 one suite (re-run) | ~48 light | ~$0.35 | $0.2–0.7 |
| Tier 2 full sweep | ~150–200 | ~$3 | $2–5 |
| Tier 3 golden + idempotency re-run | ~90–100 | ~$2 | $1–4 |
| Full 16-record run (current 7b/7c) | ~89 | ~$2.50 | $1.5–4 |
| 7e live run | ~30 + HV | ~$1 | $0.5–2 |

**Budget to finish Phase A validation**

- *Blind full-run loop (status quo, on API)*: ~10 full runs shook out the 5 bugs → **~$25**, plus
  ~$2.50 per future regression check.
- *Eval pyramid*: Tier 1 ($0) retires bugs 3–5 permanently; Tier 2 (cents) catches bug 2 + prompt
  regressions; Tier 3 golden (~$1–2) run ~5× while stabilising → **~$5–15 total**, then near-$0
  marginal. On API this is ~2–3× cheaper to reach a validated Phase A.

**Recommendation**: a **$25 credit top-up** covers the eval-pyramid path with headroom (worst case
~$24). It is *tight* if we also build the standalone Agent SDK harness now (harness iteration + a
rougher debug loop → **$40–50**). Before spending down: do Tier 1 for free, then run the golden
fixture **once with usage logging** to replace the ±2× estimate with a measured per-run figure.

## 6. Substrate decision

| Option | Billing | Portfolio value | Notes |
|--------|---------|-----------------|-------|
| **`Workflow` tool in Claude Code** (current) | subscription / plan tokens | low | Already an Agent-SDK-backed runner. Tier 3 + 7e run here for ~$0 to the user. |
| **Standalone `@anthropic-ai/claude-agent-sdk` harness** | `ANTHROPIC_API_KEY` (pay-per-token); the `ant auth login` profile can draw on the subscription but is rate-limited and not meant for batch eval loops | high — demonstrable eval infra | This is Phase B option **B2**. Only justified now if the portfolio evidence is worth ~$10–20 of API spend. |

Tier 1 is substrate-independent (plain Node). Tier 2/3 can run either place; default to the `Workflow`
tool until/unless B2 is chosen.

### 6.1 Dev-vs-official substrate — "build cheap, then Haiku"

The goal is to spend no metered API dollars until a run's *result* actually matters. "Cheaper model"
does not really apply — nothing in the Claude line is cheaper than Haiku, and swapping the
workflow-under-test to a different model (GPT Luna, a local model) invalidates every assertion,
because **the model is the system under test**. So "cheaper" resolves to a cheaper *substrate* (the
already-paid plan) or to *no model at all* (a mock).

| Eval layer | Depends on the model? | Dev / troubleshooting substrate | Official / metered substrate |
|---|---|---|---|
| Tier 1 (pure code) | No | plain Node, $0 | plain Node, $0 — same |
| Tier 2/3 **plumbing** (setup → invoke → read → diff → report, fixture load, JSON parse) | No — mechanism only | a **mock `agent()`** returning fixture-canned JSON — deterministic, zero cost; *or* the `Workflow` tool (plan tokens) | — |
| Tier 2/3 **assertions** (`expected/` values, thresholds, N-run stability) | **Yes — this is the point** | real Haiku via the `Workflow` tool (plan tokens, ~$0 to the user) | Haiku via standalone Agent SDK + API key (B2), only for CI / reproducibility / portfolio |

**Sequence:**

1. **Tier 1** — plain Node, no model, $0. Build and debug freely.
2. **Tier 2/3 plumbing** — debug against a mock `agent()`. No model calls.
3. **Author + lock the `expected/` fixtures** — wire real Haiku, run via the `Workflow` tool a handful
   of times (plan tokens). API spend so far: $0. GPT Luna judge wired here too (off the Anthropic meter).
4. **CREDITS CHECKPOINT — stop and ask the user to buy Claude API credits.** This is the *first and
   only* point real money is committed. Reached only when steps 1–3 are green **and** the user has
   chosen to go to B2 (CI / reproducibility / the portfolio artifact — §7 decision 5). Ask for a
   **~$25 top-up** (§5 budget: worst case ~$24 for the pyramid path; ~$40–50 if harness iteration is
   heavy). Do **not** start step 5 until the user confirms the credits are purchased. If B2 is *not*
   chosen, the sequence ends at step 3 and nothing is metered.
5. **Port to standalone Agent SDK + API key + Haiku** — metered runs start here, on runs that matter:
   the CI gate, reproducibility checks, the portfolio artifact. Re-lock `expected/` fixtures once for
   harness drift (see caveat below).

Realistic outcome: **$0** if the sequence ends at step 3; **$0–5** of a $25 top-up if B2 is chosen and
only the final gate is metered; up to ~$25 if harness iteration is heavy.

**Caveat — harness drift, not model drift.** Same `claude-haiku-4-5` weights, but the `Workflow` tool
wraps them in Claude Code's harness + the `.claude/agents/*.md` defs, while a standalone Agent SDK
harness has its own system prompt and a reconstructed agent config. Expect a **light re-lock of the
`expected/` fixtures** when porting substrate at step 4 — behavioural, from the harness, not the model.
The `agentType` / prompt / schema text is carried over (plan.md § Phasing "Carried over A→B"); the
surrounding harness is not.

## 7. Open decisions

**Resolved (2026-09-02):**
- **LLM-as-judge is non-Claude — GPT Luna.** Never a Claude model for the judge role. See §4.
- **Money is committed at one point only** — the §6.1 step-4 credits checkpoint, and only if B2 is
  chosen. Steps 1–3 spend $0.

**Still open:**

1. **Doc scope** — keep this as a design doc under 001, or promote to `specs/003-eval-harness/` with
   full `/speckit-*` treatment? (Recommend: stay here until implementation exceeds ~a handful of files.)
2. **Prompt extraction** — OK to factor the inline `agent()` prompt strings out of
   `intake-normalize.js` into a shared module? Required for faithful Tier 2; it's a real edit to a
   committed file.
3. **Golden fixture** — author a fresh `tests/golden/` (~8 records), or shrink the existing 16-record
   fixture? (Recommend: fresh; leave `tests/fixtures/data-dir/` for the occasional full run.)
4. **`package.json`** — add one for `node --test`, or keep the repo build-tool-free and invoke tests
   ad hoc? Tier 1 needs no deps either way.
5. **Portfolio call** — build the standalone Agent SDK harness now (parallel to Phase A validation),
   or after Phase A sign-off (it is literally Phase B / B2)?
6. **Sequencing** — Tier 1 + Tier 3 first (they directly unblock finishing Phase A), Tier 2 after;
   or all three before any more workflow runs?

## 8. Relationship to existing tasks

- **T043 / SC-006** (idempotency) — realised by the Tier 3 golden idempotency re-run.
- **T047** (Phase A exit review) — the golden run + Tier 1 green become inputs to the exit review;
  record "eval pyramid stood up" and the B1/B2 decision there.
- **plan.md § Phasing "Tests" row** — Phase A gains: Tier 1 unit + Tier 3 golden integration + manual
  quickstart. Phase B "Tests" row (vitest unit + integration, CI) is Tier 1/2/3 ported onto B2's stack.
