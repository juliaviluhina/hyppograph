# Contract: Output files written by this feature

All under `HYPPO_DATA_DIR/outputs/` except the provenance log at the data-dir root. `store/` is the
only writer and refuses any path outside `HYPPO_DATA_DIR` (Principle V).

---

## Raw Record — `outputs/job-records/raw/<id-slug>.md`

Front-matter + verbatim body. The body text is **immutable** once written.

```markdown
---
id: "https://boards.greenhouse.io/acme/jobs/12345"
sourceName: "Acme greenhouse"
sourceRef: "https://boards.greenhouse.io/acme/jobs/12345"
firstSeenAt: "2026-08-30T09:12:04Z"
retrievalMethod: "mcp-page-read"
run: "run-2026-08-30T09-10-00Z"
availability: "ok"
triage:
  decision: "kept"
  reason: "matches direction: Platform / DX"
  confidence: "normal"
  criteriaHash: "sha256:…"
  decidedAt: "2026-08-30T09:20:11Z"
---
<full verbatim posting text>
```

`availability: "unavailable"` ⇒ empty body. `triage: null` until pre-triage runs.

---

## Job Record — `outputs/job-records/<key-slug>.md`

`gray-matter` front-matter = the fixed field set (every key present; value or `"unknown"`). Body =
responsibilities + requirements list + links to raw records.

```markdown
---
key: "acme--senior-platform-engineer--berlin-remote-eu"
roleTitle: "Senior Platform Engineer"
normalizedTitle: "senior platform engineer"
canonicalCompany: "Acme"
locations: ["Berlin", "Remote (EU)"]
workArrangement: "hybrid"
salaryAmountOrRange: "€90,000–€110,000"
salaryCurrency: "EUR"
seniority: "senior"
employmentType: "full-time"
postingDate: "2026-08-28"
originalLanguage: "en"
completeness: "ok"
sources:
  - { sourceName: "Acme greenhouse", sourceRef: "https://…/12345", rawRecordId: "https://…/12345" }
  - { sourceName: "LinkedIn EU remote", sourceRef: "https://…/abc", rawRecordId: "https://…/abc" }
appliedEntryRef: null
alreadyApplied: false
---

## Responsibilities

<concise prose summary>

## Requirements

- 5+ years building internal platforms
- Strong TypeScript
- …

## Sources

- [Raw record — Acme greenhouse](./raw/acme-12345.md)
- [Raw record — LinkedIn EU remote](./raw/li-abc.md)
```

Merge rule: a later posting whose derived `key` matches appends to `sources` in place; a `"unknown"`
field may be filled by a later source, a stated value is never replaced with `"unknown"` (FR-015,
FR-010).

---

## Company canonicalisation — `outputs/job-records/companies.md`

```markdown
- Acme  ⇐  Acme, Acme Inc., Acme Corporation
- Globex  ⇐  Globex, Globex LLC
```

Left = canonical; right = observed variants. Seeded from `applications.md` and existing Job Records
(FR-014).

---

## Provenance log — `provenance-log.md` (data-dir root, append-only)

One line per stored Raw Record, per triage mark, per created/updated Job Record (FR-007):

```
2026-08-30T09:12:04Z  run-2026-08-30T09-10-00Z  raw/acme-12345.md  mcp-page-read  collected from "Acme greenhouse" (depth 1/15)
2026-08-30T09:20:11Z  run-2026-08-30T09-10-00Z  raw/acme-12345.md  pre-triage     kept — matches direction "Platform / DX"
2026-08-30T09:24:39Z  run-2026-08-30T09-10-00Z  acme--senior-platform-engineer--berlin-remote-eu.md  normalize  created from raw/acme-12345.md
```

---

## Run summary — printed to stdout, and `outputs/last-run-summary.md`

Human-readable rendering of `RunSummary` (data-model.md). Must state: postings collected, new raw
records, triage kept / rejected (with reject-reason breakdown), low-confidence triage count, new Job
Records, duplicates merged, sources failed (with reasons), items skipped (with reasons), and the
"no triage criteria configured" note when applicable (FR-020, FR-008d).
