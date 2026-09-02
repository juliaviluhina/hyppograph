# HyppoGraph Constitution

## Core Principles

### I. Deterministic, Code-Driven Orchestration

Plain code owns all control flow. The pipeline is a fixed, ordered sequence of steps
— intake, normalize, hard-filter, score with evidence, warm-path enrichment, tier,
generate deliverables, feedback loop — and the code alone decides what runs next,
branches, retries, or stops. A model MUST be invoked only *inside* a step, to perform
the cognitive piece of that step (understanding a job description, judging a
connection's usefulness, drafting prose). No model call may decide the next step, and
no free-roaming or self-directing agent loop is permitted anywhere in the workflow.

Rationale: determinism is what makes runs reproducible, debuggable, and auditable. The
moment an agent chooses its own path, the pipeline stops being inspectable and the
output stops being trustworthy for a real job search.

### II. Right-Tier Model Usage

Every model call MUST declare its tier, and the tier MUST match the work: fast
(Haiku-class) for volume work — bulk extraction, normalization, dedup, company-name
matching; mid for scoring with cited evidence; top (Opus-class, higher effort) for
Tier-1 deliverables — CV tailoring, decision memos, outreach drafts. Escalating a step
to a stronger tier or downgrading it is a deliberate, reviewed change, not an ad-hoc
default.

Rationale: cost and latency scale with volume; judgment quality scales with tier.
Spending a top-tier call on dedup wastes budget; spending a fast call on a decision
memo produces output the user cannot rely on.

### III. Evidence-Backed, Decision-Ready Output

Every scored match MUST carry, at minimum: a fit score, a gap analysis, logistics fit
(salary / location / arrangement), warm-path options drawn from the connections store,
and a concrete next-action list. Tier-1 matches additionally carry a tailored CV with
diff notes. Scores and claims MUST cite the specific input evidence they rest on. An
output that cannot show its evidence is a defect.

Rationale: the product's value is saving the user's judgment time, not their reading
time. A ranked list with no reasoning just moves the analysis burden, it does not
remove it.

### IV. The Human Owns the Last Mile

HyppoGraph MUST NOT submit an application, send a message, make a connection request,
or take any other outward-facing action automatically. It produces drafts, shortlists,
and next-action lists; applying, connecting, and deciding are always explicit human
acts. Any feature that would send or post on the user's behalf is out of scope.

Rationale: the user's name and relationships are on every outbound action. Automation
that speaks as the user, without the user, is a category of risk this project does not
take on.

### V. Local Files Are the Only State

The shared data directory — plain Markdown and CSV under `inputs/` and `outputs/` — is
the single source of persistent state. No database, no hosted services, no hidden
caches that outlive a run. Every addition anywhere in the data directory MUST be
recorded in the append-only `provenance-log.md` with what, how, and why. Personal data
(candidate profile, salary numbers, applications, connections) stays in the
user-pointed folder and MUST NOT be copied into this repo, logs, or telemetry.

Rationale: a job search is sensitive personal data. Keeping state as inspectable files
in a folder the user controls means they can read, edit, back up, and delete
everything, and there is no second copy to leak.

## Architectural Boundaries

HyppoGraph is all business logic and judgment; it has no UI and no direct access to
any logged-in browser session. Anything requiring a human-authenticated browser or a
human's screen belongs to HyppoVisor, which HyppoGraph consumes as an MCP client for
every page read and navigation.

- HyppoGraph MUST NOT embed a UI or drive an authenticated session directly.
- All page reads / navigation go through the HyppoVisor MCP contract. That contract is
  public and MUST remain implementable by a third party; HyppoGraph MUST NOT depend on
  HyppoVisor internals beyond the documented MCP surface.
- HyppoGraph and HyppoVisor communicate state only through the shared data directory;
  no other coupling (shared processes, private IPC, shared in-memory state) is allowed.
- The stack is TypeScript on the Claude Agent SDK. Adding a runtime service or a
  persistent datastore is a constitutional change, not an implementation detail.

## Development Workflow

- This repo is spec-driven via [Spec Kit](https://github.com/github/spec-kit). Every
  feature starts as a spec under `specs/` through the `/speckit-*` skills before
  implementation.
- Work happens on a branch per spec, named for the spec directory (e.g.
  `001-intake-normalize-pipeline`), and lands on `main` through a pull request — never
  a direct push to `main`. `main` is the integration branch and stays releasable. The
  branch is long-lived for the spec's duration; open a PR at each phase or milestone
  boundary rather than accumulating one giant PR. Cross-cutting or tooling changes
  ride the branch of the spec they serve.
- Implementation tooling: large codebase audits, multi-file migrations, and
  cross-checked research done *while building HyppoGraph* are run as Claude Code
  dynamic workflows — https://code.claude.com/docs/en/workflows. This is a build-time
  tool for the developer's own machine; it does not relax Principle I, which governs
  HyppoGraph's runtime.
- Each plan MUST include a Constitution Check; a plan that violates a principle MUST
  either be revised or record an explicit, justified entry in its Complexity Tracking
  before work proceeds.
- Code review MUST verify: control flow is code-driven (I), every model call names a
  justified tier (II), scored outputs carry evidence (III), no outward-facing action
  is automated (IV), and state changes stay in the data directory with provenance (V).
- Unjustified complexity is rejected by default. Prefer the simplest step that meets
  the spec.

## Governance

This constitution supersedes other practices where they conflict. It applies to all
code, specs, plans, and reviews in this repo. Changing a principle requires a PR that
states the rationale; every PR is reviewed against the Core Principles, and violations
are resolved before merge rather than deferred.
