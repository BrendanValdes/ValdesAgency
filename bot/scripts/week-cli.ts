// Gate 6 week generation CLI — headless run for Phase E verification.
// ============================================================================
// Runs a full week generation without Discord, prints a summary of each
// post's pass/fail status and the first 80 chars of each variant.
//
// Usage:
//   STATE_DIR=$(mktemp -d) npx tsx scripts/week-cli.ts [--brand valdes] [--start 2026-06-16]
//   --dry-run  Skip Anthropic API calls, use stub text (offline check only)
// ============================================================================

import { initStateStore } from "../src/services/state.js";
import { initWeekStateStore } from "../src/services/week-state.js";
import { WEEK_GRID, allocateWeekClusters, generateWeek } from "../src/features/week-content.js";
import { getBrand } from "../src/services/brand-config.js";
import { loadPoolDiagnoses } from "../src/services/content-sources.js";

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

function argVal(flag: string, fallback: string): string {
  const i = args.indexOf(flag);
  return i !== -1 ? (args[i + 1] ?? fallback) : fallback;
}

const brandKey = argVal("--brand", "valdes");

// Default startDate = next Monday from today (LA)
function nextMonday(): string {
  const now = new Date();
  const day = new Date(
    now.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }) + "T12:00:00Z",
  );
  const weekday = day.getUTCDay(); // 0=Sun
  const daysUntilMon = weekday === 0 ? 1 : (8 - weekday) % 7 || 7;
  const mon = new Date(day.getTime());
  mon.setUTCDate(mon.getUTCDate() + daysUntilMon);
  return mon.toISOString().slice(0, 10);
}

const startDate = argVal("--start", nextMonday());
const dryRun = args.includes("--dry-run");

// ---------------------------------------------------------------------------
// Pre-flight: show seed allocation plan
// ---------------------------------------------------------------------------

await initStateStore();
await initWeekStateStore();

const brand = await getBrand(brandKey);
if (!brand) { console.error(`brand ${brandKey} not found`); process.exit(1); }
const seeds = await loadPoolDiagnoses(brand);
console.log(`\nWeek CLI — ${brandKey} · start ${startDate}`);
console.log(`Seeds available: ${seeds.length} diagnoses from ${[...new Set(seeds.map(s => s.city))].length} cities`);
console.log(`Days to generate: ${WEEK_GRID.length} (Mon–Sat, Sun excluded)`);
console.log(`Seeds per day: 4 (total needed: ${WEEK_GRID.length * 4}${seeds.length < WEEK_GRID.length * 4 ? " — will wrap" : ""})`);

if (dryRun) {
  // Dry-run: validate seed allocation and parser without hitting Anthropic.
  console.log("\n[DRY RUN] Checking seed allocation only — skipping Anthropic calls.\n");
  const clusters = allocateWeekClusters(seeds, WEEK_GRID.length, 4);
  for (let d = 0; d < WEEK_GRID.length; d++) {
    const slot = WEEK_GRID[d]!;
    const cluster = clusters[d]!;
    const cities = [...new Set(cluster.map(s => s.city))].join(", ");
    console.log(`  Day ${d + 1} (${slot.weekday}): ${cluster.length} seeds from [${cities}]`);
  }
  console.log("\nSeed allocation OK. Run without --dry-run to generate real content.");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Full generation run
// ---------------------------------------------------------------------------

console.log("\nGenerating… (this makes Anthropic API calls, ~30–90 seconds)");
const result = await generateWeek({ brandKey, startDate });

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log(`\n━━━ RESULTS — week ${result.weekId} ━━━`);
console.log(`Pass rate: ${Math.round(result.passRate * 100)}% (${result.posts.filter(p => p.passed).length}/${result.posts.length})`);
if (result.seedReuse) console.log("⚠️  Seed pool shallower than 24 — some diagnoses reused across days");

const PLATFORMS = ["linkedin", "instagram", "facebook"] as const;

for (const slot of WEEK_GRID) {
  console.log(`\n── ${slot.weekday.toUpperCase()} (${slot.theme}) ──`);
  for (const platform of PLATFORMS) {
    const post = result.posts.find(p => p.weekday === slot.weekday && p.platform === platform);
    if (!post) { console.log(`  ${platform}: MISSING`); continue; }
    const flag = post.passed ? "✅" : `🚩 (${post.failures.map(f => f.check).join(", ")})`;
    const preview = post.body.slice(0, 80).replace(/\n/g, " ");
    const headlinePreview = post.headline.slice(0, 60);
    console.log(`  ${flag} [${platform}] attempts=${post.attempts}`);
    console.log(`       HEADLINE: ${headlinePreview}`);
    console.log(`       BODY:     ${preview}…`);
  }
}

const failed = result.posts.filter(p => !p.passed);
if (failed.length > 0) {
  console.log(`\n━━━ FLAGGED (${failed.length}) ━━━`);
  for (const p of failed) {
    console.log(`  ${p.id}: ${p.failures.map(f => `[${f.check}] ${f.detail}`).join("; ")}`);
  }
}

console.log("\nDone. Review the output above, then run with --brand + --start to generate real posts.");
