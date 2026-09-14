# Pipeline: intake & normalize (Phase A prototype — live)

> **Update**: the next two pipeline steps — **verify → score** — are live as a second dynamic
> workflow, `.claude/workflows/fit-screen.js`. It reads this workflow's Job Records read-only (no
> HyppoVisor call of its own) and produces cited Fit Evaluations. Full design:
> [`specs/004-retrieval-fit-screen-rework/`](../specs/004-retrieval-fit-screen-rework/).

The opening three steps of the HyppoGraph pipeline — **collect → pre-triage → normalize** — are
implemented as a **Claude Code dynamic workflow** at
[`.claude/workflows/intake-normalize.js`](../.claude/workflows/intake-normalize.js).

Full design: [`specs/001-intake-normalize-pipeline/`](../specs/001-intake-normalize-pipeline/)
(spec, plan, research, data-model, contracts, quickstart, tasks).

## What it does

| Stage | Input | Action | Output under `HYPPO_DATA_DIR` |
|---|---|---|---|
| **collect** | `inputs/settings.json` → `trackedBoards[]`, `inputs/manual-postings/` | Open each user-authored filtered board search through HyppoVisor's read tools; store every retrieved posting verbatim; ingest the manual drop | `outputs/job-records/raw/*.md` (+ `provenance-log.md`) |
| **pre-triage** | Raw Records + `hardStops` + `directions` | One fast-tier keep/reject judgment per Raw Record against hard stops and coarse direction overlap; high-recall gate | `triage:` block written onto each Raw Record's front-matter |
| **normalize** | `triage.decision === "kept"` Raw Records | Fast-tier extraction into the fixed field set; company-name canonicalisation; cross-source dedup (merge in place); already-applied linking from `inputs/applications.md` | `outputs/job-records/<key>.md`, `outputs/job-records/companies.md`, `outputs/last-run-summary.md` |

The workflow **script** owns all control flow (collect → triage → normalize, in that fixed order);
each `agent()` call is one bounded subtask that returns only its declared JSON schema
([`contracts/schemas.md`](../specs/001-intake-normalize-pipeline/contracts/schemas.md)). No model call
decides what runs next (Constitution Principle I). Every judgment runs at the **fast tier**
(`model: "haiku"`) — the only tier this feature uses (Principle II). No subagent is granted an
Edit / Bash / submit / `mcp__hyppovisor__interact` capability; collect subagents get only HyppoVisor
read/navigation tools plus `Write` (Principle IV). All state is plain files under `HYPPO_DATA_DIR`,
with one `provenance-log.md` line per Raw Record, triage mark, and Job Record (Principle V).

## Run it (Phase A)

1. Configure HyppoVisor as an MCP server — [`.mcp.json`](../.mcp.json) at the repo root, with
   `HYPPO_VISOR_MCP_URL` + `HYPPO_VISOR_MCP_TOKEN` in the environment. Only HyppoVisor's
   read/navigation tools are used.
