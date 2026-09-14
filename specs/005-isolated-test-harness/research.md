# Phase 0 Research: Isolated Test Harness

---

### R1 — Fixture service substrate: plain `node:http`, zero new dependencies

**Decision**: The fixture REST service is a stdlib-only `node:http` server (`tests/harness/service.mjs`).
No Express/Fastify/vitest — `package.json` has zero dependencies and stays that way.

**Rationale**: The service does four things (serve canned ATS JSON, flip scenarios between runs,
log accesses, fail loudly when stopped). A framework buys nothing here and would add the repo's
first runtime dependency for test-only code.

**Alternatives considered**: Reuse a mock via `WebFetch` interception — impossible; `WebFetch` is a
built-in tool with no interception point. `/etc/hosts` or DNS tricks — machine-global side effects,
rejected.

---

### R2 — The routing seam: `ATS_API_BASE_OVERRIDES` host→origin map (the one production touch)

**Decision**: `buildAtsApiUrl` (`fit-screen.js:786-793`) currently keys board detection on
production hostnames (`boards.greenhouse.io` → `boards-api.greenhouse.io`, etc.), so a loopback
fixture service is unreachable through it unchanged. This feature adds a host→origin override map
(e.g. `{"boards-api.greenhouse.io":"127.0.0.1:8471"}`), supplied via workflow args alongside the
existing `HYPPO_PACING_MS`/`HYPPO_FETCH_CAP` routing config. Empty/absent map ⇒ constructed URLs
are byte-identical to today. Fixture Job Records keep production-faithful sourceRefs; only the
map redirects them.

**Rationale**: This is routing configuration in the same category as 004's pacing reuse (FR-002d),
not a test-only branch and not judgment logic: no verdict, mark, citation, or persistence path
consults it. Without it, US1/US3 cannot run isolated at all — the alternative is leaving the
harness's core promise untestable until 006.

**Alternatives considered**: Path-pattern board detection regardless of host — a bigger semantic
change to production classification, wrong scope for a harness feature. Rewriting fixture
sourceRefs to loopback URLs — silently changes what the fixtures prove (they would no longer
exercise production URL-shape recognition). Deferring the seam to 006 — leaves 005's P1 story
red, contradicting the user's scoping decision (full harness now, fixes in 006).

---

### R3 — Per-worker tests need no seam: prompt is test input

**Decision**: Worker-contract cases invoke workers exactly as production does, except the prompt
carries the fixture-service URL / fixture file paths directly (US2). `hyppo-verify` keeps its
`WebFetch`-only grant pointed at loopback; `hyppo-score` keeps `Read, Glob`. Schema + role-rule
assertion happens in code after the call returns.

**Rationale**: The prompt is already the worker's input boundary (004 design) — feeding it fixture
inputs is using the boundary as designed, not bypassing it. This is also what makes runs-4–6-class
faults catchable in seconds instead of via a 7-minute end-to-end run.

---

### R4 — Scratch data dir per run; committed fixtures are immutable inputs

**Decision**: Every full-flow run copies `tests/fixtures/data-dir/` to a temp scratch dir and runs
against the copy. Committed fixtures are never mutated in place. Idempotency assertions (run twice,
diff) measure only the run under test.

**Rationale**: 004's manual runs mutated the fixture dir in place (the committed
`provenance-log.md` / `last-run-summary-fit-screen.md` / `outputs/evaluations/` snapshots prove
it). A harness that depends on pristine in-place state is order-dependent and un-rerunnable. Copy
cost is trivial (kilobytes of Markdown).

---

### R5 — Network isolation is asserted, not assumed

**Decision**: Two-sided assertion — (a) the fixture service access log must contain every ATS call
the run claims to have made; (b) the runner fails the run if any request target outside loopback
is observed (worker prompts + constructed URLs are auditable in code, so the check is a
URL-host allow-list over the run's inputs plus the service log, not packet capture).

**Rationale**: Spec FR-005 demands proof, and "the fixtures happen to be local" is not proof. A
misconfigured override map that silently falls back to a live host is exactly the failure this
assertion exists to catch (and the service-stopped case in US3 must fail fast, never fall back).

---

### R6 — Expected-red handling: name it, isolate it, never normalize it

**Decision**: The T024 idempotency case is a first-class case that runs every cycle and is
*expected* to fail until 006. The report distinguishes `pass` / `expected-red (T024 → 006)` /
`unexpected-red`. Exit code is non-zero only on unexpected-red. No mechanism exists to mark any
other case expected-red without a spec amendment.

**Rationale**: A harness that goes green by skipping the hard case is worse than no harness. One
named, isolated, documented red preserves the signal; a generic "known-failures list" would invite
normalizing real regressions.

---

### R7 — Relationship to 003 (eval-harness) and 006 (004-gap fixes)

**Decision**: Same stance as 004 research.md R8 — 003 is scaffold-only, this feature does not
block on it and does not duplicate it: harness cases are plain `node:test` files, placed to move
under `evals/` later if 003 lands. 006 owns all production judgment/state fixes (T024
skip-when-unchanged and any gap the regression cases expose); 005 owns the tests that prove them.

**Rationale**: Keeps the three specs' ownership clean: 005 = "prove it isolated", 006 = "fix what's
proven broken", 003 = "eventual shared harness shape".

---

### R8 — Transport constraint: WebFetch upgrades http→https; the fixture service stays plain HTTP (answered 2026-09-14)

**Finding** (discriminator experiment, F1): WebFetch unconditionally rewrites `http://` to
`https://` before connecting — documented tool behavior, no request parameter changes it. The
agent echoed the exact `http://127.0.0.1:8471/…` URL it was given; the tool silently upgraded it
and the TLS handshake against the plaintext fixture service failed (`WRONG_VERSION_NUMBER`).
The service access log held zero session-run requests, confirming nothing arrived as HTTP.

**Decision**: Split the proof, don't fight the tool —
- The loopback fixture service keeps serving plain HTTP and proves everything it can reach:
  URL construction, scenario semantics, signal derivation, mark mapping, isolation, and all
  session-shape assertions. No production change, no cert machinery, no new tool grants.
- `hyppo-verify`'s wire behavior (its only tool doing its only job) is proven in-session
  against a real `https://` ATS endpoint instead: the existing live smoke fixture
  (`tests/fixtures/live/`, 004 T006) becomes the worker-transport proof. The scenario→signal
  mapping it can't reach on loopback stays pinned by the node ground truth (T014) plus the
  prompt contract.
- Rejected: HTTPS fixture service with self-signed cert (WebFetch won't trust it; `mkcert` +
  system store is machine-specific fragility, the opposite of zero-setup). Rejected: granting
  hyppo-verify a second HTTP tool just for tests (expands the production allow-list for no
  production reason — a Principle IV discussion, not a harness shortcut).

**Consequence for 006**: F1's fix is documentation + a live-smoke session run, not code — unless
006 chooses the tool-grant discussion deliberately. The flip test (T021 session half) stays
meaningful: flipping works at the service level and the workflow's mark-update logic is
transport-independent; run it against the live smoke record's real open/closed transitions
only where possible, else assert the code path via the node halves.
