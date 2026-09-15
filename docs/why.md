# What it is, and why

## The problem

A real job search generates a lot of unstructured reading: dozens of postings a
week, each needing a keep/reject call, a comparison against your own priorities and
hard constraints, and — for the ones worth pursuing — a tailored pitch. Doing that
well by hand doesn't scale past a handful of roles; doing it by handing the whole
thing to a free-roaming agent trades one problem (too much reading) for another (an
unreviewable black box making judgment calls you can't inspect or trust).

## What HyppoGraph is

HyppoGraph is a deterministic pipeline — intake, normalize, hard-filter, score with
evidence, warm-path enrichment, tier, generate deliverables, feedback loop — that
turns a stream of job postings into a ranked, decision-ready shortlist. Every match
that reaches you carries its reasoning: a fit score, a gap analysis, logistics fit,
warm-path options from your own connections, and a concrete next action. Nothing is
ever submitted or sent on your behalf — see [Principle IV](../.specify/memory/constitution.md#iv-the-human-owns-the-last-mile).

## Why a fixed workflow, not an autonomous agent

Plain code owns the control flow. A model is invoked only *inside* a step, to do the
one cognitive task that step needs — reading a posting, judging a connection's
usefulness, drafting prose — never to decide what happens next. This is the project's
first constitutional principle
([full rationale](../.specify/memory/constitution.md#i-deterministic-code-driven-orchestration)),
and it's a deliberate trade: a fixed pipeline is less flexible than an agent that can
improvise, but every run is reproducible, every step is independently testable, and
every output can be traced back to the evidence and the code path that produced it.
For a job search — where a wrong or fabricated claim on your behalf has real
consequences — inspectability beats flexibility.

The same reasoning sets the other three principles that shape every design decision
in this repo:

- **Right-tier model usage** — fast models for volume work, a mid tier for cited
  scoring, top tier only for the deliverables you'll actually send.
- **Evidence-backed output** — a score or claim with no citation is treated as a
  defect, not a rounding error.
- **Local files are the only state** — your data directory is the single source of
  truth; nothing about your search lives in this repo, a database, or a hosted
  service.

Full principles and rationale: [`.specify/memory/constitution.md`](../.specify/memory/constitution.md).

## Where it sits

See [Solution design](./solution-design.md) for how HyppoGraph, HyppoVisor, and your
data directory divide responsibility.
