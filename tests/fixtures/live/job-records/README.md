# Live fixture — `verify` phase ATS smoke check (T006)

`figma--account-executive-enterprise--berlin.md` is a real, currently-open Greenhouse posting
(Figma, `boards.greenhouse.io/figma/jobs/5783812004`), confirmed live as of 2026-09-13 via
`https://boards-api.greenhouse.io/v1/boards/figma/jobs/5783812004`. It exists to exercise
`fit-screen.js`'s `verify` phase against a real ATS posting-API endpoint end-to-end (quickstart
scenarios 5-6) — NOT for `score`-phase testing (its front matter is intentionally sparse/unknown).

**This fixture rots.** Greenhouse postings close over time; the job above may no longer be live by
the time you read this. If a `verify` run against it reports `confirmed-closed` instead of
`confirmed-open`, that is expected staleness, not a bug — refresh this fixture with a currently-open
Greenhouse/Lever/Ashby posting (any public company's board) before relying on it for a
confirmed-open assertion. Re-verify liveness first:

```
curl -s https://boards-api.greenhouse.io/v1/boards/<org>/jobs/<id> | head -c 500
```

To exercise the `confirmed-closed` and `unresolvable` branches deterministically (not subject to
rot), use the synthetic fixtures instead:
- `tests/fixtures/data-dir/outputs/job-records/` records all use non-ATS `sourceRef`s (they resolve
  to `unresolvable` with no network call — see `buildAtsApiUrl()` in `fit-screen.js`).
- A syntactically-valid but nonexistent Greenhouse org/job-id combination reliably 404s
  (`confirmed-closed`) without depending on a real posting's lifecycle.
