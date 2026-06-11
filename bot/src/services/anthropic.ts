import Anthropic from "@anthropic-ai/sdk";
import { readFile, stat } from "node:fs/promises";
import { env } from "../env.js";
import { log } from "../logger.js";
import { getBrand, resolveDataDir } from "./brand-config.js";

const client = new Anthropic({ apiKey: env.anthropic.apiKey });

const ROCCO_PERSONA = `You are ROCCO — Brendan Valdes's sharpest AI operator at Valdes Agency.
Part elite media buyer, part senior web developer, part direct-response copywriter, part marketing strategist.

VOICE — NON-NEGOTIABLE:
- Short punchy sentences. Never essays.
- Never start a response with "I" as the first word.
- Never say "Certainly!", "Great question!", "Absolutely!", "Of course!"
- No corporate speak: leverage, utilize, actionable insights, moving forward, circle back.
- Hype wins loud and specific (numbers > adjectives).
- Problems get honest assessment + the fix immediately.
- End every strategy answer with ONE clear next move.

CONTEXT:
- Valdes Agency = done-for-you digital marketing for local pool service companies in Las Vegas.
- Brendan is a 17-year-old solo operator. NEVER reference Tyler, a setter, or a partner — Brendan runs all sales solo.
- Phase 1 goal: first paying pool client in Vegas. Sales motion is solo + async outreach.
- SonoView (existing paying client, Reno ultrasound clinic) is the proof asset.
`;

export interface ChatOptions {
  model: string;
  systemContext?: string;
  userPrompt: string;
  maxTokens?: number;
}

export async function chat(opts: ChatOptions): Promise<string> {
  const system = opts.systemContext
    ? `${ROCCO_PERSONA}\n\n--- CONTEXT (read carefully, do not quote verbatim) ---\n${opts.systemContext}`
    : ROCCO_PERSONA;

  const resp = await client.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 1024,
    system,
    messages: [{ role: "user", content: opts.userPrompt }],
  });

  const text = resp.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .filter((s) => s.length > 0)
    .join("\n")
    .trim();

  return scrubVoice(text);
}

function scrubVoice(text: string): string {
  const banned = [
    /^certainly[!.,]?\s*/i,
    /^great question[!.,]?\s*/i,
    /^absolutely[!.,]?\s*/i,
    /^of course[!.,]?\s*/i,
  ];
  let out = text;
  for (const re of banned) out = out.replace(re, "");
  if (/^I\b/.test(out)) {
    out = out.replace(/^I\s+/, "Look — ");
  }
  return out.trim();
}

// ============================================================================
// Content System v1 — Smart Embedding (Gate 3.4)
// ============================================================================
// Builds a content-generation system prompt by parsing memory/voice/valdes-
// tone-samples.md and selecting always-loaded core sections plus the relevant
// scenario section on-demand. Token budget enforced (≤ 3000 tokens) to keep
// per-draft API cost sane.
// ============================================================================

const TONE_SAMPLES_PATH_DEFAULT = "memory/voice/valdes-tone-samples.md";
const TONE_CACHE_TTL_MS = 5 * 60 * 1000;
const TOKEN_BUDGET_WARN = 2500;
const TOKEN_BUDGET_HARD_CAP = 3000;

type ToneCache = {
  sections: Map<string, string>;
  loadedAt: number;
};

let toneCache: ToneCache | null = null;

function getTonePath(brandKey: string): string {
  // valdes brand uses the default path; other brands swap "valdes" for their key.
  // Resolved via the shared marker walk-up (brand-config.resolveDataDir), NOT
  // cwd-relative: running from bot/ resolved to bot/memory/voice/... and the
  // 0.45-weight voice anchor silently fell back to YAML-only on every draft.
  const configured = process.env.TONE_SAMPLES_PATH;
  const path = configured ?? TONE_SAMPLES_PATH_DEFAULT.replace("valdes", brandKey);
  return resolveDataDir(path);
}

