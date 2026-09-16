# Issue: Workflow tool runtime crashes on a failed agent() result instead of surfacing it

**Status:** Observed once in a real run; reported upstream via Claude Code feedback, not yet reproduced in isolation.

**Scope:** Claude Code's `Workflow` tool runtime itself (`workflow.js`), not `.claude/workflows/intake-normalize.js` or any HyppoGraph domain code.

## Problem

During a real `intake-normalize` run (feature 001, first live-data validation, 2026-09-15), one
`agent()` call failed because the session hit its Claude Code usage limit:

```
[write-job-record:mercor--ml-engineer--remote-us] failed: You've hit your session limit · resets 2:20pm (America/New_York)
```

That failure is exactly the kind FR-006 (per-source failure isolation) expects the workflow
script to catch and continue past. Instead, the runtime's own post-processing of the failed
result threw before the script ever got a chance to handle it:

```
TypeError: null is not an object (evaluating 'result.created')
    at <anonymous> (workflow.js:757:17)
```

This killed the entire run with `status: "failed"` rather than delivering a normal `failed`
result for that one `agent()` call. The apparent cause: the runtime accesses a field
(`result.created`) on what is `null` for a failed agent call, without checking for failure
first.

## Impact

- A single transient agent failure (rate limit, usage limit, timeout) can abort an otherwise
  healthy long-running workflow instead of being isolated to one step.
- Recovery is still possible via `Workflow({ resumeFromRunId })` — already-completed agents
  replay from cache and the run can finish — but this requires the operator to notice the
  crash and manually resume, rather than the workflow's own FR-006-style handling taking over.

## Evidence

- Run ID: `wf_c101bf38-94d`, task ID: `wg1o2n8hz` (Claude Code session, 2026-09-15).
- 107/108 agents completed before the crash; only the last (`write-job-record:mercor...`)
  errored.
- Resuming the same run ID after the usage limit reset completed cleanly with 0 further
  errors (task ID `wm0svhyyi`).

## Recommended action

No HyppoGraph-side fix — this is host runtime behavior. Tracked here only so the workaround
(resume via `resumeFromRunId` after a crash reporting a `failed` agent) is documented for
future real runs, and so this isn't mistaken for a bug in feature 001's own failure-isolation
logic (FR-006) if it recurs.
