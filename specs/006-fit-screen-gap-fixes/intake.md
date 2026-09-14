# 006 Intake — harness state at 005 completion (2026-09-14)

Recorded by 005 T032. This is 006's work queue: every red below owns to 006.

## Expected red (by design)

- `idempotency-unchanged-rerun` (tests/harness/regression-cases/idempotency.test.mjs):
  **CLOSED 2026-09-14 (006 T003/T004).** Fixed via an input fingerprint
  (`computeInputFingerprint`/`fnv1aHex`, `contracts/eval-fingerprint.md`) computed and
  compared before any model call in the score phase; equal ⇒ skip. The hardcoded
  `EXPECTED_RED_CASE` passthrough in `run.mjs` was retired (006 T009) — this case is now
  ordinary pass/unexpected-red like every other. Harness: 55→59 node cases, all green.

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
RESOLVED 2026-09-14 (006 R3/T012-T015): the three ATS fixtures now carry
`requiresWire: true` in `support/expectations.mjs`; an isolated `--assert` run reports
them `blocked` (reason: transport, 005 R8) — its own report section, counted in neither
pass nor fail, exit code unaffected. `--assert --wire live` asserts them for real.
Neither aspirational-red nor silent softening — the gap stays visible per run.

### F2 (CLOSED 2026-09-14, 006 T011): write-run-summary silently not written — ack never checked

`write-run-summary` returned `{written: false}`; the on-disk summary kept the
previous run's content. `writeSummary()` in fit-screen.js ignores the ack
(fire-and-forget `await agent(...)`, no `written` check). Fix: check the ack,
retry/log loudly on false, and route the overwrite-intended write through
hyppo-readwrite (overwrite semantics) rather than hyppo-write.

Fixed per `contracts/summary-write.md`: `writeSummary` now calls `hyppo-readwrite`, checks
`written`, retries once with the identical prompt on `false`, and on a second `false` logs
loudly (`write-run-summary FAILED twice` + `summary.write-failed` line + full rendered
summary attached) instead of continuing silently. Live-session re-verification (the actual
ack failure mode this closes) is still pending a session run — see 006 T016.

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

## Session-run findings, 2026-09-14 (006 T016/T017, post-implementation)

Three live isolated-session runs against fresh scratch dirs (Workflow tool,
`.claude/workflows/fit-screen.js`, 9 fixture records each). Two genuine new `unexpected-red`
findings surfaced on run 1 (neither present in the node-layer suite, since node tests fabricate
scratch state directly rather than exercising a real session):

### F4 (CLOSED 2026-09-14): write-evaluation systematically dropped its leading `---` delimiter

2 of 9 evaluation files (`initrode`, `soylent`) were written missing the opening YAML front-matter
`---` line — everything else (including the closing `---` and full body) was intact. Root-caused via
a read-back verification: a retry with the byte-identical prompt reproduced the IDENTICAL malformed
result twice in a row (confirmed on the `acme` record in the run-1→resume sequence) — this was a
deterministic misread, not a flake. Cause: the prompt's instruction text ended in a blank line
immediately followed by the content's own opening `---`, which the model read as the instruction's
own markdown rule rather than file data, and dropped.

Fix: `buildEvaluationWritePrompt` now wraps the literal content in explicit `BEGIN-CONTENT`/
`END-CONTENT` markers, removing the ambiguity. Verified: run 3 (clean, 83/83 agents, 0 errors) wrote
all 9 evaluation files with the delimiter intact; `summary:scored-matches-files` went from
`unexpected-red` (9 != 7, then 9 != 8) to `pass`.

Also hardened while fixing this: the verify-then-retry helper (and `writeSummary`'s ack check)
assumed a failed `agent()` call throws; it can instead resolve `null` (observed live when a
mid-run session-quota interruption hit). Both now null-guard before touching the result.

### F5 (CLOSED 2026-09-14): isolation:service-log-covers didn't respect requiresWire

The 006 R3 `blocked` fix only patched the per-record matrix loop; the separate
`isolation:service-log-covers` check still expected ATS-call log entries for the three
`requiresWire` records regardless of wire reachability — making it permanently red on every
isolated session run (the exact gap R3 exists to name honestly, just missed in one more place).

Fix: `assertScratch`'s isolation section now excludes `requiresWire` records from
`expectedPaths` when `wire !== "live"`, mirroring the matrix loop's exemption. Verified: run 3's
`isolation:service-log-covers` passed cleanly (0 unexpected-red).

**Session run 1** (interrupted mid-run by a session-quota limit, resumed successfully after reset)
first surfaced both F4 and F5. **Session run 2** (post-fix) confirmed both closed, zero
`unexpected-red`, three ATS cases correctly `blocked`.

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
