# Eval Run 0009 — eval-extraction — 2026-09-15

## Methodology
- Layer: extraction
- Judge: GPT Luna (extraction-faithfulness)
- Substrate: mock

## Under test
- Workflow commit: e09328e
- Model IDs: n/a (mock substrate)
- Fixture: evals/per-component/fixtures/extraction.json
- Run: manual (node evals/run.mjs extraction)

## Results
| case | expected | actual | verdict |
|------|----------|--------|---------|
| extraction-globex-frontend | pass | pass | pass |
| extraction-hooli-nonenglish | pass | pass | pass |

## Cost
- Tokens in / out: 0 / 0
- Dollar cost: $0 (measured)

## Findings
- none
