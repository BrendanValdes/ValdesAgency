// Gate 3 content generator — the first stage that produces real output.
// ============================================================================
// Pulls anonymized pool-lead diagnoses, drafts a batch through the ROCCO voice
// prior (buildContentSystemPrompt + chat), validates each draft with
// voice-check.ts (validateDraft) AND a kg.ts leak guard (isBlockedByPatterns),
// auto-regens up to 2x on failure, then posts every draft to the brand's
// content channel for Brendan to review.
//
// Scope: generate -> check -> review. Approval / scheduling / posting = Gate 5.
// ============================================================================

import type { Client } from "discord.js";
import { env } from "../env.js";
import { log } from "../logger.js";
import { buildContentSystemPrompt, chat } from "../services/anthropic.js";
import type { BrandConfig } from "../services/brand-config.js";
import { getBrand } from "../services/brand-config.js";
import { loadPoolDiagnoses } from "../services/content-sources.js";
import type { DiagnosisSeed } from "../services/content-sources.js";
import { isBlockedByPatterns } from "../services/kg.js";
import { stripDashes, validateDraft } from "../services/voice-check.js";
import { postToChannel } from "./daily-brief.js";

const MAX_ATTEMPTS = 3; // 1 initial + 2 regens

type ScenarioSpec = {
  name: string;
  platform: string;
  maxTokens: number;
  instruction: string;
  /** "video" outputs are shooting scripts, tagged so they separate from text posts. */
  type: "text" | "video";
  /** Tone-samples section to embed. Video scenarios S9-S14 deliberately OMIT this:
   *  their IDs collide with the tone-samples POST scenario numbering (tone S9/S11
   *  are grind-aesthetic overrides, tone S12 is the permanently BANNED first-
   *  milestone pattern). Video structure lives entirely in `instruction`; the
   *  core voice sections (fingerprint, meta-pattern, guardrails) still load. */
  toneScenarioId?: number;
};

// Shared rules for every video scenario (S6, S9-S14). Viral templates supply
// STRUCTURE ONLY — shot format, on-screen text mechanics, pacing. All copy
// still runs through the ROCCO voice prior, dash strip, and voice-check.
const VIDEO_SCRIPT_RULES = [
  "Output a SHOOTING SCRIPT, not a finished video. Label every line:",
  "[HOOK] spoken opening line (first 1.5 seconds)",
  "[ON-SCREEN] an on-screen text element, exactly as it should appear",
  "[SPOKEN] a spoken line",
  "[CAPTION] post caption at the end, 1-3 sentences",
  "Interleave [ON-SCREEN] and [SPOKEN] in shoot order.",
  "The template is STRUCTURE ONLY. Voice stays owner-to-owner: short sentences, no influencer cadence, no hype inflection.",
  "No engagement bait anywhere, including the caption: never 'comment X', 'follow for more', 'link in bio', 'wait for it', 'you won't believe'.",
  "The CTA is ONE direct line a pool company owner can act on himself.",
].join("\n");

