// evals/lib/credentials.mjs — read required credentials from the environment ONCE at start; absent
// => exit 2 naming the variable; never prompt, never accept one from argv (FR-016). Used by the
// judge client always; by the metered substrate only at the FR-023 milestone.

// data-model.md "Credential" — HYPPO_JUDGE_API_KEY is the secret; the rest are non-secret config
// with the same environment-only sourcing (exempt from FR-016/FR-017's secrecy rules per FR-010b).
export const JUDGE_CREDENTIAL_VARS = ["HYPPO_JUDGE_API_KEY"];
export const JUDGE_CONFIG_VARS = ["HYPPO_JUDGE_BASE_URL", "HYPPO_JUDGE_MODEL", "HYPPO_JUDGE_EFFORT"];

// Returns { ok: true, values } or { ok: false, missing }. Never throws — the caller decides how to
// surface a missing-credential failure (exit 2, contracts/evals-cli.md).
export function requireEnv(varNames) {
  const missing = varNames.filter((name) => !process.env[name]);
  if (missing.length) return { ok: false, missing };
  return { ok: true, values: Object.fromEntries(varNames.map((name) => [name, process.env[name]])) };
}

export function requireJudgeCredential() {
  return requireEnv([...JUDGE_CREDENTIAL_VARS, ...JUDGE_CONFIG_VARS]);
}

export function missingCredentialMessage(missing) {
  return `missing required credential/config: ${missing.join(", ")} — set in .env (see .env.example; never as a CLI argument, never prompted).`;
}
