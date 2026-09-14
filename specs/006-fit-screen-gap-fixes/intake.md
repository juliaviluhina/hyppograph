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

### F1 (new, P0): verify never reaches plain-HTTP endpoints — all ATS checks http_error

All 3 ATS records (acme/initech/umbrella) classified `unresolvable`: hyppo-verify's
WebFetch hit an SSL `WRONG_VERSION_NUMBER` error against `http://127.0.0.1:8471`.
Service access log proves ZERO session-run requests arrived as HTTP (log held only
the test harness's own later entries). Prompt URL was byte-correct `http://` per the
persisted `still_open_scan` delegation entries — the upgrade happened downstream.
Open question for a discriminator experiment (see below): did the fast-tier agent
rewrite `http` → `https` itself (runs-4–6 family), or does the WebFetch tool upgrade
all `http://` to TLS? Until answered, the entire ATS verify path is UNPROVEN —
note that 004's runs 1–9 never successfully exercised a live ATS check either
(run 2's "verified" records were all non-ATS).
Fix direction depends on the answer: exact-URL discipline in hyppo-verify.md +
prompt (agent fault) vs rethink fixture transport (tool fault).

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

## Flip test (T021 session half): BLOCKED until F1 is answered

Flipping scenarios without a working verify path proves nothing. Order: F1
experiment → re-run T013 green → then flip test.

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
