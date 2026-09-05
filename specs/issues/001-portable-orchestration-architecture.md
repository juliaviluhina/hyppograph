# Issue: Portable, atomic orchestration architecture

**Status:** Initial architecture analysis

**Scope:** HyppoGraph, its relationship with HyppoVisor, and portability across Claude Code, Codex, Hermes, and future execution environments.

## Problem

HyppoGraph will become the business-logic orchestrator paired with HyppoVisor. The system should remain useful in small independent pieces while also supporting a complete workflow. Claude Code, Codex, and Hermes should be interchangeable execution environments, not architectural dependencies.

The goal is an atomic, testable, composable set of Lego bricks with explicit ownership, contracts, capabilities, and side effects.

## Recommended big picture

    Runtime adapters
      Claude Code | Claude Agent SDK | Codex | Hermes | deterministic mock
                              |
                    Portable workflow runner
              ordering, retries, budgets, checkpoints,
                    capabilities, approvals
                              |
                    HyppoGraph domain bricks
       intake -> triage -> normalize -> dedup -> score -> tier
                              |
              contracts, artifacts, provenance, evaluations
                              |
              HyppoVisor MCP + local artifact directory

The existing two-repository split is the right foundation:

- HyppoVisor owns authenticated browser capabilities and their safety boundary.
- HyppoGraph owns domain meaning and judgment.
- The portable runner owns workflow mechanics.
- Runtime adapters translate neutral tasks into Claude Code, Codex, Hermes, or mock execution.
- Artifact and storage adapters own persistence and rendering.

No runtime should own business workflow semantics, and HyppoVisor should not know about jobs, candidates, scores, or pipeline stages.

## Core design principles

### A runtime is an adapter, not the architecture

The current Claude Code dynamic workflow is a good prototype and iteration surface. It should not become the long-term source of truth for orchestration.

The source of truth should be ordinary portable HyppoGraph code: typed task functions plus a small workflow runner. Claude Code can remain the first adapter. Claude Agent SDK, Codex, Hermes, and a deterministic mock can implement the same adapter interface later.

Do not introduce a workflow DSL prematurely. A neutral TypeScript API is enough until multiple runtimes demonstrate that a declarative format is necessary.

### Separate control flow from model judgment

Code decides stage ordering, eligibility, concurrency, retries, budgets, checkpoints, approvals, and persistence. Models decide only bounded judgments assigned to them, such as triage or structured extraction. A model result must never decide which workflow stage runs next.

### Prefer structured results over agent-owned writes

A task should return a validated structured result. The orchestrator should then write through a central artifact store:

    task execution -> schema validation -> idempotency check
                   -> artifact write -> provenance event

This makes behavior consistent across runtimes, prevents malformed partial writes, and keeps provenance mandatory rather than prompt-dependent. Markdown should remain the human-facing format; JSON Schema or Zod should define machine-facing contracts.

### Use capabilities, not runtime identity

Tasks should declare capabilities instead of checking whether they run under Claude Code, Codex, or Hermes. Useful capabilities include:

- model.judgment
- model.structured-output
- browser.read
- browser.navigate
- browser.interact
- filesystem.read
- filesystem.write
- human.approval

The capability set must be least-privilege. Collection may require browser.read and browser.navigate while excluding browser.interact. Triage may require only model capabilities. A runtime adapter must reject tasks when it cannot satisfy their declared capabilities.

## Definition of a Lego brick

Every brick should document:

1. Input schema.
2. Output schema.
3. Required capabilities.
4. Side effects.
5. Idempotency key.
6. Retry policy.
7. Failure categories.
8. Fixture and expected-result tests.

Example:

    normalize-posting
      input: RawPosting@1
      output: NormalizedJobRecord@1
      capabilities: model.judgment, model.structured-output
      side effects: none
      idempotency key: normalize:<raw-record-id>:<schema-version>
      test: fixture posting -> expected structured record

A brick should be callable from a workflow, CLI, evaluation harness, or another application without requiring a full HyppoGraph run.

## Proposed layers

### Layer 1: Pure domain components

No network, filesystem, model, or runtime dependency. Examples include title/company normalization, stable identifiers, hard-stop evaluation, completeness, record merging, score/evidence calculations, summary rendering, and schema validation.

These should have the fastest and most exhaustive tests.

### Layer 2: Ports and adapters

Each external dependency sits behind a narrow interface: HyppoVisor MCP client, model gateway, Claude Code/SDK runtime adapter, Codex adapter, Hermes adapter, filesystem artifact store, provenance writer, and human approval interface.

Each adapter should have conformance tests against a fake implementation and, where useful, a small live smoke test.

### Layer 3: Workflow composition

Thin workflows combine domain components and ports:

    collect -> pre-triage -> normalize -> hard-filter -> score -> enrich -> tier

The workflow owns sequencing and policy, not hidden business logic inside prompts or runtime-specific agents.

## Neutral task envelope

Every externally executed unit should carry a task ID, run ID, task kind, input artifact references, output schema/version, required capabilities, model tier, cost ceiling, timeout, retry/approval policy, and idempotency key.

Conceptually:

    taskId: normalize:raw/acme-123.md
    kind: normalize-posting
    inputRefs: [outputs/job-records/raw/acme-123.md]
    outputSchema: NormalizedJobRecord@1
    capabilities: [model.judgment, model.structured-output]

