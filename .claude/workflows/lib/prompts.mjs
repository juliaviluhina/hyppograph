// prompts — the exact agent() prompt text for each model-backed subtask of the intake &
// normalize pipeline.
//
// SOURCE OF TRUTH. `.claude/workflows/intake-normalize.js` carries a marker-delimited
// inlined copy of this file's body (the sandbox forbids `import`); the module content
// with `export ` prefixes removed must stay byte-identical to that region.
// `evals/component/drift.test.mjs` enforces it (FR-002). The per-component evals import
// these builders directly — never a copy (FR-007).
//
// Each export is a `(vars) => string` builder that returns exactly the string the pipeline
// passes as the first argument to agent().

// Pre-triage keep/reject gate — one posting. vars: { criteria, directions, body }.
export function preTriagePrompt({ criteria, directions, body }) {
  return [
    "You are a HIGH-RECALL pre-triage gate. Decide kept / rejected for ONE job posting using",
    "ONLY the hard stops and the coarse direction overlap below. When unsure, keep it.",
    "",
    "HARD STOPS (reject only if the posting clearly triggers one):",
    JSON.stringify(criteria, null, 2),
    "  - excludedLocations: reject only if the posting's ONLY location(s) fall in this set.",
    "  - lackedClearances / lackedWorkAuth: reject if the posting REQUIRES one of these.",
    "  - visaSponsorshipRequired=true: reject if the posting explicitly offers NO sponsorship.",
    "",
    "CONSIDERED DIRECTIONS (coarse 'is this in the ballpark of something I want?'):",
    (directions || []).map((d) => `  - ${d.name}: ${d.description}`).join("\n") || "  (none configured)",
    "If there are directions and the posting overlaps NONE of them even loosely, reject with",
    "reason \"no direction overlap\". If there are no directions, do not reject on that basis.",
    "",
    "POSTING TEXT:",
    (body || "").slice(0, 12000),
    "",
    "Return decision, a one-line reason (for kept, name the matched direction or",
    "\"low-confidence default keep\"), and confidence normal|low. If you cannot classify",
    "confidently, return decision=kept, confidence=low.",
  ].join("\n");
}

// Fixed-field-set extraction — one posting. vars: { body }.
export function extractionPrompt({ body }) {
  return [
    "Extract the FIXED FIELD SET from ONE job posting. Rules:",
    "  - A field the source does NOT state => the literal string \"unknown\". NEVER infer,",
    "    guess, or convert (no currency conversion, no seniority inference).",
    "  - salaryAmountOrRange: copy the pay VERBATIM as written, else \"unknown\".",
    "  - requirements: a list of DISCRETE items, each individually meaningful (FR-011).",
    "  - Write every field in English. Set originalLanguage to the source posting's language",
    "    (\"en\" if it was English); if it was not English, translate the extracted values.",
    "  - normalizedTitle: a lowercased canonical form of roleTitle (strip seniority prefixes",
    "    only if they are also captured in `seniority`).",
    "  - locationBucket: a COARSE, STABLE key used for cross-source dedup — NOT a display value.",
    "    * Remote roles => \"remote-<region>\" where <region> is the lowercased zone the posting",
    "      implies: remote-eu, remote-us, remote-uk, remote-global. Collapse every phrasing to the",
    "      same bucket: \"Remote (EU)\", \"EU-remote\", \"Europe, remote\", \"remote within Europe\",",
    "      \"(Remote, EU)\" => ALL \"remote-eu\".",
    "    * City/office-anchored roles (on-site or hybrid) => the lowercased primary city: berlin, london.",
    "    * Nothing stated => \"unknown\".",
    "",
    "POSTING TEXT:",
    (body || "").slice(0, 16000),
  ].join("\n");
}

// Raw Record enumeration — index every *.md directly under the raw/ dir. vars: { rawDir }.
export function enumeratePrompt({ rawDir }) {
  return [
    `List every *.md file directly under this directory:`,
    `  ${rawDir}`,
    `For each file return: path = the bare file name only (e.g. "raw-foo.md", no directory part),`,
    `the front-matter fields id / availability, the current triage block if present (decision,`,
    `confidence, criteriaHash), and the file's body text.`,
    "If the directory is empty or missing, return an empty array.",
  ].join("\n");
}

// Source list — open one user-authored filtered board search and return its posting refs.
// vars: { filteredSearch, depth }.
export function sourceListPrompt({ filteredSearch, depth }) {
  return [
    `Open this user-authored filtered job-board search with the HyppoVisor read tools`,
    `(open_url / navigate, then read_page; wait_for_selector if the list is lazy-loaded):`,
    `  ${filteredSearch}`,
    "",
    `Return up to ${depth} posting references FROM THE FILTERED RESULT SET ONLY, in the`,
    "board's listed order (newest first where supported). Each ref = the canonical posting URL",
    "plus any list-level metadata the board shows (title/company/date) as listMeta.",
    "Do NOT follow pagination past what is needed for the requested count. Do NOT click,",
    "apply, sign in, or submit anything — read and navigate only.",
    "If the search URL is stale/rejected or the board is unreachable: opened=false with a reason.",
    "Zero results is opened=true with an empty postingRefs array (not a failure).",
  ].join("\n");
}
