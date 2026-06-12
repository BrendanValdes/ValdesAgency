// Gate 6 week generation engine.
// ============================================================================
// Produces 18 WeekPost drafts for a full weekly cycle (6 days × 3 platforms,
// Sunday excluded per weekly_pattern.sunday: no_originals).
//
// One Anthropic call per day emits all 3 platform variants in a single
// delimiter-structured response. Each variant then runs the existing ROCCO
// voice pipeline independently (stripScaffolding → stripDashes →
// validateDraft → checkContentSanity → leak guard). A failed variant gets a
// single repair call with its passing siblings as context ("don't copy their
// sentences") — max 2 repairs per variant.
//
// Days are generated sequentially; each day's prompt contains one-line
// anti-repetition summaries of prior days so the model can't recycle angles.
// ============================================================================

import { randomBytes } from "node:crypto";
import { env } from "../env.js";
import { log } from "../logger.js";
import { buildContentSystemPrompt, chat } from "../services/anthropic.js";
import type { BrandConfig } from "../services/brand-config.js";
import { getBrand } from "../services/brand-config.js";
import type { DiagnosisSeed } from "../services/content-sources.js";
import { loadPoolDiagnoses } from "../services/content-sources.js";
import type { DraftSeed } from "../services/state.js";
import { isBlockedByPatterns } from "../services/kg.js";
import {
  checkContentSanity,
  stripDashes,
  stripScaffolding,
  validateDraft,
} from "../services/voice-check.js";
import type { WeekPost, WeekPlan } from "../services/week-state.js";
import { mutateWeekState } from "../services/week-state.js";

// ---------------------------------------------------------------------------
// Day × Platform grid (v1 — constant, not config)
// ---------------------------------------------------------------------------

type DaySlot = {
  weekday: string; // "monday" … "saturday"
  theme: string;
  /** Base scenario for the tone prompt (1=educational, 7=long-form framework). */
  scenarioId: number;
  wordLimits: {
    linkedin: [number, number];
    instagram: [number, number];
    facebook: [number, number];
  };
  cardTemplate: "framework" | "statement" | "roundup";
};

export const WEEK_GRID: DaySlot[] = [
  {
    weekday: "monday",
    theme: "framework",
    scenarioId: 7,
    wordLimits: { linkedin: [350, 500], instagram: [100, 140], facebook: [150, 220] },
    cardTemplate: "framework",
  },
  {
    weekday: "tuesday",
    theme: "tip_or_observation",
    scenarioId: 1,
    wordLimits: { linkedin: [120, 180], instagram: [60, 110], facebook: [100, 160] },
    cardTemplate: "statement",
  },
  {
    weekday: "wednesday",
    theme: "tip_or_observation",
    scenarioId: 1,
    wordLimits: { linkedin: [120, 180], instagram: [60, 110], facebook: [100, 160] },
    cardTemplate: "statement",
  },
  {
    weekday: "thursday",
    theme: "tip_or_observation",
    scenarioId: 1,
    wordLimits: { linkedin: [120, 180], instagram: [60, 110], facebook: [100, 160] },
    cardTemplate: "statement",
  },
  {
    weekday: "friday",
    theme: "weekly_roundup",
    scenarioId: 7,
    wordLimits: { linkedin: [250, 400], instagram: [80, 120], facebook: [120, 200] },
    cardTemplate: "roundup",
  },
  {
    weekday: "saturday",
    theme: "lighter_or_grind",
    scenarioId: 1,
    wordLimits: { linkedin: [100, 160], instagram: [60, 100], facebook: [80, 150] },
    cardTemplate: "roundup",
  },
];

// Platforms in the grid. Matches the PostPlatform union.
const GRID_PLATFORMS: Array<"linkedin" | "instagram" | "facebook"> = [
  "linkedin",
  "instagram",
  "facebook",
];

// ---------------------------------------------------------------------------
// Seed allocation: 4 consecutive seeds per day from a round-robin queue.
// "Disjoint by construction" — no day sees the same seed twice.
// ---------------------------------------------------------------------------

