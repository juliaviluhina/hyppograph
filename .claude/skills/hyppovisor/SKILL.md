---
name: hyppovisor
description: >-
  Drive HyppoVisor's MCP browser to read or draft on web pages the user is
  already signed into. Use when a task needs a logged-in page read, a form
  prepared, or rendered content checked. Covers launching the right per-project
  instance with an explicit name + port, registering the MCP endpoint, and the
  read-only / never-submit rules.
metadata:
  source: https://github.com/juliaviluhina/hyppovisor
  install: copy this folder to .claude/skills/hyppovisor/ in the project that will use HyppoVisor
---

# HyppoVisor

HyppoVisor is a local Electron app plus an MCP server. It opens URLs in real
browser tabs that carry the **user's own logins** and exposes them as MCP tools:
`open_url`, `list_open_tabs`, `navigate`, `read_page`, `read_form_fields`,
`read_actionable`, `interact`, `wait_for_selector`, `screenshot`.

You use it to read pages behind a login and to prepare drafts. You never complete
an external action.

## Non-negotiable rules

- **Never** submit a form, press Enter, send a message, apply, connect, or
  authenticate. The user performs every external act.
- **Never** sign in. If a page shows a login wall, stop and ask the user to log
  in inside the HyppoVisor window, then continue.
- `interact` is preparation only: `fill` a plain field, `space` a plain checkbox,
  `choose_option` in a plain `<select>` / combobox, `click` **only** to reveal
  more content (pagination, "show more", "Add another"). Submit, consent, and
  credential controls are refused by the app — don't work around a refusal.
- One action is in flight at a time across all tabs; treat calls as serial.
- Read payloads are verbatim — don't ask HyppoVisor to summarise; summarise
  yourself after.
- **`screenshot` needs a visible window.** An instance launched with `--background`
  has no rendered surface, so `screenshot` returns `SCREENSHOT_FAILED` there —
  every other tool works normally. If you need a picture, ask the user to summon
  the window (re-launch the same `--instance <name>`) or run without `--background`,
  then retry. Otherwise rely on `read_page` / `read_form_fields`.

## This project's instance

| Parameter          | Value                                  |
|--------------------|----------------------------------------|
| `--instance` slug  | `hyppograph`                           |
| `--port`           | `7359`                                 |
| MCP server name    | `hyppovisor-hyppograph`                |
| MCP tool prefix    | `mcp__hyppovisor-hyppograph__*`        |
| Endpoint           | `http://127.0.0.1:7359/mcp`            |

The endpoint is registered in this repo's committed `.mcp.json` (project scope,
literal localhost URL). **Bearer-token auth is on for this instance** — the
working registration is a local-scope one (`~/.claude.json`, gitignored) with an
`Authorization: Bearer <token>` header; the committed `.mcp.json` intentionally
carries no token. `claude mcp get hyppovisor-hyppograph` should show `Connected`.

