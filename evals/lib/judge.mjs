// evals/lib/judge.mjs — the non-Claude judge client (contracts/judge-rubric.md, research D5). POSTs
// to the Responses API shape (`HYPPO_JUDGE_BASE_URL`) with `HYPPO_JUDGE_MODEL`,
// `reasoning.effort: HYPPO_JUDGE_EFFORT`, and a stable `x-opencode-session` header (verified live
// 2026-09-14 — without it the endpoint 400s `MissingSessionID`). The credential is a transport
// header only, never in the payload, never logged (FR-012, FR-016).

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

export const PERMITTED_RUBRIC_TYPES = new Set(["extraction-faithfulness", "pre-triage-reason"]);

// Parses a rubric file (contracts/judge-rubric.md shape): `# Rubric: <type>`, `## criteria`
// (numbered list), `## pass_rule` (default "all"). Throws if `type` is not one of the two permitted
// values — the harness refuses to run any other rubric (FR-010a).
export function loadRubric(rubricPath) {
  const text = readFileSync(rubricPath, "utf8");
  const typeMatch = text.match(/^#\s*Rubric:\s*(\S+)/m);
  if (!typeMatch) throw new Error(`judge: ${rubricPath} has no "# Rubric: <type>" heading`);
  const type = typeMatch[1];
  if (!PERMITTED_RUBRIC_TYPES.has(type)) {
    throw new Error(`judge: rubric type ${JSON.stringify(type)} in ${rubricPath} is not permitted (FR-010a) — only ${[...PERMITTED_RUBRIC_TYPES].join(", ")}`);
  }

  const criteriaBlock = text.match(/##\s*criteria\s*\n([\s\S]*?)(?:\n##|\n*$)/);
  const criteria = [];
  if (criteriaBlock) {
    for (const line of criteriaBlock[1].split("\n")) {
      const start = line.match(/^\s*\d+\.\s*(.+)$/);
      if (start) {
        criteria.push(start[1].trim());
      } else if (line.trim() && criteria.length) {
        // a wrapped continuation line of the previous numbered item
        criteria[criteria.length - 1] += " " + line.trim();
      }
    }
  }
  if (criteria.length === 0) throw new Error(`judge: ${rubricPath} has no numbered criteria under "## criteria"`);

  const passRuleMatch = text.match(/##\s*pass_rule\s*\n\s*(\S+(?:\s+\S+)*)/);
  const passRule = passRuleMatch ? passRuleMatch[1].trim() : "all";

  return { type, criteria, passRule };
}

export function buildJudgePrompt({ criteria, source_posting, produced_output }) {
  return [
    "You are grading ONE case against explicit criteria. Answer STRICTLY as JSON matching this",
    'shape and NOTHING else: {"results":[{"criterion":"<verbatim>","verdict":"pass"|"fail","note":"<short>"}]}',
    "Exactly one result entry per criterion below, in the same order. No prose outside the JSON.",
    "",
    "CRITERIA:",
    ...criteria.map((c, i) => `${i + 1}. ${c}`),
    "",
    "SOURCE POSTING:",
    source_posting,
    "",
    "PRODUCED OUTPUT:",
    JSON.stringify(produced_output, null, 2),
  ].join("\n");
}

function extractOutputText(data) {
  if (typeof data.output_text === "string") return data.output_text;
  const items = Array.isArray(data.output) ? data.output : [];
  for (const item of items) {
    if (item.type === "message" && Array.isArray(item.content)) {
      const textPart = item.content.find((c) => c.type === "output_text" || c.type === "text");
      if (textPart?.text) return textPart.text;
    }
  }
  throw new Error("judge: could not find output text in the Responses API result");
}

// FR-010/FR-012: a response missing a criterion, or returning anything other than pass/fail, fails
// the case with "judge response malformed" — never thrown as a hard error, since a malformed judge
// reply is a normal (if unwelcome) eval outcome, not a harness bug.
export function parseJudgeResponse(text, criteria) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { verdict: "fail", note: "judge response malformed", results: [] };
  }
  if (!parsed || !Array.isArray(parsed.results) || parsed.results.length !== criteria.length) {
    return { verdict: "fail", note: "judge response malformed", results: parsed?.results || [] };
  }
  for (const r of parsed.results) {
    if (r.verdict !== "pass" && r.verdict !== "fail") {
      return { verdict: "fail", note: "judge response malformed", results: parsed.results };
    }
  }
  const allPass = parsed.results.every((r) => r.verdict === "pass");
  return { verdict: allPass ? "pass" : "fail", results: parsed.results };
}

// The judge exchange (contracts/judge-rubric.md). `sessionId` defaults to a fresh id per call —
// callers doing multiple calls in one eval run should pass a shared, stable one (routing/
// prompt-caching only, not a credential — FR-010b).
export async function callJudge({ criteria, source_posting, produced_output }, { sessionId } = {}) {
  const apiKey = process.env.HYPPO_JUDGE_API_KEY;
  const baseUrl = process.env.HYPPO_JUDGE_BASE_URL;
  const model = process.env.HYPPO_JUDGE_MODEL;
  const effort = process.env.HYPPO_JUDGE_EFFORT || "low";
  const missing = ["HYPPO_JUDGE_API_KEY", "HYPPO_JUDGE_BASE_URL", "HYPPO_JUDGE_MODEL"].filter((n) => !process.env[n]);
  if (missing.length) {
    throw new Error(`judge: missing required credential/config: ${missing.join(", ")}`);
  }

  const prompt = buildJudgePrompt({ criteria, source_posting, produced_output });

  const res = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      "x-opencode-session": sessionId || randomUUID(),
    },
    body: JSON.stringify({ model, input: prompt, reasoning: { effort } }),
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(`judge: HTTP ${res.status} — ${bodyText.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = extractOutputText(data);
  return parseJudgeResponse(text, criteria);
}