export function allocateWeekClusters(
  seeds: DiagnosisSeed[],
  dayCount: number,
  seedsPerDay = 4,
): DraftSeed[][] {
  // Build a city-interleaved queue: round-robin across city buckets once, then
  // repeat. Gives diversity per-cluster even with a small total pool.
  const byCity = new Map<string, DiagnosisSeed[]>();
  for (const s of seeds) {
    if (!byCity.has(s.city)) byCity.set(s.city, []);
    byCity.get(s.city)!.push(s);
  }
  const queue: DraftSeed[] = [];
  let i = 0;
  const cityQueues = [...byCity.values()];
  while (queue.length < dayCount * seedsPerDay && cityQueues.some((q) => q.length > 0)) {
    const bucket = cityQueues[i % cityQueues.length];
    if (!bucket) { i++; continue; }
    const item = bucket.shift();
    if (item) {
      queue.push({ city: item.city, tier: item.tier, diagnosis: item.diagnosis });
    }
    i++;
  }

  if (queue.length === 0) {
    throw new Error("allocateWeekClusters: no seeds available");
  }

  // Distribute: day 0 gets indices [0…k), day 1 gets [k…2k), etc.
  // If the pool is smaller than dayCount*seedsPerDay, wrap around (degrades
  // freshness but never breaks).
  const clusters: DraftSeed[][] = [];
  for (let d = 0; d < dayCount; d++) {
    const cluster: DraftSeed[] = [];
    for (let s = 0; s < seedsPerDay; s++) {
      const idx = (d * seedsPerDay + s) % queue.length;
      const seed = queue[idx];
      if (seed) cluster.push(seed);
    }
    clusters.push(cluster);
  }
  if (queue.length < dayCount * seedsPerDay) {
    log.warn("week_seed_reuse", {
      available: queue.length,
      needed: dayCount * seedsPerDay,
      days: dayCount,
    });
  }
  return clusters;
}

// ---------------------------------------------------------------------------
// Delimiter-structured output parser
// ===LINKEDIN===
// HEADLINE: up to 10 words
// BODY: body text
// ===INSTAGRAM===
// HEADLINE: ...
// BODY: ...
// ===FACEBOOK===
// HEADLINE: ...
// BODY: ...
// ---------------------------------------------------------------------------

type RawVariant = { headline: string; body: string };
type ParsedDay = {
  linkedin: RawVariant | null;
  instagram: RawVariant | null;
  facebook: RawVariant | null;
};

function parseDelimitedOutput(raw: string): ParsedDay {
  const result: ParsedDay = { linkedin: null, instagram: null, facebook: null };
  const blocks = raw.split(/===(?:LINKEDIN|INSTAGRAM|FACEBOOK)===/i);
  const headers = [...raw.matchAll(/===(LINKEDIN|INSTAGRAM|FACEBOOK)===/gi)].map((m) =>
    (m[1] ?? "").toLowerCase() as "linkedin" | "instagram" | "facebook",
  );
  for (let i = 0; i < headers.length; i++) {
    const platform = headers[i];
    if (!platform || !GRID_PLATFORMS.includes(platform)) continue;
    const block = (blocks[i + 1] ?? "").trim();
    if (!block) continue;

    // Extract HEADLINE line (first line starting with "HEADLINE:")
    const headlineMatch = block.match(/^HEADLINE:\s*(.+?)$/m);
    const headline = (headlineMatch?.[1] ?? "").trim().slice(0, 120);

    // Body = everything after "BODY:" (or after headline line if no BODY: marker)
    const bodyMatch = block.match(/^BODY:\s*([\s\S]+?)(?:===|$)/m);
    let body = (bodyMatch?.[1] ?? "").trim();
    if (!body) {
      // Fallback: strip HEADLINE: line, use remainder
      body = block.replace(/^HEADLINE:[^\n]*\n?/m, "").trim();
    }

    if (headline && body) {
      result[platform] = { headline, body };
    }
  }
  return result;
}

