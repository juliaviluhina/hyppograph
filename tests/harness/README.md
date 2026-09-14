# Isolated Test Harness (005)

Zero-live-dependency tests for feature 004's verify-then-score flow
(`.claude/workflows/fit-screen.js`). Stdlib only — no new dependencies.

## What runs fully automatically

```bash
npm run harness            # full node suite, exit 0 iff green (see below)
npm run harness -- --case=verify-signal   # single case (debug)
npm test                   # unaffected (004-era eval scaffold)
```

57 cases, all green (006 closed the sole `idempotency-unchanged-rerun` red — see
`specs/006-fit-screen-gap-fixes/`). A session `--assert` run additionally reports the three
ATS-backed matrix cases as `blocked` unless run with `--wire live`
(`contracts/harness-report-amendment.md` — transport gap, not a failure).
Covered: fixture-service behavior, URL construction + override seam, signal/mark/verdict
logic (mirrored + sync-checked against the workflow), fixture honesty, config gate,
citation resolution, structural pins for every 004 run-5/6/7 fix, agent grants, wiring,
the idempotency fingerprint guard, and the full assertion layer against synthetic session
shapes.

## Layout

| Path | Role |
|---|---|
| `service.mjs` + `scenarios.json` | Loopback ATS stand-in (Greenhouse/Lever/Ashby paths, live/closed/malformed/error/flapping) |
| `run.mjs` | Runner: `test` (managed service + TAP report) · `--serve` · `--prep` · `--assert` |
| `worker-cases/*.test.mjs` | Per-worker contracts (node halves; model halves are session steps, see below) |
| `regression-cases/*.test.mjs` | Full-flow matrix, flip shape, stopped-service, wiring, gate, honesty, idempotency red, fault sweep |
| `support/` | ports, scratch, isolation, pure-mirror, expectations, fetch, structure-pins, audit, gate, assert |
| `last-report.md` | Run output (gitignored, regenerated every run) |

Committed fixtures under `tests/fixtures/` are **immutable inputs** — every run copies
them to a temp scratch dir. If `git status` shows fixture modifications after a run,
something is wrong.

## Session-backed runs (model workers need a Claude Code session)

The workflow itself only executes in-session. Rails:

```bash
node tests/harness/run.mjs --prep        # prints dataDir + atsApiBaseOverrides + service cmd
node tests/harness/service.mjs --port 8471 --scenarios tests/harness/scenarios.json --access-log <scratch>/access.jsonl
# ... run fit-screen.js in-session with the printed args (single pass) ...
node tests/harness/run.mjs --assert --dir <scratch> --access-log <scratch>/access.jsonl [--service-origin http://127.0.0.1:8471]
```

`--service-origin` falls back to the live access log when the JSONL file is missing.
Flip test: POST `/__admin/scenario` between two runs, assert with flipped expectations
(see `regression-cases/flapping.test.mjs` for the shape).

## Known transport constraint (research.md R8 — read before debugging verify)

`hyppo-verify` (WebFetch-only) **cannot reach the plain-HTTP fixture service**:
WebFetch upgrades `http://` → `https://` unconditionally (proven 2026-09-14; the agent
echoed the exact URL, the tool rewrote the scheme). Session runs will show ATS records
as `unresolvable` — documented expectation, not a regression. The worker's wire behavior
is proven separately against a real `https://` ATS endpoint via `tests/fixtures/live/`.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `port 8471 is already in use` | A previous service is still up — stop it; the harness never steals ports |
| `fixture service unreachable` | Start it (`--serve`); tests never fall back to live hosts |
| `scored N != M evaluation files` | Stale `last-run-summary` (see 006 F2) or a real scoring gap — inspect the scratch |
| Standalone `node --test` fails on service cases | Expected without a running service; use `npm run harness` (managed) or `--serve` |
| `idempotency-unchanged-rerun` red | By design until 006 — do not "fix" the test |

Design docs: `specs/005-isolated-test-harness/` (spec, plan, research, contracts,
quickstart, tasks). Fixes queue: `specs/006-fit-screen-gap-fixes/intake.md`.
