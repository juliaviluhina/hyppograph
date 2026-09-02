# Contract: judge rubric + judge exchange

The judge is a **non-Claude** model (the developer's GPT Luna access), used for exactly two assertion
types and nothing else (FR-010). Every other assertion in the harness is deterministic.

## Permitted types

| `type` | Question it answers |
|---|---|
| `extraction-faithfulness` | Does the extracted Job Record faithfully represent the source posting (no invented facts, no dropped material terms)? |
| `pre-triage-reason` | Is the keep/reject reason sound given the posting text and the configured criteria? |

A rubric of any other `type` is a contract violation — the harness refuses to run it.

## Rubric file — `evals/per-component/rubrics/<type>.md`

```markdown
# Rubric: <type>

## criteria
1. <explicit check, answerable pass/fail from the posting + output alone>
2. <…>

## pass_rule
all            # or: "at least N of M" — default "all"
```

Criteria must be concrete and self-contained. "The salary in the record matches the posting or is
absent in both" — yes. "The extraction is good" — no.

## Judge request

Constructed by `evals/lib/judge.mjs`. Payload:

```json
{
  "criteria": ["…", "…"],
  "source_posting": "<verbatim fixture text>",
  "produced_output": { "…": "…" }
}
```

- The credential is a transport header only — never in the payload, never logged (FR-012, FR-016).
- Synthetic fixture data only ever crosses to the judge.

## Judge response

```json
{
  "results": [
    { "criterion": "…", "verdict": "pass", "note": "" },
    { "criterion": "…", "verdict": "fail", "note": "salary 120k in posting, absent in record" }
  ]
}
```

Case verdict = `pass_rule` applied to the per-criterion verdicts. A response missing a criterion, or
returning anything other than `pass`/`fail`, fails the case with a "judge response malformed" note.

## Report linkage

Any case that used the judge names it in the report's *Methodology* section (case ids + rubric
`type`). The judge model ID appears under *Under test*. No judge prompt or response body is copied
into the report — only the per-criterion verdicts in the results table.
