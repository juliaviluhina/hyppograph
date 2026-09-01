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
`interact`, `wait_for_selector`, `screenshot`.

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

## This project's instance

| Parameter          | Value                                  |
|--------------------|----------------------------------------|
| `--instance` slug  | `hyppograph`                           |
| `--port`           | `7359`                                 |
| MCP server name    | `hyppovisor-hyppograph`                |
| MCP tool prefix    | `mcp__hyppovisor-hyppograph__*`        |
| Endpoint           | `http://127.0.0.1:7359/mcp`            |

The endpoint is registered in this repo's committed `.mcp.json` (project scope,
literal localhost URL — no env vars, no bearer token). You only need the
**Launch** step below; the endpoint is already known to Claude Code.

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

```bash
# packaged app, macOS  (-n forces a new process)
open -na HyppoVisor --args --instance hyppograph --port 7359

# or from a HyppoVisor checkout (dev)
npx electron . --instance hyppograph --port 7359
```

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

`.claude/settings.local.json` enables it (`enabledMcpjsonServers`). If you ever
need to register it by hand instead:

```bash
claude mcp add --transport http --scope local \
  hyppovisor-hyppograph http://127.0.0.1:7359/mcp
```

- Each project registers its own `hyppovisor-<slug>` so the entries never clobber
  each other. Do **not** add a generic `hyppovisor` at user scope.
- If the panel's **Bearer token** is on, append
  `--header "Authorization: Bearer <token>"` (and move the URL/token into a
  gitignored place rather than the committed `.mcp.json`).
- The panel (hippo button, top bar) shows this command pre-filled with the live
  port, server name, and token — copy it verbatim rather than hand-type.

### 3. Confirm you reached the right instance

The MCP `initialize` handshake reports `serverInfo.name` as
`hyppovisor-hyppograph`. If it doesn't match, you're talking to another
instance — check the port.

## Adding a new project

1. Pick a short slug (`[a-z0-9][a-z0-9_-]*`, ≤ 32 chars) and the next free port
   from the registry.
2. Copy this `hyppovisor/` skill folder into that project's `.claude/skills/`,
   then update its **This project's instance** table and **Port registry** row.
3. In that project: commit a `.mcp.json` with `hyppovisor-<slug>` →
   `http://127.0.0.1:<port>/mcp`, or `claude mcp add --transport http --scope
   local hyppovisor-<slug> http://127.0.0.1:<port>/mcp`.
4. Launch: `open -na HyppoVisor --args --instance <slug> --port <port>`.

## Working flow

1. `open_url` the target page (or `navigate` an existing tab from `list_open_tabs`).
2. If a login wall appears → stop, ask the user to sign in, wait, retry.
3. `read_page` for visible text; `read_form_fields` for a structured control map
   with per-field `fill` / `click` verdicts and selectors.
4. `interact` to fill fields, tick plain checkboxes, choose options, or click to
   reveal sections. `wait_for_selector` when content loads async.
5. `screenshot` to verify what actually rendered.
6. Hand back to the user for anything that submits, sends, or signs in.

## Parallel sessions

Run one HyppoVisor per project or persona — each its own `--instance` / `--port`
/ profile (separate logins, settings, recent URLs, interaction log). They don't
interfere: a form-fill in one instance never blocks a read in another. Each is
registered under its own `hyppovisor-<slug>` name.
