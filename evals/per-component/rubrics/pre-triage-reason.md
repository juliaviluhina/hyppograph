# Rubric: pre-triage-reason

Grades whether the pre-triage subtask's keep/reject reason is sound given the posting text and the
configured criteria (contracts/judge-rubric.md).

## criteria

1. If the decision is "rejected", the stated reason correctly identifies a hard stop
   (excludedLocations, lackedClearances, lackedWorkAuth, visaSponsorshipRequired) or a genuine lack
   of overlap with every configured direction — not a criterion the posting does not actually
   trigger.
2. If the decision is "kept" and directions are configured, the stated reason names a direction the
   posting plausibly overlaps with, or explicitly notes a low-confidence default keep.
3. For a "rejected" decision, the reason is specific to this posting's content (quotes or
   paraphrases something the posting actually says), not a generic template sentence that could
   apply to any posting. **This criterion does not apply to a "kept" decision** — naming just the
   matched direction (or "low-confidence default keep") is the prompt's intended, sufficient
   behavior for a keep; do not fail a kept case for terseness alone.

## pass_rule

all
