// tests/synthetic/fixtures/mock-answers.mjs — the "model judgments" for the synthetic integration
// dataset, hand-decided once (data-model.md "Expected-output tree ... every expected output value is
// hand-derivable"). Keyed by raw-record basename. Consumed by evals/integration/mock-pipeline.mjs to
// stand in for every agent() call the real workflow would make, so the integration gate can exercise
// its copy -> triage -> normalize -> diff -> report plumbing for $0, with no model and no network
// (research D7). This is NOT a judgment-quality check — see evals/per-component/ for that.

export const manualIngest = {
  "massive-dynamic-platform-engineer.md": { isPosting: true },
  "NOTES-networking-event.md": { isPosting: false, reason: "personal note, not a job posting" },
};

// decision | reason | confidence — mirrors triageMarkSchema.
export const triage = {
  "raw-acme-boarda.md": { decision: "kept", reason: "platform-backend", confidence: "normal" },
  "raw-acme-boardb.md": { decision: "kept", reason: "platform-backend", confidence: "normal" },
  "raw-globex-boarda.md": { decision: "kept", reason: "software-engineering", confidence: "normal" },
  "raw-initech-boardb.md": {
    decision: "rejected",
    reason: "excluded-location: posting is only located in Antarctica",
    confidence: "normal",
  },
  "raw-umbrella-boarda.md": {
    decision: "rejected",
    reason: "no direction overlap: marketing role does not match configured directions",
    confidence: "normal",
  },
  "raw-tyrell-boardb.md": {
    decision: "rejected",
    reason: "clearance: requires TS/SCI clearance",
    confidence: "normal",
  },
  "raw-hooli-boarda.md": { decision: "kept", reason: "platform-backend", confidence: "normal" },
  "raw-wonka-boardb.md": { decision: "kept", reason: "software-engineering", confidence: "normal" },
  "manual-massive-dynamic-platform-engineer.md": {
    decision: "kept",
    reason: "platform-backend",
    confidence: "normal",
  },
};

// jobRecordFieldsSchema shape — mirrors the extraction agent()'s structured output.
export const extraction = {
  "raw-acme-boarda.md": {
    roleTitle: "Senior Backend Engineer",
    normalizedTitle: "backend engineer",
    companyAsStated: "Acme Inc.",
    locations: ["Berlin, Germany"],
    locationBucket: "berlin",
    workArrangement: "hybrid",
    salaryAmountOrRange: "€70,000–€90,000",
    salaryCurrency: "EUR",
    seniority: "senior",
    employmentType: "full-time",
    postingDate: "2026-08-01",
    originalLanguage: "en",
    responsibilitiesSummary: "Design and build backend services for Acme's core platform.",
    requirements: [
      "5+ years backend engineering experience",
      "Strong Node.js or Go skills",
      "Experience with distributed systems",
    ],
  },
  "raw-acme-boardb.md": {
    roleTitle: "Sr. Backend Engineer",
    normalizedTitle: "backend engineer",
    companyAsStated: "Acme Corp",
    locations: ["Berlin, Germany"],
    locationBucket: "berlin",
    workArrangement: "hybrid",
    salaryAmountOrRange: "70k-90k EUR/year",
    salaryCurrency: "EUR",
    seniority: "senior",
    employmentType: "full-time",
    postingDate: "2026-08-01",
    originalLanguage: "en",
    responsibilitiesSummary: "Design and build backend services for Acme's core platform.",
    requirements: [
      "5+ years backend engineering experience",
      "Strong Node.js or Go skills",
      "Experience with distributed systems",
    ],
  },
  "raw-globex-boarda.md": {
    roleTitle: "Frontend Engineer",
    normalizedTitle: "frontend engineer",
    companyAsStated: "Globex LLC",
    locations: ["Remote (EU)"],
    locationBucket: "remote-eu",
    workArrangement: "remote",
    salaryAmountOrRange: "unknown",
    salaryCurrency: "unknown",
    seniority: "mid",
    employmentType: "full-time",
    postingDate: "2026-08-03",
    originalLanguage: "en",
    responsibilitiesSummary: "Build and maintain customer-facing web applications.",
    requirements: ["3+ years frontend experience", "React proficiency", "Familiarity with TypeScript"],
  },
  "raw-hooli-boarda.md": {
    roleTitle: "Backend Developer",
    normalizedTitle: "backend developer",
    companyAsStated: "Hooli GmbH",
    locations: ["Berlin, Germany"],
    locationBucket: "berlin",
    workArrangement: "on-site",
    salaryAmountOrRange: "€65,000–€80,000",
    salaryCurrency: "EUR",
    seniority: "mid",
    employmentType: "full-time",
    postingDate: "2026-08-05",
    originalLanguage: "de",
    responsibilitiesSummary: "Develop and maintain backend services for Hooli's internal tools.",
    requirements: [
      "3+ years backend development experience",
      "Java or Kotlin proficiency",
      "German business fluency preferred",
    ],
  },
  "raw-wonka-boardb.md": {
    roleTitle: "Confectionery Software Engineer",
    normalizedTitle: "software engineer",
    companyAsStated: "Wonka Industries",
    locations: ["unknown"],
    locationBucket: "unknown",
    workArrangement: "unknown",
    salaryAmountOrRange: "unknown",
    salaryCurrency: "unknown",
    seniority: "unknown",
    employmentType: "unknown",
    postingDate: "unknown",
    originalLanguage: "en",
    responsibilitiesSummary: "Build software systems for Wonka's confectionery production lines.",
    requirements: ["Programming experience"],
  },
  "manual-massive-dynamic-platform-engineer.md": {
    roleTitle: "Platform Engineer",
    normalizedTitle: "platform engineer",
    companyAsStated: "Massive Dynamic",
    locations: ["Berlin, Germany"],
    locationBucket: "berlin",
    workArrangement: "hybrid",
    salaryAmountOrRange: "€75,000–€95,000",
    salaryCurrency: "EUR",
    seniority: "senior",
    employmentType: "full-time",
    postingDate: "2026-08-07",
    originalLanguage: "en",
    responsibilitiesSummary: "Own platform infrastructure and internal developer tooling.",
    requirements: ["5+ years platform/infra experience", "Kubernetes and Terraform", "Strong CI/CD background"],
  },
};

// dedupGroupSchema shape — mirrors the canonicalise-companies agent()'s output.
export const canonGroups = [
  { canonical: "Acme", variants: ["Acme Inc.", "Acme Corp"] },
  { canonical: "Globex", variants: ["Globex LLC"] },
  { canonical: "Hooli", variants: ["Hooli GmbH"] },
  { canonical: "Wonka Industries", variants: ["Wonka Industries"] },
  { canonical: "Massive Dynamic", variants: ["Massive Dynamic"] },
];

// alreadyApplied resolution against inputs/applications.md — mirrors the write-job-record agent()'s
// STEP 1. Absent entries default to { alreadyApplied: false, appliedEntryRef: null }.
export const applied = {
  "manual-massive-dynamic-platform-engineer.md": {
    alreadyApplied: true,
    appliedEntryRef: "applications.md#massive-dynamic-platform-engineer",
  },
};

// The frozen run clock for every synthetic-dataset gate run (feature 001's runtime contract: the
// workflow never computes its own timestamp). Fixed so the expected tree is byte-reproducible.
export const RUN_TIMESTAMP = "2026-09-14T12:00:00.000Z";
