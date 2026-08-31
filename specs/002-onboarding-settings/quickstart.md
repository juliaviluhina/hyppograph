# Quickstart & Validation: Onboarding & Settings Stage

How to run the onboarding stage and confirm it works end-to-end. Design detail lives in
[plan.md](./plan.md), [data-model.md](./data-model.md), and [contracts/](./contracts) —
[`settings-store.md`](./contracts/settings-store.md) (output shape) and
[`onboarding.md`](./contracts/onboarding.md) (section/question catalog).

Two substrates (plan.md § Phasing). The **Phase A** section is the interactive Claude Code command;
everything from *Prerequisites* onward is the **Phase B** TypeScript CLI. The validation scenarios
apply to both — run them by hand in Phase A, automated in `vitest` in Phase B.

## Phase A — run the interactive command

1. Point `HYPPO_DATA_DIR` at `tests/fixtures/data-dir/` (or a scratch dir) — start from one with **no**
   `inputs/settings.json` for a first-run walkthrough.
2. In a Claude Code session, invoke the `onboard` skill (`/onboard`).
3. Answer each section: accept the shown default with Enter, or type a replacement. Skip an optional
   section when offered.
4. When the walkthrough ends, check `inputs/settings.json` and the tail of `provenance-log.md` against
   the scenarios below.
5. Run `/onboard` again and choose **leave as is** — confirm nothing is written.

## Prerequisites (Phase B)

- Node.js ≥ 20, npm
- A data directory following the README's `inputs/` layout — for validation use
  `tests/fixtures/data-dir/`
- **No** Anthropic credentials required for the core flow. Credentials are needed only to exercise the
  optional model-backed hand-authored-file parser (`prefill.ts` → `judge()`); without them the
  heuristic parser is used.
- No HyppoVisor endpoint — onboarding does not use one.

## Setup

```bash
npm install
cp .env.example .env    # set HYPPO_DATA_DIR
```

| Var | Default | Purpose |
|---|---|---|
| `HYPPO_DATA_DIR` | — (required) | Root of the inputs/outputs tree; onboarding writes `inputs/settings.json` here |
| `HYPPO_PACING_MS` / `HYPPO_FETCH_CAP` / `HYPPO_DEFAULT_DEPTH` | `3000` / `300` / `25` | Only used as the **default proposals** for the `collectionTuning` section |

## Run

```bash
npm run onboard              # first-run walkthrough, or reconfigure if a store exists
npm run onboard -- --check   # print completeness only; exit 0 if setup ready, 1 if not; writes nothing
```

Exit code is non-zero only on a fatal error (data dir unwritable) or, for `--check`, when setup is
incomplete. A rejected answer is re-asked, not a crash.

## Validation scenarios

Numbers map to the spec's user stories and success criteria.

### 1. First-run, accept every default  (US1, SC-001, SC-002, SC-011)

- Start: `HYPPO_DATA_DIR` with no `settings.json`.
- Run onboarding; accept every default; supply the one unavoidable input — at least one `directions`
  entry and at least one `trackedBoards` entry (required lists have no blank default).
- Expect: `inputs/settings.json` exists and validates against `settings-store.md`; every **required**
  section `status: "answered"`; optional sections either `answered` or `skipped`;
  `completeness.setupReady === true`, `completeness.unresolved === []`; one `provenance-log.md` line
  per section written; a "setup ready" message shown. Wall-clock under 5 minutes (SC-001).

### 2. Invalid answer is rejected before storage  (US1 scenario 3, SC-008)

- During the run, give `compensation.floor` a non-numeric value, and add a `trackedBoards` entry with
  an empty `filteredSearch`.
- Expect: each is rejected with a message naming the field; the question is re-asked; a subsequent
  read of `settings.json` shows neither bad value was written.

### 3. Skip an optional section  (US1 scenario 5, SC-011)

- Choose to skip `scoringWeightNotes`.
- Expect: `sections.scoringWeightNotes.status === "skipped"`; it does not appear in
  `completeness.unresolved`; `setupReady` still `true` once the required four are answered.