const SCENARIOS: Record<number, ScenarioSpec> = {
  1: {
    name: "Educational mistake",
    platform: "LinkedIn/X",
    maxTokens: 500,
    type: "text",
    toneScenarioId: 1,
    instruction:
      "Pick ONE problem from the list. Open with the mistake. Say why it costs the owner booked jobs. Give the fix in 1-2 lines. Owner-to-owner, never salesy. About 120-180 words.",
  },
  7: {
    name: "LinkedIn long-form",
    platform: "LinkedIn",
    maxTokens: 900,
    type: "text",
    toneScenarioId: 7,
    instruction:
      "Use the cluster as evidence. Find the PATTERN across these problems. Make one argument a pool owner has not heard before. Thought-leadership, about 350-500 words, still punchy.",
  },
  6: {
    name: "Short-video hook",
    platform: "Reel/IG",
    maxTokens: 500,
    type: "video",
    toneScenarioId: 6,
    instruction:
      "Reformat into a vertical short-video script. Line 1 is a 1.5-second scroll-stopping hook. Then 3-5 fast beats, one idea each. End on a single CTA line. Label lines [HOOK], [BEAT], [CTA].",
  },
  9: {
    name: "Two Sides Debate",
    platform: "Reel/TikTok",
    maxTokens: 700,
    type: "video",
    instruction: [
      "Two Sides Debate: one person plays both sides of an argument, cut side by side as two characters disagreeing.",
      "Side A is the owner's current thinking, voiced as a REAL objection heard on dials (e.g. 'my Yelp reviews are enough', 'I get all my work from referrals').",
      "Side B is the reality. Side B wins with ONE specific fact drawn from the raw material, scrubbed of any identity.",
      "3-5 exchanges. Label speakers [SPOKEN A] and [SPOKEN B] instead of plain [SPOKEN]. Side B gets the last word.",
      "30-45 seconds of total speech.",
      VIDEO_SCRIPT_RULES,
    ].join("\n"),
  },
  10: {
    name: "Numbered Countdown List",
    platform: "Reel/TikTok",
    maxTokens: 900,
    type: "video",
    instruction: [
      "Numbered Countdown List: speaker on camera, a numbered list appears beside them, each number fills in as it is spoken.",
      "Topic shape: 'N things on a pool company website that send customers to a competitor.'",
      "EVERY item must be a real finding pattern from the raw material, generalized. NO filler items to hit a round number: if only 5 real ones exist in the material, the list is 5.",
      "Per item: one [ON-SCREEN] short list label (3-6 words), then 1-2 [SPOKEN] sentences.",
      "45-60 seconds of total speech.",
      VIDEO_SCRIPT_RULES,
    ].join("\n"),
  },
  11: {
    name: "Bad Good Excellent Grade",
    platform: "Reel/TikTok",
    maxTokens: 700,
    type: "video",
    instruction: [
      "Bad Good Excellent Grade: three-tier verbal grading shown as colored labels on screen, speaker grades ONE business element across the three tiers.",
      "Pick ONE element from the raw material (e.g. contact email: Bad = yahoo/aol address, Good = gmail, Excellent = yourcompany.com with Google Workspace).",
      "[ON-SCREEN] labels BAD / GOOD / EXCELLENT as each tier is ruled, each followed by its [SPOKEN] grading.",
      "Always END with what Excellent costs. Numbers only if they appear in the raw material or are public list prices. Never invent a stat.",
      "30-45 seconds of total speech.",
      VIDEO_SCRIPT_RULES,
    ].join("\n"),
  },
  12: {
    name: "Direct Count On Fingers",
    platform: "Reel/TikTok",
    maxTokens: 500,
    type: "video",
    instruction: [
      "Direct Count On Fingers: straight to camera, NO graphics except one [ON-SCREEN] title card at the start. Speaker counts points on fingers. Lowest production weight.",
      "Compressed punchy version of a list topic from the raw material. MAX 3 points, one short [SPOKEN] block each.",
      "20-30 seconds of total speech.",
      VIDEO_SCRIPT_RULES,
    ].join("\n"),
  },
  13: {
    name: "Tier List Ranking",
    platform: "Reel/TikTok",
    maxTokens: 900,
    type: "video",
    instruction: [
      "Tier List Ranking: classic S/A/B/C/D tier board on screen, items placed into tiers one at a time as the speaker rules on each.",
      "Rank the ways pool companies get leads: referrals, Google Business Profile, Yelp, Thumbtack, door hangers, paid ads.",
      "Per placement: one [ON-SCREEN] line ('Thumbtack -> C tier') and exactly ONE [SPOKEN] sentence of reasoning.",
      "Reasoning must come from cost/ROI evidence in the raw material (real per-lead prices, real review-platform behavior). No vibes rankings. If the material has no evidence for a channel, reason from owner economics without inventing numbers.",
      "45-60 seconds of total speech.",
      VIDEO_SCRIPT_RULES,
    ].join("\n"),
  },
  14: {
    name: "1 to 10 Scale Rating",
    platform: "Reel/TikTok",
    maxTokens: 500,
    type: "video",
    instruction: [
      "1 to 10 Scale Rating: a 1-10 colored scale on screen, speaker rates ONE thing and the number lights up.",
      "Rate one common pool-company business decision drawn from the raw material (e.g. 'paying $50 a lead on Thumbtack with no website of your own').",
      "ONE rating per video. The WHY is the content: 3-5 [SPOKEN] lines justifying the number, anchored in the raw material.",
      "[ON-SCREEN] shows the decision being rated, then the number on the scale.",
      "20-30 seconds of total speech.",
      VIDEO_SCRIPT_RULES,
    ].join("\n"),
  },
};

const ANTI_LEAK = [
  "ANONYMIZE — non-negotiable:",
  "- Never name a company, owner, person, domain, or email.",
  '- Generalize: "a pool company in {city}", "a lot of Vegas pool shops", "one site I looked at".',
  "- These are REAL problems on REAL sites. Teach the lesson, protect the source.",
].join("\n");

const VOICE_REMINDER =
  "Voice: short punchy sentences, 20 words max each. No em-dashes. No banned words. One concrete reference (named neighborhood, %, $, or business type). End with one clear takeaway or move.";

