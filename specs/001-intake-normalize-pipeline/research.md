# Phase 0 Research: Intake & Normalize Pipeline Steps

Resolves the NEEDS CLARIFICATION items from Technical Context. Format per item:
Decision / Rationale / Alternatives considered.

---

## R0. Orchestration substrate — phased

**Decision**: Prototype the collect→triage→normalize flow as a **Claude Code dynamic workflow**
(`.claude/workflows/intake-normalize.js`): `phase()` per step, `pipeline()` over sources / raw records
/ kept records, one bounded `agent()` per unit of work with a JSON `schema`, HyppoVisor reached via
subagent MCP instructions. Iterate it inside a Claude Code session (plan-billed). Once the flow is
proven against fixtures and one small live run (Phase A exit criteria in plan.md), decide between
**B1** — keep the script, invoke it from a thin Agent SDK harness through the `Workflow` tool — or
**B2** — rewrite the orchestration as plain TypeScript on `@anthropic-ai/claude-agent-sdk` for CI,
`vitest`, and hard idempotency guarantees.

**Rationale**: The spec, data model, contracts, JSON schemas, prompts, and fixtures are
substrate-independent, so a workflow prototype is a cheap way to de-risk the prompts and the
HyppoVisor interaction before committing to the full typed implementation. The `Workflow` tool is in
the TS Agent SDK (v0.3.149+), so the prototype is not throwaway even if B2 is never done.

**Alternatives considered**: Go straight to B2 — more upfront cost, slower prompt iteration, and the
HyppoVisor MCP tool names aren't pinned yet (R3). Stay on a workflow forever — rejected: the sandbox
(no `import`, frozen clock, 16-agent cap, no CI) blocks the SC-006 idempotency test and a review gate.

**Constitution note**: a workflow subagent has more per-task latitude than a `maxTurns: 1` call, so
Phase A is a slightly looser reading of "the model does only the cognitive piece". Accepted as a
time-boxed prototype trade-off that Phase B removes (see plan.md Constitution Check).

The rest of this document (R1–R7) describes the **Phase B** shape; the Phase A workflow reuses the
same decisions expressed as subagent prompts + schemas.

---

## R1. Model-in-the-loop mechanism (Claude Agent SDK, single-shot judgment)

**Decision**: In Phase B, all model judgment goes through one wrapper, `model/judge.ts`, which calls
`query({ prompt, options })` from `@anthropic-ai/claude-agent-sdk` with:
- `options.model` = the alias for the requested tier (see R2)
- `options.maxTurns = 1` — one model turn, no agentic round-trips
- `options.outputFormat = { type: "json_schema", schema }` — the caller passes a JSON Schema; the
  result is validated with `zod` before returning
- `options.mcpServers` omitted, `options.allowedTools = []`, `options.disallowedTools` listing the
  built-in tools — the judgment calls do no tool use at all
- `options.settingSources = []` — do not load user/project/local filesystem settings, so no external
  state or config bleeds into a judgment
- `options.systemPrompt` = a task-specific string (not the `claude_code` preset)
The generator is drained; the `result`/final assistant message is parsed as JSON and zod-validated.

**Rationale**: The constitution requires code-driven control flow with the model used only *inside* a
step. `maxTurns: 1` + no tools + no setting sources makes each call a pure function of (prompt, input,
schema, model) — which is also what makes fixture-backed fakes and idempotency tests possible.
`outputFormat` gives a machine-checkable object so normalize can guarantee every fixed field is present
or `unknown` (SC-004).

**Alternatives considered**:
- *Anthropic API SDK (`@anthropic-ai/sdk`) directly* — smaller surface, but the constitution names the
  Claude Agent SDK as the stack, and the same SDK is already needed for the MCP client. One dependency,
  one auth path.
- *Tool Runner / multi-turn agent* — rejected: introduces a model-driven loop, violating Principle I.
- *Prompt-only "return JSON" without `outputFormat`* — rejected: weaker guarantee, more parse failures.

---

## R2. Model tiers → concrete aliases

**Decision**: `config/index.ts` maps tiers to Agent SDK model aliases, overridable by env:
- `fast` → `haiku` (Haiku-class) — **the only tier this feature uses**
- `mid` → `sonnet` — reserved for downstream scoring, not used here
- `top` → `opus` — reserved for downstream Tier-1 deliverables, not used here
Exact model IDs are pinned via `HYPPO_MODEL_FAST` / `HYPPO_MODEL_MID` / `HYPPO_MODEL_TOP` env vars
(defaults resolve to the current Haiku/Sonnet/Opus aliases).

**Rationale**: The constitution's model table puts "bulk extraction, normalization, dedup,
company-name matching" on the fast tier; pre-triage is a single cheap yes/no, also fast. Keeping the
map in config (not scattered at call sites) satisfies Principle II's "every model call declares its
tier" while allowing pinning for reproducibility.

**Alternatives considered**: Hard-coding model IDs at call sites — rejected, spreads tier decisions and
breaks the single-audit-point the review checklist relies on.

---

## R3. HyppoVisor MCP page-read contract (the seam)

**Decision**: `mcp/hyppovisor.ts` is a thin adapter exposing exactly what collect needs:
1. `openFilteredSearch(source): Promise<PostingRef[]>` — navigate the user-authored filtered search
   URL/params and return the ordered list of result posting references (URL + any list-level metadata),
   honouring the source's collection depth.
