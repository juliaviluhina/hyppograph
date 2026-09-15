# Data Model: Write-Fidelity Guardrails (007)

This feature adds no persistent domain entities to the pipeline's data directory (FR-005: no
scoring/verdict/persistence semantics change). The two entities below are test/tooling concepts,
not `HYPPO_DATA_DIR` records.

## Verbatim-Write Call Site

One `agent()` call, in `fit-screen.js` or `intake-normalize.js`, whose prompt instructs a full
overwrite of a file's content (not a patch/edit).

| Field | Type | Notes |
|---|---|---|
| id | string | Audit table id (#1–#8), stable reference used across spec/plan/tasks |
| file | string | `fit-screen.js` or `intake-normalize.js` |
| line | number | As of the commit named in the audit table; updated if the file is restructured |
| label | string | The `agent()` call's `label` option, e.g. `write-evaluation`, `write-run-summary` |
| agentType | string | Always `hyppo-readwrite` for the three at-risk sites |
| guardState | enum | `none` \| `begin-end-markers` \| `structurally-safe-by-construction` |
| inClass | boolean | `true` for #1/#2/#3 (this spec's scope); `false` for #4–#8 (out-of-class, recorded with reason only) |

State transition (in-class sites only): `none` → `begin-end-markers` (FR-001 for #1, already done
on 006; FR-003 for #2/#3, this spec's implementation work).

## Atomic Write-Fidelity Test

A single-`agent()`-call, scratch-fixture test asserting byte-exact output for one Verbatim-Write
Call Site.

| Field | Type | Notes |
|---|---|---|
| targetCallSite | id | References a Verbatim-Write Call Site (one test per in-class site) |
| fixtureRecord | object | Minimal synthetic record literal, defined inline in the test file — no fixture service, no scratch dir (spec US1 Independent Test) |
| expectedBytes | string | The exact expected file content, first line included |
| actualBytes | string | Read from the single throwaway temp file after the real `agent()` call completes |
| verdict | enum | `pass` (byte-identical) \| `fail` (diff, printed actual-vs-expected) |

No lifecycle beyond one-shot run/assert/cleanup per invocation — these are not stored records.
