# Contract: Evaluation Fingerprint

## Field

`inputFingerprint: "<fnv1a-hex>"` in `outputs/evaluations/<key>.md` front matter,
written by the score phase on every persist, alongside the existing keys
(004 `contracts/evaluation-format.md` unchanged otherwise).

## Computation (code-owned, both substrates — keep verbatim in sync)

**T002 decision (2026-09-14): parts[0] hashes the in-memory parsed record, not the raw file text.**
The score-phase call site (`fit-screen.js:565`) never holds the Job Record's raw file bytes — only
the parsed fields from `index.records` (`jobRecordIndexSchema`, populated by one `hyppo-read` call
over the whole directory at verify-phase start). Re-reading the file per record before every score
would add a fast-tier call on every run, partly undercutting R1's own "skips the expensive part"
rationale. The parsed-field object is a complete, deterministic proxy: it is byte-for-byte the same
object `buildScorePrompt` (fit-screen.js:929) serializes into the JOB RECORD section hyppo-score
reads, so anything that could change hyppo-score's answer is already covered — a field that changed
in the file but not in this object cannot have affected the prior score either.

```
jobRecordFingerprintInput = JSON.stringify({
  roleTitle: rec.roleTitle,
  canonicalCompany: rec.canonicalCompany,
  locations: rec.locations,
  salaryAmountOrRange: rec.salaryAmountOrRange,
  salaryCurrency: rec.salaryCurrency,
  responsibilitiesSummary: rec.responsibilitiesSummary,
  requirements: rec.requirements,
  openStatus: rec.openStatus,
})   # identical shape to buildScorePrompt's JOB RECORD JSON — not the raw file bytes

parts = [ jobRecordFingerprintInput,
          ...evidenceFiles.map(f => f.content),   # evidenceBase.files order
          trackerExists ? trackerText : "NO_TRACKER",
          JSON.stringify({ hardConstraints, hardStops, targetRoles }) ]
digest = fnv1a_hex(parts.join("\n---\n"))
```

FNV-1a 32-bit over UTF-16 code units, hex, zero-padded to 8 chars. Mirrored in
`tests/harness/support/pure.mjs` under the existing sync-check (extend the function
list — a divergence fails the harness).

## Comparison rule (score phase, per record, before any model call)

1. Read `outputs/evaluations/<key>.md` front matter (hyppo-read; missing file ⇒ proceed).
2. Recompute over current inputs.
3. Equal ⇒ skip: no `hyppo-score` call, no writes, no provenance line;
   `summary.skippedIdempotent++`.
4. Different ⇒ proceed exactly as 004 today (score → audit → write with new
   fingerprint → migrate → provenance).

Pre-006 files (no field) always take path 4 once, then carry the field.
