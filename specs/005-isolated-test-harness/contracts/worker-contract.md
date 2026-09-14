# Contract: Worker-Contract Cases

One isolated case per bounded worker. Each case invokes the worker exactly as production does
(same agent type, same tool grant, same schema) with fixture input in the prompt, then asserts in
code. Cases are independent: any one can run and fail without any other running.

## Case format

```text
worker:        <agent type / reader name>
fixtureInput:  <what goes in the prompt — fixture URL, file text, evidence paths, tracker rows>
schemaRule:    <004 contracts/schemas.md schema the output must validate against>
roleRule:      <one-line boundary predicate, evaluated in code>
```

## The six cases (minimum)

| Worker | Fixture input | Role rule |
|---|---|---|
| `hyppo-verify` | 4 fixture URLs: live / closed / error / malformed (+ non-ATS sourceRef that must never reach the worker) | Returns raw signal only (`found`/`not_found`/`http_error`/`unparseable`); never a `confirmed-*` disposition; non-ATS input is rejected before any call |
| `hyppo-score` | One gap-fixture Job Record + evidence base | Every non-`Unknown` row cites an existing file+section; output contains no overall-verdict field |
| settings-reader | Settings text with tricky paths (relative, nested, absolute-looking) | Every `evidenceBase.files` entry echoed byte-for-byte (runs 1/4/6) |
| evidence-reader | Two evidence files | One call per file; each result echoes its own path with its own content (run 5) |
| applications-reader | Present tracker / missing tracker / empty tracker | Distinguishes "file missing" from "present with no match" (R3 → `unknown` vs `not_applied`) |
| `citation_audit` | Batch with one planted bad citation | Rejects the bad citation AND records the rejection as advisory — persistence proceeds (run 7) |

## Rules

- A schema violation or role-rule violation fails the case before any downstream worker runs.
- Worker prompts point at loopback/file fixtures only; any non-loopback URL in a prompt fails the
  case immediately (supports the FR-005 isolation proof).
