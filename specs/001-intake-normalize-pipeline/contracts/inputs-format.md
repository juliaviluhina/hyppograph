# Contract: Input files read by this feature

All under `HYPPO_DATA_DIR`, hand-authored by the user, **read-only** here. Parsing is tolerant:
anything unparseable is reported (per source / per file) and the run continues.

---

## `inputs/boards.md` → `TrackedSource[]`

A Markdown bullet list. One bullet per tracked source. Recognised shapes:

```markdown
## Boards

- [Senior TS roles, EU remote](https://www.linkedin.com/jobs/search/?keywords=typescript&f_WT=2&...) — depth: 40
- name: Wellfound backend  <https://wellfound.com/jobs?...>  depth: 25
- https://boards.greenhouse.io/acme?...   depth: 15
```

| Element | Rule |
|---|---|
| filtered search URL | The bullet's link (Markdown link, autolink, or bare URL). Required. Missing ⇒ `configError`, source skipped (FR-002a). |
| `depth: N` | Integer ≥ 1. Missing ⇒ default depth (`HYPPO_DEFAULT_DEPTH`, default 25). |
| `name:` | Optional display name. Missing ⇒ URL host. |

Headings and non-bullet lines are ignored.

---

## `inputs/priorities.md` → `HardStops`

Hard stops are read from a delimited section. Recognised:

```markdown
## Hard stops

- Excluded locations: US-only, India
- No clearance: TS/SCI, Public Trust
- No work authorization: requires US citizenship, needs existing EU work permit
```

| Key (case-insensitive, `:`-delimited list) | Maps to |
|---|---|
| `Excluded locations` | `excludedLocations[]` |
| `No clearance` / `Clearances I lack` | `lackedClearances[]` |
| `No work authorization` / `Work auth I lack` | `lackedWorkAuth[]` |

No `## Hard stops` section (or all lists empty) ⇒ no hard stops; pre-triage keeps everything and the
run summary sets `noTriageCriteria` if directions are also absent (FR-008d). The rest of
`priorities.md` (scoring weights, salary benchmarks) is **not** read by this feature.

---

## `inputs/directions/` → `ConsideredDirection[]`

One Markdown file per direction. Empty directory / no files ⇒ no directions (FR-008d).

| Field | Source |
|---|---|
| `name` | The file's first `#` heading, else the filename without extension |
| `context` | The remaining file body — passed to the pre-triage judgment as the description of what this direction covers |

---

## `inputs/applications.md` → `ApplicationsTrackerEntry[]`

Existing applications tracker. Parsed for `{ company, role, ref }` rows (Markdown table or bullet list;
tolerant). Used only for `alreadyApplied` linking (FR-016) and to seed `CanonicalCompany`. Never
written.
