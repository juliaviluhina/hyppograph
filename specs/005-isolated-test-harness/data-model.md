# Phase 1 Data Model: Isolated Test Harness

Test-only entities. Production entities (`JobRecord`, `FitEvaluation`, …) are defined by 004 and
referenced here, never redefined.

---

## FixtureService *(test process)*

The loopback REST service (`tests/harness/service.mjs`).

| Field | Type | Notes |
|---|---|---|
| `origin` | `127.0.0.1:<port>` | Fixed port (quickstart documents it); bind failure ⇒ fail fast naming the port, never auto-pick another (a moved port invalidates URL-shape assertions) |
| `scenarioMap` | `postingKey → ScenarioName` | Per-posting scenario, reconfigurable between runs (incl. live→closed flip) |
| `accessLog` | append-only list of `{ at, method, path, scenarioServed }` | The positive half of the FR-005 isolation proof |

**Scenarios**: `live` (200 + posting body) · `closed` (404 or explicit closed marker) ·
`malformed` (200 with wrong shape) / `error` (non-200) · `flapping` (serves `live`, then `closed`
after a commanded flip). See `contracts/fixture-service.md`.

---

## SyntheticDataDir *(test input — scratch copy per run)*

A copy of `tests/fixtures/data-dir/` with production-faithful sourceRefs. Contents and expected
outputs are pinned in `contracts/expected-matrix.md` (6 scoring fixtures + ATS-signal fixtures).

| Field | Type | Notes |
|---|---|---|
| `sourcePath` | path | Always the committed `tests/fixtures/data-dir` — never mutated |
| `scratchPath` | temp path | Per-run copy; the run's `HYPPO_DATA_DIR` |
| `overrideMap` | host→origin | `ATS_API_BASE_OVERRIDES` for this run; empty map is itself a case (must behave exactly like production today) |

---

## WorkerContractCase *(test — one per bounded worker)*

| Field | Type | Notes |
|---|---|---|
| `worker` | `hyppo-verify` \| `hyppo-score` \| settings-reader \| evidence-reader \| applications-reader \| `citation_audit` | The bounded worker under test, invoked with its production tool grant |
| `fixtureInput` | worker-specific | Fixture-service URL, settings text, evidence paths, tracker content, or planted citations — carried in the prompt, per research.md R3 |
| `schemaRule` | JSON schema ref | Output must validate against the worker's declared schema (004 `contracts/schemas.md`) |
| `roleRule` | one-line predicate | The boundary the worker must not cross (verify: signal-only, never a disposition; score: cited rows, no final verdict; readers: verbatim echo) |
| `verdict` | `pass` \| `fail` | Independent of every other case |

---

## RegressionCase *(test — one per 004 historical issue)*

| Field | Type | Notes |
|---|---|---|
| `tracesTo` | `run-1` … `run-9` | Link into spec.md's traceability table |
| `fault` | description | The reintroduced historical fault (e.g. "batched two-file evidence read") |
| `expectedSymptom` | description | The historically observed failure (e.g. "one wrong file returned") |
| `verdict` | `pass` \| `fail` | Fails red when the fault is present and the harness is correct |

---

## HarnessReport *(test output)*

| Field | Type | Notes |
|---|---|---|
| `run` | string | Timestamp/identifier |
| `cases` | list of `{ name, tracesTo?, verdict }` | `verdict` ∈ `pass` / `expected-red` / `unexpected-red`; exactly one `expected-red` may exist (T024 idempotency → 006), no other case may use it without a spec amendment |
| `isolationProof` | `{ atsCallsInServiceLog, nonLoopbackTargetsObserved }` | FR-005 evidence; any non-loopback target ⇒ whole run `unexpected-red` |
| `exitCode` | `0` \| non-zero | Non-zero iff any `unexpected-red` exists |

State transitions: none — the report is written fresh per run, never appended.
