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
  },
  models: {
    brief: optional("MODEL_BRIEF", "claude-sonnet-4-6"),
    audit: optional("MODEL_AUDIT", "claude-opus-4-6"),
    outreach: optional("MODEL_OUTREACH", "claude-sonnet-4-6"),
  },
  http: {
    port: Number.parseInt(optional("PORT", "3000"), 10),
  },
  paths: {
    skillsDir: optional("SKILLS_DIR", "data/skills"),
    leadsFile: optional("LEADS_FILE", "data/leads/vegas-pool-leads.md"),
  },
  timezone: "America/Los_Angeles",
} as const;

export function assertEnv(): void {
  for (const key of required) read(key);
}
