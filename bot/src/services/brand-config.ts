import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { env } from "../env.js";
import { log } from "../logger.js";

const SUPPORTED_SCHEMA_VERSIONS = ["1.0"] as const;

const BannedWordSchema = z.object({
  term: z.string().min(1),
  pos: z.enum(["verb", "noun", "any"]).optional(),
  context_exception: z.string().optional(),
});

const BannedStructureSchema = z.object({
  pattern_id: z.string().min(1),
  description: z.string(),
  regex: z.string(),
});

const BannedScenarioSchema = z.object({
  scenario_id: z.string().min(1),
  description: z.string(),
  regex_patterns: z.array(z.string()),
  keyword_triggers: z.array(z.string()),
  structural_checks: z.array(z.string()),
  permanent: z.boolean(),
  rationale: z.string(),
});

const VoiceAnchorSchema = z.object({
  path: z.string(),
  weight: z.number().min(0).max(1),
});

const FeatureFlagsSchema = z
  .object({
    scenario_3_client_proof_unlocked: z.boolean().optional().default(false),
    scenario_8_we_fixed_this_unlocked: z.boolean().optional().default(false),
  })
  .optional();

const LinkedinAccountSchema = z.object({
  composio_connection_id: z.string().min(1),
  handle: z.string().min(1),
});

const InstagramAccountSchema = z.object({
  composio_connection_id: z.string().min(1),
  handle: z.string().min(1),
});

const FacebookAccountSchema = z.object({
  composio_connection_id: z.string().min(1),
  page_id: z.string().min(1),
});

const XAccountSchema = z.object({
  composio_connection_id: z.string().min(1),
  handle: z.string().min(1),
  analytics_mode: z.enum(["full", "blind"]),
});

// TiktokAccountSchema reserved for v1.1 (Publer-based):
// const TiktokAccountSchema = z.object({
//   publer_account_id: z.string().min(1),
//   handle: z.string().min(1),
// });

const AccountsSchema = z.object({
  linkedin: LinkedinAccountSchema.optional(),
  instagram: InstagramAccountSchema.optional(),
  facebook: FacebookAccountSchema.optional(),
  x: XAccountSchema.optional(),
  // tiktok: TiktokAccountSchema.optional(),  // deferred to v1.1
});

const BrandConfigSchema = z.object({
  schema_version: z.enum(SUPPORTED_SCHEMA_VERSIONS),
  brand_key: z.string().regex(/^[a-z][a-z0-9_-]*$/, "lowercase kebab"),
  display_name: z.string().min(1),
  status: z.enum(["active", "placeholder"]),
  default_brand: z.boolean(),

  positioning: z.object({
    one_liner: z.string(),
    voice_anchors: z.array(VoiceAnchorSchema),
  }),

  voice: z.object({
    banned_words: z.array(BannedWordSchema),
    banned_structures: z.array(BannedStructureSchema),
    banned_scenarios: z.array(BannedScenarioSchema).optional().default([]),
    max_sentence_words: z.number().int().positive(),
    reading_level_max: z.number().int().positive().optional(),
    required_per_post: z.array(z.string()),
    dash_policy: z.enum(["none", "allow"]),
  }),

  visual: z.object({
    palette: z.object({
      primary: z.string(),
      secondary: z.string(),
      accent: z.string(),
      neutral_dark: z.string(),
      neutral_soft: z.string(),
    }),
    fonts: z.object({
      display: z.string(),
      body: z.string(),
      accent: z.string().optional(),
    }),
    logo: z.object({
      main: z.string(),
      watermark: z.string(),
      watermark_position: z.enum([
        "bottom-right",
        "bottom-left",
        "top-right",
        "top-left",
      ]),
      watermark_opacity: z.number().min(0).max(1),
    }),
  }),

  cadence: z.object({
    posts_per_platform_per_day: z.number().int().nonnegative(),
    platforms: z.array(
      z.enum(["linkedin", "instagram", "facebook", "x", "tiktok"]),
    ),
    exploration_ratio: z.number().min(0).max(1),
    weekly_pattern: z.object({
      monday: z.string(),
      tuesday: z.string(),
      wednesday: z.string(),
      thursday: z.string(),
      friday: z.string(),
      saturday: z.string(),
      sunday: z.string(),
    }),
  }),

  approval: z.object({
    channel_env_var: z.string().min(1),
    weekly_plan_time: z.string(),
    daily_preview_time: z.string(),
    daily_publish_pass_time: z.string(),
    approval_lapse_hours: z.number().int().positive(),
  }),

  accounts: AccountsSchema,

  sources: z.object({
    evergreen_dir: z.string(),
    lead_scrapes: z.string(),
    exa_queries: z.array(z.string()),
    kg_filter: z.array(z.string()),
    kg_blocked_patterns: z.array(z.string()),
  }),

  grind_aesthetic: z.object({
    max_per_week: z.number().int().nonnegative(),
    must_be_generic: z.boolean(),
  }),

  face_content: z.object({
    pct_of_visuals: z.number().min(0).max(1),
    ai_generation: z.enum(["never", "allow"]),
    photo_dir: z.string(),
    video_dir: z.string(),
  }),

  performance: z.object({
    collection_delay_hours: z.number().int().nonnegative(),
    weekly_analysis_time: z.string(),
    metrics_per_post: z.array(z.string()),
  }),

  feature_flags: FeatureFlagsSchema,
});

