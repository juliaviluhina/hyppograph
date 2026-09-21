# Issue: `hardConstraints`/`hardStops` settings schema has gaps against the vault fit rubric

**Status:** Gap-checked (manual read + TypeSafe Jev Noul check per item, 2026-09-19); not yet
spec'd.

**Scope:** `inputs/settings.json` sections `hardConstraints` and `hardStops`
([`settings-additions.md`](../004-retrieval-fit-screen-rework/contracts/settings-additions.md)),
and the `score`/`hard-filter` logic in `fit-screen.js` that reads them. Reference rubric:
`vault/drilling/job-search/job-fit-screen-interface.md` C1.1/C1.2 (the Claude job-search skills'
canonical hard-constraint clauses — see issue 003 for the broader flow comparison this came out
of).

## Problem

Checked each C1.2 hard-constraint clause against the current `hardConstraints`/`hardStops`
settings fields — once manually, once as six independent TypeSafe Noul questions ("does the
settings field fully implement this vault rule, no material gap") over the same
vault-clause / settings-field pairing. Both agreed: none of the six clauses are fully covered
as currently specified.

| C1.2 item | TypeSafe P(fully covers) | Gap |
| --- | --- | --- |
| Location | 0.03 | No market-comparison logic; flat `excludedLocations` membership only; no `unresolved` outcome for relocation-required roles |
| Work model | 0.04 | No documented precedence rule when a posting page's stated work model disagrees with a board's `isRemote` flag |
| Travel | 0.02 | No field at all — `hardConstraints`/`hardStops` have no travel-percentage concept |
| Work authorization | 0.15 | Fields exist (`lackedClearances`, `lackedWorkAuth`, `visaSponsorshipRequired`) but don't carry the vault's Green-Card framing |
| Role nature | 0.25 | Mechanism (`excludedRoleNatures` free-text, matched by mid-tier judgment) is sound; template's example values don't demonstrate the vault's actual exclusions (client-facing/pre-sales/consulting) |
| Compensation floor | 0.03 | Single `compFloor.amount` — no midpoint-clears-a-low-floor rule, no hourly-rate variant |

None of this should be read as "port the vault's exact rules into HyppoGraph" — HyppoGraph is a
portable tool a user configures with their own values (e.g. the vault's Philadelphia-specific
market comparison is this user's instance, not a schema constant). The gap is structural: the
*schema* has no field or state to express several of these rule shapes at all, regardless of
whose values go in them.

## Proposed fixes, by category

**Code-only, no new model call (do first — cheap, pure correctness):**
- Compensation-floor midpoint-clears-a-low-floor comparison: once `normalize` extracts the
  posted range as numbers, do the `floor < compFloor` / `midpoint >= compFloor` check in code
  (`score` phase), not as a model judgment — it's arithmetic, not semantic understanding
  (Principle I).
- Work-model precedence: when `normalize` has both a posting-page-derived work model and a
  board's `isRemote` flag and they disagree, prefer the posting-page value. Pure `if`, zero
  model cost.

**Schema additions:**
- `hardConstraints.maxTravelPercent: number | null`.
- `hardConstraints.compFloor.hourly: { amount, currency } | null` alongside the existing annual
  field.
- `hardConstraints.relocationReferenceMarket: string | null` — a user-set reference market for
  the (necessarily judgment-based) relocation-market-strength comparison; no hardcoded metro
  list.

**Decision-tree fix (touches the Constitution Check, needs `speckit-plan`):**
- Add a third hard-constraint outcome, `unresolved`, alongside `pass`/`blocked`. Currently the
  schema and (as far as documented) `hyppo-score`'s output imply binary pass/blocked; the
  vault's own C1.3 decision tree requires `unresolved` to route to APPLY-AND-SEE with the
  blocker surfaced, not collapse into a clean pass or a SKIP. This is the highest-impact item
  and the one most likely to need a `plan.md` Constitution Check entry since it changes
  `hyppo-score`'s output contract and the code-owned `overallVerdict` branch logic.

**New judgment call (fast-tier `hyppo-judge`, or a TypeSafe Noul per issue 003's pilot list):**
- Travel-percentage detection from posting text against the new `maxTravelPercent` threshold —
  postings rarely state a clean number, so this needs a judgment, with the numeric comparison
  itself done in code once the judgment returns a value.
- Relocation-market-strength comparison against `relocationReferenceMarket` — genuinely needs a
  model (semantic market-tier judgment), unlike the arithmetic fixes above.

**Docs-only:**
- `settings.template.json`'s `excludedRoleNatures` and `hardStops` example values don't
  demonstrate the kinds of exclusions the vault rubric actually uses (client-facing/pre-sales/
  consulting; Green-Card-specific framing). Update the template's example content so a new user
  copying it sees realistic values, not just structurally-valid placeholders.

## Recommended action

Do the two code-only fixes (compensation-floor midpoint logic, work-model precedence) directly —
no spec needed, they're bug-fix-sized. Take the `unresolved` outcome through
`speckit-specify`/`plan` given it changes `hyppo-score`'s contract and the Constitution Check.
The two new schema fields + judgment calls (travel, relocation market) can ride the same spec or
follow after. Docs-only template fix can land independently, anytime.

## Status (2026-09-19)

**Compensation-floor midpoint logic — DONE**, direct fix, no spec:
`evaluateCompFloor`/`parseSalaryRange` added to `.claude/workflows/fit-screen.js`, mirrored in
`tests/harness/support/pure.mjs` per the project's pure-helper convention, with unit tests in
`tests/harness/pure.test.mjs`. `compFloor` is now a code-computed hard-constraint row (parses
`salaryAmountOrRange`, applies the midpoint-clears-a-low-floor rule already documented in
`data-model.md`, currency-mismatch and unparseable/hourly text all resolve to `unresolved`
rather than an assumed pass); `hyppo-score` is explicitly told to omit it from its own
`hardConstraints` array.

**Work-model precedence — NOT actionable as scoped, deferred.** Checked the current schema:
there is no `workModel` field, no board `isRemote` flag, and no such data anywhere in the Job
Record shape produced by `intake-normalize.js` — only free-text `locations`. The fix as written
("when a posting-page-derived work model disagrees with a board's `isRemote` flag, prefer the
posting-page value") has no data source to reconcile yet, so it isn't a same-day code fix; it
needs new Job Record fields first. Folding this into the schema-additions category above instead
— it should ride the same `speckit-specify`/`plan` pass as the other new fields (travel,
relocation market), not land as an isolated bug fix.
