# Solution design

## Where it sits

```mermaid
flowchart LR
  HG["HyppoGraph<br/>(this repo — all business logic)"]
  HV["HyppoVisor<br/>(Electron app — authenticated browser + UI)"]
  Data[("Shared data directory<br/>inputs/ + outputs/, plain md / CSV")]
  HG <-->|MCP client| HV
  HG <-->|reads / writes| Data
  HV <-->|reads / writes| Data
```

- **HyppoGraph owns all judgment.** Understanding a job description, a career fact,
  or a connection's usefulness happens here. It has no UI and no direct access to any
  logged-in session.
- **[HyppoVisor](https://github.com/juliaviluhina/hyppovisor)** owns everything that
  needs a human-authenticated browser or a human's screen. HyppoGraph connects to it
  as an MCP client for every page read or navigation. HyppoVisor does not depend on
  HyppoGraph — it is a general authenticated-session MCP server that HyppoGraph
  happens to be the first consumer of.
- The two share one **local data directory** as their only persistent state — no
  database, no services. Both read and write it directly. See
  [Constitution → Architectural Boundaries](../.specify/memory/constitution.md#architectural-boundaries).

## The pipeline

Eight fixed stages, run in order by plain code — a model is called only inside a
stage, for the judgment that stage needs (why: [`why.md`](./why.md)):

`intake → normalize → hard-filter → score with evidence → warm-path enrichment →
tier → generate deliverables → feedback loop`

Two stage-groups are implemented and live today, each as a
[Claude Code dynamic workflow](https://code.claude.com/docs/en/workflows) — a
prototyping substrate, cheap to iterate in a session, that gets ported to the Claude
Agent SDK once proven (see [Status](#status) below):

| Stage-group | Workflow | Steps | Spec |
|---|---|---|---|
| intake → normalize | `.claude/workflows/intake-normalize.js` | collect → pre-triage → normalize | [`specs/001-intake-normalize-pipeline/`](../specs/001-intake-normalize-pipeline/) |
| hard-filter → score | `.claude/workflows/fit-screen.js` | verify → score | [`specs/004-retrieval-fit-screen-rework/`](../specs/004-retrieval-fit-screen-rework/) |

Full step-by-step behavior, inputs, and outputs for both live workflows:
[`docs/pipeline.md`](./pipeline.md). The remaining stages (warm-path enrichment
through feedback loop) are not yet built.

Both workflows follow the same shape: plain code owns the loop/phase/branch
decisions, every judgment call declares its own tier, and each subagent's tool grant
comes from its `.claude/agents/*.md` definition, never an inline list — that's
Constitution Principles I, II, and IV made concrete. The diagrams below name every
`agent()` call in the live scripts, its `agentType`/tier, and which decisions stay in
code (marked "code decides") versus which are delegated to a model.

### `intake-normalize.js` orchestration

```mermaid
flowchart TD
  Start(["start: args.dataDir, args.runTimestamp"]) --> Pre["read-settings — hyppo-read (fast)"]
  Pre -->|setupReady: false| Halt[["report unresolved sections, exit — zero writes (FR-000)"]]
  Pre -->|setupReady: true| Collect

  subgraph Collect["phase: collect — serial per source (one HyppoVisor session at a time)"]
    direction TB
    C1["open-search:&lt;board&gt; — hyppo-collect-list (fast)<br/>per tracked board search"]
    C2["fetch:&lt;posting&gt; — hyppo-collect-fetch (fast)<br/>per posting ref, up to depth/fetchCap; writes Raw Record"]
    C3["ingest-manual-postings — hyppo-readwrite (fast)<br/>inputs/manual-postings/ drop folder"]
    C1 --> C2
  end
  Collect --> Triage

  subgraph Triage["phase: triage — serial per Raw Record (shared provenance-log.md)"]
    direction TB
    T1["index-raw-records — hyppo-read (fast)"] --> T2{"criteriaHash matches stored<br/>triage mark? (code decides)"}
    T2 -->|unchanged| T3["reuse stored decision — no agent call"]
    T2 -->|new/changed| T4["triage:&lt;record&gt; — hyppo-judge (fast)<br/>keep/reject vs hard stops + directions"]
    T4 --> T5["write-triage:&lt;record&gt; — hyppo-readwrite (fast)<br/>front-matter only, body untouched"]
    T3 --> T6["append provenance"]
    T5 --> T6
  end
  Triage --> Normalize

  subgraph Normalize["phase: normalize — serial over kept records (merges shared files)"]
    direction TB
    N1["canonicalise-companies — hyppo-readwrite (fast)<br/>seeded from applications.md + companies.md + existing records"]
    N1 --> N2["normalize:&lt;record&gt; — hyppo-judge (fast)<br/>extract the fixed field set"]
    N2 --> N3["dedup key built in code — dedupKey(company, title, locBucket)<br/>(code decides — LLM output never keys a file)"]
    N3 --> N4["write-job-record:&lt;key&gt; — hyppo-readwrite (fast)<br/>create new, or merge 3 edits into an existing duplicate"]
    N4 --> N5["append provenance"]
  end
  Normalize --> Summary["write-run-summary — hyppo-write (fast)<br/>verbatim BEGIN-CONTENT/END-CONTENT write"]
  Summary --> End(["return ok, summary"])
```

### `fit-screen.js` orchestration

```mermaid
flowchart TD
  Start(["start: args.dataDir, args.runTimestamp"]) --> Pre["read-settings — hyppo-read (fast)<br/>evidenceBase / hardConstraints / targetRoles"]
  Pre -->|missing/inconsistent| Halt[["report the unresolved item, exit — zero writes (FR-000/SC-012)"]]
  Pre -->|ok| Snap["read-evidence×N, read-applications, index-job-records<br/>all hyppo-read (fast) — one snapshot shared by both phases"]
  Snap --> Verify

  subgraph Verify["phase: verify — serial per Job Record (mutates the shared file in place)"]
    direction TB
    V0{"openStatus == confirmed-closed?<br/>(code decides — terminal, never re-checked)"} -->|yes| VSkip["skip"]
    V0 -->|no| V1{"ATS-derivable posting-API URL?<br/>(buildAtsApiUrl — code decides, no agent spent)"}
    V1 -->|yes| V2["verify:&lt;record&gt; — hyppo-verify (fast, WebFetch-only)<br/>raw signal ONLY: found / not_found / http_error / unparseable"]
    V1 -->|no| V3["signal = null → unresolvable, no agent call"]
    V2 --> V4["signal → mark mapped in code<br/>(mapSignalToMark — the model never reports a disposition)"]
    V3 --> V4
    V4 --> V5["write-open-status:&lt;record&gt; — hyppo-readwrite (fast)<br/>front-matter only"]
    V5 --> V6{"mark changed?"}
    V6 -->|yes| V7["append provenance"]
  end
  Verify --> Score

  subgraph Score["phase: score — pipeline(), parallel per disjoint evaluation file"]
    direction TB
    S0["filter: openStatus confirmed-open OR unresolvable"] --> S1["input fingerprint computed in code<br/>(computeInputFingerprint)"]
    S1 --> S2{"existing evaluation's fingerprint<br/>matches? (code decides)"}
    S2 -->|yes| S3["skip — no model call, no writes (FR-001)"]
    S2 -->|no| S4{"insufficient input?<br/>(isInsufficientInput — code decides)"}
    S4 -->|yes| S5["synthetic insufficientInput result — no model call"]
    S4 -->|no| S6["score:&lt;record&gt; — hyppo-score (MID = sonnet)<br/>requirement table + hard-constraint gate + anti-patterns + applicationState"]
    S5 --> S7
    S6 --> S7["overallVerdict computed in code<br/>(computeOverallVerdict — hyppo-score proposes, never decides)"]
    S7 --> S8{"batch has persisted 2+ evaluations<br/>this run? (code decides)"}
    S8 -->|yes| S9["citation-audit:&lt;record&gt; — hyppo-judge (fast)<br/>every citation checked against the evidence text"]
    S8 -->|no| S10
    S9 --> S10["write-evaluation:&lt;record&gt; — hyppo-readwrite (fast)<br/>verbatim BEGIN-CONTENT/END-CONTENT write"]
    S10 --> S11["read-back shape check — hyppo-read (fast)<br/>retry the write once if malformed"]
    S11 --> S12["migrate-application-state:&lt;record&gt; — hyppo-readwrite (fast)"]
    S12 --> S13["append provenance"]
  end
  Score --> Summary["write-run-summary-fit-screen — hyppo-readwrite (fast)"]
  Summary --> End(["return ok, summary"])
```

## Model usage

Volume work cheap, judgment work strong — every model call declares a tier, and the
tier must match the work
([Principle II](../.specify/memory/constitution.md#ii-right-tier-model-usage)):

| Step | Model tier |
|---|---|
| Bulk extraction, normalization, dedup, company-name matching | fast (Haiku-class) |
| Scoring with cited evidence | mid |
| Tier-1 deliverables — CV tailoring, decision memos, outreach drafts | top (Opus-class, higher effort) |

## The data directory

HyppoGraph takes the data-directory path as local config (`HYPPO_DATA_DIR` or
equivalent). It is **not** part of this repo — personal data (candidate profile,
salary numbers, applications, connections) stays in a folder either app is merely
pointed at ([Principle V](../.specify/memory/constitution.md#v-local-files-are-the-only-state)).

```
<data-dir>/
├── provenance-log.md         # every addition anywhere below — what/how/why, append-only
├── inputs/                   # everything HyppoGraph reads to decide
│   ├── candidate-profile.md
│   ├── directions/           # one prepared-CV file per direction + shared CV materials
│   ├── priorities.md         # priorities, benchmarks incl. salary, settings, scoring-weight prose
│   ├── boards.md              # tracked job-board list + collection depth
│   ├── connections/          # merged LinkedIn export + personal contacts, with attributes
│   └── applications.md       # applications tracker — dedup + channel-exclusivity source
└── outputs/                  # everything HyppoGraph produces, rendered by HyppoVisor's dashboard
    ├── job-records/          # normalized, scored, tiered Job Records
    ├── queue.md              # the ranked review queue
    ├── deliverables/         # tailored CVs + diff notes, outreach drafts
    └── outcomes.md           # the feedback-loop log
```

## Spec-driven development

This repo uses [Spec Kit](https://github.com/github/spec-kit). Design intent lives in
[`.specify/memory/constitution.md`](../.specify/memory/constitution.md); every feature
is specced under [`specs/`](../specs/) via the `/speckit-*` skills before
implementation. See [Contributing](./contributing.md) for the workflow.

## Status

Every live stage-group is a **Phase A prototype**: validation is manual (quickstart
scenarios by hand), run as a Claude Code dynamic workflow. Porting to the Claude
Agent SDK, automated `vitest` + CI coverage, hard idempotency guarantees, and
statistical success-criteria measurement are Phase B, gated on each feature's Phase A
exit review. See each spec's `tasks.md` for the exact gate.