2. `fetchPosting(ref): Promise<{ text: string; retrievedAt: string; finalUrl: string; status: "ok" | "unavailable" }>`
   — retrieve one posting's full readable text.
The adapter calls HyppoVisor through `query()` `options.mcpServers = { hyppovisor: { type: "http",
url: HYPPO_VISOR_MCP_URL, headers: { Authorization: ... } } }` (stdio config also supported via env),
with `allowedTools` restricted to HyppoVisor's **read/navigation** tool names only
(`mcp__hyppovisor__*` narrowed to the read subset once the contract is confirmed).

**Rationale**: The constitution says depend only on HyppoVisor's documented MCP surface and keep the
contract third-party-implementable. Isolating the two operations above in one adapter means the rest of
the codebase never names a HyppoVisor tool, and `contracts/hyppovisor-page-read.md` can be handed to
any MCP server author.

**Open item (carried as assumption, not a blocker)**: HyppoVisor's exact tool names and argument
shapes are not yet pinned in this repo. Before implementation, confirm them against the HyppoVisor
project's published MCP contract and fill `contracts/hyppovisor-page-read.md` with the concrete
mapping. The adapter's two-function interface is expected to hold regardless.

**Alternatives considered**:
- *HyppoGraph drives its own headless browser* — rejected by the constitution (no authenticated
  session in HyppoGraph; no UI/browser).
- *Scrape raw HTTP without HyppoVisor* — rejected: job boards need the user's authenticated session.

---

## R4. Structured-output reliability & failure handling

**Decision**: Every `judge()` call validates the model result against its zod schema. On a schema
miss: retry once with the same input; on a second miss, record the Raw Record (for triage) or Job
Record (for normalize) as `errored` with the reason, count it in the run summary, and continue. A
`judge()` failure never aborts the run (mirrors FR-006 for sources).

**Rationale**: Keeps a bad model response from stopping a 100-posting run (SC-009) while still
surfacing it. One retry is cheap at fast tier.

**Alternatives considered**: Unbounded retries (rejected — can blow the time budget); hard-fail the run
(rejected — one posting shouldn't sink the batch).

---

## R5. Input file formats (`boards.md`, `priorities.md`, `directions/`)

**Decision**: Parse tolerantly; document the expected shape in `contracts/inputs-format.md`:
- `boards.md` — a Markdown list, one bullet per tracked source: a link (the filtered search URL) plus
  an inline `depth: N` (and optional `name:`). Lines that don't parse are reported as
  configuration errors for that source (FR-002a), not fatal.
- `priorities.md` — hard stops read from a delimited section (e.g. a `## Hard stops` heading) with
  recognised keys for excluded locations and lacked clearances / work authorisations. Absent section ⇒
  no hard stops (FR-008d).
- `directions/` — one Markdown file per considered direction; the file's title/first heading is the
  direction name, body is context for the triage judgment. Empty directory ⇒ no directions (FR-008d).

**Rationale**: These are user-hand-authored files (per the README's `inputs/` tree). Tolerant parsing
with explicit "couldn't read this" reporting beats a rigid schema the user must satisfy exactly.

**Alternatives considered**: Require YAML/JSON inputs — rejected: contradicts the README's "plain md /
CSV" and the privacy-friendly "a folder you point at" model.

---

## R6. Idempotency & determinism strategy

**Decision**:
- **Raw Record identity** = canonical source URL (board postings) or absolute file path (manual drop).
  `store/rawRecord.ts` skips a fetch/write when that identity already exists (FR-008).
- **Triage mark** is stored on/next to the Raw Record; re-running with unchanged `priorities.md` +
  `directions/` leaves an existing mark untouched (a content hash of the triage criteria + raw text is
  stored with the mark; recompute only on mismatch).
- **Job Record identity** = deterministic key `{canonical company, normalized role title, overlapping
  location set}` (FR-015); a re-seen posting merges its source reference into the existing file.
- Tests inject fixture-backed `mcp/` and `model/` fakes so a full run is reproducible and the
  re-run-produces-nothing-new assertion (SC-006) is exact.

**Rationale**: Model calls are non-deterministic in production, so idempotency is anchored on
*persisted identity keys* and *criteria hashes*, not on identical model output. Determinism in tests
comes from the fakes.

**Alternatives considered**: Caching raw model responses in the data dir for reproducibility —
rejected: adds hidden state that outlives a run (Principle V) and isn't needed once identity keys
carry idempotency.

---

## R7. Pacing implementation

**Decision**: `collect.ts` awaits a `sleep(pacingDelayMs)` between `fetchPosting` calls per source
(default 3000 ms, `HYPPO_PACING_MS`) and stops a source once the per-run cap is hit
(`HYPPO_FETCH_CAP`, default 300). Pacing is HyppoGraph-side and independent of HyppoVisor (FR-006a).

**Rationale**: Simple, observable, conservative by default; keeps the user's authenticated session off
board rate-limits. 100 postings × 3 s ≈ 5 min of pacing, well inside the 30-minute budget with triage
and normalize.

**Alternatives considered**: Token-bucket / adaptive backoff on 429 signals — deferred; the fixed
delay + cap is enough for current scale and easier to reason about.