**Jev relevance ranking** (`read_actionable`'s `goal` param) needs `TYPESAFE_API_KEY`
resolved in HyppoVisor's own process — as of the `docs-typesafe-key-resolution`
update this is automatic: HyppoVisor checks its own process env first, then falls
back to the OS-user environment (`launchctl getenv TYPESAFE_API_KEY`). Set it once
with `launchctl setenv TYPESAFE_API_KEY <key>` and every future launch (Dock,
`open`, direct exec) picks it up with no per-launch ceremony. If ranking is
unavailable, `read_actionable` still returns normally with
`rankingStatus: "unavailable-missing-key"` — never an error.

## Port registry (avoid collisions across projects)

Every project gets its own slug **and** its own port so parallel instances never
clash. Known assignments on this machine:

| Project                     | Slug         | Port   | Server name             |
|-----------------------------|--------------|--------|-------------------------|
| `~/projects/hyppovisor`     | `hyppovisor` | `7357` | `hyppovisor`            |
| `~/projects/julia-2-nd`     | `julia-2-nd` | `7358` | `hyppovisor-julia-2-nd` |
| `~/projects/hyppograph`     | `hyppograph` | `7359` | `hyppovisor-hyppograph` |
| *next project*              | *its slug*   | `7360` | `hyppovisor-<slug>`     |

When setting up a new project, take the next free port and add a row.

## Before using it — check the connection

Call `list_open_tabs` (tool `mcp__hyppovisor-hyppograph__list_open_tabs`). If the
tool is unavailable or errors, HyppoVisor is not running or not registered — walk
the user through **Setup** below, then retry.

## Setup

The user runs these; you supply the exact commands with this project's slug/port
filled in.

### 1. Launch this project's instance

Always launch this project's instance **with an explicit name + port and in
background mode** (`--background`) unless the user is actively watching it (e.g.
debugging a crash, or signing in) — rationale: intake work often runs while the
user is doing other things, and a background instance starts hidden and never
steals focus.

```bash
# packaged app, macOS  (-n forces a new process)
open -na HyppoVisor --args --instance hyppograph --port 7359 --background

# or from a HyppoVisor checkout (dev)
npx electron . --instance hyppograph --port 7359 --background
```

Every MCP tool works the same in background mode **except `screenshot`**, which
needs a rendered surface and returns `SCREENSHOT_FAILED` while the window is
hidden. To sign in past a login wall or to take a screenshot, the user re-runs
the same `--instance hyppograph` line (no `--background` needed) to **summon** the
window, does the thing, then closes it — the instance drops back to the
background and keeps serving MCP on port 7359. Summon-then-close never stops the
instance; see **Shutting down** below.

The window title reads `HyppoVisor — hyppograph`. If the port is already in use,
the app's **Connection & MCP** panel shows a "port in use" error — the user frees
port 7359 or relaunches with a different `--port` (and then update the registry
above and re-register). HyppoVisor never silently picks another port.

Omitting `--port` reuses that instance's last port, else `7357`.

### 2. Register the MCP endpoint (already done for this project)

This repo commits the endpoint in `.mcp.json`:

```json
{ "mcpServers": { "hyppovisor-hyppograph": {
  "type": "http", "url": "http://127.0.0.1:7359/mcp" } } }
```

`.claude/settings.local.json` enables it (`enabledMcpjsonServers`). If the panel's
**Bearer token** is on (it is, for this instance), the plain committed
`.mcp.json` won't authenticate — register a local-scope override instead:

```bash
claude mcp add --transport http --scope local \
  hyppovisor-hyppograph http://127.0.0.1:7359/mcp \
  --header "Authorization: Bearer <token>"
```

- Each project registers its own `hyppovisor-<slug>` so the entries never clobber
  each other. Do **not** add a generic `hyppovisor` at user scope.
- The panel (hippo button, top bar) shows this command pre-filled with the live
  port, server name, and token — copy it verbatim rather than hand-type.

### 3. Confirm you reached the right instance

The MCP `initialize` handshake reports `serverInfo.name` as
`hyppovisor-hyppograph`. If it doesn't match, you're talking to another
instance — check the port.

## Working flow

1. `open_url` the target page (or `navigate` an existing tab from `list_open_tabs`).
2. If a login wall appears → stop, ask the user to sign in, wait, retry.
3. `read_page` for visible text; `read_form_fields` for a structured control map
   with per-field `fill` / `click` verdicts and selectors; `read_actionable` for a
   compact indexed element table plus text in one call (pass `goal` for Jev relevance
   ranking; address entries via `elementIndex` + `generation`, never as selectors).
   **Caveat observed 2026-09-21**: `read_actionable`'s indexed table doesn't
   reliably surface every real link on a page — e.g. WeWorkRemotely's job-posting
   links didn't appear as indexed `link` elements at all in one snapshot, only in
   the plain `text` block. Don't assume `read_actionable` is a drop-in replacement
   for `read_page` on every board; check its `elements`/`omissions` against what
   you actually need before relying on it, and fall back to `read_page` if the
   thing you're looking for isn't there.
4. `interact` to fill fields, tick plain checkboxes, choose options, or click to
   reveal sections. `wait_for_selector` when content loads async.
5. `screenshot` to verify what actually rendered (visible-window instances only —
   see the note in Non-negotiable rules for `--background`).
6. Hand back to the user for anything that submits, sends, or signs in.

## Adding a new project

1. Pick a short slug (`[a-z0-9][a-z0-9_-]*`, ≤ 32 chars) and the next free port
   from the registry.
2. Copy this `hyppovisor/` skill folder into that project's `.claude/skills/`,
   then update its **This project's instance** table and **Port registry** row.
3. In that project: commit a `.mcp.json` with `hyppovisor-<slug>` →
   `http://127.0.0.1:<port>/mcp`, or `claude mcp add --transport http --scope
   local hyppovisor-<slug> http://127.0.0.1:<port>/mcp`.
4. Launch: `open -na HyppoVisor --args --instance <slug> --port <port> --background`.

## Shutting down

An instance keeps running — and keeps serving MCP on its port — until it gets a
real quit. Closing a summoned window only drops a `--background` instance back to
the background; it does **not** stop it. Summon-then-close is for signing in or
screenshotting, never for shutdown.

The user runs one of these; you supply the command:

- **Ctrl-C in the terminal that launched it** — the clean stop. A `--background`
  instance handles SIGINT/SIGTERM as a graceful quit: tabs close, the MCP server
  stops. This is not a hard kill.
- Launched detached / no terminal in reach — target it **by instance name** so a
  sibling instance is untouched:

  ```bash
  pkill -f -- "--instance hyppograph "
  ```

  Same graceful path as Ctrl-C.
- Once the instance is gone for good, drop the client entry:

  ```bash
  claude mcp remove hyppovisor-hyppograph
  ```

**If you launched an instance yourself for this session, ask the user before the
session ends whether to close it.** A `--background` instance you started has no
window and no focus — it is invisible and easy to forget, but it stays alive and
holds its port. Don't kill an instance the user was already running, or one from
another project; only offer to stop the one this session created.