// Parse markdown into H2-keyed sections. Section content starts after the H2
// line and runs until the next H2 (or EOF). H3 subheadings are preserved
// inside their parent section.
function parseSectionsByH2(markdown: string): Map<string, string> {
  const sections = new Map<string, string>();
  const lines = markdown.split("\n");
  let currentTitle: string | null = "__header__"; // pre-H2 content
  let buffer: string[] = [];

  for (const line of lines) {
    const h2Match = line.match(/^##\s+(.+?)\s*$/);
    if (h2Match) {
      // flush previous section
      if (currentTitle !== null) {
        sections.set(currentTitle, buffer.join("\n").trim());
      }
      currentTitle = (h2Match[1] ?? "").trim();
      buffer = [];
    } else {
      buffer.push(line);
    }
  }
  if (currentTitle !== null) {
    sections.set(currentTitle, buffer.join("\n").trim());
  }
  return sections;
}

async function loadToneSamples(brandKey: string): Promise<Map<string, string>> {
  if (toneCache && Date.now() - toneCache.loadedAt < TONE_CACHE_TTL_MS) {
    return toneCache.sections;
  }
  const path = getTonePath(brandKey);
  try {
    await stat(path);
    const raw = await readFile(path, "utf8");
    const sections = parseSectionsByH2(raw);
    toneCache = { sections, loadedAt: Date.now() };
    log.info("tone_samples_loaded", { path, sections: sections.size });
    return sections;
  } catch (err) {
    log.warn("tone_samples_load_failed", { path, err: String(err) });
    const empty = new Map<string, string>();
    toneCache = { sections: empty, loadedAt: Date.now() };
    return empty;
  }
}

// Heuristic: 1 token ≈ 4 chars for Claude. Conservative for English prose.
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

// Find a section whose title starts with the given prefix (case-insensitive).
function findSection(sections: Map<string, string>, prefix: string): string {
  const lowerPrefix = prefix.toLowerCase();
  for (const [title, content] of sections) {
    if (title.toLowerCase().startsWith(lowerPrefix)) return content;
  }
  return "";
}

function findScenarioSection(
  sections: Map<string, string>,
  scenarioId: number,
): { title: string; content: string } | null {
  const target = `scenario ${scenarioId}:`;
  for (const [title, content] of sections) {
    if (title.toLowerCase().startsWith(target)) {
      return { title, content };
    }
  }
  return null;
}

export type BuildContentPromptOpts = {
  scenarioId?: number;
};

export type BuildContentPromptResult = {
  prompt: string;
  tokensEstimated: number;
  sectionsIncluded: string[];
  truncated: boolean;
  warnings: string[];
};

export async function buildContentSystemPrompt(
  brandKey: string,
  opts: BuildContentPromptOpts = {},
): Promise<BuildContentPromptResult> {
  const brand = await getBrand(brandKey);
  if (!brand) throw new Error(`Unknown brand: ${brandKey}`);
  if (brand.status !== "active") {
    throw new Error(`Brand ${brandKey} is ${brand.status}, not consumable for content generation`);
  }

  const sections = await loadToneSamples(brandKey);
  const warnings: string[] = [];
  const included: string[] = [];
  const blocks: string[] = [];

  blocks.push(`You are ROCCO generating content for ${brand.display_name}.`);
  blocks.push("");

  // Always-loaded core section: Voice Fingerprint
  const voiceFingerprint = findSection(sections, "voice fingerprint");
  if (voiceFingerprint) {
    blocks.push("VOICE FINGERPRINT:");
    blocks.push(voiceFingerprint);
    blocks.push("");
    included.push("Voice Fingerprint");
  }

  // Always-loaded: Meta-Pattern
  const metaPattern = findSection(sections, "meta-pattern");
  if (metaPattern) {
    blocks.push("META-PATTERN (rules to follow):");
    blocks.push(metaPattern);
    blocks.push("");
    included.push("Meta-Pattern");
  }

  // Always-loaded: Master Guardrails
  const masterGuardrails = findSection(sections, "master guardrails");
  if (masterGuardrails) {
    blocks.push("MASTER GUARDRAILS (especially for grind-aesthetic scenarios 4/9/11):");
    blocks.push(masterGuardrails);
    blocks.push("");
    included.push("Master Guardrails List");
  }

  // Always-loaded: Embedded Voice References (banned words, banned structures, always use)
  const embeddedRefs = findSection(sections, "embedded voice references");
  if (embeddedRefs) {
    blocks.push("VOICE REFERENCES:");
    blocks.push(embeddedRefs);
    blocks.push("");
    included.push("Embedded Voice References");
  } else {
    // Fallback: build from brand config directly
    const bannedWordsList = brand.voice.banned_words.map((w) => w.term).join(", ");
    blocks.push(`VOICE REFERENCES (fallback, tone-samples section missing):`);
    blocks.push(`Banned words: ${bannedWordsList}`);
    blocks.push(`Banned structures: ${brand.voice.banned_structures.map((s) => s.description).join("; ")}`);
    blocks.push(`Max sentence words: ${brand.voice.max_sentence_words}`);
    blocks.push(`Dash policy: ${brand.voice.dash_policy}`);
    blocks.push("");
    warnings.push("tone-samples 'Embedded Voice References' section missing; built fallback from valdes.yaml");
    included.push("Embedded Voice References (fallback)");
  }

  // On-demand scenario section
  if (opts.scenarioId !== undefined) {
    const scenario = findScenarioSection(sections, opts.scenarioId);
    if (scenario) {
      blocks.push(`SCENARIO PATTERN (${scenario.title}):`);
      blocks.push(scenario.content);
      blocks.push("");
      included.push(scenario.title);
    } else {
      warnings.push(`Scenario ${opts.scenarioId} section not found in tone-samples.md`);
    }
  }

  blocks.push("---");
  blocks.push("Match this voice exactly. Do not introduce banned phrases. No em-dashes. Specific numbers, named places, owner-to-owner stance. One clear idea per post.");

  let prompt = blocks.join("\n");
  let tokens = estimateTokenCount(prompt);
  let truncated = false;

  // Token budget enforcement
  if (tokens > TOKEN_BUDGET_HARD_CAP && opts.scenarioId !== undefined) {
    // Truncate scenario section to first 50% of bytes
    const scenario = findScenarioSection(sections, opts.scenarioId);
    if (scenario) {
      const halfContent = scenario.content.slice(0, Math.floor(scenario.content.length / 2)) +
        "\n\n[... truncated for token budget. Full scenario in memory/voice/valdes-tone-samples.md ...]";
      const rebuilt = blocks.map((b) =>
        b === scenario.content ? halfContent : b,
      );
      prompt = rebuilt.join("\n");
      tokens = estimateTokenCount(prompt);
      truncated = true;
      warnings.push(`Token budget exceeded (${TOKEN_BUDGET_HARD_CAP}); truncated scenario ${opts.scenarioId} section to 50%`);
    }
  }
  if (tokens > TOKEN_BUDGET_HARD_CAP) {
    warnings.push(`Token budget STILL exceeded after truncation (${tokens} > ${TOKEN_BUDGET_HARD_CAP}); review tone-samples.md size`);
  } else if (tokens > TOKEN_BUDGET_WARN) {
    warnings.push(`Token budget warning: ${tokens} > ${TOKEN_BUDGET_WARN} (cap ${TOKEN_BUDGET_HARD_CAP})`);
  }

  return { prompt, tokensEstimated: tokens, sectionsIncluded: included, truncated, warnings };
}

// Test-only cache reset
export function _resetToneCache(): void {
  toneCache = null;
}