// Fallback headline: first sentence of body, capped at 90 chars.
function fallbackHeadline(body: string): string {
  const m = body.match(/^[^.!?]+[.!?]/);
  const candidate = m ? m[0].trim() : body.slice(0, 90);
  return candidate.length > 90 ? candidate.slice(0, 87) + "…" : candidate;
}

// ---------------------------------------------------------------------------
// Per-variant voice pipeline (mirrors content.ts generateOne)
// ---------------------------------------------------------------------------

const ANTI_LEAK = [
  "ANONYMIZE — non-negotiable:",
  "- Never name a company, owner, person, domain, or email.",
  '- Generalize: "a pool company in {city}", "one site I looked at".',
  "- These are REAL problems on REAL sites. Teach the lesson, protect the source.",
].join("\n");

const VOICE_REMINDER =
  "Voice: short punchy sentences, 20 words max each. No em-dashes. No banned words. One concrete reference (named neighborhood, %, $, or business type). End with one clear takeaway.";

function renderSeeds(cluster: DraftSeed[]): string {
  return cluster.map((s, i) => `${i + 1}. (${s.city}) ${s.diagnosis}`).join("\n");
}

function buildDayUserPrompt(
  slot: DaySlot,
  cluster: DraftSeed[],
  priorDaySummaries: string[],
  repairContext?: { failedPlatform: string; failures: string; passedSiblings: string },
): string {
  const parts: string[] = [];

  if (repairContext) {
    parts.push(
      `Your previous ${repairContext.failedPlatform} variant FAILED voice-check. Rewrite it completely.`,
      `Failures: ${repairContext.failures}`,
      `Do NOT copy sentences from these passing siblings:\n${repairContext.passedSiblings}`,
      "",
    );
  }

  if (priorDaySummaries.length > 0) {
    parts.push(
      "PRIOR DAYS THIS WEEK — do NOT repeat these angles or openers:",
      ...priorDaySummaries.map((s, i) => `Day ${i + 1}: ${s}`),
      "",
    );
  }

  parts.push(
    `Write THREE platform-adapted versions of a ${slot.theme.replace(/_/g, " ")} post.`,
    "Use the raw material below. One observation, three voices.",
    "",
    `Output EXACTLY this structure (include the === delimiters verbatim):`,
    "===LINKEDIN===",
    "HEADLINE: [≤10 words, punchy, drives the card]",
    `BODY: [${slot.wordLimits.linkedin[0]}–${slot.wordLimits.linkedin[1]} words, LinkedIn tone, thought-leadership, owner-to-owner]`,
    "===INSTAGRAM===",
    "HEADLINE: [≤10 words]",
    `BODY: [${slot.wordLimits.instagram[0]}–${slot.wordLimits.instagram[1]} words, caption style, direct, one insight]`,
    "===FACEBOOK===",
    "HEADLINE: [≤10 words]",
    `BODY: [${slot.wordLimits.facebook[0]}–${slot.wordLimits.facebook[1]} words, slightly warmer, same core idea]`,
    "",
    "Rules: same core insight, genuinely different sentences. Instagram ≠ LinkedIn condensed. Facebook ≠ Instagram with more words.",
    "",
    "Raw material (anonymized pool-company marketing problems):",
    renderSeeds(cluster),
    "",
    ANTI_LEAK,
    "",
    VOICE_REMINDER,
  );

  return parts.join("\n");
}

const MAX_VARIANT_REPAIRS = 2;

type VariantResult = {
  body: string;
  headline: string;
  passed: boolean;
  attempts: number;
  failures: Array<{ check: string; detail: string }>;
};

async function validateVariant(
  brand: BrandConfig,
  body: string,
  attempt: number,
): Promise<{ passed: boolean; failures: Array<{ check: string; detail: string }> }> {
  const stripped = brand.voice.dash_policy === "none" ? stripDashes(stripScaffolding(body)) : stripScaffolding(body);
  const result = validateDraft({ voice: brand.voice }, stripped, { regenAttempt: attempt });
  const sanity = checkContentSanity(stripped, new Date().getFullYear());
  const leaked = isBlockedByPatterns(stripped, brand.sources.kg_blocked_patterns);
  const failures = [
    ...result.hardFailures,
    ...sanity.hard,
    ...(leaked ? [{ check: "kg_leak_guard", detail: "matched kg_blocked_patterns" }] : []),
  ];
  return { passed: failures.length === 0, failures };
}

