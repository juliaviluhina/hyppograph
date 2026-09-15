# Contract: Verbatim-Write Marker Convention

FR-006. Referenced from `.claude/workflows/fit-screen.js`'s and `.claude/workflows/intake-normalize.js`'s
module header comments.

## The rule

Any `agent()` call whose prompt instructs a **full overwrite of a file with multi-line literal
content** MUST wrap that content between explicit `BEGIN-CONTENT` / `END-CONTENT` marker lines, and
instruct the model to write the content **between** the markers, excluding the marker lines
themselves.

```text
Write the EXACT content between the BEGIN-CONTENT and END-CONTENT markers below (excluding the
marker lines themselves — they are not part of the file) to (overwrite if it already exists): <path>

BEGIN-CONTENT
<literal content, byte-for-byte>
END-CONTENT
```

## Why

A prompt that ends its own instruction text with a blank line immediately followed by the
content's first line — when that first line starts with a markdown-collision-prone character
(`-`, `#`, `` ` ``, `*`, a list marker) — gets misread by the model as the *instruction's own*
markdown formatting rather than data to transcribe, and the character silently drops from the
written file. This was found and root-caused in 006 (F4, `write-evaluation` dropping its YAML
front matter's leading `---`) — see `specs/007-write-fidelity-guardrails/spec.md` Background.
Explicit markers remove the ambiguity: there is no longer a boundary for the model to guess at.

## When this applies

- **Applies**: full-file-overwrite prompts with multi-line literal content (audit #1/#2/#3 in
  007's spec) — including content whose first line is not *currently* collision-prone but is not
  *structurally guaranteed* to stay that way (spec Edge Cases).
- **Does not apply**: patch/edit prompts that instruct the model to compose changes from
  instructions rather than transcribe a literal blob (audit #4/#5/#6), or single-line appends with
  no embedded newline (audit #7/#8) — neither has an instruction/content boundary to collide with.

## Enforcement

The free, node-only structural pin (`tests/harness/support/structure.mjs`, FR-004) greps each
in-class call site's prompt-builder source for both literal `BEGIN-CONTENT` and `END-CONTENT`
strings. It does not parse the AST or execute the function — a static text check, matching the
existing `hasRawSettingsPassthrough`-style pins' cost and strictness.
