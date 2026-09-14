import net from "node:net";

// 005 T003 — fixed-port helper. The fixture service binds ONE documented port and
// fails fast on conflict; it never auto-picks another (a moved port would silently
// invalidate every URL-shape assertion downstream).
export const DEFAULT_PORT = 8471;

export function harnessPort() {
  const raw = process.env.HYPPO_HARNESS_PORT;
  if (raw === undefined || raw === "") return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`HYPPO_HARNESS_PORT=${JSON.stringify(raw)} is not a valid port`);
  }
  return port;
}

// Rejects when the port is already held; resolves when it is free to bind.
// Race between check and bind is the caller's (service binds immediately after).
export function assertPortFree(port) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", (err) => {
      if (err.code === "EADDRINUSE") {
        reject(
          new Error(
            `fixture-service port ${port} is already in use (likely a stale harness service) — ` +
              `stop it or free the port, then re-run; the harness never picks another port silently`
          )
        );
      } else {
        reject(err);
      }
    });
    probe.listen(port, "127.0.0.1", () => probe.close(() => resolve()));
  });
}
