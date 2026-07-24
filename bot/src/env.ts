const required = [
  "DISCORD_BOT_TOKEN",
  "DISCORD_CLIENT_ID",
  "DISCORD_GUILD_ID",
  "ANTHROPIC_API_KEY",
  "GHL_PRIVATE_TOKEN",
  "GHL_LOCATION_ID",
  "CHANNEL_DAILY_BRIEFING",
  "CHANNEL_WEEKLY_AUDIT",
  "CHANNEL_OUTREACH",
  "CHANNEL_ONBOARDING",
] as const;

type Required = (typeof required)[number];

function read(name: Required): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v.trim();
}

function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : fallback;
}

export const env = {
  discord: {
    token: read("DISCORD_BOT_TOKEN"),
    clientId: read("DISCORD_CLIENT_ID"),
    guildId: read("DISCORD_GUILD_ID"),
    // Gate 5 approver. Empty = fall back to the guild owner at runtime.
    approverUserId: optional("APPROVER_USER_ID", ""),
  },
  anthropic: {
    apiKey: read("ANTHROPIC_API_KEY"),
  },
  ghl: {
    token: read("GHL_PRIVATE_TOKEN"),
    locationId: read("GHL_LOCATION_ID"),
    onboardingWebhook: optional("GHL_ONBOARDING_WEBHOOK", ""),
  },
  channels: {
    dailyBriefing: read("CHANNEL_DAILY_BRIEFING"),
    weeklyAudit: read("CHANNEL_WEEKLY_AUDIT"),
    outreach: read("CHANNEL_OUTREACH"),
    onboarding: read("CHANNEL_ONBOARDING"),
    contentValdes: optional("CHANNEL_CONTENT_VALDES", ""),
  },
  models: {
    brief: optional("MODEL_BRIEF", "claude-sonnet-4-6"),
    audit: optional("MODEL_AUDIT", "claude-opus-4-6"),
    outreach: optional("MODEL_OUTREACH", "claude-sonnet-4-6"),
    content: optional("MODEL_CONTENT", "claude-sonnet-4-6"),
    contentAnalysis: optional("MODEL_CONTENT_ANALYSIS", "claude-opus-4-7"),
  },
  content: {
    composioKey: optional("COMPOSIO_API_KEY", ""),
    exaKey: optional("EXA_API_KEY", ""),
    higgsfieldKey: optional("HIGGSFIELD_API_KEY", ""),
    socialPublishingEnabled: process.env.SOCIAL_PUBLISHING_ENABLED === "true",
    defaultBrand: optional("BRAND_DEFAULT", "valdes"),
    configDir: optional("BRAND_CONFIG_DIR", "config/brands"),
  },
  http: {
    port: Number.parseInt(optional("PORT", "3000"), 10),
    // Railway public domain (https://...), no trailing slash. Required at
    // runtime only when IG/FB are in cadence.slot_times — IG's media
    // container must fetch the card image from a public URL. Enforced by
    // self-check, not assertEnv, so local dev boots without it.
    publicBaseUrl: optional("PUBLIC_BASE_URL", "").replace(/\/+$/, ""),
  },
  paths: {
    skillsDir: optional("SKILLS_DIR", "data/skills"),
    leadsFile: optional("LEADS_FILE", "data/leads/vegas-pool-leads.md"),
    // Gate 5 persistent state. Railway: STATE_DIR=/data (volume mount).
    // Local default "state" resolves against cwd — see resolveStateDir().
    stateDir: optional("STATE_DIR", "state"),
  },
  timezone: "America/Los_Angeles",
} as const;

export function assertEnv(): void {
  for (const key of required) read(key);
}
