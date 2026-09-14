# Contract: Evaluation Fingerprint

## Field

`inputFingerprint: "<fnv1a-hex>"` in `outputs/evaluations/<key>.md` front matter,
written by the score phase on every persist, alongside the existing keys
(004 `contracts/evaluation-format.md` unchanged otherwise).

## Computation (code-owned, both substrates — keep verbatim in sync)

```
parts = [ jobRecordFileText,
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
