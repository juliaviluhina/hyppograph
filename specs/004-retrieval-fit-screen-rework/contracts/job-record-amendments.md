# Contract: Amendments to feature 001's Job Record

This feature amends the Job Record file format defined in
`specs/001-intake-normalize-pipeline/contracts/outputs-format.md`. It does not change the file's
identity (`key`), location, merge rule, or any field feature 001 owns other than the two called out
below.

---

## Removed

- `alreadyApplied: boolean` — replaced by `applicationState` (research.md R9). A Job Record written
  by a feature-001-only run still carries this old field; the first time this feature's `score` step
  touches that record, it computes `applicationState` and removes `alreadyApplied` — no dual-write,
  no deprecation window (Constitution Principle V: single source of truth, no external consumer to
  break).

## Added

```markdown
---
# ...feature 001's existing fields unchanged...
appliedEntryRef: "applications.md#acme-platform-engineer"   # unchanged from feature 001
applicationState: "existing_application"                     # NEW — replaces alreadyApplied
openStatus: "confirmed-open"                                  # NEW
openStatusCheckedAt: "2026-09-12T10:03:00Z"                   # NEW
openStatusReason: "ATS API returned the posting"               # NEW
---
```

| Key | Type | Notes |
|---|---|---|
| `applicationState` | one of the 8 `ApplicationStateValue`s | FR-007. `null`/absent only before this feature's first `score` pass touches the record. |
| `openStatus` | `"confirmed-open"` \| `"confirmed-closed"` \| `"unresolvable"` \| `null` | FR-002. `null` before this feature's first `verify` pass. |
| `openStatusCheckedAt` | ISO 8601 string \| null | Updated on every re-check, whether or not the mark changed. |
| `openStatusReason` | string \| null | One line naming the signal (research.md R6). |

## Unchanged, but now load-bearing for this feature

- `key`, `sources[]`, `requirements` (body list), `canonicalCompany`, `locations`,
  `salaryAmountOrRange`, `salaryCurrency` — all read (never written) by `hyppo-score` to build the
  requirement table and evaluate hard constraints.
- `completeness: "low"` — a Job Record already flagged low-completeness by feature 001 is still
  eligible for verify/score; if the record is too sparse to score meaningfully (missing role title,
  requirements, or company — the spec's `score.insufficient-input` condition), that is judged
  independently by `hyppo-score`, not inferred from `completeness` alone.

## A Job Record marked `confirmed-closed` by this feature

Feature 001's own fields (front matter + body) are **never** modified when a record transitions to
`confirmed-closed` — only the four new/amended fields above change. Feature 001's dedup/merge
behavior on a later re-collection of the "same" role is entirely unaffected by this feature's marks.
