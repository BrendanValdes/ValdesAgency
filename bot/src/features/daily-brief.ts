import type { Client, TextBasedChannel } from "discord.js";
import { ChannelType } from "discord.js";
import { env } from "../env.js";
import { log } from "../logger.js";
import { chat } from "../services/anthropic.js";
import { buildPipelineSnapshot } from "../services/ghl.js";
import { loadSkill } from "../services/skills.js";
import { chunkForDiscord, formatCurrency } from "../utils/format.js";

export async function runDailyBrief(client: Client): Promise<void> {
  const snapshot = await buildPipelineSnapshot();
  const sales = await loadSkill("sales");
  const lessons = await loadSkill("lessons-learned");

  const pipelineBlock = snapshot
    ? [
        `Pipeline: ${snapshot.pipelineName}`,
        `Open: ${snapshot.openCount} opps / ${formatCurrency(snapshot.totalValue)}`,
        `New today: ${snapshot.newToday} | This week: ${snapshot.newThisWeek}`,
        `Won this week: ${snapshot.wonThisWeek} | Lost: ${snapshot.lostThisWeek}`,
        "",
        "By stage:",
        ...snapshot.byStage.map(
          (s) => `  - ${s.stage}: ${s.count} opps / ${formatCurrency(s.value)}`,
        ),
      ].join("\n")
    : "Pipeline: GHL fetch failed — fix the connection before tomorrow's brief.";

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: env.timezone,
  });

  const userPrompt = `Today is ${today}.

Current pipeline state:
${pipelineBlock}

Generate the top 3 priorities for Brendan today. Format:

**${today} — ROCCO Daily Brief**

[2-line pipeline read in your voice. Numbers > adjectives.]

**Top 3 today:**
1. [specific action, who/what/by when]
2. [specific action]
3. [specific action]

**Next move:** [ONE concrete action to take in the next 60 minutes]

Hard rules:
- Short punchy sentences. No essays.
- Never start any sentence with "I" as the first word.
- Reference real numbers from the pipeline data above.
- The "Next move" must be doable in 60 minutes, today.
- Solo operator — never reference Tyler, a setter, or a partner.`;

  const context = [
    "--- skills/sales.md (sales motion) ---",
    sales,
    "--- skills/lessons-learned.md §4 (anti-pattern scan) ---",
    lessons.split("## §4")[1] ?? lessons.slice(-2000),
  ].join("\n\n");

  const text = await chat({
    model: env.models.brief,
    systemContext: context,
    userPrompt,
    maxTokens: 900,
  });

  await postToChannel(client, env.channels.dailyBriefing, text);
  log.info("daily_brief_posted", { length: text.length });
}

export async function postToChannel(
  client: Client,
  channelId: string,
  text: string,
): Promise<void> {
  const ch = await client.channels.fetch(channelId);
  if (!ch || ch.type !== ChannelType.GuildText) {
    throw new Error(`Channel ${channelId} not text-based`);
  }
  const sender = ch as TextBasedChannel & { send: (s: string) => Promise<unknown> };
  for (const chunk of chunkForDiscord(text)) {
    await sender.send(chunk);
  }
}
