# Contract: HyppoVisor Page-Read (consumer view)

The **only** capability this feature needs from HyppoVisor. Expressed as the interface
`mcp/hyppovisor.ts` exposes to the rest of HyppoGraph; the underlying MCP tool names are bound in one
place (R3) and must be confirmed against HyppoVisor's published MCP contract before implementation.

All operations are **read / navigation only**. No operation submits, sends, posts, or mutates any
remote state (Principle IV, FR-018). `allowedTools` for the `query()` call that carries these
operations is restricted to HyppoVisor's read-tool names; no write-capable tool is allow-listed.

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

`options.allowedTools = ["mcp__hyppovisor__<read tool>", "mcp__hyppovisor__<navigate tool>"]`
— exact names filled once the HyppoVisor contract is confirmed; wildcard `mcp__hyppovisor__*` is
acceptable only if every tool HyppoVisor exposes is read-only.

## Pacing (caller-side, not part of this contract)

`collect.ts` waits `HYPPO_PACING_MS` (default 3000) between `fetchPosting` calls per source and stops a
source at `HYPPO_FETCH_CAP` (default 300) total fetches per run (FR-006a).
