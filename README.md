# HyppoGraph

<img src="assets/hyppograph.png" alt="HyppoGraph" width="200" align="right">

**The orchestrator that turns a stream of job descriptions into a ranked,
decision-ready shortlist.**

HyppoGraph is a deterministic workflow: plain code drives a fixed pipeline —
intake, normalize, hard-filter, score with evidence, warm-path enrichment, tier,
generate deliverables, feedback loop — and a model is called only *inside* the
steps that need judgment. No free-roaming agent decides what to do next.

<br clear="right" />

Every good match arrives with a fit score, a gap analysis, logistics fit
(salary / location / arrangement), warm-path options from your merged connections
store, a tailored CV, and a concrete next-action list — so your own time goes only
to the last mile: applying, connecting, deciding. Nothing is ever submitted or sent
automatically.

## Docs

Each doc below is one concern. Start with **why**, then read the others as you need
them.

| Doc | Covers |
|---|---|
| [Why](docs/why.md) | The problem, why a fixed pipeline instead of a free-roaming agent, the constitutional principles behind every design decision |
| [Solution design](docs/solution-design.md) | Where HyppoGraph sits relative to HyppoVisor and the data directory, the pipeline stages, model-tier policy, the data directory layout |
| [Pipeline detail](docs/pipeline.md) | Step-by-step input/output for each live workflow (intake-normalize, fit-screen) |
| [Testing approach](docs/testing.md) | The three test tiers (unit, isolated harness, write-fidelity), the eval harness and spend ledger |
| [How to use](docs/usage.md) | Set up HyppoVisor, point at a data directory, run the workflows, check the results |
| [Contributing](docs/contributing.md) | Spec-driven workflow, branching/PR conventions, the Constitution Check, testing your change |

Design intent that outlives any one feature: [`.specify/memory/constitution.md`](.specify/memory/constitution.md).
Features are specced under [`specs/`](specs/).

## Quick start

```bash
npm test          # pure-code unit tests — $0
npm run harness    # isolated test harness — $0, needs a Claude Code session for model-backed cases
```

Running the pipeline itself needs a Claude Code session and a
[HyppoVisor](https://github.com/juliaviluhina/hyppovisor) instance — see
[How to use](docs/usage.md).

## License

[Apache-2.0](LICENSE) — free for any use including commercial; keep `LICENSE` and
`NOTICE` with any copy. The MCP contract with HyppoVisor is open to implement
against.
