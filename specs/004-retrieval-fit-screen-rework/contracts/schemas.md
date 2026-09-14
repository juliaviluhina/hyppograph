# Contract: `agent()` JSON schemas (Phase A workflow)

The bounded structured payloads the `fit-screen` dynamic workflow (`.claude/workflows/fit-screen.js`)
exchanges with each subagent. Every `agent()` call declares one of these as its `schema` and the
subagent returns **only** an object matching it (Principle I, plan.md Constitution Check T011 clause
e). Field semantics trace to `data-model.md` and `contracts/evaluation-format.md` /
`contracts/job-record-amendments.md`. Mirrors feature 001's own `contracts/schemas.md` in shape.

| # | Schema (const in the workflow) | Used by `agent()` call(s) | Purpose |
|---|---|---|---|
| 0 | `rawFileReadSchema` | `read-settings` (run precondition), `read-evidence:<file>` (run precondition) | Read one exact file's raw, unmodified text (`found`/`content`) — nothing else. The script `JSON.parse()`s `inputs/settings.json` itself and extracts every structured value in code; see the schema's own note on why a fast-tier agent is never asked to transcribe this file's structured fields (it was repeatedly, specifically unreliable on `evidenceBase.files` even though far larger structures came through correctly). One call per evidence-base file too — a batched multi-file read was observed returning the wrong file entirely |
| 1 | `applicationsReadSchema` | `read-applications` (run precondition) | Distinguish "tracker file missing entirely" from "present" (research.md R3) — drives the script's `unknown`-override rule, never left to the model |
| 2 | `jobRecordIndexSchema` | `index-job-records` (start of `verify`) | One read-only snapshot of every `outputs/job-records/*.md` (excluding `raw/`/`companies.md`): front-matter + rendered body fields both phases need |
| 3 | `verifySignalSchema` | `verify:<key>` (`verify`) | One raw ATS-API signal (`found`/`not_found`/`http_error`/`unparseable`) — never a disposition (research.md R6) |
| 4 | `fitEvaluationSchema` | `score:<key>` (`score`) | The full per-item requirement table, hard-constraint rows (with `likelyOutcome` on `unresolved`, research.md R11), anti-pattern flags, and reconciled `applicationState` — never `overallVerdict`, which the script alone computes (T021) |

## Supporting write-only schemas

Small `{ written }` / `{ appended }` acknowledgements are declared as `writtenAckSchema` /
`appendedAckSchema` and reused across every write/append call (`write-open-status:*`,
`write-evaluation:*`, `migrate-application-state:*`, `provenance`, `write-run-summary`). They carry no
judgment — only the subagent's report of what it wrote.

## `fitEvaluationSchema` field notes

- `requirementTable[].narrowAdjacentException` (boolean) — set by `hyppo-score` when a `Fails`/`Absent`
  row should cap the overall verdict at `APPLY-AND-SEE` instead of forcing `SKIP` (FR-006's
  narrow-adjacent-subskill exception). The script, not the model, applies this in `computeOverallVerdict()`.
- `hardConstraints[].likelyOutcome` — required (non-null) only when `state === "unresolved"`;
  `null` for `pass`/`fail` rows. See research.md R11 and `contracts/evaluation-format.md`.
- `insufficientInput` — the workflow decides this deterministically in code (`isInsufficientInput()`,
  T041) *before* deciding whether to call `hyppo-score` at all; when true, `hyppo-score` is skipped
  entirely for that record and a zeroed evaluation is written directly.

## Tier & tools per call (Principle II / IV)

| `agent()` call(s) | `agentType` | tools | tier |
|---|---|---|---|
| `read-settings`, `read-evidence`, `read-applications`, `index-job-records` | `hyppo-read` | `Read, Glob` | fast |
| `verify:*` | `hyppo-verify` | `WebFetch` | fast |
| `score:*` | `hyppo-score` | `Read, Glob` | **mid** (`sonnet`, research.md R10) |
| `citation-audit:*` | `hyppo-judge` | nominal `Read`, never used | fast |
| `write-open-status:*`, `write-evaluation:*`, `migrate-application-state:*`, `provenance` | `hyppo-readwrite` | `Read, Write, Glob` | fast |
| `write-run-summary` | `hyppo-write` | `Write` | fast |

No def grants `Edit`, `Bash`, `mcp__hyppovisor-hyppograph__interact`, or any submit/send capability.
This feature makes no HyppoVisor call at all — `hyppo-verify`'s `WebFetch` is the built-in tool, not
an MCP call.
