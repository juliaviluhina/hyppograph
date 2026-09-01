/**
 * intake-normalize — Phase A prototype (Claude Code dynamic workflow)
 * =================================================================
 * Feature 001: the opening three pipeline steps — collect -> pre-triage -> normalize.
 * Spec:  specs/001-intake-normalize-pipeline/
 *
 * RUNTIME CONTRACT (Claude Code dynamic workflow — see the `workflow-authoring` skill)
 *   - Constrained JavaScript: no `import`, no `require`, no direct fs / shell / network from the
 *     script body. `Date.now()`, `Math.random()`, argless `new Date()` THROW — every timestamp/id
 *     comes from `args`.
 *   - The script body runs at TOP LEVEL inside an async wrapper: use `await` directly, use top-level
 *     `return` to finish. There is no default export wrapping the body. (`node --check` rejects a
 *     top-level `return`; that is expected — the workflow runtime, not node, executes this file.)
 *   - Globals available to the body:
 *       phase(title)                       — void marker; subsequent agent() calls group under it
 *       pipeline(items, stage1, stage2, …) — run each item through the stages; NO options arg;
 *                                            concurrency auto-caps at min(16, CPUs-2); <=4096 items
 *       parallel(thunksArray)              — run an array of () => Promise thunks together (barrier)
 *       agent(prompt, { schema, label, model, phase, agentType }) — one bounded subtask; with a
 *                                            `schema` it returns an object matching it and nothing
 *                                            else. `agentType` picks a custom subagent def from
 *                                            .claude/agents/ — that is where the per-agent TOOL
 *                                            POLICY lives (there is no `allowedTools` option).
 *       log(...)                           — structured progress log, surfaced in /workflows
 *   - `args`:
 *       args.runTimestamp : string  — ISO-8601, the frozen run clock + run id source
 *       args.dataDir      : string  — absolute path to HYPPO_DATA_DIR (inputs/ + outputs/ live here)
 *       args.pacingMs?    : number  — default 3000  (HYPPO_PACING_MS) — see sleep() note at EOF
 *       args.fetchCap?    : number  — default 300   (HYPPO_FETCH_CAP)
 *       args.defaultDepth?: number  — default 25    (HYPPO_DEFAULT_DEPTH)
 *
 * CONSTITUTION GUARDRAILS baked in here (see specs/.../plan.md Constitution Check):
 *   I.  The workflow BODY sequences every phase/stage. No agent() result may redirect control flow.
 *   II. Every judgment agent() sets model: "haiku" (fast tier) explicitly — the only tier this feature uses.
 *   IV. Tool policy is per-agentType (.claude/agents/hyppo-*.md), not inline:
 *         hyppo-read          -> Read                      (read-settings, index-raw-records)
 *         hyppo-write         -> Write                     (write-run-summary)
 *         hyppo-readwrite     -> Read, Write               (write-triage, canonicalise-companies,
 *                                                           write-job-record, ingest-manual-postings, provenance)
 *         hyppo-judge         -> Read (unused; pure judgment) (triage, normalize extraction)
 *         hyppo-collect-list  -> 6 HyppoVisor read tools   (open-search)
 *         hyppo-collect-fetch -> 6 HyppoVisor read tools + Write (fetch)
 *       interact / screenshot / Edit / Bash / any submit/send capability appear in NO agent def.
 *   V.  Every write path is args.dataDir + a relative path. inputs/ is opened read-only and never
 *       copied outside args.dataDir. One provenance line per Raw Record / triage mark / Job Record.
 *
 * Phase A validation is MANUAL — run the quickstart scenarios by hand in a Claude Code session
 * (specs/001-intake-normalize-pipeline/quickstart.md). Automated coverage is Phase B.
 */

export const meta = {
  name: "intake-normalize",
  description:
    "Collect job postings from tracked board searches via HyppoVisor, store them verbatim with provenance, pre-triage each against hard stops + considered directions, and normalize kept postings into comparable Job Records with cross-source dedup. All state is plain files under HYPPO_DATA_DIR. Reads inputs/settings.json (feature 002). No outward-facing actions.",
  phases: [{ title: "collect" }, { title: "triage" }, { title: "normalize" }],
};

/* ------------------------------------------------------------------ *
 * Subagent tool policy (T011 clause a) — Principle IV
 * ------------------------------------------------------------------ *
 * Enforced by the custom subagent definitions in .claude/agents/ (see the guardrail block
 * above). The script names the right `agentType` on every agent() call; it never passes a
 * tool list. The six HyppoVisor read/navigation tools live in hyppo-collect-list.md and
 * hyppo-collect-fetch.md; mcp__hyppovisor-hyppograph__interact is granted nowhere.
 */
const FAST = "haiku"; // Principle II — the only tier this feature uses (T011 clause d)

/* ------------------------------------------------------------------ *
 * agent() JSON schemas (T007) — documented in contracts/schemas.md
 * ------------------------------------------------------------------ */

