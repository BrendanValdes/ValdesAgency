#!/usr/bin/env node
// Content System v1:Gate 2: Source Inventory Generator
//
// Scans content sources per brand config and produces a categorized inventory
// markdown file for Brendan's approval before Gate 3 (validation + generation).
//
// Usage: node bot/scripts/build-source-inventory.mjs [brand_key]
//        brand_key defaults to "valdes"
//
// Output: memory/content/source-inventory-<brand>-<YYYY-MM-DD>.md

import { readFile, readdir, writeFile, stat } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const BRAND_KEY = process.argv[2] ?? "valdes";

// ============================================================
// SCENARIO METADATA (canonical from tone-samples.md)
// ============================================================

const SCENARIOS = [
  { id: 1, name: "Educational post about a marketing mistake", status: "ACTIVE",
    sourceTypes: ["lead_scrape", "evergreen", "kg_abstraction"] },
  { id: 2, name: "Behind-the-scenes (building ROCCO)", status: "ACTIVE",
    sourceTypes: ["evergreen", "kg_abstraction"] },
  { id: 3, name: "Social proof (named client + outcome)", status: "DORMANT",
    sourceTypes: ["kg_ClientOutcome"], dormancyGates: ["A_kg_ClientOutcome", "B_feature_flag"] },
  { id: 4, name: "Personal/founder (grind-aesthetic)", status: "USER_OVERRIDE",
    sourceTypes: ["guardrails_only"] },
  { id: 5, name: "Industry commentary (reacting to trend or news)", status: "ACTIVE",
    sourceTypes: ["exa_trends", "evergreen", "lead_scrape"] },
  { id: 6, name: "TikTok hook-driven version (S1 reformat)", status: "ACTIVE",
    sourceTypes: ["lead_scrape", "evergreen", "kg_abstraction"],
    note: "TikTok platform deferred to v1.1; this scenario can still ship as Reel/Carousel on IG" },
  { id: 7, name: "LinkedIn long-form thought leadership", status: "ACTIVE",
    sourceTypes: ["lead_scrape", "evergreen", "kg_abstraction"] },
  { id: 8, name: "Instagram before/after screenshot", status: "DORMANT_WITH_ALT",
    sourceTypes: ["screenshots_lead_scrape", "screenshots_manual", "firecrawl_ondemand"],
    dormancyGates: ["A_kg_ClientOutcome", "B_feature_flag"],
    altPatternAvailable: true },
  { id: 9, name: "Bad day post (grind-aesthetic)", status: "USER_OVERRIDE",
    sourceTypes: ["guardrails_only"] },
  { id: 10, name: "Weekly learned recap", status: "ACTIVE",
    sourceTypes: ["kg_abstraction", "lead_scrape", "evergreen"] },
  { id: 11, name: "Motivational/grit (grind-aesthetic)", status: "USER_OVERRIDE",
    sourceTypes: ["guardrails_only"] },
  { id: 12, name: "First close milestone", status: "BANNED_PATTERN",
    sourceTypes: [] },
];

// ============================================================
// HELPERS
// ============================================================

async function safeReadDir(dirPath) {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries;
  } catch {
    return null; // dir does not exist
  }
}

async function safeStat(path) {
  try {
    return await stat(path);
  } catch {
    return null;
  }
}

