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
import { validateDraft } from "../services/voice-check.js";
import { postToChannel } from "./daily-brief.js";

const MAX_ATTEMPTS = 3; // 1 initial + 2 regens

type ScenarioSpec = {
  name: string;
  platform: string;
  maxTokens: number;
  instruction: string;
};

const SCENARIOS: Record<number, ScenarioSpec> = {
  1: {
    name: "Educational mistake",
    platform: "LinkedIn/X",
    maxTokens: 500,
    instruction:
      "Pick ONE problem from the list. Open with the mistake. Say why it costs the owner booked jobs. Give the fix in 1-2 lines. Owner-to-owner, never salesy. About 120-180 words.",
  },
  7: {
    name: "LinkedIn long-form",
    platform: "LinkedIn",
    maxTokens: 900,
    instruction:
      "Use the cluster as evidence. Find the PATTERN across these problems. Make one argument a pool owner has not heard before. Thought-leadership, about 350-500 words, still punchy.",
  },
  6: {
    name: "Short-video hook",
    platform: "Reel/IG",
    maxTokens: 500,
    instruction:
      "Reformat into a vertical short-video script. Line 1 is a 1.5-second scroll-stopping hook. Then 3-5 fast beats, one idea each. End on a single CTA line. Label lines [HOOK], [BEAT], [CTA].",
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
  body: string;
  passed: boolean;
  attempts: number;
  failures: Array<{ check: string; detail: string }>;
  cities: string[];
};

/** Round-robin across cities so the cluster is not all one file / one neighborhood. */
function pickCluster(seeds: DiagnosisSeed[], n: number): DiagnosisSeed[] {
  const byCity = new Map<string, DiagnosisSeed[]>();
  for (const s of seeds) {
    if (!byCity.has(s.city)) byCity.set(s.city, []);
    byCity.get(s.city)?.push(s);
  }
  const queues = [...byCity.values()];
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
  const sys = await buildContentSystemPrompt(brandKey, { scenarioId });
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
  const lines = [
    `**Draft ${n}/${total} — S${d.scenarioId} ${spec.name} — ${spec.platform}**`,
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
  opts: { brandKey?: string; scenarios?: number[] } = {},
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
      `No pool diagnoses found under ${brand.sources.lead_scrapes}. Are POOL *.md dial sheets present and cwd = repo root?`,
    );
  }

  const cluster = pickCluster(seeds, 5);

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