const LEAK_MSG =
  "LEAK: the draft matched a blocked personal/founder pattern. Remove any personal financial state, dial counts, 'just started', or founder-milestone language.";

export function getSpec(scenarioId: number): ScenarioSpec {
  const spec = SCENARIOS[scenarioId];
  if (!spec) throw new Error(`Unsupported scenario ${scenarioId}`);
  return spec;
}

export type Draft = {
  scenarioId: number;
  /** "video" = shooting script (S6, S9-S14), "text" = post copy (S1, S7). */
  format: "text" | "video";
  body: string;
  passed: boolean;
  attempts: number;
  failures: Array<{ check: string; detail: string }>;
  cities: string[];
};

/** Round-robin across cities so the cluster is not all one file / one neighborhood.
 *  skipPerCity drops the first k seeds of every city queue, so reruns can pull a
 *  fresh cluster instead of the same deterministic heads. */
function pickCluster(seeds: DiagnosisSeed[], n: number, skipPerCity = 0): DiagnosisSeed[] {
  const byCity = new Map<string, DiagnosisSeed[]>();
  for (const s of seeds) {
    if (!byCity.has(s.city)) byCity.set(s.city, []);
    byCity.get(s.city)?.push(s);
  }
  const queues = [...byCity.values()].map((q) => q.slice(skipPerCity));
  const out: DiagnosisSeed[] = [];
  let i = 0;
  while (out.length < n && queues.some((q) => q.length > 0)) {
    const q = queues[i % queues.length];
    const item = q?.shift();
    if (item) out.push(item);
    i++;
  }
  return out;
}

function renderSeeds(cluster: DiagnosisSeed[]): string {
  return cluster.map((s, i) => `${i + 1}. (${s.city}) ${s.diagnosis}`).join("\n");
}

function buildUserPrompt(
  scenarioId: number,
  cluster: DiagnosisSeed[],
  regenFeedback?: string,
): string {
  const spec = getSpec(scenarioId);
  const blocks: string[] = [];
  if (regenFeedback) {
    blocks.push(
      "Your previous draft FAILED voice-check. Fix every issue, then rewrite the FULL post:",
      regenFeedback,
      "",
    );
  }
  blocks.push(
    `Write ONE ${spec.name} post for ${spec.platform}.`,
    "",
    spec.instruction,
    "",
    "Raw material (anonymized pool-company marketing problems):",
    renderSeeds(cluster),
    "",
    ANTI_LEAK,
    "",
    VOICE_REMINDER,
  );
  return blocks.join("\n");
}

async function generateOne(
  brandKey: string,
  brand: BrandConfig,
  scenarioId: number,
  cluster: DiagnosisSeed[],
): Promise<Draft> {
  const spec = getSpec(scenarioId);
  // Video scenarios pass no toneScenarioId: their IDs collide with the
  // tone-samples POST scenario numbering (see ScenarioSpec.toneScenarioId).
  const sys = await buildContentSystemPrompt(
    brandKey,
    spec.toneScenarioId !== undefined ? { scenarioId: spec.toneScenarioId } : {},
  );
  if (sys.warnings.length > 0) {
    log.warn("content_prompt_warnings", { scenarioId, warnings: sys.warnings });
  }

  let body = "";
  let passed = false;
  let leakBlocked = false;
  let hardFailures: Array<{ check: string; detail: string }> = [];
  let feedback = "";
  let attemptsUsed = 0;

  for (let a = 0; a < MAX_ATTEMPTS; a++) {
    attemptsUsed = a + 1;
    const userPrompt = buildUserPrompt(scenarioId, cluster, a > 0 ? feedback : undefined);
    body = await chat({
      model: env.models.content,
      systemContext: sys.prompt,
      userPrompt,
      maxTokens: spec.maxTokens,
    });

    // Deterministic fix first: dashes are stripped, not regen'd. Regen only
    // fires for failures a rewrite can't mechanically resolve.
    if (brand.voice.dash_policy === "none") {
      body = stripDashes(body);
    }

    const result = validateDraft({ voice: brand.voice }, body, { regenAttempt: a });
    leakBlocked = isBlockedByPatterns(body, brand.sources.kg_blocked_patterns);
    hardFailures = result.hardFailures;
    passed = result.passed && !leakBlocked;
    if (passed) break;

    feedback = [result.regenFeedback, leakBlocked ? LEAK_MSG : ""]
      .filter(Boolean)
      .join("\n\n");
  }

  const failures = [
    ...hardFailures,
    ...(leakBlocked
      ? [{ check: "kg_leak_guard", detail: "matched kg_blocked_patterns (personal/founder leak)" }]
      : []),
  ];

  log.info("content_draft_generated", {
    scenarioId,
    passed,
    attempts: attemptsUsed,
    failures: failures.length,
  });

  return {
    scenarioId,
    format: spec.type,
    body,
    passed,
    attempts: attemptsUsed,
    failures,
    cities: [...new Set(cluster.map((c) => c.city))],
  };
}