async function runVariantPipeline(
  brandKey: string,
  brand: BrandConfig,
  slot: DaySlot,
  cluster: DraftSeed[],
  raw: RawVariant,
  platform: "linkedin" | "instagram" | "facebook",
  priorDaySummaries: string[],
): Promise<VariantResult> {
  let body = brand.voice.dash_policy === "none"
    ? stripDashes(stripScaffolding(raw.body))
    : stripScaffolding(raw.body);
  let headline = raw.headline || fallbackHeadline(body);

  let { passed, failures } = await validateVariant(brand, body, 0);
  let attempts = 1;

  // Repair loop: up to MAX_VARIANT_REPAIRS single-platform calls.
  for (let r = 0; r < MAX_VARIANT_REPAIRS && !passed; r++) {
    const sys = await buildContentSystemPrompt(brandKey, { scenarioId: slot.scenarioId });
    const failureDesc = failures.map((f) => `[${f.check}] ${f.detail}`).join("; ");
    const repairPrompt = buildDayUserPrompt(slot, cluster, priorDaySummaries, {
      failedPlatform: platform,
      failures: failureDesc,
      passedSiblings: `(generated in the same day batch — don't copy sentences)`,
    });
    const raw2 = await chat({
      model: env.models.content,
      systemContext: sys.prompt,
      userPrompt: repairPrompt,
      maxTokens: 600,
    });
    // The repair call outputs a single-platform response without delimiters.
    body = brand.voice.dash_policy === "none"
      ? stripDashes(stripScaffolding(raw2))
      : stripScaffolding(raw2);
    // If headline starts with "HEADLINE:" strip it (model may echo the label)
    headline = body.match(/^HEADLINE:\s*(.+?)$/m)?.[1]?.trim() || headline;
    body = body.replace(/^HEADLINE:[^\n]*\n?/m, "").replace(/^BODY:\s*/m, "").trim();

    const v = await validateVariant(brand, body, r + 1);
    passed = v.passed;
    failures = v.failures;
    attempts = r + 2;
  }

  return { body, headline, passed, attempts, failures };
}

// ---------------------------------------------------------------------------
// Day summary line for anti-repetition prompt block
// ---------------------------------------------------------------------------

function dayOneLiner(posts: WeekPost[]): string {
  const li = posts.find((p) => p.platform === "linkedin");
  if (!li) return "";
  // First sentence of the LinkedIn body
  const m = li.body.match(/^[^.!?\n]+[.!?]/);
  return m ? m[0].trim() : li.body.slice(0, 80);
}

// ---------------------------------------------------------------------------
// Main: generate a full WeekPlan
// ---------------------------------------------------------------------------

/** Compute date string for the Nth weekday starting from startDate (Monday). */
function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Compact random 4-char ID suffix for the week plan id. */
function weekId(startDate: string): string {
  const compact = startDate.replace(/-/g, "");
  const suffix = randomBytes(2).toString("hex");
  return `wk-${compact}-${suffix}`;
}

export type GenerateWeekOpts = {
  brandKey?: string;
  /** Monday start date in YYYY-MM-DD format (LA). */
  startDate: string;
  /** Override for logging/CLI — does not affect generation. */
  dryRun?: boolean;
};

export type GenerateWeekResult = {
  weekId: string;
  posts: WeekPost[];
  passRate: number;
  seedReuse: boolean;
};

