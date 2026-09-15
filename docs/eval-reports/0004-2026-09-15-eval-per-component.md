# Eval Run 0004 — eval-enumerate, eval-pre-triage, eval-extraction, eval-source-list — 2026-09-15

## Methodology
- Layer: all four per-component evals (`enumerate`, `pre-triage`, `extraction`, `source-list`)
- Judge: GPT Luna (`gpt-5.6-luna`, `reasoning.effort: low`) for `pre-triage` (rubric
  `pre-triage-reason`, 3 cases) and `extraction` (rubric `extraction-faithfulness`, 2 cases);
  `enumerate` and `source-list` are fully deterministic, no judge
- Substrate: mock (canned per-case results; deterministic parts real, judgment canned — research D7)

## Under test
- Workflow commit: f783486
- Model IDs: n/a (mock substrate — no Claude calls); judge: `gpt-5.6-luna`
- Fixture: `evals/per-component/fixtures/{enumerate,pre-triage,extraction,source-list}.json`
- Run: 2026-09-15 / manual (`node evals/run.mjs <layer> --substrate mock --confirm-spend`, US5
  report-writing not yet wired)

## Results
| case | expected | actual | verdict |
|------|----------|--------|---------|
| enumerate (2 cases) | exact record-set match | exact match | pass |
| pre-triage (3 cases, judge-graded) | decision match + reason-soundness pass | pass | pass |
| extraction (2 cases, judge-graded) | field match + faithfulness pass | pass | pass |
| source-list (3 cases) | opened/refCount match | match | pass |

All four layers exit 0.

## Cost
- Tokens in / out: not measured (Responses API usage field not yet parsed)
- Dollar cost: $0 measured on every judge call made while building this phase (6 live calls total —
  1 standalone verification + 5 across pre-triage/extraction fixture iterations)

## Findings

1. **The live judge caught three real fixture-authoring defects**, exactly the mechanism this layer
   exists to provide:
   - `pre-triage`'s judge call originally received only the posting text and the produced
     decision/reason — no configured criteria/directions. It correctly refused to credit a reason it
     had no way to check ("no configured directions are provided"). Fixed by folding the configured
     hard stops/directions into `source_posting` in `pre-triage.mjs` (the judge exchange has no
     separate context channel — contracts/judge-rubric.md's `{criteria, source_posting,
     produced_output}` shape is the only one available).
   - `extraction`'s fixtures claimed `seniority`/`postingDate` values the trimmed posting text never
     stated — genuine invented facts per the production prompt's own rule ("NEVER infer, guess").
     Fixed by setting those fields to `"unknown"` in the fixtures, matching what the postings
     actually say.
   - The Hooli fixture's `locations` claimed `"Berlin, Germany"` when the posting only said
     "Standort: Berlin" — inferring the country is exactly the kind of unstated-fact addition the
     production prompt forbids. Fixed to `"Berlin"`.
2. **Rubric calibration gap found and fixed**: `extraction-faithfulness` criterion 1 originally
   required every field to be literally stated in the source text, but `locationBucket` and
   `normalizedTitle` are INTENTIONAL coarse derivations by design (e.g. "Remote (EU)" →
   `remote-eu`) — the judge correctly flagged `remote-eu` as "not stated," which is true but not a
   faithfulness defect. Added an explicit exemption for these two derived fields.
3. **Rubric calibration gap found and fixed**: `pre-triage-reason` criterion 3 penalized a "kept"
   case for citing only the matched direction's name, but the production prompt's own instruction
   for a keep is exactly "name the matched direction" — terse by design, not a soundness defect.
   Scoped criterion 3 to "rejected" decisions only.
4. A pre-existing cosmetic inconsistency, not fixed: `tests/synthetic/fixtures/mock-answers.mjs`
   (the integration gate's fixture set, report 0002) still carries `"Berlin, Germany"` for the same
   Hooli posting and non-`"unknown"` seniority/postingDate — a different, independently-locked
   fixture set that this layer's judge never inspects, so it is not a functional bug for either
   layer, just a minor drift between the two synthetic fixture sets worth reconciling later.