function renderDraft(n: number, total: number, d: Draft): string {
  const spec = getSpec(d.scenarioId);
  const status = d.passed ? "✅ PASS" : `🚩 FLAGGED after ${d.attempts} attempts`;
  const formatTag = d.format === "video" ? " 🎬 VIDEO SCRIPT" : "";
  const lines = [
    `**Draft ${n}/${total} — S${d.scenarioId} ${spec.name} — ${spec.platform}${formatTag}**`,
    `Voice: ${status}`,
    `Source: pool lead diagnoses (${d.cities.join(", ")})`,
  ];
  if (!d.passed && d.failures.length > 0) {
    lines.push(`Failures: ${d.failures.map((f) => `${f.check} — ${f.detail}`).join("; ")}`);
  }
  lines.push("", d.body, "", "— manual post for now. Approval + scheduling = Gate 5.");
  return lines.join("\n");
}

export type ContentBatchResult = { posted: number; clean: number; flagged: number };

export type DraftBatch = {
  brandKey: string;
  brand: BrandConfig;
  cluster: DiagnosisSeed[];
  drafts: Draft[];
};

/** Headless generation core: load brand, source seeds, draft + voice-check.
 *  No Discord dependency — used by runContentBatch and CLI/Gate-5 callers. */
export async function generateDrafts(
  opts: { brandKey?: string; scenarios?: number[]; seedOffset?: number } = {},
): Promise<DraftBatch> {
  const brandKey = opts.brandKey ?? env.content.defaultBrand;
  const scenarios =
    opts.scenarios && opts.scenarios.length > 0 ? opts.scenarios : [1, 7, 6];

  const brand = await getBrand(brandKey);
  if (!brand) {
    throw new Error(
      `Unknown brand: ${brandKey}. Confirm config/brands/${brandKey}.yaml exists at the repo root (or bundled under bot/data/config/brands on Railway).`,
    );
  }
  if (brand.status !== "active") {
    throw new Error(`Brand ${brandKey} is ${brand.status}, not consumable for content.`);
  }

  const seeds = await loadPoolDiagnoses(brand);
  if (seeds.length === 0) {
    throw new Error(
      `No pool diagnoses found under ${brand.sources.lead_scrapes}. Are POOL *.md dial sheets present in the repo (or bundled under bot/data/memory/leads on Railway)?`,
    );
  }

  const cluster = pickCluster(seeds, 5, opts.seedOffset ?? 0);

  const drafts: Draft[] = [];
  for (const scenarioId of scenarios) {
    if (!SCENARIOS[scenarioId]) {
      log.warn("content_unknown_scenario", { scenarioId });
      continue;
    }
    drafts.push(await generateOne(brandKey, brand, scenarioId, cluster));
  }

  if (drafts.length === 0) {
    throw new Error(
      `No valid scenarios in [${scenarios.join(", ")}]. Supported: ${Object.keys(SCENARIOS).join(", ")}.`,
    );
  }

  return { brandKey, brand, cluster, drafts };
}

export async function runContentBatch(
  client: Client,
  opts: { brandKey?: string; scenarios?: number[] } = {},
): Promise<ContentBatchResult> {
  const channelId = env.channels.contentValdes;
  if (!channelId) {
    throw new Error(
      "CHANNEL_CONTENT_VALDES is not set — can't post the content batch. Set it (and mirror to Railway) first.",
    );
  }

  const { brandKey, brand, cluster, drafts } = await generateDrafts(opts);

  const today = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: env.timezone,
  });
  const header = [
    `📝 **Content batch — ${brand.display_name}**`,
    `${drafts.length} draft${drafts.length === 1 ? "" : "s"} · seeds from ${cluster.length} pool diagnoses · ${today}`,
  ].join("\n");
  await postToChannel(client, channelId, header);

  let n = 0;
  for (const d of drafts) {
    n += 1;
    await postToChannel(client, channelId, renderDraft(n, drafts.length, d));
  }

  const clean = drafts.filter((d) => d.passed).length;
  const flagged = drafts.length - clean;
  log.info("content_batch_posted", { brand: brandKey, posted: drafts.length, clean, flagged });
  return { posted: drafts.length, clean, flagged };
}
