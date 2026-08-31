# Pipeline: intake & normalize (Phase A prototype — live)

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
