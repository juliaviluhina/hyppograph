# Eval Run 0008 — eval-pre-triage — 2026-09-15

## Methodology
- Layer: pre-triage
- Judge: GPT Luna (pre-triage-reason)
- Substrate: mock

## Under test
- Workflow commit: e09328e
- Model IDs: n/a (mock substrate)
- Fixture: evals/per-component/fixtures/pre-triage.json
- Run: manual (node evals/run.mjs pre-triage)

## Results
| case | expected | actual | verdict |
|------|----------|--------|---------|
| pretriage-acme-boarda | pass | pass | pass |
| pretriage-initech-boardb | pass | pass | pass |
| pretriage-umbrella-boarda | pass | pass | pass |

## Cost
- Tokens in / out: 0 / 0
- Dollar cost: $0 (measured)

## Findings
- none
