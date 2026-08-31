# Contract: HyppoVisor Page-Read (consumer view)

The **only** capability this feature needs from HyppoVisor. Expressed as the interface
`mcp/hyppovisor.ts` exposes to the rest of HyppoGraph; the underlying MCP tool names are bound in one
place (R3).

All operations are **read / navigation only**. No operation submits, sends, posts, or mutates any
remote state (Principle IV, FR-018). `allowedTools` for the `query()` call that carries these
operations is restricted to HyppoVisor's read-tool names; no write-capable tool is allow-listed.

## Confirmed tool mapping (HyppoVisor MCP, verified 2026-08-31)

The live `hyppovisor` MCP server exposes eight tools:
`interact, list_open_tabs, navigate, open_url, read_form_fields, read_page, screenshot, wait_for_selector`.

| This contract | HyppoVisor MCP tool(s) | Notes |
|---|---|---|
| open a filtered search / a posting URL | `mcp__hyppovisor__open_url`, `mcp__hyppovisor__navigate` | navigation only |
| wait for a lazy-loaded result list | `mcp__hyppovisor__wait_for_selector` | |
| read the rendered page text | `mcp__hyppovisor__read_page` | the primary read |
| inspect form fields (diagnostic only) | `mcp__hyppovisor__read_form_fields` | not used for collection; read-only |
| enumerate open tabs | `mcp__hyppovisor__list_open_tabs` | |
| capture a screenshot (diagnostic only) | `mcp__hyppovisor__screenshot` | read-only |

**Allow-list** (Phase A `.mcp.json` + every `agent()` `allowedTools` in the collect stage):

```
mcp__hyppovisor__open_url
mcp__hyppovisor__navigate
mcp__hyppovisor__wait_for_selector
mcp__hyppovisor__read_page
mcp__hyppovisor__read_form_fields
mcp__hyppovisor__list_open_tabs
```

`mcp__hyppovisor__interact` (clicks / typing / form entry) is the one state-changing tool and is
**never** allow-listed anywhere in this feature. `screenshot` is read-only but not needed by the
workflow; omit it from `allowedTools` unless debugging a collect run by hand. The wildcard
`mcp__hyppovisor__*` is **not** acceptable here because `interact` is in the set.

---

## `openFilteredSearch(source): Promise<PostingRef[]>`

**Input** — `source`:
| Field | Type | Notes |
|---|---|---|
| `filteredSearch` | string | The user-authored tuned search URL / params, passed through opaquely |
| `depth` | integer ≥ 1 | Max number of result references to return, in board order (newest first where the board supports it) |

**Output** — ordered `PostingRef[]` (length ≤ `depth`):
| Field | Type | Notes |
|---|---|---|
| `url` | string | Canonical posting URL — becomes `RawRecord.id` for board postings |
| `listMeta` | object \| null | Any list-level fields the board exposes (title, company, posted-date) — advisory only |

**Failure**: throws `PageReadError { source, reason }` when the filtered search can't be opened
(stale/rejected URL, board unreachable). Caller records the source as failed and continues (FR-006).
An empty result array is **not** a failure (FR-002a edge case).

---

## `fetchPosting(ref): Promise<FetchedPosting>`

**Input** — `ref: PostingRef` (from `openFilteredSearch`) or `{ url }`.

**Output** — `FetchedPosting`:
| Field | Type | Notes |
|---|---|---|
| `status` | `"ok"` \| `"unavailable"` | `unavailable` = posting delisted between discovery and fetch |
| `text` | string | Full readable posting text when `status === "ok"`; empty when `unavailable` |
| `finalUrl` | string | URL after redirects — used as the canonical id if it differs |
| `retrievedAt` | ISO 8601 string | Set by HyppoGraph at call time if HyppoVisor doesn't supply it |

**Failure**: throws `PageReadError` on transport failure. `status: "unavailable"` is a normal result,
not an error — caller stores a RawRecord with `availability: "unavailable"` and no text.

---

## Connection

`query()` `options.mcpServers`:

```
{
  hyppovisor: {
    type: "http",                       // or "sse"; stdio via HYPPO_VISOR_MCP_CMD
    url: process.env.HYPPO_VISOR_MCP_URL,
    headers: { Authorization: `Bearer ${process.env.HYPPO_VISOR_MCP_TOKEN}` }
  }
}
```

`options.allowedTools` = the six read/navigation tool names listed under **Allow-list** above
(`open_url`, `navigate`, `wait_for_selector`, `read_page`, `read_form_fields`, `list_open_tabs`).
Wildcard `mcp__hyppovisor__*` is **not** acceptable — `mcp__hyppovisor__interact` is state-changing.

## Pacing (caller-side, not part of this contract)

`collect.ts` waits `HYPPO_PACING_MS` (default 3000) between `fetchPosting` calls per source and stops a
source at `HYPPO_FETCH_CAP` (default 300) total fetches per run (FR-006a).

---

## Constitution audit — Phase A workflow (T041 / T042), reviewed 2026-08-31

Checks against `.claude/workflows/intake-normalize.js` at Phase A completion:

**Principle IV — the human owns the last mile.**
- `.mcp.json` defines only the `hyppovisor` server; no tools are globally enabled there.
- Every collect `agent()` (`open-search:*`, `fetch:*`) is granted exactly the six read/navigation
  tools (`HV_READ_TOOLS`); `fetch:*` additionally gets `Write`. `mcp__hyppovisor__interact` is
  granted **nowhere**.
- `triage:*` and `normalize:*` are granted `[]` (pure judgment). Write-only helpers get
  `["Read","Write"]` or `["Write"]`. No `agent()` anywhere lists `Edit`, `Bash`, or a submit/send tool.

**Principle I — deterministic, code-driven orchestration.**
- The default-export `run()` body is the only sequencer: `read-settings` gate → `phase("collect")` →
  `phase("triage")` → `phase("normalize")` → summary, in fixed order. No `agent()` return value is
  branched on to choose *what stage runs next* — results only update counters, provenance, and the
  per-record `_decision` used to filter the normalize input list.
- Each `agent()` prompt is one bounded action (open one search; fetch one posting; classify one
  record; extract one posting; resolve company names; append one provenance line) and returns only its
  declared schema (`contracts/schemas.md`).
- *Accepted prototype note* (plan.md Constitution Check): a workflow subagent runs multiple turns
  within its bounded task, vs. a Phase B `maxTurns: 1` call. Time-boxed; removed by Phase B.

**Principle II — right-tier model usage.** Every judgment `agent()` sets `model: "haiku"` via the
single `FAST` constant — the lowest tier, and the only tier this feature uses. Any non-fast `model`
would be a policy violation (there are none).

**Principle V — local files are the only state.** Every write path is `args.dataDir` + a relative
path (`outputs/job-records/raw/…`, `outputs/job-records/…`, `outputs/job-records/companies.md`,
`outputs/last-run-summary.md`, `provenance-log.md`). `inputs/` is only ever read. `appendProvenance()`
is called for every newly-written Raw Record, every triage mark, and every Job Record create/merge
(SC-003). No database, no cache outliving the run.
