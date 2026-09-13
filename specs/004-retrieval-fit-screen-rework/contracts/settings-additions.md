# Contract: `inputs/settings.json` additions

This feature **extends** feature 001's `inputs/settings.json` (schema base:
`specs/002-onboarding-settings/contracts/settings-store.md`, currently deferred but still the
file's owning shape) with three new top-level sections. It does not replace or restructure any
existing section, and does not depend on feature 002's onboarding UX.

All three follow the same `{ status, value }` shape feature 001/002 already use.

---

## `sections.evidenceBase`

```json
{
  "status": "answered",
  "value": {
    "files": ["evidence/career-history.md", "evidence/cv-content.md"]
  }
}
```

| Field | Rule |
|---|---|
| `files` | Non-empty string array. Paths relative to `HYPPO_DATA_DIR`. Each MUST resolve to a readable file with non-empty content — otherwise `config.evidence-unavailable` (FR-000, spec Edge Cases). |

## `sections.hardConstraints`

```json
{
  "status": "answered",
  "value": {
    "compFloor": { "amount": 90000, "currency": "EUR" },
    "excludedRoleNatures": ["on-call rotation", "people management"]
  }
}
```

| Field | Rule |
|---|---|
| `compFloor` | `{ amount: number > 0, currency: ISO 4217 string }` or `null` (no floor configured — not a config error). |
| `excludedRoleNatures` | String array, may be empty. Free-text, matched by the mid-tier scoring judgment against posting responsibilities text. |

Location, clearance, and work-authorization hard constraints are **read from feature 001's existing
`sections.hardStops.value`** (`excludedLocations`, `lackedClearances`, `lackedWorkAuth`,
`visaSponsorshipRequired`) — not duplicated here (research.md R1).

## `sections.targetRoles`

```json
{
  "status": "answered",
  "value": {
    "streams": [
      { "name": "AI Engineering", "seniorityCeiling": "staff", "description": "Applied AI / LLM engineering roles." },
      { "name": "Test Automation", "seniorityCeiling": "principal", "description": "Senior SDET / test automation architect roles." }
    ],
    "recencyWindowYears": 4
  }
}
```

| Field | Rule |
|---|---|
| `streams` | Non-empty array of `{ name (unique), seniorityCeiling (string), description }`. Empty ⇒ `config.evidence-unavailable`-class error naming the missing field (FR-000). |
| `recencyWindowYears` | Positive integer. Required — no default is invented (research.md R2). Missing ⇒ same class of config error. |

---

## Run-start validation (extends feature 001's FR-000 precondition)

At the start of a `fit-screen.js` run, in addition to feature 001's existing `settings.json`
precondition:

1. `evidenceBase.value.files` — every path resolves and is non-empty, or exit reporting
   `config.evidence-unavailable` with the specific missing/empty path(s).
2. `hardConstraints.value` — present; `compFloor` is either `null` or well-formed; `excludedRoleNatures`
   is an array (may be empty).
3. `targetRoles.value.streams` — non-empty, each entry complete; `recencyWindowYears` — a positive
   integer.

Any failure here makes **zero writes** (spec SC-012), same posture as feature 001's FR-000.
