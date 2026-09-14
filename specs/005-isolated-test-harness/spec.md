# Feature Specification: Isolated Test Harness

**Feature Branch**: `005-isolated-test-harness`

**Created**: 2026-09-14

**Status**: Draft

**Input**: User description: "Concise and synthetic flow with 0 dependencies. We have job descriptions which cover different cases (no match, partial match, full match etc.). All subagents should be tested separately and whole flow. We spin up a REST API service which exposes our examples. Idea is to keep full test cycle independent. Prepare spec which covers issues already found in feature 004's nine fit-screen.js runs."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run the full verify-then-score flow with zero live dependencies (Priority: P1)

A developer runs one command against a fully synthetic data directory and a locally-served fixture API. The run exercises the same verify-then-score flow as feature 004's `fit-screen.js` (ATS re-check with pacing, cited scoring against an evidence base, hard-constraint gate, anti-pattern checks, one overall verdict, reconciled application state, named outcomes) but contacts nothing outside the machine: every ATS posting-API response is served by the local fixture service, every posting and every evidence file is fabricated. The run finishes with a summary and provenance log the developer can assert against.

**Why this priority**: This is the independence guarantee itself. Every other story is a component of this flow; without it, testing still depends on live ATS endpoints and real posting data that rot over time (the exact fragility behind 004's `tests/fixtures/live/` refresh note).

**Independent Test**: Start the fixture service, point the harness at the synthetic data dir, run the full flow, stop the service. Confirm all fixture records reach a terminal state (evaluation or named outcome), the summary counts match the fixture matrix exactly, and no request left the machine (service access log shows every ATS call; no other host was contacted).

**Acceptance Scenarios**:

1. **Given** the fixture service is running and the synthetic data dir is populated, **When** the full flow runs, **Then** every fixture Job Record gets either a fit evaluation or a named outcome, and the run summary counts match the expected matrix (full-match → APPLY, gap → SKIP, hard-constraint failure → SKIP, title-inflation / domain-crossover / stale-leadership → flagged).
2. **Given** a full-flow run, **When** it completes, **Then** zero requests were made to any host other than the local fixture service.
3. **Given** the same data dir unchanged, **When** the full flow runs twice in a row, **Then** the second run produces zero evaluation-content changes and zero new provenance lines for records whose open-status mark did not change (idempotency assertion; covers 004 run 9 / T049 and the known T024 gap as a failing-until-fixed test).

---

### User Story 2 - Test each subagent in isolation against its contract (Priority: P2)

A developer tests each bounded worker (`hyppo-verify`, `hyppo-score`, the settings/evidence/applications readers, the `citation_audit` delegation) separately against its declared JSON schema and role boundary: one fixture input in, one schema-validated output out, with the worker's tool grant unchanged from production (verify gets network-to-fixture-service only, score gets reads only, nothing gets writes). A worker that returns the wrong shape, invents a citation, or decides a disposition it does not own fails its own test without needing the full flow.

**Why this priority**: 004's runs 4–6 were all the same class of failure — a fast-tier reader silently corrupting one field while the rest of the flow looked healthy. Per-worker contract tests catch that class at the source instead of via a 7-minute end-to-end run.

**Independent Test**: For each worker, feed its fixture input(s), validate the output against the worker's schema plus its role rule (e.g. verify returns a raw signal only, never a disposition; score never assigns the final verdict; readers echo paths verbatim), and confirm pass/fail per worker without running any other worker.

**Acceptance Scenarios**:

1. **Given** a verify fixture (live-posting URL, closed-posting URL, unreachable URL, non-ATS source), **When** the verify worker is tested alone, **Then** it returns `found` / `not_found` / `http_error` / `unparseable` respectively, and never returns a `confirmed-*` disposition.
2. **Given** a score fixture (one Job Record plus the evidence base), **When** the score worker is tested alone, **Then** every non-`Unknown` requirement row cites an exact evidence file + section that exists, and the output contains no overall-verdict field.
3. **Given** a settings file with tricky paths, **When** the settings reader is tested alone, **Then** every `evidenceBase.files` entry is echoed byte-for-byte (covers 004 runs 1, 4, 6: missing `inputs/` prefix, doubled absolute prefix, settings.json path echoed as evidence).
4. **Given** a batch of evaluations with planted bad citations, **When** the citation-audit delegation is tested alone, **Then** it rejects the bad citations, and the rejection is recorded as advisory (never silently blocking persistence — covers 004 run 7).

---

### User Story 3 - Serve ATS fixtures from a local REST service (Priority: P3)

A developer starts a small local service that exposes the ATS posting-API fixtures (live, closed, malformed/unreachable-equivalent, flapping between runs) at the same URL shapes the production code constructs (`buildAtsApiUrl` output for Greenhouse/Lever/Ashby). The verify step under test is pointed at the service instead of the real ATS hosts by configuration only — no code branch, no special-case URL rewriting inside the worker.

**Why this priority**: This is what makes stories 1–2 deterministic. 004's live smoke fixture (`tests/fixtures/live/`) depends on a real posting staying open; this service replaces that dependency entirely.

**Independent Test**: Start the service, fetch each fixture endpoint directly (live → posting body, closed → not-found/closed marker, broken → malformed), reconfigure the response map mid-run (live → closed) and confirm the second fetch reflects the change. Stop the service and confirm nothing else in the harness requires the network.

**Acceptance Scenarios**:

1. **Given** the service is running, **When** the harness resolves a Greenhouse/Lever/Ashby fixture URL, **Then** the request reaches the local service and the response matches the configured scenario for that posting.
2. **Given** a scenario change (posting flips live → closed between runs), **When** the flow re-runs, **Then** the open-status mark updates without disturbing the prior evaluation (covers 004 run 8 / quickstart scenario 6).
3. **Given** the service is stopped, **When** any harness test runs, **Then** it fails fast with a clear "fixture service unreachable" message rather than falling back to a live host.

---

### User Story 4 - Cover every 004 run-1–9 regression as a labelled fixture (Priority: P4)

Each real issue surfaced by 004's nine manual runs is pinned as a labelled fixture case with a known-good expected output, so a future change that reintroduces any of them turns the harness red. The cases are the evidence-path convention (run 1), the scoring matrix over honest fixtures (runs 2–3), single-file evidence reads (run 5), raw settings passthrough with code-side parse (run 6), non-blocking citation rejection with SC-001 persistence (run 7), idempotency baseline (runs 8–9), plus the known-open T024 gap asserted as a currently-failing test.

**Why this priority**: Without this, the harness proves the flow works today but not that it keeps working. This story is the reason the nine runs were worth doing — it converts a debugging diary into regression protection.

**Independent Test**: Introduce each historical fault in isolation (strip the `inputs/` prefix; batch two evidence reads into one call; let the reader transcribe settings instead of echoing raw text; drop a record on audit rejection; re-score unconditionally) and confirm the corresponding harness case fails with the historically observed symptom.

**Acceptance Scenarios**:

1. **Given** the full regression matrix, **When** the harness runs green, **Then** each of the run-1–9 issues has at least one dedicated case mapping to it (traceability table in the spec).
2. **Given** the T024 idempotency gap is still unfixed, **When** the harness runs, **Then** the idempotency case fails (red-by-design) with a pointer to the future 006 fix — it is never silently skipped or marked passing.
3. **Given** all cases pass except the known T024 red, **When** the developer reads the report, **Then** the report names exactly which cases passed, which one is the expected red, and which historical run each case traces to.

### Edge Cases

- The fixture service is already bound to its port when the harness starts: fail fast naming the port and the likely stale process; never silently pick a different port (a moved port would invalidate URL-shape assertions).
- A fixture evidence file is empty: the config-gate case reports `config.evidence-unavailable` with zero writes, mirroring 004 run 1 — an empty evidence base cannot support a cited verdict.
- A fixture Job Record is too sparse to score (missing title, requirements, or company): the record still gets an evaluation file with an empty requirement table and null verdict (`score.insufficient-input`), never a silent drop (SC-001, 004 run 7 lesson).
- The applications-tracker fixture is absent entirely: every record reconciles to `unknown`, never `not_applied` (004/US3 rule).
- A worker returns output outside its schema (extra fields, invented citation, disposition instead of signal): the per-worker test fails on schema/role validation before any downstream worker runs.
- Run ordering with the flapping-posting scenario: the live→closed flip case must run after the stable baseline case; the harness enforces or documents this order rather than depending on filesystem listing order.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The harness MUST provide a synthetic data directory covering the full scoring matrix: a full-match record, a one-gap record, a hard-constraint-failure record, a title-inflation record, a domain-crossover record, and a stale-leadership-evidence record — each with known-good expected verdicts.
- **FR-002**: The harness MUST provide a local fixture REST service exposing ATS posting-API scenarios (live, closed/not-found, malformed-or-error, flapping live→closed between runs) at the same URL shapes production constructs; no test may contact a live ATS host.
- **FR-003**: The harness MUST test each bounded worker in isolation against its declared schema and role boundary (verify → raw signal only; score → cited rows, no final verdict; readers → verbatim echo), independent of the full flow.
- **FR-004**: The harness MUST run the full verify-then-score flow end to end against the synthetic data dir plus the fixture service with one command, and assert summary counts, verdicts, flags, and named outcomes against the expected matrix.
- **FR-005**: The harness MUST assert zero non-local network contact for every test (full-flow and per-worker): all ATS calls appear in the fixture service access log, and no other host is contacted.
- **FR-006**: The harness MUST include one dedicated regression case per 004 historical issue (runs 1–9 traceability table below), each failing with the historically observed symptom when its fault is reintroduced.
- **FR-007**: The harness MUST include the idempotency assertion (unchanged re-run → zero evaluation-content changes, zero new provenance lines for unchanged marks) and MUST report it as red-by-design until the 006 fix lands — never silently skipped.
- **FR-008**: The harness MUST report per-case pass/fail naming the historical run each regression case traces to, distinguishing the one expected-red (T024) from unexpected failures; exit code is non-zero on any unexpected failure.
- **FR-009**: The harness MUST NOT modify production workflow code to make tests pass (no test-only branches in `fit-screen.js`, no special-case URL rewriting inside workers); test pointing happens by configuration (data dir, service base URL) only.
- **FR-010**: All fixture content MUST be fabricated (invented personas, invented postings, invented evidence) consistent with the existing `tests/fixtures/` convention; no real personal data and no copied live-posting text.

### Regression traceability (004 runs → harness cases)

| Historical run | Issue observed | Harness case |
|---|---|---|
| Run 1 (config-gate exit) | Evidence paths missing `inputs/` prefix across inconsistent docs | Config-gate case: stripped-prefix settings fixture → `config.evidence-unavailable`, zero writes |
| Run 2 (agent-type race) | `hyppo-verify` unregistered at run start | Worker-presence case: missing worker definition fails fast with a named error, not a mid-run crash |
| Run 3 (1/6 scored) | Fixture requirement ("5+ years") unsupported by fabricated evidence; overlapping employment dates | Fixture-honesty case: labelled gap/domain fixtures score as designed; evidence supports exactly what it claims |
| Run 4 (doubled paths) | Fast-tier reader resolved `evidenceBase.files` to absolute paths | Verbatim-echo case: reader output compared byte-for-byte against settings text |
| Run 5 (all-Unknown) | Batched two-file evidence read returned one wrong file | Single-read case: one worker call per evidence file; batched-read fault injection fails |
| Run 6 (still no evidence) | Reader echoed settings.json path as the evidence file | Raw-passthrough case: settings read returns raw text; script parses in code; transcription fault injection fails |
| Run 7 (3/6, silent drop) | Rejected citation audit silently dropped the record (SC-001 violation) | Non-blocking-audit case: planted bad citation → rejection logged, evaluation still persisted |
| Run 8 (6/6) | Baseline green after non-blocking fix | Full-flow baseline case: all records evaluated or named-outcome'd |
| Run 9 (idempotency probe) + open T024 | Score phase re-scores unconditionally; T024 wrongly marked done | Idempotency case: red-by-design until 006; asserts zero content/provenance changes on unchanged re-run |

### Key Entities

- **Fixture Service**: Local REST service exposing ATS posting-API scenarios at production URL shapes; the only network endpoint any test may contact.
- **Synthetic Data Directory**: Fabricated inputs (settings, evidence base, applications tracker, Job Records) plus expected outputs (verdicts, flags, named outcomes) the harness asserts against.
- **Worker Contract Case**: One isolated test per bounded worker: fixture input, schema + role-boundary assertion, pass/fail independent of other workers.
- **Regression Case**: One labelled test per 004 historical issue, traceable via the table above, including the one expected-red idempotency case.
- **Harness Report**: Per-case pass/fail output naming the historical run each regression case traces to, with exit code reflecting unexpected failures only.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer unfamiliar with the harness can run the full cycle (start service → run all tests → stop service) in under 10 minutes following one short doc section.
- **SC-002**: With the fixture service running, 100% of harness cases pass except the single known-red idempotency case, which fails with a pointer to the planned 006 fix.
- **SC-003**: With the fixture service stopped, 100% of network-dependent cases fail fast with "fixture service unreachable" and none attempts a live-host fallback.
- **SC-004**: Reintroducing any single historical fault from the traceability table turns its dedicated case red while all unrelated cases stay green (fault isolation).
- **SC-005**: The full cycle makes zero requests to any host other than the local fixture service, verified against the service access log plus a network assertion.
- **SC-006**: Every 004 historical run (1–9) has at least one dedicated harness case tracing to it — zero unmapped runs.

## Assumptions

- Feature 004's `fit-screen.js` workflow, agent definitions, and fixture matrix exist as the system under test; this feature adds test infrastructure only and changes no production scoring or verification logic (fixes land in 006).
- The harness reuses 004's existing fixture conventions (`tests/fixtures/data-dir/`, `tests/fixtures/live/` replaced-by-service) and the `node:test` pattern already referenced in 004's plan rather than introducing a second test framework.
- Constitution Principle V holds: all fixture content is fabricated; no real personal data enters the repo through this harness.
- The idempotency case stays red-by-design until 006 implements the FR-009/T024 skip-when-unchanged logic; 005 never marks it passing to look green.
- Port selection, service lifecycle (start/stop), and base-URL configuration are harness details resolved at plan time, not in this spec.