2. Point `HYPPO_DATA_DIR` at a data dir whose `inputs/settings.json` has `completeness.setupReady: true`
   (produced by feature 002's onboarding, or hand-written). For local validation use
   [`tests/fixtures/data-dir/`](../tests/fixtures/data-dir/).
3. In a Claude Code session, run the workflow via `/workflows` (or `/intake-normalize` once saved).
   Pass `runTimestamp` and `dataDir` via `args` — the workflow clock is frozen for replay determinism.
4. Check `outputs/job-records/`, `provenance-log.md`, and `outputs/last-run-summary.md` against the
   [quickstart scenarios](../specs/001-intake-normalize-pipeline/quickstart.md).

If `settings.json` is missing or `setupReady` is false, the workflow prints the unresolved sections
and exits with **zero writes** (FR-000).

## Status

Phase A is a prototype: validation is **manual** (quickstart scenarios by hand). Automated `vitest` +
CI coverage, hard idempotency guarantees, and the SC-006a / SC-007 statistical measurements are
**Phase B**, a separate slice gated on the Phase A exit review (tasks.md T047).

---

# Pipeline: retrieval verification & fit-screen (Phase A prototype — live)

The next two steps — **verify → score** — are implemented as a second Claude Code dynamic workflow
at [`.claude/workflows/fit-screen.js`](../.claude/workflows/fit-screen.js), run after
`intake-normalize.js`. It reads that workflow's Job Records **read-only** — no HyppoVisor call of
its own (this feature never opens a new browsing session).

Full design: [`specs/004-retrieval-fit-screen-rework/`](../specs/004-retrieval-fit-screen-rework/)
(spec, plan, research, data-model, contracts, quickstart, tasks).

## What it does

| Stage | Input | Action | Output under `HYPPO_DATA_DIR` |
|---|---|---|---|
| **verify** | Job Records not marked `confirmed-closed` | A stateless ATS posting-API re-check (Greenhouse/Lever/Ashby) for a still-open signal, paced like feature 001's collection; a non-ATS source is `unresolvable` with no network call | Amended `openStatus`/`openStatusCheckedAt`/`openStatusReason` fields on each Job Record (+ `provenance-log.md`) |
| **score** | Confirmed-open/unresolvable Job Records + `inputs/evidence/*.md` + this feature's `settings.json` additions | One mid-tier, cited fit judgment per record: a per-requirement table, a hard-constraint gate, anti-pattern checks, one overall verdict, and reconciled application state against `inputs/applications.md` | `outputs/evaluations/<key>.md` (+ amended `applicationState` on the Job Record, `provenance-log.md`) |

The workflow script owns all control flow (verify → score, in that fixed order); `hyppo-verify`
returns only a raw signal (never a disposition) and `hyppo-score` proposes per-item judgments but
never the final `overallVerdict` — the script computes that alone (Constitution Principle I). Every
call declares its tier: `hyppo-verify` and any delegated `hyppo-judge` sub-task run fast
(`model: "haiku"`); `hyppo-score` is the one mid-tier call (`model: "sonnet"`), matching the
constitution's "mid for scoring with cited evidence" clause (Principle II). No subagent here is
granted `Edit`/`Bash`/a submit capability, or `mcp__hyppovisor-hyppograph__interact` (Principle IV).
All state stays under `HYPPO_DATA_DIR`, with one `provenance-log.md` line per open-status mark set or
changed, per Fit Evaluation written, and per `applicationState` value recorded (Principle V).

## Run it (Phase A)

1. Point `HYPPO_DATA_DIR` at a data dir that already has feature 001's output
   (`outputs/job-records/*.md`) and this feature's `inputs/evidence/*.md` populated — for local
   validation use [`tests/fixtures/data-dir/`](../tests/fixtures/data-dir/), or copy
   [`docs/settings.template.json`](./settings.template.json) +
   [`docs/evidence-template/`](./evidence-template/) into a fresh data directory (SC-013).
2. In a Claude Code session, run the workflow via `/workflows` (or `/fit-screen` once saved). Pass
   `runTimestamp` and `dataDir` via `args` — the workflow clock is frozen for replay determinism.
3. Check `outputs/evaluations/`, the amended fields on `outputs/job-records/*.md`,
   `provenance-log.md`, and `outputs/last-run-summary-fit-screen.md` against the
   [quickstart scenarios](../specs/004-retrieval-fit-screen-rework/quickstart.md).

If `inputs/settings.json`'s `evidenceBase`/`hardConstraints`/`targetRoles` sections are missing,
empty, or inconsistent, the workflow reports the specific unresolved item and exits with **zero
writes** (FR-000, SC-012).

## Status

Phase A is a prototype: validation is manual (quickstart scenarios by hand). Automated `vitest`
coverage and the SC-003/005/006/008 statistical measurements against a labelled eval set are Phase B,
a separate slice gated on the Phase A exit review (tasks.md T053).
