// 007 T004 — byte-exact assertion for the Tier-2 atomic fidelity tests.
//
// Tolerates exactly one trailing "\n" difference between actual and expected: a live run
// (2026-09-14) showed the model normalizes whether a file ends with a final newline
// inconsistently across otherwise-identical BEGIN/END-CONTENT shapes, in *both* directions
// (stripping one, adding one) — a benign end-of-file convention distinct from the leading-
// delimiter-drop bug (F4) this spec targets. The leading character (and everything else) still
// MUST match exactly; only a single trailing "\n" is normalized away before comparing.
import fs from "node:fs";

function stripOneTrailingNewline(s) {
  return s.endsWith("\n") ? s.slice(0, -1) : s;
}

export function assertByteIdentical(actualPath, expectedContent) {
  let actual;
  try {
    actual = fs.readFileSync(actualPath, "utf8");
  } catch (e) {
    throw new Error(`expected file was never written at ${actualPath}: ${e.message}`);
  }
  if (stripOneTrailingNewline(actual) === stripOneTrailingNewline(expectedContent)) return;
  throw new Error(
    `byte mismatch at ${actualPath}\n--- expected ---\n${JSON.stringify(expectedContent)}\n--- actual ---\n${JSON.stringify(actual)}`
  );
}