export type BrandConfig = z.infer<typeof BrandConfigSchema>;

const cache = new Map<string, BrandConfig>();
let loaded = false;

const moduleDir = dirname(fileURLToPath(import.meta.url));

function ancestorsOf(start: string): string[] {
  const out: string[] = [];
  let dir = start;
  for (;;) {
    out.push(dir);
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return out;
}

// Resolve a relative config dir by searching upward from this module's
// location, then from cwd — no fixed-depth assumption about where the
// compiled file sits. Pass 1 finds the live repo checkout (`config/brands`
// at the repo root). Pass 2 finds the bundled copy (`data/config/brands`,
// produced by scripts/bundle-data.mjs) for Railway images built with bot/
// as the root, where no repo root exists above the app.
function resolveConfigDir(dir: string): string {
  if (isAbsolute(dir)) return dir;
  const roots = [...ancestorsOf(moduleDir), ...ancestorsOf(process.cwd())];
  for (const root of roots) {
    const candidate = resolve(root, dir);
    if (existsSync(candidate)) return candidate;
  }
  for (const root of roots) {
    const candidate = resolve(root, "data", dir);
    if (existsSync(candidate)) return candidate;
  }
  // Nothing found — return a concrete path so the dir-missing warn log
  // tells the operator exactly where the loader looked last.
  return resolve(process.cwd(), dir);
}

async function loadAll(): Promise<void> {
  if (loaded) return;

  const dir = resolveConfigDir(env.content.configDir);
  let files: string[];
  try {
    files = await readdir(dir);
  } catch (err) {
    log.warn("brand_config_dir_missing", { dir, err: String(err) });
    loaded = true;
    return;
  }

  for (const filename of files) {
    if (!filename.endsWith(".yaml") || filename.startsWith("_")) continue;

    const path = resolve(dir, filename);
    try {
      const text = await readFile(path, "utf8");
      const raw = parseYaml(text);
      const config = BrandConfigSchema.parse(raw);

      const expectedKey = filename.replace(/\.yaml$/, "");
      if (config.brand_key !== expectedKey) {
        log.warn("brand_config_key_mismatch", {
          file: filename,
          declared_key: config.brand_key,
          expected_key: expectedKey,
        });
        continue;
      }

      cache.set(config.brand_key, config);
      log.info("brand_config_loaded", {
        brand: config.brand_key,
        status: config.status,
        platforms: config.cadence.platforms,
      });
    } catch (err) {
      log.error("brand_config_load_failed", {
        file: filename,
        err: String(err),
      });
    }
  }

  const defaults = [...cache.values()].filter(
    (c) => c.status === "active" && c.default_brand,
  );
  if (defaults.length > 1) {
    log.error("brand_config_multiple_defaults", {
      brands: defaults.map((d) => d.brand_key),
    });
  }

  loaded = true;
}

export async function getBrand(key: string): Promise<BrandConfig | null> {
  await loadAll();
  return cache.get(key) ?? null;
}

export async function getActiveBrands(): Promise<BrandConfig[]> {
  await loadAll();
  return [...cache.values()].filter((c) => c.status === "active");
}

export async function getDefaultBrand(): Promise<BrandConfig | null> {
  await loadAll();
  return (
    [...cache.values()].find(
      (c) => c.status === "active" && c.default_brand,
    ) ?? null
  );
}

export async function resolveChannelId(brandKey: string): Promise<string> {
  const config = await getBrand(brandKey);
  if (!config) {
    throw new Error(`Unknown brand: ${brandKey}`);
  }
  if (config.status !== "active") {
    throw new Error(
      `Brand ${brandKey} is ${config.status}, not consumable in v1`,
    );
  }
  const varName = config.approval.channel_env_var;
  const value = process.env[varName];
  if (!value || value.trim() === "") {
    throw new Error(
      `Channel env var ${varName} not set. Required for brand ${brandKey}.`,
    );
  }
  return value.trim();
}
