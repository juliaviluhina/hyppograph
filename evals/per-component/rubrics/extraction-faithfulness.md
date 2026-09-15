# Rubric: extraction-faithfulness

Grades whether the extraction subtask's structured Job Record fields faithfully represent the
source posting — no invented facts, no dropped material terms (contracts/judge-rubric.md).

## criteria

1. Every value in the produced output that names a fact (salary, `locations`, seniority, employment
   type, posting date, requirement) is either stated in the source posting or is the literal string
   "unknown" — no invented specifics. **Exempt**: `locationBucket` and `normalizedTitle` are
   intentional coarse derivations (e.g. "Remote (EU)" → `remote-eu`; a title minus its seniority
   prefix), not verbatim extractions — judge them for reasonableness of the derivation, not literal
   presence in the source text.
2. No requirement, responsibility, or hard constraint that is material to the role and clearly
   stated in the source posting is missing from the produced output's `requirements` or
   `responsibilitiesSummary`.
3. The salary figure in the produced output matches the source posting's stated figure (verbatim or
   an equivalent restatement), or is "unknown" if the posting does not state one — never a converted
   or inferred figure.
4. `originalLanguage` and the language of `responsibilitiesSummary`/`requirements` are consistent:
   if the source posting is not in English, the produced output is in English and
   `originalLanguage` names the source language.

## pass_rule

all