// Used by the run-precondition bootstrap: read inputs/settings.json and return only what 001 consumes.
const settingsReadSchema = {
  type: "object",
  additionalProperties: false,
  required: ["found", "setupReady", "unresolved", "trackedBoards", "hardStops", "directions"],
  properties: {
    found: { type: "boolean" },
    setupReady: { type: "boolean" },
    unresolved: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["section", "reason"],
        properties: { section: { type: "string" }, reason: { type: "string" } },
      },
    },
    trackedBoards: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "filteredSearch", "depth"],
        properties: {
          name: { type: "string" },
          filteredSearch: { type: "string" },
          depth: { type: ["integer", "number"] },
        },
      },
    },
    hardStops: {
      type: "object",
      additionalProperties: false,
      required: [
        "excludedLocations",
        "lackedClearances",
        "lackedWorkAuth",
        "visaSponsorshipRequired",
      ],
      properties: {
        excludedLocations: { type: "array", items: { type: "string" } },
        lackedClearances: { type: "array", items: { type: "string" } },
        lackedWorkAuth: { type: "array", items: { type: "string" } },
        visaSponsorshipRequired: { type: "boolean" },
      },
    },
    // sections.locations.value.excluded — unioned into the effective excluded-location set
    locationsExcluded: { type: "array", items: { type: "string" } },
    directions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "description"],
        properties: { name: { type: "string" }, description: { type: "string" } },
      },
    },
  },
};

// collect stage — open a filtered board search, return posting refs FROM THE FILTERED RESULT SET.
const collectResultSchema = {
  type: "object",
  additionalProperties: false,
  required: ["opened", "postingRefs"],
  properties: {
    opened: { type: "boolean" }, // false => filtered search could not be opened (PageReadError)
    reason: { type: "string" }, // set when opened === false
    postingRefs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["url"],
        properties: {
          url: { type: "string" }, // canonical posting URL -> RawRecord.id
          listMeta: { type: ["object", "null"] }, // advisory list-level fields (title/company/date)
        },
      },
    },
  },
};

// collect stage — fetch one posting's full readable text and write the Raw Record.
const fetchPostingSchema = {
  type: "object",
  additionalProperties: false,
  required: ["status", "rawRecordPath", "written"],
  properties: {
    status: { enum: ["ok", "unavailable"] },
    finalUrl: { type: "string" },
    rawRecordPath: { type: "string" }, // relative to args.dataDir
    written: { type: "boolean" }, // false => a Raw Record with this id already existed (skipped)
    reason: { type: "string" },
  },
};

// triage stage — one keep/reject mark per Raw Record.
const triageMarkSchema = {
  type: "object",
  additionalProperties: false,
  required: ["decision", "reason", "confidence"],
  properties: {
    decision: { enum: ["kept", "rejected"] },
    reason: { type: "string" }, // one line; required for rejected; for kept names the matched direction
    confidence: { enum: ["normal", "low"] }, // low => defaulted to kept, flagged in the summary
  },
};

// normalize stage — the fixed Job Record field set. Every key present; "unknown" allowed, never inferred.
const jobRecordFieldsSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "roleTitle",
    "normalizedTitle",
    "companyAsStated",
    "locations",
    "locationBucket",
    "workArrangement",
    "salaryAmountOrRange",
    "salaryCurrency",
    "seniority",
    "employmentType",
    "postingDate",
    "originalLanguage",
    "responsibilitiesSummary",
    "requirements",
  ],
  properties: {
    roleTitle: { type: "string" },
    normalizedTitle: { type: "string" }, // lowercased / canonical form used in the key + dedup
    companyAsStated: { type: "string" }, // resolved to canonical form by the workflow (T034)
    locations: { type: "array", items: { type: "string" } }, // may be ["unknown"] — human-readable, verbatim-ish
    locationBucket: { type: "string" }, // COARSE stable dedup key: "remote-<region>" | "<city>" | "unknown"
    workArrangement: { enum: ["remote", "hybrid", "on-site", "unknown"] },
    salaryAmountOrRange: { type: "string" }, // verbatim as stated, or "unknown" — never converted
    salaryCurrency: { type: "string" },
    seniority: { type: "string" },
    employmentType: { type: "string" },
    postingDate: { type: "string" }, // ISO-8601 or "unknown"
    originalLanguage: { type: "string" }, // "en" unless the source posting was another language
    responsibilitiesSummary: { type: "string" }, // prose for the body
    requirements: { type: "array", items: { type: "string" } }, // discrete list items (FR-011)
  },
};

