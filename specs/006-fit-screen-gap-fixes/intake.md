# 006 Intake — harness state at 005 completion (2026-09-14)

Recorded by 005 T032. This is 006's work queue: every red below owns to 006.

## Expected red (by design)

- `idempotency-unchanged-rerun` (tests/harness/regression-cases/idempotency.test.mjs):
  structural pin `hasIdempotencyGuard()` is false — the score phase never reads the
  existing evaluation before writing, so skip-when-unchanged is unimplemented.
  Runner routes it to `expected-red`; exit code unaffected. Fix = 006 US1.

## Unexpected reds

None from node. First real session run (2026-09-14T15:20:51Z, scratch asserted
2026-09-14T15:38Z) produced 5 `unexpected-red` — three new production findings below.
Artifacts: session summary in chat history; scratch dir was temp (deleted after assert).

### F1 (CLOSED 2026-09-14): tool fault, wire proven live

Discriminator experiment result: the agent echoed the exact `http://127.0.0.1:8471/…` URL;
WebFetch silently rewrote the scheme (documented tool behavior, no parameter changes it)
and the TLS handshake failed. Service log held zero session requests. Wire proof
completed same day: direct `hyppo-verify` call against the real
`https://boards-api.greenhouse.io/v1/boards/figma/jobs/5783812004` (posting confirmed
live via curl first) returned `signal: found` with the exact `https://` URL echoed —
clean, no TLS error. Nothing wrong with hyppo-verify's logic or the ATS URL
construction; only plain-HTTP local doubles are unreachable to it.
Design decision recorded in 005 research.md R8 (split proof). No code fix; no new
tool grants.
OPEN QUESTION for 006: the matrix still expects confirmed-open/closed for the three
ATS fixtures, which is unachievable in isolation while the wire only works over
`https://`. Decide: keep them aspirational-red (the run stays RED as a standing
reminder of the transport gap) or add an explicit transport-exemption to the
expectations (run goes green, gap tracked here instead). Do NOT silently soften —
either state must be deliberate and documented.

### F2 (new): write-run-summary silently not written — ack never checked

`write-run-summary` returned `{written: false}`; the on-disk summary kept the
previous run's content. `writeSummary()` in fit-screen.js ignores the ack
(fire-and-forget `await agent(...)`, no `written` check). Fix: check the ack,
retry/log loudly on false, and route the overwrite-intended write through
hyppo-readwrite (overwrite semantics) rather than hyppo-write.

### F3 (process): --access-log flag omitted on the manual service start

The session's service ran without `--access-log`, so no JSONL file existed and the
isolation assert initially failed on I/O, not signal. Mitigated in 005 same-day:
`--assert` accepts `--service-origin` and falls back to live
GET `/__admin/access-log` (proves the fallback works — it pulled the log above).
Keep the flag in all future session instructions anyway (file is the primary proof).

## Flip test (T021 session half): UNBLOCKED in revised form (R8)

Flipping works at the service level and the mark-update logic is transport-independent;
run the session flip against scenario flips and assert mark updates + untouched
evaluations via --assert with flipped expectations. Worker wire proof comes separately
from the live-smoke check above.

## Notes for 006 implementers

- The idempotency fix must preserve the `summary:no-eval-on-closed` exemption rule
  (support/assert.mjs): post-flip closed records legitimately carry their run-1
  evaluation. "Never write on closed" would break the flapping case.
- If the fix renames/restructures the score phase, update the `hasIdempotencyGuard`
  pin in support/structure.mjs — the test asserts the prerequisite (existing-
  evaluation read), not any particular implementation.
- Session halves still pending (need a Claude Code run): T013 full session flow,
  T020 worker agreement, T021 live two-run flip, T033/T038/T044 manual validations.
  Their rails (`--prep` / `--serve` / `--assert`) are implemented and smoke-tested.
