# Contributing

## Spec-driven development

This repo is spec-driven via [Spec Kit](https://github.com/github/spec-kit). Every
feature starts as a spec under [`specs/`](../specs/) through the `/speckit-*` skills
before any implementation:

`speckit-specify → speckit-clarify → speckit-plan → speckit-tasks → speckit-implement`

(`speckit-checklist` and `speckit-analyze` are available at any point for a custom
checklist or a cross-artifact consistency pass.) Each feature directory ends up with
`spec.md`, `plan.md`, `tasks.md`, plus supporting `research.md`, `data-model.md`,
`contracts/`, and `quickstart.md` as needed. Browse `specs/*/spec.md` for the current
and past feature list.

Design intent that outlives any one feature lives in
[`.specify/memory/constitution.md`](../.specify/memory/constitution.md) — read it
before proposing a design change. `speckit-constitution` updates it.

## Branching and PRs

- One branch per spec, named for the spec directory (e.g.
  `001-intake-normalize-pipeline`). The branch is long-lived for the spec's duration.
- Land on `main` through a pull request — never a direct push to `main`. `main` is
  the integration branch and stays releasable.
- Open a PR at each phase or milestone boundary rather than accumulating one giant
  PR.
- Cross-cutting or tooling changes ride the branch of the spec they serve.

## Constitution Check

Every `plan.md` includes a Constitution Check. A plan that violates a principle must
either be revised or record an explicit, justified entry in its Complexity Tracking
section before work proceeds. Code review verifies, per PR:

- Control flow is code-driven, not agent-decided (Principle I).
- Every model call names a justified tier (Principle II).
- Scored outputs carry cited evidence (Principle III).
- No outward-facing action is automated (Principle IV).
- State changes stay in the data directory with a provenance-log entry (Principle V).

Unjustified complexity is rejected by default — prefer the simplest step that meets
the spec.

## Prototyping with Claude Code workflows

Pipeline steps are prototyped as
[Claude Code dynamic workflows](https://code.claude.com/docs/en/workflows) under
`.claude/workflows/` — cheap to iterate in a session — and ported to the Claude Agent
SDK once proven (see [Solution design → Status](./solution-design.md#status)). This
is a build-time tool for the developer's own machine; it does not relax
Principle I, which governs HyppoGraph's runtime. If you're authoring or editing a
workflow script, load the `workflow-authoring` skill first — dynamic workflows have
their own runtime contract (no `import` from outside the script body, sandboxed
execution) that the tests in `tests/fidelity/` and `tests/harness/` depend on.

## Testing your change

See [Testing approach](./testing.md) for the full tier breakdown. At minimum before
opening a PR:

```bash
npm test              # pure-code unit tests, $0
npm run harness        # isolated test harness, $0 (needs a Claude Code session for model-backed cases)
```

`npm run test:fidelity` (cents per run, real model calls) is expected when you touch
a verbatim-write prompt in either live workflow. Large-scale audits, migrations, or
cross-checked research done while building HyppoGraph — as opposed to HyppoGraph's
own runtime — may also use Claude Code dynamic workflows as a build-time tool.

## Personal data

Never commit anything that belongs under `HYPPO_DATA_DIR` — candidate profile,
salary numbers, applications, connections. Test fixtures under `tests/fixtures/` are
synthetic only; see [`tests/fixtures/README.md`](../tests/fixtures/README.md).