// normalize stage — resolve every observed company name to one canonical form.
const dedupGroupSchema = {
  type: "object",
  additionalProperties: false,
  required: ["groups"],
  properties: {
    groups: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["canonical", "variants"],
        properties: {
          canonical: { type: "string" },
          variants: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

const writtenAckSchema = {
  type: "object",
  additionalProperties: false,
  required: ["written"],
  properties: { written: { type: "boolean" } },
};

/* ================================================================== *
 * Workflow body — the code-only orchestrator (T010). Principle I:
 * this body alone sequences phases + stages. No agent() output below
 * is ever consulted to decide *what runs next*.
 * ================================================================== */

const RUN = args.runTimestamp; // frozen run clock + run id (T001)
const DATA = args.dataDir;
const PACING_MS = args.pacingMs ?? 3000; // FR-006a
const FETCH_CAP = args.fetchCap ?? 300; // FR-006a
const DEFAULT_DEPTH = args.defaultDepth ?? 25;

log("intake-normalize starting", { run: RUN, dataDir: DATA, pacingMs: PACING_MS, fetchCap: FETCH_CAP });

const summary = newRunSummary(RUN);

/* ---- Run precondition (FR-000): load inputs/settings.json ---- */
const settings = await agent(
  [
    "Read the JSON file at this exact path and return ONLY the requested fields:",
    `  ${DATA}/inputs/settings.json`,
    "",
    "If the file is missing or unreadable: found=false, setupReady=false, unresolved=[], and empty",
    "arrays/objects for the rest.",
    "If it parses: set found=true; copy completeness.setupReady -> setupReady and",
    "completeness.unresolved -> unresolved; copy sections.trackedBoards.value -> trackedBoards",
    "(each {name, filteredSearch, depth}); sections.hardStops.value -> hardStops; ",
    "sections.locations.value.excluded -> locationsExcluded; sections.directions.value -> directions",
    "(each {name, description} — ignore materialsPath). Do not infer or fill missing values; if a",
    "section is unset, use an empty array/object and the documented defaults for hardStops",
    "(all lists [], visaSponsorshipRequired false).",
  ].join("\n"),
  { schema: settingsReadSchema, label: "read-settings", model: FAST, agentType: "hyppo-read" }
);

if (!settings.found) {
  log("settings not found — run onboarding (feature 002). Exiting with zero writes.", {
    path: `${DATA}/inputs/settings.json`,
  });
  return { ok: false, reason: "settings-not-found", summary };
}
if (settings.setupReady !== true) {
  log("setup not ready — unresolved required sections. Exiting with zero writes (FR-000).", {
    unresolved: settings.unresolved,
  });
  return { ok: false, reason: "setup-not-ready", unresolved: settings.unresolved, summary };
}

/* ---- Normalise the config into the shapes the stages want ---- */
const sources = (settings.trackedBoards || []).map((b) => {
  const depth = Number(b.depth);
  const badDepth = !Number.isFinite(depth) || depth < 1 || Math.floor(depth) !== depth;
  const emptySearch = !b.filteredSearch || !String(b.filteredSearch).trim();
  return {
    name: b.name || "(unnamed source)",
    filteredSearch: b.filteredSearch,
    depth: badDepth ? DEFAULT_DEPTH : depth,
    configError: emptySearch
      ? "filteredSearch is empty"
      : badDepth
      ? `depth is not a positive integer (${b.depth})`
      : null,
  };
});

const hs = settings.hardStops || {};
const effectiveExcludedLocations = [
  ...foldSet(hs.excludedLocations),
  ...foldSet(settings.locationsExcluded),
];
const criteria = {
  excludedLocations: [...new Set(effectiveExcludedLocations)],
  lackedClearances: [...foldSet(hs.lackedClearances)],
  lackedWorkAuth: [...foldSet(hs.lackedWorkAuth)],
  visaSponsorshipRequired: hs.visaSponsorshipRequired === true,
};
const directions = (settings.directions || []).map((d) => ({
  name: d.name,
  description: d.description,
}));

const hasHardStops =
  criteria.excludedLocations.length ||
  criteria.lackedClearances.length ||
  criteria.lackedWorkAuth.length ||
  criteria.visaSponsorshipRequired;
const noTriageCriteria = !hasHardStops && directions.length === 0; // FR-008d
summary.noTriageCriteria = noTriageCriteria;

const criteriaFingerprint = stableHash(
  JSON.stringify({ criteria, directions: directions.map((d) => d.description).sort() })
);

/* ============================ COLLECT ============================ *
 * Serial `for` loop, not pipeline(): the real pipeline() has no concurrency option, and collect
 * must stay one-source-at-a-time — it drives the user's authenticated HyppoVisor session and paces
 * fetches. (T013/T014/T015/T017)
 */
phase("collect");
{
  // T012 — split usable sources from per-source config errors.
  const usable = [];
  for (const s of sources) {
    if (s.configError) {
      summary.sourcesFailed.push({ source: s.name, reason: `configError: ${s.configError}` });
      log("source skipped — config error", { source: s.name, reason: s.configError });
      continue;
    }
    usable.push(s);
  }

  for (const src of usable) {
    let opened;
    try {
      opened = await agent(
        [
          `Open this user-authored filtered job-board search with the HyppoVisor read tools`,
          `(open_url / navigate, then read_page; wait_for_selector if the list is lazy-loaded):`,
          `  ${src.filteredSearch}`,
          "",
          `Return up to ${src.depth} posting references FROM THE FILTERED RESULT SET ONLY, in the`,
          "board's listed order (newest first where supported). Each ref = the canonical posting URL",
          "plus any list-level metadata the board shows (title/company/date) as listMeta.",
          "Do NOT follow pagination past what is needed for the requested count. Do NOT click,",
          "apply, sign in, or submit anything — read and navigate only.",
          "If the search URL is stale/rejected or the board is unreachable: opened=false with a reason.",
          "Zero results is opened=true with an empty postingRefs array (not a failure).",
        ].join("\n"),
        {
          schema: collectResultSchema,
          label: `open-search:${slug(src.name)}`,
          model: FAST,
          phase: "collect",
          agentType: "hyppo-collect-list",
        }
      );
    } catch (err) {
      summary.sourcesFailed.push({ source: src.name, reason: `openFilteredSearch threw: ${err}` });
      log("source failed — continuing with others (FR-006)", { source: src.name, error: String(err) });
      continue;
    }

    if (!opened.opened) {
      summary.sourcesFailed.push({ source: src.name, reason: opened.reason || "could not open filtered search" });
      log("source failed — filtered search not opened", { source: src.name, reason: opened.reason });
      continue;
    }

    const refs = (opened.postingRefs || []).slice(0, src.depth);
    if (refs.length === 0) {
      log("source returned zero results — continuing (FR-002b)", { source: src.name });
      continue;
    }

    let fetched = 0;
    for (let i = 0; i < refs.length; i++) {
      if (fetched >= FETCH_CAP) {
        log("per-run fetch cap reached — stopping this source", { source: src.name, cap: FETCH_CAP });
        break;
      }
      const ref = refs[i];
      try {
        const res = await agent(
          [
            "Fetch the full readable text of this job posting using the HyppoVisor read tools",
            "(open_url then read_page). Read only — never click apply / sign in / submit.",
            `  ${ref.url}`,
            "",
            "Then WRITE a Raw Record Markdown file. Path (relative to the data dir root):",
            `  outputs/job-records/raw/${slug(ref.url)}.md`,
            `Absolute: ${DATA}/outputs/job-records/raw/${slug(ref.url)}.md`,
            "",
            "FIRST check whether that file already exists. If it does, do not overwrite it —",
            "return written=false (idempotency, FR-008).",
            "",
            "File contents — YAML front-matter then the verbatim body:",
            "---",
            `id: ${JSON.stringify(ref.url)}`,
            `sourceName: ${JSON.stringify(src.name)}`,
            `sourceRef: ${JSON.stringify(ref.url)}`,
            `firstSeenAt: ${JSON.stringify(RUN)}`,
            'retrievalMethod: "mcp-page-read"',
            `run: ${JSON.stringify(RUN)}`,
            "availability: <\"ok\" if the posting loaded, \"unavailable\" if it was delisted/gone>",
            "triage: null",
            "---",
            "<the FULL verbatim posting text, unedited — or an EMPTY body if availability is unavailable>",
            "",
            "Return status ok|unavailable, the finalUrl after redirects, rawRecordPath (the relative",
            "path above), and written (true if you wrote a new file, false if it already existed).",
          ].join("\n"),
          {
            schema: fetchPostingSchema,
            label: `fetch:${slug(ref.url)}`,
            model: FAST,
            phase: "collect",
            agentType: "hyppo-collect-fetch",
          }
        );
        fetched++;
        summary.postingsCollected++;
        if (res.written) {
          summary.newRawRecords++;
          await appendProvenance(DATA, RUN, "collect", {
            what: res.rawRecordPath,
            how: "mcp-page-read",
            why: `collected from ${JSON.stringify(src.name)} (depth ${i + 1}/${src.depth})` +
              (res.status === "unavailable" ? " — unavailable, metadata only" : ""),
          });
        }
      } catch (err) {
        summary.itemsSkipped.push({ ref: ref.url, reason: `fetch threw: ${err}` });
        log("posting fetch failed — skipping this posting", { url: ref.url, error: String(err) });
      }

      // T015 — pacing between fetches (see sleep() note at EOF: no-op in the sandbox).
      if (i < refs.length - 1 && fetched < FETCH_CAP) {
        await sleep(PACING_MS);
      }
    }
  }

  // T016 — ingest the manual drop.
  const manual = await agent(
    [
      `List every file directly under this directory and read each one:`,
      `  ${DATA}/inputs/manual-postings/`,
      "(If the directory does not exist, return an empty results array — that is fine.)",
      "",
      "For each file decide whether it is a real job posting.",
      "  - If it IS a posting: WRITE a Raw Record to",
      `      outputs/job-records/raw/<slug-of-filepath>.md   (absolute: ${DATA}/outputs/job-records/raw/...)`,
      "    with front-matter id=<absolute file path>, sourceName=\"manual\",",
      `    sourceRef=<absolute file path>, firstSeenAt=${JSON.stringify(RUN)},`,
      `    retrievalMethod=\"manual\", run=${JSON.stringify(RUN)}, availability=\"ok\", triage: null,`,
      "    body = the file's verbatim posting text. Skip (written=false) if that Raw Record id already exists.",
      "  - If it is NOT a posting (a note, a resume, a screenshot, an empty file): do not write anything;",
      "    list it under skipped with a short reason.",
      "Never edit or move the source files — read only.",
    ].join("\n"),
    {
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["written", "skipped"],
        properties: {
          written: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["rawRecordPath", "sourceRef", "isNew"],
              properties: {
                rawRecordPath: { type: "string" },
                sourceRef: { type: "string" },
                isNew: { type: "boolean" },
              },
            },
          },
          skipped: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["ref", "reason"],
              properties: { ref: { type: "string" }, reason: { type: "string" } },
            },
          },
        },
      },
      label: "ingest-manual-postings",
      model: FAST,
      phase: "collect",
      agentType: "hyppo-readwrite",
    }
  );

  for (const w of manual.written || []) {
    summary.postingsCollected++;
    if (w.isNew) {
      summary.newRawRecords++;
      await appendProvenance(DATA, RUN, "collect", {
        what: w.rawRecordPath,
        how: "manual",
        why: `ingested from manual drop ${JSON.stringify(w.sourceRef)}`,
      });
    }
  }
  for (const sk of manual.skipped || []) {
    summary.itemsSkipped.push({ ref: sk.ref, reason: sk.reason }); // FR-003
  }

  log("collect complete", {
    postingsCollected: summary.postingsCollected,
    newRawRecords: summary.newRawRecords,
    sourcesFailed: summary.sourcesFailed.length,
    itemsSkipped: summary.itemsSkipped.length,
  });
}

