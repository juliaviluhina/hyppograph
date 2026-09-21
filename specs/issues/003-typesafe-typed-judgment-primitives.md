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
| Posting-link extraction from a search result page (`intake-normalize.js` T2, `hyppo-collect-list`) | `hyppo-collect-list` subagent reads full `read_page` text and infers which spans are posting links | **Choice/Noul, with fallback** | see design note below — reuses jev-ultrafast's snapshot+typed-selection pattern; needs a fallback branch since it's a runtime dependency, not a build-time model swap |

## Explicitly not a fit

- Dedup key-building (`intake-normalize.js` N3) — deliberately code-only today ("LLM output
  never keys a file"); stays that way.
- `overallVerdict` computation (`fit-screen.js` S7) — `hyppo-score` proposes, code decides;
  no change.
- Tier-1 deliverables (CV tailoring, decision memos, outreach drafts) — generative work;
  TypeSafe returns typed answers/probabilities, not generated text, so it doesn't apply here.

## Design note: posting-link extraction with a TypeSafe/no-TypeSafe fallback

Unlike the other three candidates (pure judgment calls with a single provider), link
extraction sits in front of a step that must always produce a result — `openFilteredSearch`
can't come back empty just because a second model provider is unreachable. So this one needs
an explicit availability branch, not a straight swap:

```
if (typeSafeAvailable) {
  // fast path: structured elements (from read_page / read_form_fields) -> one typed
  // classification call (Choice/Noul per indexed element: "is this a posting link?")
  refs = classifyLinksWithJev(elements)
} else {
  // current path: unchanged — hyppo-collect-list subagent reads full page text,
  // infers posting links itself (haiku tier)
  refs = hyppoCollectListSubagent(pageText)
}
```

- `typeSafeAvailable` is a capability check (plugin/provider reachable), evaluated once per
  run, not per posting — avoid flapping between paths mid-run.
- Both paths must satisfy the same `openFilteredSearch` contract (ordered `PostingRef[]`,
  `PageReadError` on failure, empty array is not a failure) — the fallback is not a degraded
  contract, just a slower one.
- The eval-harness comparison (see Open questions below) should score both paths against the
  same fixture set so the fallback path's accuracy is a known baseline, not an assumption.
- Keeps Principle II honest: this is a second *provider*, and every call still declares its
  tier — the fallback path is the existing haiku call, not a silent downgrade.

### Validation: what tests can and can't cover here

Maps onto the existing eval pyramid (`specs/003-eval-harness/eval-strategy.md` §3) — the
branching *mechanism* is free to test; the branching *decision's downstream quality* is not.

| Layer | Covers | Cost |
|---|---|---|
| **Tier 1** (`node:test`, plain code, both `classifyLinksWithJev` and the subagent call mocked) | Right path chosen per `typeSafeAvailable`; both paths return the same `PostingRef[]` shape; empty result ≠ `PageReadError`; availability checked once per run, not per posting | $0, milliseconds |
| **Tier 2** (single-agent eval, real Jev + real haiku subagent call against a saved fixture page) | Whether the Jev path actually extracts the right links on real content | cents |
| **Tier 3 / golden run** | End-to-end behavior including the fallback path in context | ~$1 |

Tier 1 is buildable now, before any pilot decision, and should land *with* the fallback
branch itself — it's cheap insurance against the mechanism regressing (wrong path picked,
contract shape drifting between the two branches) independent of whether Jev's judgment
quality ever gets measured. It does not tell us whether to pilot Jev; only Tier 2/3 can.

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
