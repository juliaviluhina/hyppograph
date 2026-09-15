# How to use

HyppoGraph runs as a [Claude Code dynamic workflow](https://code.claude.com/docs/en/workflows)
inside a Claude Code session — there is no standalone binary or server yet (see
[Solution design → Status](./solution-design.md#status)).

## 1. Set up HyppoVisor

Both live workflow stages need [HyppoVisor](https://github.com/juliaviluhina/hyppovisor)
as an MCP server for any authenticated page read. Configure it via
[`.mcp.json`](../.mcp.json) at the repo root, with `HYPPO_VISOR_MCP_URL` and
`HYPPO_VISOR_MCP_TOKEN` in the environment. Only HyppoVisor's read/navigation tools
are used — nothing here clicks, applies, or submits on your behalf
([Principle IV](../.specify/memory/constitution.md#iv-the-human-owns-the-last-mile)).

## 2. Point at a data directory

Set `HYPPO_DATA_DIR` (or your local equivalent) to a folder following the
[data directory layout](./solution-design.md#the-data-directory). For a first run
without your own data, use the committed synthetic fixtures at
[`tests/fixtures/data-dir/`](../tests/fixtures/data-dir/) — see
[`tests/fixtures/README.md`](../tests/fixtures/README.md) for what each fixture
exercises. For a real search, start from
[`docs/settings.template.json`](./settings.template.json) and
[`docs/evidence-template/`](./evidence-template/).

`inputs/settings.json` must have `completeness.setupReady: true`, or the workflow
reports the unresolved sections and exits with zero writes.

## 3. Run the workflows

In a Claude Code session, run each workflow via `/workflows` (or the saved slash
command once available: `/intake-normalize`, `/fit-screen`). Pass `runTimestamp` and
`dataDir` via `args` — the workflow clock is frozen for replay determinism.

1. **`.claude/workflows/intake-normalize.js`** — collect → pre-triage → normalize.
   Populates `outputs/job-records/`.
2. **`.claude/workflows/fit-screen.js`** — verify → score. Reads feature 1's Job
   Records read-only, requires `inputs/evidence/*.md` populated, and populates
   `outputs/evaluations/`.

## 4. Check the results

- `outputs/job-records/` and `outputs/evaluations/` — the pipeline's actual output.
- `provenance-log.md` — an append-only line per write, anywhere in the data
  directory.
- `outputs/last-run-summary.md` / `outputs/last-run-summary-fit-screen.md` — a
  per-run summary.
- Each spec's `quickstart.md` — the scenarios to check output against by hand
  (Phase A validation; see [Testing](./testing.md)).

Full per-stage input/output detail: [`docs/pipeline.md`](./pipeline.md).