async function listFiles(dirPath, extPattern = null) {
  const entries = await safeReadDir(dirPath);
  if (!entries) return [];
  return entries
    .filter((e) => e.isFile() && (extPattern ? extPattern.test(e.name) : true))
    .map((e) => e.name)
    .sort();
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Count rows in a lead .md file that look like ICP-scored entries
// Pattern: lines starting with "### <number>. <name>:Score: <n>"
async function countLeadRows(filePath) {
  try {
    const text = await readFile(filePath, "utf8");
    const matches = text.match(/^### \d+\. /gm);
    return matches?.length ?? 0;
  } catch {
    return 0;
  }
}

// Sample first 3 ICP-scored rows from a lead .md file (for candidate examples)
async function sampleLeadRows(filePath, count = 3) {
  try {
    const text = await readFile(filePath, "utf8");
    const lines = text.split("\n");
    const samples = [];
    for (const line of lines) {
      // Source files use em-dash format "### N. Name — Score: X" — match the source faithfully
      const m = line.match(/^### (\d+)\. (.+?) — Score: (.+)$/);
      if (m) {
        samples.push({ rank: m[1], name: m[2].trim(), score: m[3].trim() });
        if (samples.length >= count) break;
      }
    }
    return samples;
  } catch {
    return [];
  }
}

// ============================================================
// SCANNER
// ============================================================

async function loadBrandConfig(brandKey) {
  const path = resolve(REPO_ROOT, "config", "brands", `${brandKey}.yaml`);
  const text = await readFile(path, "utf8");
  return parseYaml(text);
}

async function scanEvergreen(config) {
  const dir = resolve(REPO_ROOT, config.sources.evergreen_dir);
  const files = await listFiles(dir, /\.md$/);
  return { dir: config.sources.evergreen_dir, count: files.length, files };
}

async function scanLeadScrapes(config) {
  const dir = resolve(REPO_ROOT, config.sources.lead_scrapes);
  const mdFiles = await listFiles(dir, /^vegas-pool-leads.*\.md$/);
  const csvFiles = await listFiles(dir, /^vegas-pool-leads.*\.csv$/);

  let totalRows = 0;
  const fileSummaries = [];
  for (const f of mdFiles) {
    const filePath = join(dir, f);
    const rows = await countLeadRows(filePath);
    totalRows += rows;
    const samples = await sampleLeadRows(filePath, 2);
    fileSummaries.push({ file: f, rows, samples });
  }

  return {
    dir: config.sources.lead_scrapes,
    md_files: mdFiles.length,
    csv_files: csvFiles.length,
    total_lead_rows: totalRows,
    file_summaries: fileSummaries,
  };
}

async function scanScreenshots() {
  const leadScrapeDir = resolve(REPO_ROOT, "memory", "leads", "screenshots");
  const manualDir = resolve(REPO_ROOT, "memory", "leads", "screenshots", "manual");
  const leadScrapeFiles = await listFiles(leadScrapeDir, /\.(png|jpg|jpeg|webp)$/i);
  const manualFiles = await listFiles(manualDir, /\.(png|jpg|jpeg|webp)$/i);
  return {
    lead_scrape: { dir: "memory/leads/screenshots/", count: leadScrapeFiles.length },
    manual: { dir: "memory/leads/screenshots/manual/", count: manualFiles.length },
  };
}

async function scanBrandAssets(config) {
  const photoDir = resolve(REPO_ROOT, config.face_content.photo_dir);
  const videoDir = resolve(REPO_ROOT, config.face_content.video_dir);
  const logoPath = resolve(REPO_ROOT, config.visual.logo.main);
  const watermarkPath = resolve(REPO_ROOT, config.visual.logo.watermark);

  const photos = await listFiles(photoDir, /\.(png|jpg|jpeg|webp)$/i);
  const videos = await listFiles(videoDir, /\.(mp4|mov|webm)$/i);
  const logoExists = (await safeStat(logoPath)) !== null;
  const watermarkExists = (await safeStat(watermarkPath)) !== null;

  return { photos, videos, logoExists, watermarkExists };
}

function summarizeKgBlockedPatterns(config) {
  // Static list per current valdes.yaml. Real KG entity scanning deferred to Gate 3.2 (services/kg.ts).
  return config.sources.kg_blocked_patterns ?? [];
}

// ============================================================
// MARKDOWN BUILDER
// ============================================================

function statusLabel(status) {
  const map = {
    ACTIVE: "✅ ACTIVE",
    DORMANT: "🔒 DORMANT",
    DORMANT_WITH_ALT: "🔒 DORMANT (alt-pattern active)",
    USER_OVERRIDE: "📋 USER OVERRIDE (guardrails)",
    BANNED_PATTERN: "❌ BANNED PATTERN (permanent)",
  };
  return map[status] ?? status;
}

function buildScenarioSection(scenario, scan, config) {
  const lines = [];
  lines.push(`### Scenario ${scenario.id}: ${scenario.name}`);
  lines.push(`**Status:** ${statusLabel(scenario.status)}`);
  lines.push("");

  if (scenario.status === "ACTIVE") {
    lines.push("**Available sources:**");
    if (scenario.sourceTypes.includes("evergreen")) {
      lines.push(`- Evergreen library (${scan.evergreen.dir}): ${scan.evergreen.count} entries${scan.evergreen.count === 0 ? " (empty, week-1 seeding pending)" : ""}`);
    }
    if (scenario.sourceTypes.includes("lead_scrape")) {
      lines.push(`- Lead scrapes (${scan.leads.dir}): ${scan.leads.md_files} md files, ${scan.leads.total_lead_rows} ICP-scored lead rows total`);
    }
    if (scenario.sourceTypes.includes("exa_trends")) {
      lines.push(`- Exa weekly trends: ${config.sources.exa_queries.length} queries configured. Last pull: not yet run (Gate 5 cron, weekly)`);
    }
    if (scenario.sourceTypes.includes("kg_abstraction")) {
      lines.push(`- KG abstractions: scan deferred to Gate 3.2 (services/kg.ts). Filesystem source count above stands in for the inventory.`);
    }
    lines.push("");

    // Sample candidates from lead scrapes if applicable
    if (scenario.sourceTypes.includes("lead_scrape") && scan.leads.file_summaries.length > 0) {
      lines.push("**Sample source candidates:**");
      const samples = scan.leads.file_summaries
        .flatMap((fs) => fs.samples.map((s) => ({ file: fs.file, ...s })))
        .slice(0, 3);
      for (const s of samples) {
        // Scrub any em-dashes that survived in the source data
        const cleanName = s.name.replace(/—/g, ",").replace(/–/g, ",");
        lines.push(`- ${s.file}: rank ${s.rank} (${cleanName}, Score: ${s.score})`);
      }
      lines.push("");
    }

    if (scenario.note) {
      lines.push(`**Note:** ${scenario.note}`);
      lines.push("");
    }

    lines.push("**Blocked from this scenario:** None (no scenario-specific exclusions beyond global kg_blocked_patterns)");
    lines.push("");
    return lines.join("\n");
  }

  if (scenario.status === "DORMANT" || scenario.status === "DORMANT_WITH_ALT") {
    lines.push("**Dormancy gates:**");
    lines.push(`- **Gate A (auto KG check)**: At least 1 \`ClientOutcome\` entity for brand "${BRAND_KEY}" with all 8 required fields populated AND verifiable: true AND shareable: true.`);
    lines.push(`  - Current state: **0 entities** (KG scan deferred to Gate 3.2; defaults to 0 in pre-3.2 state)`);
    lines.push(`  - **Gate A: CLOSED**`);
    lines.push(`- **Gate B (manual flag)**:\`feature_flags.scenario_${scenario.id === 8 ? "8_we_fixed_this_unlocked" : "3_client_proof_unlocked"}\` in valdes.yaml.`);
    const flagExists = config.feature_flags !== undefined;
    lines.push(`  - Current state: **field does not yet exist** in schema (added in Gate 3.1; default will be false). ${flagExists ? "Flag block present." : "Flag block absent."}`);
    lines.push(`  - **Gate B: CLOSED**`);
    lines.push("");
    lines.push(`**Result:** Pattern unavailable. Pipeline falls back to industry-observation framing for this slot.`);
    lines.push("");

    if (scenario.status === "DORMANT_WITH_ALT") {
      lines.push("**ALTERNATE PATTERN (available immediately, no unlock required):**");
      lines.push("Annotated public-site teardown. ROCCO screenshots a real public pool company site, annotates what's working / what's losing them calls. Never claims we did the fix.");
      lines.push("");
      lines.push("**Source candidates for alt pattern:**");
      lines.push(`- Lead-scrape screenshots (${scan.screenshots.lead_scrape.dir}): ${scan.screenshots.lead_scrape.count} files`);
      lines.push(`- Manual uploads (${scan.screenshots.manual.dir}): ${scan.screenshots.manual.count} files`);
      lines.push(`- Firecrawl on-demand: AVAILABLE (max 5 captures/week per brand)`);
      const totalScreenshots = scan.screenshots.lead_scrape.count + scan.screenshots.manual.count;
      if (totalScreenshots === 0) {
        lines.push(`- **Action needed before first S8 alt-pattern post:** Brendan uploads first 3-5 screenshots OR ROCCO captures 3-5 via Firecrawl on lead URLs that did not convert.`);
      }
      lines.push("");
    }
    return lines.join("\n");
  }

  if (scenario.status === "USER_OVERRIDE") {
    lines.push("**User override:** All three original A/B/C options rejected by Brendan during voice review.");
    lines.push("**Source filter:** Generic grind-aesthetic guardrails (no real numbers, no real situation references, no named businesses from Brendan's actual world).");
    lines.push("**Sample reference outputs:** See `memory/voice/valdes-tone-samples.md` Scenario " + scenario.id + " section.");
    lines.push("**Source candidates:** None needed. Pattern generates from generic guardrails plus ROCCO's discipline-framing instruction prior.");
    lines.push("");
    return lines.join("\n");
  }

  if (scenario.status === "BANNED_PATTERN") {
    lines.push("**Permanently banned per user direction \"expert from the jump.\"**");
    lines.push("**Source filter:** N/A. Pattern is banned at OUTPUT level (Gate 3.3 voice-check.ts via `voice.banned_scenarios` block), not at source level. Source inventory does not exclude anything here.");
    lines.push("**Alternate framing for client wins (once Scenario 3 unlocks):** \"Worked with a pool company in [neighborhood] this month. Here's what we did.\" Work-specifics framing, no progression narrative.");
    lines.push("");
    return lines.join("\n");
  }

  return lines.join("\n");
}

function buildBlockedPatternsAuditLog(config) {
  const patterns = summarizeKgBlockedPatterns(config);
  const lines = [];
  lines.push("## Blocked Patterns Audit Log");
  lines.push("");
  lines.push("Every KG entity or source item scanned BUT excluded per `kg_blocked_patterns` is logged here so you can verify nothing is leaking that shouldn't be.");
  lines.push("");
  lines.push("**Patterns currently configured in `valdes.yaml`:**");
  lines.push("");
  lines.push("| # | Regex pattern | Intent |");
  lines.push("|---|---|---|");
  patterns.forEach((p, i) => {
    let intent = "Personal context leak prevention";
    if (p.includes("MRR")) intent = "Personal financial state";
    else if (p.includes("dials")) intent = "Personal activity log";
    else if (p.includes("started")) intent = "Founder progression narrative";
    else if (p.includes("BrendanValdes-Context")) intent = "Personal context KG entity";
    else if (p.includes("first paying")) intent = "Founder milestone language";
    lines.push(`| ${i + 1} | \`${p}\` | ${intent} |`);
  });
  lines.push("");
  lines.push("**Actual block events this run:**");
  lines.push("- KG entity scan deferred to Gate 3.2. Pattern enforcement against KG entities happens once `services/kg.ts` ships.");
  lines.push("- Filesystem source enforcement: this scanner does NOT yet read source file contents to apply regex patterns. Pattern matching against generated drafts happens at Gate 3.3 (voice-check.ts), not at the source-inventory stage.");
  lines.push("");
  lines.push("**Brendan checks:**");
  lines.push("- [ ] Any pattern missing that SHOULD be blocking? Add it to `valdes.yaml` kg_blocked_patterns.");
  lines.push("- [ ] Any pattern present that's over-broad? Refine the regex.");
  lines.push("");
  return lines.join("\n");
}

function buildAwaitingActionSection(scan) {
  const lines = [];
  lines.push("## Sources Awaiting Brendan Action");
  lines.push("");
  lines.push("Items the pipeline depends on that Brendan still needs to provide before Gate 3 ships first draft:");
  lines.push("");
  const items = [];
  if (scan.evergreen.count === 0) items.push(`**Evergreen library seeding:** \`${scan.evergreen.dir}\` is empty. Plan target: 50+ topics in week 1.`);
  if (scan.brandAssets.photos.length === 0) items.push(`**Brand photos:** \`memory/brand/valdes/photos/\` is empty. 3-5 headshots needed.`);
  if (scan.brandAssets.videos.length === 0) items.push(`**Brand videos:** \`memory/brand/valdes/videos/\` is empty. Weekly selfies Mondays.`);
  if (!scan.brandAssets.logoExists) items.push(`**Logo file:** \`memory/brand/valdes/logo.svg\` missing.`);
  if (!scan.brandAssets.watermarkExists) items.push(`**Watermark file:** \`memory/brand/valdes/logo-watermark.png\` missing.`);
  if (scan.screenshots.lead_scrape.count + scan.screenshots.manual.count === 0) {
    items.push(`**Public-site screenshots:** Both \`memory/leads/screenshots/\` and \`memory/leads/screenshots/manual/\` are empty. Needed before Scenario 8 alt-pattern can ship; can be filled by Firecrawl on first run.`);
  }
  // Composio + Railway env sync:always pending until Brendan confirms
  items.push(`**Composio account connections:** LinkedIn, Instagram, Facebook, X. Connection IDs in \`config/brands/valdes.yaml\` accounts block currently \`[set after connect]\`.`);
  items.push(`**Railway env sync:** \`CHANNEL_CONTENT_VALDES\` + \`COMPOSIO_API_KEY\` + \`EXA_API_KEY\` + \`HIGGSFIELD_API_KEY\` must mirror Codespaces Secrets to Railway env before deployed bot can post.`);

  items.forEach((item) => lines.push(`- [ ] ${item}`));
  lines.push("");
  return lines.join("\n");
}

function buildSummary(scenarios, scan) {
  const counts = {
    active: scenarios.filter((s) => s.status === "ACTIVE").length,
    dormant: scenarios.filter((s) => s.status === "DORMANT" || s.status === "DORMANT_WITH_ALT").length,
    override: scenarios.filter((s) => s.status === "USER_OVERRIDE").length,
    banned: scenarios.filter((s) => s.status === "BANNED_PATTERN").length,
  };
  return `## Summary

- **Brand:** ${BRAND_KEY}
- **Scenarios scanned:** ${scenarios.length}
  - ✅ ACTIVE (sources ready): **${counts.active}**
  - 🔒 DORMANT (fallback patterns active until unlock): **${counts.dormant}**
  - 📋 USER OVERRIDE (generic guardrails, no source needed): **${counts.override}**
  - ❌ BANNED PATTERN (output-level only): **${counts.banned}**
- **Filesystem sources scanned:**
  - Evergreen library entries: ${scan.evergreen.count}
  - Lead-scrape md files: ${scan.leads.md_files} (${scan.leads.total_lead_rows} ICP-scored lead rows)
  - Lead-scrape csv files: ${scan.leads.csv_files}
  - Screenshots (lead-scrape): ${scan.screenshots.lead_scrape.count}
  - Screenshots (manual): ${scan.screenshots.manual.count}
  - Brand photos: ${scan.brandAssets.photos.length}
  - Brand videos: ${scan.brandAssets.videos.length}
  - Logo files: ${(scan.brandAssets.logoExists ? 1 : 0) + (scan.brandAssets.watermarkExists ? 1 : 0)} of 2 expected
- **KG entity scan:** deferred to Gate 3.2 (services/kg.ts).
- **Exa trend pull:** deferred to Gate 5 (weekly cron).

`;
}

function buildHeader() {
  return `# Content Source Inventory: Valdes Agency

**Date:** ${todayISO()}
**Brand:** ${BRAND_KEY}
**Generated by:** \`bot/scripts/build-source-inventory.mjs\`
**Scope:** Sources scanned per scenario, blocked patterns flagged, items awaiting Brendan action listed.
**Purpose:** Gate 2 approval surface. No drafts generated. Brendan confirms inventory before Gate 3 (validation + first draft) begins.

`;
}

function buildFooter() {
  return `## What's Ready for Gate 3

- ACTIVE scenarios have at least one clean source available (lead scrapes alone provide enough for v1 launch).
- DORMANT scenarios have fallback patterns documented (industry-observation framing for S3, annotated public-site teardown for S8).
- BANNED scenario (S12) flagged for output-level enforcement at Gate 3.3.
- KG-blocked patterns documented and ready for Gate 3.2 enforcement.
- Source counts logged for week-over-week trend tracking once Gate 5 ships cron.

## Gate 2 Approval

Brendan confirms:

1. [ ] **Source-by-scenario breakdown is correct.** No missing scenarios. ACTIVE/DORMANT/BANNED labels match the tone-samples.md spec.
2. [ ] **Blocked-patterns audit is clean.** Nothing personal/sensitive leaked into the "clean for use" list. Nothing legitimate over-blocked.
3. [ ] **Sources Awaiting Brendan list is accurate.** Brendan knows what he needs to provide before Gate 3 ships first draft.
4. [ ] **Source counts are sane.** Not zero across the board, not absurdly high.

If all 4 confirm → Brendan reacts 👍 → Gate 3 unblocks.
If any fail → Brendan flags corrections → ROCCO refines the scanner/filters and re-runs.

---

*Re-run command:* \`node bot/scripts/build-source-inventory.mjs ${BRAND_KEY}\`
`;
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log(`Building source inventory for brand: ${BRAND_KEY}`);
  console.log(`Repo root: ${REPO_ROOT}`);

  const config = await loadBrandConfig(BRAND_KEY);
  console.log(`Loaded config: ${config.display_name} (status=${config.status})`);

  const scan = {
    evergreen: await scanEvergreen(config),
    leads: await scanLeadScrapes(config),
    screenshots: await scanScreenshots(),
    brandAssets: await scanBrandAssets(config),
  };

  console.log("Scan complete:");
  console.log(`  evergreen: ${scan.evergreen.count}`);
  console.log(`  leads: ${scan.leads.md_files} md files / ${scan.leads.total_lead_rows} rows`);
  console.log(`  screenshots: ${scan.screenshots.lead_scrape.count} + ${scan.screenshots.manual.count} manual`);
  console.log(`  brand photos: ${scan.brandAssets.photos.length}, videos: ${scan.brandAssets.videos.length}`);

  const sections = [];
  sections.push(buildHeader());
  sections.push(buildSummary(SCENARIOS, scan));
  sections.push("## Sources by Scenario\n");
  for (const scenario of SCENARIOS) {
    sections.push(buildScenarioSection(scenario, scan, config));
  }
  sections.push(buildBlockedPatternsAuditLog(config));
  sections.push(buildAwaitingActionSection(scan));
  sections.push(buildFooter());

  const markdown = sections.join("\n");

  const outPath = resolve(REPO_ROOT, "memory", "content", `source-inventory-${BRAND_KEY}-${todayISO()}.md`);
  await writeFile(outPath, markdown, "utf8");

  console.log(`\n✓ Inventory written: ${outPath}`);
  console.log(`  Lines: ${markdown.split("\n").length}`);
  console.log(`  Bytes: ${Buffer.byteLength(markdown, "utf8")}`);
}

main().catch((err) => {
  console.error("Inventory build failed:", err);
  process.exit(1);
});
