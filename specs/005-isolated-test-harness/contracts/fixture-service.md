# Contract: Fixture Service

Loopback-only ATS posting-API stand-in (`tests/harness/service.mjs`). The only network endpoint
any harness case may contact.

## Origin

`http://127.0.0.1:<PORT>` — fixed port, default `8471` (overridable via `HYPPO_HARNESS_PORT`;
see `tests/harness/support/ports.mjs`). If the port is taken, the
service exits non-zero naming the port and the likely stale process. It MUST NOT auto-pick a free
port (a moved port silently invalidates every URL-shape assertion downstream).

## Endpoints (ATS-shaped paths)

| Method | Path | Scenario source |
|---|---|---|
| GET | `/v1/boards/<board>/jobs/<id>` | Greenhouse-shaped (mirrors `boards-api.greenhouse.io` path) |
| GET | `/v0/postings/<org>/<pid>` | Lever-shaped (mirrors `api.lever.co` path) |
| GET | `/posting-api/job-board/<org>/<pid>` | Ashby-shaped (mirrors `api.ashbyhq.com` path) |
| GET | `/__admin/scenario` | Read current scenario map (harness use) |
| POST | `/__admin/scenario` | Set `{"postingKey": "live"\|"closed"\|"malformed"\|"error"\|"flapping"}` — incl. mid-run flips |
| GET | `/__admin/access-log` | Full access log for the FR-005 assertion |

## Scenario responses

- `live` → 200 + JSON posting body in the ATS shape the path implies.
- `closed` → 404, or 200 with an explicit closed marker (both must map to `not_found` downstream).
- `malformed` → 200 with a body outside the expected ATS shape (→ `unparseable`).
- `error` → 500 (→ `http_error`).
- `flapping` → serves `live` until POSTed to `closed`; the flip command is logged with a timestamp.

## Rules

- The service serves canned bytes only; it never fetches, proxies, or contacts any upstream.
- Every non-admin request appends to the access log: timestamp, method, path, scenario served.
- Stopping the service mid-cycle must make dependent cases fail fast with "fixture service
  unreachable" — never fall back to any other host.
