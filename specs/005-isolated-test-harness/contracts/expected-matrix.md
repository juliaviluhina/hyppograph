# Contract: Expected Matrix

The synthetic data dir contents the full-flow run asserts against. Source of truth for FR-001;
every row names its expected terminal state. (Fixture files themselves live under
`tests/fixtures/data-dir/`; this contract pins what the harness must expect of them.)

## Scoring fixtures (verify → score)

| Fixture record | Expected verdict | Expected flags / notes |
|---|---|---|
| full-match | `APPLY` | Every requirement row `Strong` with citation |
| one-gap | `SKIP` (or `APPLY-AND-SEE` only via the narrow-adjacent-subskill exception) | Gap row `Fails`/`Absent`/`Unknown`, never invented |
| hard-constraint-failure | `SKIP` | Failure in the hard-constraint section, separate from the requirement table |
| title-inflation | ≤ `APPLY-AND-SEE` | `title-vs-requirements` flag; title never raises the verdict |
| domain-crossover | flagged | `domain-crossover-overclaim` flag visible |
| stale-leadership | downgraded one level | `recency-discount` flag; affected row downgraded (e.g. `Strong`→`Partial`) |

## Signal fixtures (verify)

| Fixture source | Service scenario | Expected mark | Scoring consequence |
|---|---|---|---|
| Greenhouse/Lever/Ashby-shaped, live | `live` | `confirmed-open` | Scored normally |
| Greenhouse/Lever/Ashby-shaped, closed | `closed` | `confirmed-closed` | Excluded from scoring, reason recorded |
| Malformed/error response | `malformed` / `error` | `unresolvable` | Scored with "open status unverified" flag |
| Non-ATS source | n/a (no call) | `unresolvable` | Scored with flag; no service access-log entry |
| Flapping live→closed | `flapping`, flipped between runs | Mark updates; prior evaluation untouched | `score` skips the now-terminal record |

## Application-state fixtures

No tracker match + tracker present → `not_applied` · `submitted` match → `submitted` ·
conflicting evidence → `ambiguous` + `state.ambiguous-match` · no tracker file → `unknown` for
every record.

## Config-gate fixtures

Missing `recencyWindowYears` / empty evidence file / stripped `inputs/` prefix →
`config.evidence-unavailable`, zero writes (run 1).
