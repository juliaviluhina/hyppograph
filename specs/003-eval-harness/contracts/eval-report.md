# Contract: eval report + index

## Report file — `docs/eval-reports/NNNN-YYYY-MM-DD-<scope>.md`

- `NNNN` — zero-padded 4-digit sequence, monotonic across all scopes.
- `<scope>` — `component` | `eval-<subtask>` | `integration` | `integration-idem` | `live-smoke`.
- One file per run. Committed. Human-readable Markdown. Synthetic-data-only.

### Required sections (in order)

```markdown
# Eval Run NNNN — <scope> — YYYY-MM-DD

## Methodology
- Layer: <which of the four>
- Judge: <none | GPT Luna for cases X, Y — rubric <type>>
- Substrate: <workflow-tool | mock | metered>

## Under test
- Workflow commit: <sha>
- Model IDs: claude-haiku-4-5 ; judge: <model id or n/a>
- Fixture: <dir> (hash <h>)
- Run: <timestamp> / <run id>

## Results
| case | expected | actual | verdict |
|------|----------|--------|---------|
| ...  | ...      | ...    | pass/fail |
<!-- for each fail, an actual-vs-expected diff block below the table -->

## Cost
- Tokens in / out: <n> / <n>
- Dollar cost: <0 for component & workflow-tool ; measured figure for metered>

## Findings
- <bugs caught + fix-commit link | expected-tree re-lock + reason | partial-result note | "none">
```

### Forbidden in any report (FR-012, SC-007)

Credentials, auth headers, request/response bodies, personal data, any content not from the synthetic
fixtures. Reports carry model **IDs** and token **counts** only.

## Index — `docs/eval-reports/README.md`

A single table, newest last:

```markdown
| NNNN | date | scope | result | cost | commit |
|------|------|-------|--------|------|--------|
| 0001 | 2026-09-02 | component | pass (42/42) | $0 | abc1234 |
```

- `result` — `pass (n/n)` | `fail (k/n)` | `partial (ceiling)`.
- `cost` — `$0` for free layers; the measured figure for metered runs.
- Metered rows MUST sum to a total within 10% or $1 (whichever is larger) of the account's recorded
  spend for the same runs (SC-008).

## Generation

The harness writes the report as its final step (SC-009). For a `Workflow`-tool run whose driver is
the tool rather than `evals/run.mjs`, the report is assembled by hand from the run summary using this
same layout until the standalone substrate exists.
