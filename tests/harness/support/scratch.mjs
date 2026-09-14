import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 005 T005 — scratch data dir. Every full-flow run copies the committed
// tests/fixtures/data-dir/ to a temp dir and runs against the copy, so committed
// fixtures are immutable inputs and idempotency assertions measure only the run
// under test (research.md R4).
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const COMMITTED_DATA_DIR = path.resolve(HERE, "..", "..", "fixtures", "data-dir");

export function makeScratch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hyppo-harness-"));
  fs.cpSync(COMMITTED_DATA_DIR, dir, { recursive: true });
  return {
    dir,
    cleanup() {
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
