#!/usr/bin/env node
// 005 T004 — fixture REST service. Loopback-only ATS posting-API stand-in.
// Serves canned bytes only; never fetches, proxies, or contacts any upstream.
//
// Usage: node service.mjs [--port 8471] [--scenarios <file>] [--access-log <file>]
//   --port        fixed bind port (default 8471); EADDRINUSE => loud exit, never another port
//   --scenarios   JSON file { "<path>": "<scenario>" } loaded at startup (optional)
//   --access-log  JSONL file every request (and flip) is appended to (optional)
// Prints `HARNESS_SERVICE origin=<origin>` on stdout when ready.
import http from "node:http";
import fs from "node:fs";

const SCENARIOS = new Set(["live", "closed", "malformed", "error", "flapping"]);

function parseArgs(argv) {
  const out = { port: 8471, scenarios: null, accessLog: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--port") out.port = Number(argv[++i]);
    else if (argv[i] === "--scenarios") out.scenarios = argv[++i];
    else if (argv[i] === "--access-log") out.accessLog = argv[++i];
  }
  if (!Number.isInteger(out.port) || out.port < 1 || out.port > 65535) {
    console.error(`bad --port (must be 1-65535)`);
    process.exit(2);
  }
  return out;
}

const opts = parseArgs(process.argv.slice(2));
const scenarioMap = new Map(); // path -> scenario; unset paths default to "live"
if (opts.scenarios) {
  const loaded = JSON.parse(fs.readFileSync(opts.scenarios, "utf8"));
  for (const [path, scenario] of Object.entries(loaded)) {
    if (!SCENARIOS.has(scenario)) {
      console.error(`bad scenario ${JSON.stringify(scenario)} for ${path}`);
      process.exit(2);
    }
    scenarioMap.set(path, scenario);
  }
}

const accessLog = [];
function log(entry) {
  const row = { at: new Date().toISOString(), ...entry };
  accessLog.push(row);
  if (opts.accessLog) fs.appendFileSync(opts.accessLog, JSON.stringify(row) + "\n");
}

function cannedBody(kind, path) {
  const seg = path.split("/").filter(Boolean).pop() ?? "posting";
  if (kind === "greenhouse") {
    return { id: 101, title: `Fixture posting ${seg}`, absolute_url: path, location: { name: "Remote" }, content: "<p>Fixture posting body.</p>", departments: [{ name: "Engineering" }] };
  }
  if (kind === "lever") {
    return { id: seg, text: `Fixture posting ${seg}`, hostedUrl: path, categories: { location: "Remote", team: "Engineering" }, description: "Fixture posting body." };
  }
  return { id: seg, title: `Fixture posting ${seg}`, isListed: true, locationName: "Remote", description: "Fixture posting body." }; // ashby
}

function boardKind(path) {
  if (path.startsWith("/v1/boards/")) return "greenhouse";
  if (path.startsWith("/v0/postings/")) return "lever";
  if (path.startsWith("/posting-api/job-board/")) return "ashby";
  return null;
}

function serveScenario(scenario, kind, path, res) {
  const effective = scenario === "flapping" ? "live" : scenario; // flapping serves live until flipped via admin
  if (effective === "live") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(cannedBody(kind, path)));
  } else if (effective === "closed") {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  } else if (effective === "malformed") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ surprise: "not-an-ats-shape" }));
  } else {
    res.writeHead(500, { "content-type": "application/json" }); // error
    res.end(JSON.stringify({ error: "boom" }));
  }
  return effective;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch (e) {
        reject(e);
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const path = url.pathname;

  if (path === "/__admin/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (path === "/__admin/access-log" && req.method === "GET") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(accessLog));
    return;
  }
  if (path === "/__admin/scenario" && req.method === "GET") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(Object.fromEntries(scenarioMap)));
    return;
  }
  if (path === "/__admin/scenario" && req.method === "POST") {
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "invalid JSON" }));
      return;
    }
    if (typeof body.path !== "string" || !SCENARIOS.has(body.scenario)) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "need {path: string, scenario: live|closed|malformed|error|flapping}" }));
      return;
    }
    const prev = scenarioMap.get(body.path) ?? "live";
    scenarioMap.set(body.path, body.scenario);
    log({ type: "flip", path: body.path, from: prev, to: body.scenario });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, path: body.path, from: prev, to: body.scenario }));
    return;
  }

  const kind = boardKind(path);
  if (!kind || req.method !== "GET") {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "unknown fixture path" }));
    return;
  }
  const scenario = scenarioMap.get(path) ?? "live";
  const served = serveScenario(scenario, kind, path, res);
  log({ type: "request", method: req.method, path, scenarioServed: served, configured: scenario });
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `fixture-service port ${opts.port} is already in use (likely a stale harness service) — ` +
        `stop it or free the port, then re-run; the harness never picks another port silently`
    );
    process.exit(3);
  }
  console.error(err);
  process.exit(1);
});

server.listen(opts.port, "127.0.0.1", () => {
  console.log(`HARNESS_SERVICE origin=http://127.0.0.1:${opts.port}`);
});
