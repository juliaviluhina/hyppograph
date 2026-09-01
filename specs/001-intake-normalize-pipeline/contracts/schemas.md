# Contract: `agent()` JSON schemas (Phase A workflow)

The bounded structured payloads the `intake-normalize` dynamic workflow
(`.claude/workflows/intake-normalize.js`) exchanges with each subagent. Every `agent()` call declares
one of these as its `schema` and the subagent returns **only** an object matching it (Principle I,
plan.md Constitution Check T011 clause e). Field semantics trace to `data-model.md` and
`contracts/outputs-format.md`.

Phase B (`@anthropic-ai/claude-agent-sdk`) re-expresses these same shapes as `zod` schemas passed to
`query({ options.outputFormat })`; the field sets do not change across phases.

| # | Schema (const in the workflow) | Used by `agent()` call(s) | Purpose |
|---|---|---|---|
| 0 | `settingsReadSchema` | `read-settings` (run precondition) | Read `inputs/settings.json` and return only 001's view: `setupReady`, `unresolved[]`, `trackedBoards[]`, `hardStops`, `locationsExcluded[]`, `directions[]` |
| 1 | `collectResultSchema` | `open-search:<source>` (collect) | Open one filtered board search; return `opened` + up to `depth` `postingRefs[] {url, listMeta}` from the filtered result set (FR-002, FR-002b) |
| 2 | `fetchPostingSchema` | `fetch:<url>` (collect) | Fetch one posting's verbatim text and write its Raw Record; report `status` (ok/unavailable), `rawRecordPath`, `written` (false ⇒ already existed, FR-008) |
| 3 | `triageMarkSchema` | `triage:<id>` (triage) | One keep/reject decision per Raw Record: `decision`, one-line `reason`, `confidence` (low ⇒ default keep, FR-008c) |
| 4 | `jobRecordFieldsSchema` | `normalize:<id>` (normalize) | Extract the fixed field set from one posting; every key present; `"unknown"` for anything unstated, never inferred (FR-009, FR-010); `requirements` as discrete items (FR-011); `originalLanguage` + English values (FR-013); `locationBucket` is a coarse dedup key (`remote-<region>` / `<city>` / `unknown`) that collapses board-specific location phrasings (FR-015) |
| 5 | `dedupGroupSchema` | `canonicalise-companies` (normalize) | Resolve every observed company name to one `canonical` form with its `variants[]` (FR-014) |

## Supporting write-only schemas

Small `{ written }` / `{ appended }` / `{ created, merged, path, alreadyApplied }` acknowledgements are
declared inline at their call sites (`write-triage:*`, `write-job-record:*`, `provenance`,
`write-run-summary`, `ingest-manual-postings`, `index-raw-records`). They carry no judgment — only the
subagent's report of what it wrote, which the workflow body uses to update the `RunSummary` and append
provenance.

## Fixed field set (schema 4) — every key required

`roleTitle`, `normalizedTitle`, `companyAsStated` (workflow resolves → `canonicalCompany`),
`locations[]`, `workArrangement` (`remote|hybrid|on-site|unknown`), `salaryAmountOrRange` (verbatim or
`"unknown"`), `salaryCurrency`, `seniority`, `employmentType`, `postingDate` (ISO-8601 or `"unknown"`),
`originalLanguage`, `responsibilitiesSummary`, `requirements[]`.

The workflow derives `key`, `completeness` (`ok`/`low` per FR-017), `sources[]`, `appliedEntryRef`,
and `alreadyApplied` — they are **not** asked of the extraction subagent.

## Tier & tools per call (Principle II / IV)

Every schema-bearing `agent()` above runs at `model: "haiku"` (fast tier — the only tier this feature
uses). Tools are **not** passed per call — each `agent()` names an `agentType` (a custom subagent def
in `.claude/agents/`) that carries the grant:

| `agent()` call(s) | `agentType` | tools |
|---|---|---|
| `read-settings`, `index-raw-records` | `hyppo-read` | `Read` |
| `open-search:*` | `hyppo-collect-list` | the six HyppoVisor read/navigation tools |
| `fetch:*` | `hyppo-collect-fetch` | those six + `Write` |
| `triage:*`, `normalize:*` | `hyppo-judge` | nominal `Read`, never used (a zero-tool subagent cannot launch; the prompt forbids tool use) |
| `write-triage:*`, `canonicalise-companies`, `write-job-record:*`, `ingest-manual-postings`, `provenance` | `hyppo-readwrite` | `Read, Write` |
| `write-run-summary` | `hyppo-write` | `Write` |

No def grants `Edit`, `Bash`, `mcp__hyppovisor-hyppograph__interact`, or any submit/send capability.