A minimal future interface could be:

    interface RuntimeAdapter {
      capabilities(): CapabilitySet;
      execute(task: TaskEnvelope): Promise<TaskResult>;
    }

The exact interface should be designed when the second runtime adapter is implemented, but the separation should be preserved now.

## Contract boundaries

### HyppoVisor MCP contract

HyppoVisor exposes live browser capability only: open/navigate, read page content, inspect forms, prepare drafts under its safety rules, wait, and screenshot. HyppoGraph collectors should receive a narrow read/navigation grant; wildcard access should not be used because it can include state-changing interaction.

### Domain artifact contracts

Version stable schemas for PostingReference, RawPosting, TriageDecision, NormalizedJobRecord, ScoreEvidence, TierDecision, Deliverable, RunSummary, ProvenanceEvent, and TaskResult. Define additive versus breaking changes, migrations, and handling of unknown versions.

### Runtime contract

A runtime sees a task and returns a structured result or classified failure. It should not directly write the canonical data directory or choose subsequent workflow stages.

## Data and persistence strategy

The local data directory remains a good human-readable persistence boundary. Use it as an artifact store, not an implicit message bus:

- raw captures are immutable;
- derived records carry schema and source references;
- writes are atomic;
- provenance is emitted by the store or orchestrator;
- every task has an idempotency key;
- every run has a manifest and resumable checkpoints;
- partial results are explicit;
- credentials and hidden runtime state never enter artifacts.

A database is not needed initially. A filesystem store with atomic writes and a run manifest is sufficient. Add durable infrastructure only when measured requirements show the filesystem is no longer adequate.

## Testing strategy

The same logical workflow should be testable through:

1. Pure component tests.
2. Schema and contract tests.
3. Adapter conformance tests using fakes.
4. Replay tests from saved synthetic fixtures.
5. Full workflow tests with a deterministic mock runtime.
6. Runtime-specific integration tests.
7. Explicit live-smoke tests against a scratch directory.

The expected artifact tree should be identical across runtimes when model output is mocked or fixed. Runtime tests should verify translation and failure handling, not duplicate all domain assertions. The existing HyppoGraph eval harness is a strong basis; its mock substrate should become the reference integration substrate, while the Claude-specific workflow remains one tested adapter.

## Suggested evolution path

### Phase 1: Stabilize contracts

Freeze versioned domain schemas; keep the Claude Code workflow operational; separate pure helpers and prompts from workflow control flow; document capabilities and side effects; add task, run, and idempotency metadata.

### Phase 2: Centralize persistence

Make tasks return structured data; move canonical writes into a store module; centralize atomic writes and provenance; add checkpoint/resume; preserve the Markdown layout.

### Phase 3: Introduce the portable runner

Move stage ordering into a runtime-neutral runner; add a deterministic mock runtime; run the fixture pipeline through it; keep Claude Code as an adapter during migration.

### Phase 4: Port runtimes

Add Claude Agent SDK support where useful, then Codex and Hermes adapters behind the same task contract. Add capability negotiation and compare artifact trees across substrates.

### Phase 5: Optimize from evidence

Add parallelism only where it preserves browser pacing and determinism. Add a richer workflow representation or durable infrastructure only when demonstrated requirements justify them.

## Decision rules for new features

    Requires authenticated browser?      -> HyppoVisor
    Requires domain understanding?       -> HyppoGraph domain core
    Controls ordering/retries/budgets?   -> portable workflow runner
    Translates to a vendor environment?  -> runtime adapter
    Stores or renders artifacts?         -> artifact-store adapter
    Requires a human decision?           -> explicit approval boundary

If a feature spans categories, split it at the boundary instead of placing it in whichever repository is convenient.

## Non-goals

- Replacing HyppoVisor with a headless browser or browser extension.
- Making Claude Code, Codex, or Hermes understand the domain workflow.
- Introducing a general-purpose workflow DSL before need is demonstrated.
- Adding a database or service layer before filesystem limitations are measured.
- Allowing model output to submit, send, apply, or authenticate.
- Making Markdown parsing the only machine-readable contract.

## Acceptance criteria for future implementation

- A pure domain brick runs without Electron, MCP, a model, or network access.
- The complete fixture workflow runs with a deterministic mock runtime.
- The same task envelope is translatable by at least two runtime adapters.
- Runtime adapters cannot invoke capabilities absent from the task grant.
- Canonical writes are centralized, atomic, idempotent, and provenance-logged.
- A failed run resumes without duplicating artifacts or provenance events.
- HyppoGraph uses HyppoVisor through a narrow, explicit MCP allow-list.
- Workflow tests compare expected artifacts without a live AI provider.
- Adding a runtime does not require changing domain bricks.

## Recommended decision

Keep the current HyppoVisor/HyppoGraph split. Do not pursue an architectural rewrite.

Make portability an explicit HyppoGraph feature by introducing a small runtime-neutral task and workflow boundary, centralizing persistence, and using capabilities plus versioned artifact contracts.

Claude Code should remain the first runtime and rapid-prototyping surface, but not the owner of orchestration semantics. This preserves atomicity, testability, composability, and future portability without adding unnecessary infrastructure.