### 4. Resume an interrupted first run  (US1 scenario 4, FR-011)

- Start a first run, answer `locations`, then exit before finishing.
- Re-run onboarding.
- Expect: it resumes at the first still-`unset` section in catalog order; `locations` (and anything
  else already answered) is unchanged and not re-asked.

### 5. Reconfigure one section, others byte-identical  (US2, SC-003, SC-004)

- Start from a complete store. Capture its bytes.
- Run onboarding, choose **change a section**, pick `locations`, add one excluded location, save.
- Expect: `sections.locations` reflects the change; **every other section is byte-identical** to the
  captured copy; exactly one new `provenance-log.md` line (`settings/locations  changed (reconfigure)…`).

### 6. Leave as is — zero writes  (US2 scenario 3, FR-009, SC-007)

- From a complete store, run onboarding and choose **leave as is** (also: run it twice back-to-back
  with no changes).
- Expect: `settings.json` mtime and bytes unchanged; **no** new `provenance-log.md` lines.

### 7. Refuse to empty a required list  (US2 scenario 4, FR-017)

- Reconfigure `trackedBoards` and delete every entry, then try to save.
- Expect: the save is refused with a stated reason; the section stays in edit; the stored value is
  untouched.

### 8. Pre-fill from hand-authored files  (US3, SC-005, FR-013)

- Place `inputs/boards.md` with a bullet list of board searches (one deliberately malformed) and
  `inputs/hard-stops.md` with excluded locations + lacked clearances, in an otherwise-empty data dir.
- Run onboarding.
- Expect: the `trackedBoards` and `hardStops`/`locations.excluded` sections are proposed **pre-filled**
  from those files; the malformed board line is listed as **"couldn't read — please re-enter"**, not
  dropped and not guessed; ≥ 90% of the individually-valid entries appear as proposals.

### 9. Store vs file disagreement  (US3, FR-014, R7)

- With a complete store, add `inputs/boards.md` whose list differs from `sections.trackedBoards`.
- Run onboarding to the boards section.
- Expect: a side-by-side diff (store vs file) and a **keep-store / take-file / edit** prompt; no silent
  merge; whichever the user picks is what gets saved (with a provenance line only if it changed).

### 10. Corrupt store  (US edge case, FR-019, R8)

- Truncate `inputs/settings.json` to invalid JSON. Run onboarding.
- Expect: it reports the problem, offers to back up to `inputs/settings.json.bak-<timestamp>` and start
  fresh, and does **not** overwrite `settings.json` until confirmed; the backup gets a provenance line.

### 11. Completeness query matches, and downstream agrees  (US4, SC-006, SC-010)

- Leave one required section `unset`. Run `npm run onboard -- --check`.
- Expect: output names that exact section, reports "setup incomplete", exit code 1; a feature-001 run
  against the same store reports the same unresolved section and exits without collecting (001 FR-000).
- Then complete that section and re-check: "setup ready", exit 0; feature 001 now runs to completion
  using only the stored settings, asking the user nothing further (SC-010).

### 12. No outward actions  (US, SC-009, FR-021)

- Run any of the above with network access blocked.
- Expect: every scenario still passes; nothing attempts a connection, a message, or a page fetch.

## Phase B test mapping

| Scenario | `vitest` location |
|---|---|
| 1, 3, 4 | `tests/integration/first-run.test.ts` |
| 2, 7 | `tests/unit/validators.test.ts` + `tests/integration/reject.test.ts` |
| 5, 6 | `tests/integration/reconfigure.test.ts` (byte-identical + zero-write assertions) |
| 8, 9 | `tests/unit/prefill.test.ts`, `tests/unit/diff.test.ts` |
| 10 | `tests/unit/corrupt-store.test.ts` |
| 11 | `tests/unit/completeness.test.ts` + a cross-feature integration check |
| 12 | `tests/unit/no-network.test.ts` (asserts no network client is constructed) |