export async function generateWeek(opts: GenerateWeekOpts): Promise<GenerateWeekResult> {
  const brandKey = opts.brandKey ?? env.content.defaultBrand;
  const brand = await getBrand(brandKey);
  if (!brand) throw new Error(`Unknown brand: ${brandKey}`);
  if (brand.status !== "active") throw new Error(`Brand ${brandKey} is not active`);

  const seeds = await loadPoolDiagnoses(brand);
  if (seeds.length === 0) throw new Error("No pool diagnoses found — check lead sheets in data bundle");

  const dayCount = WEEK_GRID.length;
  const clusters = allocateWeekClusters(seeds, dayCount, 4);
  const seedReuse = seeds.length < dayCount * 4;

  const wid = weekId(opts.startDate);
  const posts: WeekPost[] = [];
  const priorDaySummaries: string[] = [];

  log.info("week_gen_start", { weekId: wid, brand: brandKey, startDate: opts.startDate, days: dayCount, seeds: seeds.length });

  for (let dayIdx = 0; dayIdx < dayCount; dayIdx++) {
    const slot = WEEK_GRID[dayIdx]!;
    const dayDate = addDays(opts.startDate, dayIdx);
    const cluster = clusters[dayIdx]!;

    log.info("week_gen_day", { weekId: wid, day: dayIdx + 1, weekday: slot.weekday, date: dayDate });

    // ONE call for all 3 platforms.
    const sys = await buildContentSystemPrompt(brandKey, { scenarioId: slot.scenarioId });
    const userPrompt = buildDayUserPrompt(slot, cluster, priorDaySummaries);
    const raw = await chat({
      model: env.models.content,
      systemContext: sys.prompt,
      userPrompt,
      maxTokens: 1800, // enough for all 3 variants together
    });

    const parsed = parseDelimitedOutput(raw);
    const dayPosts: WeekPost[] = [];

    for (const platform of GRID_PLATFORMS) {
      const rawVariant = parsed[platform];
      let varResult: VariantResult;

      if (!rawVariant) {
        // Parser couldn't find this platform's block — treat as failed but record.
        log.warn("week_gen_parse_miss", { weekId: wid, day: slot.weekday, platform });
        varResult = {
          body: "(parse failed — no output for this platform in the day batch)",
          headline: `${slot.weekday} ${platform}`,
          passed: false,
          attempts: 1,
          failures: [{ check: "parse", detail: `no ${platform} block found in delimiter output` }],
        };
      } else {
        varResult = await runVariantPipeline(
          brandKey,
          brand,
          slot,
          cluster,
          rawVariant,
          platform,
          priorDaySummaries,
        );
      }

      const postId = `${wid}-${slot.weekday.slice(0, 3)}-${platform}`;
      const post: WeekPost = {
        id: postId,
        day: dayDate,
        weekday: slot.weekday,
        theme: slot.theme,
        platform,
        scenarioId: slot.scenarioId,
        body: varResult.body,
        headline: varResult.headline || fallbackHeadline(varResult.body),
        passed: varResult.passed,
        attempts: varResult.attempts,
        failures: varResult.failures,
        seeds: cluster,
        fate: "pending",
        regenCount: 0,
        messageIds: [],
      };
      dayPosts.push(post);
      posts.push(post);

      log.info("week_gen_variant", {
        id: postId,
        platform,
        passed: varResult.passed,
        attempts: varResult.attempts,
        failures: varResult.failures.length,
      });
    }

    // Record a one-liner for the anti-repetition block.
    priorDaySummaries.push(dayOneLiner(dayPosts));
  }

  const passRate = posts.filter((p) => p.passed).length / posts.length;
  log.info("week_gen_complete", {
    weekId: wid,
    total: posts.length,
    passed: posts.filter((p) => p.passed).length,
    passRate: Math.round(passRate * 100),
  });

  return { weekId: wid, posts, passRate, seedReuse };
}

// ---------------------------------------------------------------------------
// Create a WeekPlan object from a generation result (called by /week generate)
// ---------------------------------------------------------------------------

export function buildWeekPlan(
  result: GenerateWeekResult,
  brandKey: string,
  startDate: string,
  cycleWeeks: number,
): WeekPlan {
  const phaseDeadline = new Date(
    new Date(`${startDate}T00:00:00Z`).getTime() + 72 * 3600 * 1000,
  ).toISOString();
  return {
    id: result.weekId,
    brandKey,
    startDate,
    cycleWeeks,
    phase: "text_review",
    posts: result.posts,
    createdAt: new Date().toISOString(),
    phaseDeadline,
  };
}
