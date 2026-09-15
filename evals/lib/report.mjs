// evals/lib/report.mjs — assemble and write a dated eval report + append its index row
// (FR-011, FR-013, contracts/eval-report.md). Strips/refuses forbidden content (FR-012, SC-007):
// credentials, auth headers, request/response bodies, personal data — reports carry model IDs and
// token counts only.

import { readdirSync, existsSync, mkdirSync, writeFileSync, readFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";

export const REPORTS_DIR = "docs/eval-reports";

// Same shape as evals/component/credential-hygiene.test.mjs's guard — a live OpenCode Go key looks
// like `sk-<20+ chars>`. A report containing this pattern is refused outright rather than silently
// redacted, so a real leak is never masked as "handled".
const FORBIDDEN_PATTERNS = [/\bsk-[A-Za-z0-9]{20,}\b/, /\bauthorization:\s*bearer\b/i];

export function nextSequence(reportsDir = REPORTS_DIR) {
  if (!existsSync(reportsDir)) return 1;
  const nums = readdirSync(reportsDir)
    .map((f) => f.match(/^(\d{4})-/))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  return (nums.length ? Math.max(...nums) : 0) + 1;
}

function pad4(n) {
  return String(n).padStart(4, "0");
}

function resultsTable(results) {
  const header = "| case | expected | actual | verdict |\n|------|----------|--------|---------|";
  const rows = results.map((r) => `| ${r.case} | ${r.expected} | ${r.actual} | ${r.verdict} |`);
  return [header, ...rows].join("\n");
}

export function assembleReport({ seq, scope, date, methodology, underTest, results, diffs = [], cost, findings }) {
  const lines = [
    `# Eval Run ${pad4(seq)} — ${scope} — ${date}`,
    "",
    "## Methodology",
    `- Layer: ${methodology.layer}`,
    `- Judge: ${methodology.judge}`,
    `- Substrate: ${methodology.substrate}`,
    "",
    "## Under test",
    `- Workflow commit: ${underTest.commit}`,
    `- Model IDs: ${underTest.modelIds}`,
    `- Fixture: ${underTest.fixture}`,
    `- Run: ${underTest.run}`,
    "",
    "## Results",
    resultsTable(results),
  ];
  if (diffs.length) {
    lines.push("");
    for (const d of diffs) {
      lines.push(`<!-- ${d.case} diff -->`, "```", d.diff, "```");
    }
  }
  lines.push(
    "",
    "## Cost",
    `- Tokens in / out: ${cost.tokensIn} / ${cost.tokensOut}`,
    `- Dollar cost: ${cost.dollarCost}`,
    "",
    "## Findings",
    ...(findings.length ? findings.map((f) => `- ${f}`) : ["- none"])
  );
  return lines.join("\n") + "\n";
}

function assertNoForbiddenContent(markdown, reportPath) {
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(markdown)) {
      throw new Error(`report.mjs: refusing to write ${reportPath} — forbidden content detected (FR-012, SC-007)`);
    }
  }
}

// Appends `| NNNN | date | scope | result | cost | commit |` to the index (FR-013). `result` MUST
// be one of the three contract-defined values.
export function appendIndexRow({ seq, date, scope, result, cost, commit }, indexPath = join(REPORTS_DIR, "README.md")) {
  if (!/^(pass \(\d+\/\d+\)|fail \(\d+\/\d+\)|partial \(ceiling\))$/.test(result)) {
    throw new Error(`report.mjs: index result ${JSON.stringify(result)} does not match the contract's three allowed forms`);
  }
  const row = `| ${pad4(seq)} | ${date} | ${scope} | ${result} | ${cost} | ${commit} |\n`;
  appendFileSync(indexPath, row);
}

// Writes the report file and appends its index row. Returns the report's relative path. Throws
// (writes nothing) if forbidden content is detected.
export function writeReport({ scope, date, methodology, underTest, results, diffs, cost, findings, indexResult, indexCost, commit }, reportsDir = REPORTS_DIR) {
  const seq = nextSequence(reportsDir);
  const markdown = assembleReport({ seq, scope, date, methodology, underTest, results, diffs, cost, findings });

  const reportPath = join(reportsDir, `${pad4(seq)}-${date}-${scope}.md`);
  assertNoForbiddenContent(markdown, reportPath);

  if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });
  writeFileSync(reportPath, markdown);
  appendIndexRow({ seq, date, scope, result: indexResult, cost: indexCost, commit }, join(reportsDir, "README.md"));

  return reportPath;
}