/* ============================ TRIAGE ============================ */
phase("triage");

// Snapshot of the Raw Record archive after collect — index + bodies (Principle V: bodies stay on disk).
const rawIndex = await agent(
  [
    `List every *.md file under this directory and, for each, return its path (relative to the data`,
    `dir root), the front-matter fields id / availability, and the current triage block if present`,
    `(decision, confidence, criteriaHash). Also return the file's body text.`,
    `  ${DATA}/outputs/job-records/raw/`,
    "If the directory is empty or missing, return an empty array.",
  ].join("\n"),
  {
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["records"],
      properties: {
        records: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["path", "id", "availability", "body"],
            properties: {
              path: { type: "string" },
              id: { type: "string" },
              availability: { type: "string" },
              body: { type: "string" },
              triage: {
                type: ["object", "null"],
                additionalProperties: true,
                properties: {
                  decision: { type: "string" },
                  confidence: { type: "string" },
                  criteriaHash: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    label: "index-raw-records",
    model: FAST,
    phase: "triage",
    agentType: "hyppo-read",
  }
);

const rawRecords = rawIndex.records || [];

// Per-record front-matter writes are disjoint, so triage parallelises safely via pipeline().
await pipeline(rawRecords, async (rec) => {
  const thisHash = stableHash(criteriaFingerprint + "\u0000" + (rec.body || ""));

  // T029 — recompute only when the criteria hash differs from the stored one (R6).
  if (rec.triage && rec.triage.criteriaHash === thisHash && rec.triage.decision) {
    if (rec.triage.decision === "kept") summary.triageKept++;
    else summary.triageRejected++;
    if (rec.triage.confidence === "low") summary.triageLowConfidence++;
    rec._decision = rec.triage.decision;
    return;
  }

  let mark;
  if (noTriageCriteria) {
    // T030 — nothing to test against: everything is kept.
    mark = { decision: "kept", reason: "no triage criteria configured", confidence: "normal" };
  } else {
    mark = await agent(
      [
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
        directions.map((d) => `  - ${d.name}: ${d.description}`).join("\n") || "  (none configured)",
        "If there are directions and the posting overlaps NONE of them even loosely, reject with",
        "reason \"no direction overlap\". If there are no directions, do not reject on that basis.",
        "",
        "POSTING TEXT:",
        (rec.body || "").slice(0, 12000),
        "",
        "Return decision, a one-line reason (for kept, name the matched direction or",
        "\"low-confidence default keep\"), and confidence normal|low. If you cannot classify",
        "confidently, return decision=kept, confidence=low.",
      ].join("\n"),
      {
        schema: triageMarkSchema,
        label: `triage:${slug(rec.id)}`,
        model: FAST,
        phase: "triage",
        agentType: "hyppo-judge",
      }
    );
  }

  // T029 — write the mark onto the Raw Record FRONT-MATTER only. Never touch the body.
  await agent(
    [
      `Update ONLY the YAML front-matter of this file — leave the body BYTE-FOR-BYTE unchanged:`,
      `  ${DATA}/${rec.path}`,
      "",
      "Set the `triage:` key to exactly this block:",
      "triage:",
      `  decision: ${JSON.stringify(mark.decision)}`,
      `  reason: ${JSON.stringify(mark.reason)}`,
      `  confidence: ${JSON.stringify(mark.confidence)}`,
      `  criteriaHash: ${JSON.stringify(thisHash)}`,
      `  decidedAt: ${JSON.stringify(RUN)}`,
      "",
      "Read the file, replace the front-matter `triage:` value (it is currently `null` or an older",
      "block), and write it back. Do not reformat or re-order the other front-matter keys.",
    ].join("\n"),
    {
      schema: writtenAckSchema,
      label: `write-triage:${slug(rec.id)}`,
      model: FAST,
      phase: "triage",
      agentType: "hyppo-readwrite",
    }
  );

  rec._decision = mark.decision;
  if (mark.decision === "kept") {
    summary.triageKept++;
    if (mark.confidence === "low") summary.triageLowConfidence++;
  } else {
    summary.triageRejected++;
    bumpReason(summary, mark.reason);
  }
  await appendProvenance(DATA, RUN, "triage", {
    what: rec.path,
    how: "pre-triage",
    why: `${mark.decision} — ${mark.reason}` + (mark.confidence === "low" ? " (low confidence)" : ""),
  });
});

log("triage complete", {
  kept: summary.triageKept,
  rejected: summary.triageRejected,
  lowConfidence: summary.triageLowConfidence,
  noTriageCriteria,
});

/* =========================== NORMALIZE =========================== *
 * Serial `for` loop, not pipeline(): write-job-record merges in place into shared
 * outputs/job-records/<key>.md files, so two kept records with the same dedup key must not run
 * concurrently. At Phase A scale (low hundreds of kept postings) serial is fine. (T020/T031/T036)
 */
phase("normalize");
{
  // T031 — normalize runs over KEPT records only. Rejected records stay archived with their reason.
  const kept = rawRecords.filter((r) => r._decision === "kept");
  if (kept.length === 0) {
    log("no kept records to normalize", {});
  } else {
    // T034 — company canonicalisation. Seed from applications.md + existing Job Records + companies.md.
    const canon = await agent(
      [
        "Build a company-name canonicalisation map. Sources to read (any that exist):",
        `  ${DATA}/inputs/applications.md               (company column / bullets)`,
        `  ${DATA}/outputs/job-records/companies.md     (existing canonical <= variants lines)`,
        `  ${DATA}/outputs/job-records/*.md             (canonicalCompany front-matter of existing Job Records)`,
        "",
        "Plus these newly-observed company names from this run's kept postings:",
        JSON.stringify(
          kept.map((k) => ({ rawPath: k.path, id: k.id })),
          null,
          2
        ),
        "(read each kept Raw Record body to see the company name it states).",
        "",
        "Resolve every observed variant (\"Acme\", \"Acme Inc.\", \"Acme Corporation\") to ONE canonical",
        "form — prefer the shortest clean legal-suffix-free name, and prefer a form already used in",
        "applications.md or an existing Job Record. Then WRITE the merged map back to",
        `  ${DATA}/outputs/job-records/companies.md`,
        "as lines `- <canonical>  <=  <variant>, <variant>, ...`. Return the groups you wrote.",
      ].join("\n"),
      { schema: dedupGroupSchema, label: "canonicalise-companies", model: FAST, phase: "normalize", agentType: "hyppo-readwrite" }
    );

    const canonOf = (name) => {
      const n = String(name || "").trim().toLowerCase();
      for (const g of canon.groups || []) {
        if (g.canonical.toLowerCase() === n) return g.canonical;
        if ((g.variants || []).some((v) => v.toLowerCase() === n)) return g.canonical;
      }
      return String(name || "unknown").trim() || "unknown";
    };

    // T020/T021/T022/T023/T024/T035/T036/T037/T038 — one Job Record per real role, merge in place.
    for (const rec of kept) {
      const fields = await agent(
        [
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
          (rec.body || "").slice(0, 16000),
        ].join("\n"),
        { schema: jobRecordFieldsSchema, label: `normalize:${slug(rec.id)}`, model: FAST, phase: "normalize", agentType: "hyppo-judge" }
      );

      const canonicalCompany = canonOf(fields.companyAsStated);
      const locs = (fields.locations && fields.locations.length ? fields.locations : ["unknown"]).slice();
      // Dedup key uses the COARSE locationBucket, not the free-text locations[] — two boards phrase
      // the same location differently ("Remote (EU)" vs "EU"), which used to split one role into two
      // Job Records. Fall back to the old locations-derived slug only when the bucket is unknown.
      const locKey =
        slug(fields.locationBucket) ||
        [...new Set(locs.map((l) => slug(l)).filter(Boolean))].sort().join("_") ||
        "unknown";
      const key = `${slug(canonicalCompany)}--${slug(fields.normalizedTitle || fields.roleTitle)}--${locKey}`;

      // T023 — completeness: low when >=60% of fixed-field values are "unknown", or a core field is missing.
      const coreVals = [
        fields.roleTitle,
        canonicalCompany,
        fields.locations && fields.locations.join(","),
        fields.workArrangement,
        fields.salaryAmountOrRange,
        fields.salaryCurrency,
        fields.seniority,
        fields.employmentType,
        fields.postingDate,
      ];
      const unknownCount = coreVals.filter(
        (v) => v === undefined || v === null || String(v).toLowerCase() === "unknown" || v === ""
      ).length;
      const requirementsEmpty = !fields.requirements || fields.requirements.length === 0;
      const completeness =
        unknownCount / coreVals.length >= 0.6 ||
        !fields.roleTitle ||
        fields.roleTitle.toLowerCase() === "unknown" ||
        canonicalCompany.toLowerCase() === "unknown" ||
        requirementsEmpty
          ? "low"
          : "ok";

      // Applications link — resolved by the writer against inputs/applications.md (T037).
      const result = await agent(
        [
          "Create OR merge a Job Record. Target file (relative to the data dir root):",
          `  outputs/job-records/${key}.md`,
          `Absolute: ${DATA}/outputs/job-records/${key}.md`,
          "",
          "STEP 1 — read inputs/applications.md (if it exists). If it has an entry whose company",
          `matches ${JSON.stringify(canonicalCompany)} AND whose role matches`,
          `${JSON.stringify(fields.roleTitle)} (loose match), capture a stable ref back to that entry`,
          "=> appliedEntryRef = that ref, alreadyApplied = true. Otherwise appliedEntryRef = null,",
          "alreadyApplied = false.",
          "",
          "STEP 2 — if the target file does NOT exist: create it with this exact front-matter shape",
          "(gray-matter YAML) then the body:",
          "---",
          `key: ${JSON.stringify(key)}`,
          `roleTitle: ${JSON.stringify(fields.roleTitle)}`,
          `normalizedTitle: ${JSON.stringify(fields.normalizedTitle)}`,
          `canonicalCompany: ${JSON.stringify(canonicalCompany)}`,
          `locations: ${JSON.stringify(locs)}`,
          `workArrangement: ${JSON.stringify(fields.workArrangement)}`,
          `salaryAmountOrRange: ${JSON.stringify(fields.salaryAmountOrRange)}`,
          `salaryCurrency: ${JSON.stringify(fields.salaryCurrency)}`,
          `seniority: ${JSON.stringify(fields.seniority)}`,
          `employmentType: ${JSON.stringify(fields.employmentType)}`,
          `postingDate: ${JSON.stringify(fields.postingDate)}`,
          `originalLanguage: ${JSON.stringify(fields.originalLanguage)}`,
          `completeness: ${JSON.stringify(completeness)}`,
          "sources:",
          `  - { sourceName: <from the raw record>, sourceRef: ${JSON.stringify(rec.id)}, rawRecordId: ${JSON.stringify(rec.id)} }`,
          "appliedEntryRef: <null or the ref from step 1>",
          "alreadyApplied: <true/false>",
          "---",
          "",
          "## Responsibilities",
          "",
          fields.responsibilitiesSummary || "unknown",
          "",
          "## Requirements",
          "",
          (fields.requirements || []).map((r) => `- ${r}`).join("\n") || "- unknown",
          "",
          "## Sources",
          "",
          `- [Raw record](./raw/${rec.path.split("/").pop()})`,
          "",
          "STEP 3 — if the target file DOES exist (a duplicate role from another source): do NOT",
          "create a second file. Append this SourceLink to `sources` if its rawRecordId is not",
          `already listed:  - { sourceName: <from the raw record>, sourceRef: ${JSON.stringify(rec.id)}, rawRecordId: ${JSON.stringify(rec.id)} }`,
          "fill any front-matter field whose current value is \"unknown\" from this posting's values",
          "above, but NEVER overwrite an already-stated value with \"unknown\"; add this line under",
          `## Sources if not already there:  - [Raw record](./raw/${rec.path.split("/").pop()})`,
          "Report merged=true.",
          "",
          "Return: created (bool), merged (bool), path (relative), alreadyApplied (bool).",
        ].join("\n"),
        {
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["created", "merged", "path"],
            properties: {
              created: { type: "boolean" },
              merged: { type: "boolean" },
              path: { type: "string" },
              alreadyApplied: { type: "boolean" },
            },
          },
          label: `write-job-record:${key}`,
          model: FAST,
          phase: "normalize",
          agentType: "hyppo-readwrite",
        }
      );

      if (result.created) {
        summary.newJobRecords++;
        await appendProvenance(DATA, RUN, "normalize", {
          what: result.path,
          how: "normalize",
          why: `created from ${rec.path}` + (result.alreadyApplied ? " (already applied)" : ""),
        });
      } else if (result.merged) {
        summary.duplicatesMerged++;
        await appendProvenance(DATA, RUN, "normalize", {
          what: result.path,
          how: "normalize",
          why: `merged source ${rec.path} into existing record`,
        });
      }
    }

    log("normalize complete", {
      newJobRecords: summary.newJobRecords,
      duplicatesMerged: summary.duplicatesMerged,
    });
  }
}

/* ---- T040 — run summary: write outputs/last-run-summary.md and log it ---- */
const rendered = renderSummary(summary);
await agent(
  [
    `Write this exact text to ${DATA}/outputs/last-run-summary.md (overwrite):`,
    "",
    rendered,
  ].join("\n"),
  {
    schema: writtenAckSchema,
    label: "write-run-summary",
    model: FAST,
    agentType: "hyppo-write",
  }
);
log("run summary\n" + rendered, { summary });

return { ok: true, summary };

/* ------------------------------------------------------------------ *
 * Inline helpers (T009) — hoisted function declarations; no imports in the sandbox
 * ------------------------------------------------------------------ */

// Deterministic, dependency-free string hash (FNV-1a, 32-bit) for change-detection only.
function stableHash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return "fnv1a:" + h.toString(16).padStart(8, "0");
}

function slug(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function foldSet(arr) {
  return new Set((arr || []).map((x) => String(x).trim().toLowerCase()).filter(Boolean));
}

// provenance-log.md line — one per Raw Record / triage mark / Job Record (contracts/outputs-format.md).
function provenanceLine(run, { what, how, why }) {
  return `${run}  ${run}  ${what}  ${how}  ${why}`;
}

// RunSummary accumulator — mirrors data-model.md § RunSummary (FR-020).
function newRunSummary(run) {
  return {
    run,
    postingsCollected: 0,
    newRawRecords: 0,
    triageKept: 0,
    triageRejected: 0,
    triageRejectReasons: {}, // { reasonBucket: count }
    triageLowConfidence: 0,
    newJobRecords: 0,
    duplicatesMerged: 0,
    sourcesFailed: [], // { source, reason }
    itemsSkipped: [], // { ref, reason }
    noTriageCriteria: false,
  };
}

function bumpReason(summary, reason) {
  const key = String(reason || "unspecified").split(":")[0].trim().slice(0, 60) || "unspecified";
  summary.triageRejectReasons[key] = (summary.triageRejectReasons[key] || 0) + 1;
}

function renderSummary(s) {
  const lines = [
    `Run ${s.run}`,
    `  postings collected      : ${s.postingsCollected}`,
    `  new raw records         : ${s.newRawRecords}`,
    `  triage kept / rejected  : ${s.triageKept} / ${s.triageRejected}`,
    `  triage low-confidence   : ${s.triageLowConfidence}`,
    `  new job records         : ${s.newJobRecords}`,
    `  duplicates merged       : ${s.duplicatesMerged}`,
  ];
  const rr = Object.entries(s.triageRejectReasons);
  if (rr.length) {
    lines.push("  reject-reason breakdown :");
    for (const [k, v] of rr) lines.push(`      ${k}: ${v}`);
  }
  if (s.sourcesFailed.length) {
    lines.push("  sources failed          :");
    for (const f of s.sourcesFailed) lines.push(`      ${f.source} — ${f.reason}`);
  }
  if (s.itemsSkipped.length) {
    lines.push("  items skipped           :");
    for (const it of s.itemsSkipped) lines.push(`      ${it.ref} — ${it.reason}`);
  }
  if (s.noTriageCriteria) {
    lines.push("  NOTE: no triage criteria configured — every posting kept by default (FR-008d)");
  }
  return lines.join("\n");
}

/* appendProvenance — one line, append-only, to provenance-log.md (Principle V).
 * `phaseName` only steers the /workflows progress grouping. */
async function appendProvenance(dataDir, run, phaseName, entry) {
  const line = provenanceLine(run, entry);
  await agent(
    [
      `APPEND exactly one line (create the file if missing) to:`,
      `  ${dataDir}/provenance-log.md`,
      "Line to append (do not modify existing lines, do not add a trailing blank line):",
      line,
    ].join("\n"),
    {
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["appended"],
        properties: { appended: { type: "boolean" } },
      },
      label: "provenance",
      model: FAST,
      phase: phaseName,
      agentType: "hyppo-readwrite",
    }
  );
}

/* sleep — Phase A: the workflow sandbox exposes NO timer primitive. The documented globals are
 * agent / pipeline / parallel / phase / log only; there is no wait/sleep/setTimeout, and Date.now()
 * throws (frozen clock). Pacing between fetches therefore relies entirely on serial collect
 * (one source at a time, one fetch at a time) + natural agent latency. args.pacingMs / HYPPO_PACING_MS
 * is kept wired for Phase B (the plain-TS CLI) and is a documented no-op here — recorded in the
 * Phase A exit review (T047). */
async function sleep(_ms) {
  return undefined;
}
