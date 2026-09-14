// 005 — fixture-service client for worker/regression cases.
// Default origin is the harness port (runner-managed service); HYPPO_HARNESS_ORIGIN
// overrides for ad-hoc runs. Unreachable service throws the standard message —
// never falls back to any other host (US3).
export function harnessOrigin() {
  const raw = process.env.HYPPO_HARNESS_ORIGIN;
  if (raw === undefined || raw === "") return "http://127.0.0.1:8471";
  return raw.replace(/\/+$/, "");
}

export async function fetchFixture(path) {
  const url = harnessOrigin() + path;
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    throw new Error(
      `fixture service unreachable at ${url} (${e.cause?.code ?? e.message}) — ` +
        `start it first (npm run harness -- --serve); tests never fall back to a live host`
    );
  }
  return res;
}

export async function setScenario(path, scenario) {
  const url = harnessOrigin() + "/__admin/scenario";
  let admin;
  try {
    admin = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path, scenario }),
    });
  } catch (e) {
    throw new Error(
      `fixture service unreachable at ${url} (${e.cause?.code ?? e.message}) — ` +
        `start it first (npm run harness -- --serve); tests never fall back to a live host`
    );
  }
  if (admin.status !== 200) {
    throw new Error(`scenario admin rejected ${path} -> ${scenario}: ${await admin.text()}`);
  }
}

// Access-log loading with live-service fallback: prefer the JSONL file (written
// when the service runs with --access-log); if it is missing/unreadable and a
// service origin is given, pull GET /__admin/access-log from the live service.
// Throws the standard unreachable message when neither works.
export async function loadAccessLog({ file, origin }) {
  if (file) {
    try {
      const fs = await import("node:fs");
      const rows = fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
      return { rows, source: "file" };
    } catch {
      // fall through to the live service when an origin is available
    }
  }
  if (origin) {
    const url = origin.replace(/\/+$/, "") + "/__admin/access-log";
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`status ${res.status}`);
      return { rows: await res.json(), source: "service" };
    } catch (e) {
      throw new Error(
        `fixture service unreachable and no access log at ${file ?? "(none)"} ` +
          `(${e.cause?.code ?? e.message}) — tests never fall back to a live host`
      );
    }
  }
  throw new Error(
    `fixture service unreachable or access log missing (${file ?? "(none)"}) — tests never fall back to a live host`
  );
}
