// 007 T004 — byte-exact assertion for the Tier-2 atomic fidelity tests.
import fs from "node:fs";

export function assertByteIdentical(actualPath, expectedContent) {
  let actual;
  try {
    actual = fs.readFileSync(actualPath, "utf8");
  } catch (e) {
    throw new Error(`expected file was never written at ${actualPath}: ${e.message}`);
  }
  if (actual === expectedContent) return;
  throw new Error(
    `byte mismatch at ${actualPath}\n--- expected ---\n${JSON.stringify(expectedContent)}\n--- actual ---\n${JSON.stringify(actual)}`
  );
}
