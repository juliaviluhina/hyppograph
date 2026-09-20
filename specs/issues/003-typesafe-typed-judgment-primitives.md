# Issue: Evaluate TypeSafe (System One) as a typed-judgment primitive for narrow pipeline steps

**Status:** Idea, not yet spec'd or piloted.

**Scope:** HyppoGraph's judgment-calling steps in `intake-normalize.js` and `fit-screen.js`; a
potential second model provider alongside the Haiku/Sonnet/Opus tier table in
[`solution-design.md`](../../docs/solution-design.md#model-usage).

## Problem / opportunity

TypeSafe (`typesafe-ai` Claude Code plugin, System One models incl. Jev) returns typed
judgments — Choice / Noul (probability) / Score (ordered level) — directly, instead of free
text a caller has to parse. HyppoGraph's constitution already commits to the same shape: code
owns control flow, a model is called only for the judgment a step needs, and every call
declares its tier (Principle I, II). Several of HyppoGraph's fast/mid-tier judgment steps are
narrow enough to be a good match for this primitive style rather than a full Claude subagent
turn.

Concretely, `fit-screen.js` already has a failure mode this would remove: step S11
("read-back shape check... retry the write once if malformed") exists because `hyppo-score`
returns text that has to be re-parsed. A typed primitive doesn't need that retry branch.

## Candidate steps

| Step | Current | Candidate primitive | Notes |
| --- | --- | --- | --- |
| Pre-triage keep/reject (`intake-normalize.js` T4, `hyppo-judge` fast) | hard-stop / direction-overlap judgment | **Noul** | probability of hard-stop match; threshold in code instead of a binary LLM decision baked into prose |
| Citation audit (`fit-screen.js` S9, `hyppo-judge` fast) | every citation checked against evidence text | **Noul** | matches TypeSafe's own "verify and escalate" cookbook pattern; escalate low-confidence ones to Claude |
| Per-requirement fit row inside scoring (`fit-screen.js` S6, `hyppo-score` mid) | Strong/Partial/Fails/Absent/Unknown per required bullet (`job-fit-screen-interface.md` C1.3) | **Score** | ordered-level judgment, structurally the same shape as this primitive; narrative rationale/citation assembly would stay with Claude |

## Explicitly not a fit

- Dedup key-building (`intake-normalize.js` N3) — deliberately code-only today ("LLM output
  never keys a file"); stays that way.
- `overallVerdict` computation (`fit-screen.js` S7) — `hyppo-score` proposes, code decides;
  no change.
- Tier-1 deliverables (CV tailoring, decision memos, outreach drafts) — generative work;
  TypeSafe returns typed answers/probabilities, not generated text, so it doesn't apply here.

## Open questions for spec/plan

- Introducing TypeSafe means a second model provider alongside the Haiku/Sonnet/Opus tier
  table (Principle II) — needs an explicit tier/provider entry, not an implicit one.
- Whether a TypeSafe call is a direct API call from workflow-script code (no subagent, no
  `agent()` tool grant) or wrapped behind the same task/capability envelope as existing
  Claude-backed steps (see issue 001's `model.judgment` / `model.structured-output`
  capabilities) — probably the latter, to keep runtime-adapter portability intact.
- Needs eval-harness comparison against the current Haiku baseline before replacing any live
  step, starting with pre-triage and citation-audit (cheap, narrow, low stakes) before the
  fit-score row (cited-evidence requirement, higher stakes).

## Recommended action

Pilot on pre-triage and citation-audit first via the eval harness; hold off on the
per-requirement fit-score row until those results are in. Write up as a `speckit-specify`
feature once a pilot direction is chosen, since it touches the Principle II tier table.
