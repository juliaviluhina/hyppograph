# Phase 0 Research: Fit-Screen Gap Fixes

Grounded in the exact code sites (all in `.claude/workflows/fit-screen.js`) and the
session evidence in `intake.md`.

---

### R1 — Idempotency via input fingerprint, not content comparison

**Decision**: Each Fit Evaluation carries `inputFingerprint`: a code-computed hash
(FNV-1a over UTF-16 code units, hex) of the concatenation of (a) the Job Record file
text, (b) every evidence file's text (in `evidenceBase.files` order), (c) the
applications-tracker text (or the sentinel `"NO_TRACKER"` when absent), and (d) the
scoring-relevant settings JSON (`hardConstraints`, `hardStops`, `targetRoles` —
canonical `JSON.stringify`, not the whole settings file). Score phase, per record,
before ANY model call: read the existing evaluation's front matter (hyppo-read),
recompute, compare — equal ⇒ skip scoring, skip writes, skip provenance, count as
`skipped-idempotent` in the summary; different/missing ⇒ proceed exactly as today
and persist the new fingerprint with the write.

**Rationale**: Content comparison cannot work here, for two structural reasons found
by reading `buildEvaluationWritePrompt` (lines 1003+): (1) the rendered file embeds
`scoredAt: run` and delegation `timestamp: RUN` — the frozen clock moves every run,
so bytes always differ; (2) `hyppo-score`'s notes/flags are model prose and may be
rephrased between runs even on identical inputs. Fingerprinting INPUTS sidesteps
both: identical causes ⇒ skip, any changed cause ⇒ re-score. It also skips the
mid-tier call itself (the expensive part), which content comparison could never do.
`openStatus` needs no special case — it lives in the Job Record text, so a flip
changes the fingerprint and forces re-scoring automatically (and a flipped-to-closed
record leaves `scorable` anyway via the existing FR-002a filter).

**Alternatives considered**: Masked content comparison (ignore timestamp lines, fuzzy-
match prose) — fragile, still pays the mid-tier call, and fuzzy equality on verdicts
is exactly the kind of judgment-in-code the constitution avoids. Storing a
last-run input snapshot elsewhere — a second source of truth; the fingerprint rides
on the evaluation it describes (Principle V: state lives with what it describes).

---

### R2 — Summary write: single writer + checked ack + one retry

**Decision**: Route `writeSummary` through `hyppo-readwrite` (overwrite prompt,
unchanged text) instead of `hyppo-write`, check the returned `written` ack in code,
and on `false` retry once then `log()` loudly with the rendered summary attached
(so the run's numbers always survive in the session log even if the file write
fails twice). No third attempt, no silent continuation.

**Rationale**: Two compounding defects from the session evidence (intake.md F2):
(1) the ack is fire-and-forget — `writeSummary` never reads `written`, so a silent
`false` stays silent; (2) the call uses `hyppo-write`, contradicting the plan's own
single-writer rule (004 plan.md: "`hyppo-readwrite` … is the single writer" for
this feature's outputs). The `false` cause itself is unknown (fast-tier flake is
consistent with runs 4–6, but unproven) — ack-check + retry + loud log makes the
cause visible next time instead of guessing now. Switching writers is safe: the
prompt already says "(overwrite)", which is readwrite semantics.

**Alternatives considered**: Keep hyppo-write and only check the ack — leaves the
single-writer violation in place for no benefit. Retry-until-true — unbounded agent
calls on a write path; one retry plus a loud log bounds cost while preserving evidence.

---

### R3 — Matrix-vs-transport scoping: explicit `blocked`, not red, not green

**Decision**: Expectations gain `requiresWire: true` on the three ATS fixtures
(acme/initech/umbrella). When a run cannot exercise the wire (isolated loopback —
the R8 constraint), `--assert` reports those cases as `blocked (transport:
WebFetch upgrades http→https; see 005 research.md R8)` — listed separately in the
report, counted in neither pass nor fail, exit code unaffected. A live-`https`
session run (or a future transport that reaches loopback) flips them back to
asserted without touching the matrix. The `blocked` state needs no spec amendment
to enter or leave — it is a property of the run environment, recorded per run.

**Rationale**: The intake's open question had two bad defaults: permanent red
(normalizes failure — the harness cries wolf every run) or silent softening
(hides the gap). `blocked` is the honest third state: the expectation stands, the
environment can't meet it, and the report says exactly that. It also matches the
005 report contract's spirit (verdicts describe reality) while changing only the
enumeration, not the exit-code discipline.

**Alternatives considered**: Aspirational-red forever — rejected, red fatigue kills
the harness's signal within weeks. Transport-exemption deleting the expectations —
rejected, deletes the proof that the wire matters. `skip` flag in expectations —
same as `blocked` but static; per-run derivation (wire reachable or not) is more
truthful than a committed flag.

---

### R4 — What 006 explicitly does NOT do

No tool-grant changes (R8's rejected options stay rejected — Principle IV
discussion, not this slice). No Phase B port (gated on T053, which this spec
completes but does not execute). No new scoring/verification semantics: the
fingerprint and the ack-check are control-flow and persistence mechanics; every
verdict, mark, and citation rule is byte-for-byte 004 behavior.
