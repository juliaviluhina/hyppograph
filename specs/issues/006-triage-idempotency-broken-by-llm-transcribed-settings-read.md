# Issue: `intake-normalize.js`'s triage idempotency guard is broken by a non-deterministic settings read

**Status:** FIXED and verified live, 2026-09-20. Root cause confirmed live the same day — a real run
redid triage on all 35 raw records instead of the 15 actually-new ones, and the run was stopped
early specifically because of the wasted cost. Fix applied per the "Fix" section below (raw-text
settings read + code-side JSON.parse, mirroring fit-screen.js exactly) and verified by running
`intake-normalize.js` twice, back to back, against a scratch copy of `tests/fixtures/data-dir`
(14 raw records, unchanged `settings.json` between runs):
- **Run 1** (fresh, from-scratch triage): `triageKept: 12, triageRejected: 3`, all 14 records got a
  real `triage:`/`write-triage:` agent call and a stored `criteriaHash`.
- **Run 2** (same dataDir, same settings, no config change): **zero** `triage:*` / `write-triage:*`
  agent calls appear anywhere in the run's journal — every record hit the `criteriaHash` skip branch
  and `continue`d. `summary.triageKept`/`triageRejected` came back unchanged (12/3), carried over
  from the stored marks, not recomputed. Also confirms issue 005 §1's batched-provenance fix
  (`queueProvenance`/`flushProvenance`): the triage phase's provenance queue stayed empty (zero
  provenance agent calls for phase `triage` in run 2, vs. one per record in run 1), and normalize's
  7 merges flushed as a single batched write instead of 7 separate ones.

No spec was needed — bug-fix-sized, direct port of an already-proven fix in the same repo.

**Scope:** `.claude/workflows/intake-normalize.js`'s `read-settings` step (`settingsReadSchema`,
line 77) and `criteriaFingerprint` (line 954), which together back the triage-skip check (FR-008,
"recompute only when the criteria hash differs from the stored one").

## Problem

Ran `intake-normalize.js` against the real data dir (15 new Coder postings collected on top of 20
pre-existing himalayas-board raw records from an earlier run, none of whose triage criteria —
`hardStops`, `directions` — had changed in `settings.json` between the two runs). Expected: the 20
old records skip straight past triage (`rec.triage.criteriaHash === thisHash` hits, `continue`,
line ~578) and only the 15 new ones get judged. Observed instead: **every record checked so far got
a fresh, real `triage:` judge call and a new `criteriaHash`/`decidedAt`** — confirmed by inspecting
`outputs/job-records/raw/httpshimalayasappcompaniesblend360jobsprincipal-ai-engineer.md` (a Sep-15
record), whose front-matter now carries this run's timestamp and a new hash, despite reaching the
identical `rejected — UK-only location` decision either way. The skip branch never fired once
across the first 15 records processed.

**Root cause**: `read-settings` (line 77) extracts `hardStops`/`directions` via an **LLM
transcription** of `inputs/settings.json` — the agent is handed the raw file and asked to copy
specific fields into a matching JSON shape (`settingsReadSchema`) — rather than a deterministic
`JSON.parse()` in code. `criteriaFingerprint(criteria, directions)` (line 954) hashes
`JSON.stringify({criteria, directions})` over whatever that transcription produced. If two runs'
transcriptions of the *same underlying bytes* differ in any way that changes the stringified
JSON — key order, a stray whitespace difference, unicode normalization of an em-dash, anything — the
hash changes and the skip check misses, even though nothing a user actually configured changed at
all.

This is not hypothetical: `fit-screen.js` (spec 004) hit and documented the *exact same class of
bug* in its own settings read (see the comment above `rawFileReadSchema` there) — an early version
asked a fast-tier agent to transcribe `evidenceBase.files` and got three different wrong values
across three runs, even though the much larger `hardStops`/`hardConstraints`/`targetRoles`
structures came through correctly every time. `004`'s fix: the agent call now does *only* a raw,
verbatim file read (`found`/`content`), and every structured value is extracted by `JSON.parse()`
in code — "plain code owns config parsing... never trust a model to transcribe JSON it could
instead read raw and let the script parse." `intake-normalize.js` was never updated to match, and
this run is a direct demonstration of why that matters: a "harmless" transcription drift here
doesn't just get a field slightly wrong once, it **silently defeats an idempotency guarantee** and
turns every run into a full re-triage of every previously-processed record.

**Cost observed**: re-triaging one record is a full 3-call round trip (judge + write-triage +
provenance append) at ~145s average per the timed run — for a data dir with 35 raw records, that's
the difference between "15 new records, ~35 min of triage" and "35 records, ~85 min of triage,"
before `normalize` even starts. This compounds with issue 005's serial-architecture cost instead of
replacing it — every unnecessary re-triage pays the full per-record serial tax on top.

## Fix

Mirror 004's fix exactly: change `read-settings` to a plain raw-text read
(`found`/`content`, matching `fit-screen.js`'s `rawFileReadSchema`), then `JSON.parse()` the content
in code and derive `trackedBoards`/`hardStops`/`directions`/`locationsExcluded` the same way
`fit-screen.js` derives its own settings fields (deterministic property access with `??`/`||`
defaults, not an agent's transcription). This is a direct, mechanical port of an already-proven fix
within the same repo — no new design needed, and it removes the underlying non-determinism at the
source rather than working around its symptom (e.g. it would be wrong to "fix" this by loosening or
removing the fingerprint check instead — the check is correct, the input feeding it isn't).

Bonus: this also removes one full agent call's worth of LLM latency from every run's start (the
transcription call becomes a plain file read), independent of the idempotency fix.

## Recommended action

Bug-fix-sized, no spec needed — same posture as issue 004's comp-floor fix. Apply directly: swap
`read-settings`'s schema/prompt for a raw-text read, move the `trackedBoards`/`hardStops`/
`directions`/`locationsExcluded` extraction into code, verify against the existing
`tests/fixtures/data-dir/` fixture (idempotent re-run scenario, feature 001 quickstart scenario 8)
that a second run with unchanged settings now correctly skips every previously-triaged record with
zero new agent calls for them. Do this **before** re-running `intake-normalize.js` again against
the real data dir — otherwise the next run repeats the same waste on the (by then) 35 already-triaged
records once more.
