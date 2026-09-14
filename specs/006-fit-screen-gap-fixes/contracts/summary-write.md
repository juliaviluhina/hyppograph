# Contract: Summary Write Protocol

## Call

`writeSummary` uses `agentType: "hyppo-readwrite"` (the feature's single writer —
004 plan.md Persistence), prompt text unchanged ("overwrite"), schema
`writtenAckSchema` unchanged.

## Ack discipline (code-owned)

1. Check the returned `written`. `true` ⇒ done.
2. `false` ⇒ retry ONCE via `hyppo-readwrite` with the identical prompt.
3. Still `false` ⇒ `log()` loudly: label `write-run-summary FAILED twice`,
   the full rendered summary in the log payload, and a `summary.write-failed`
   line in the run output. Never silently continue — the F2 lesson.

No other write path in this feature changes agent type. No path retries more than
once; no path treats `false` as success.
