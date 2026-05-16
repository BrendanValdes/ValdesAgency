import type { Client, Message } from "discord.js";
import { env } from "../env.js";
import { log } from "../logger.js";
import { chat } from "../services/anthropic.js";
import { loadAllSkills, loadLeadsFile } from "../services/skills.js";
import { withErrorBoundary } from "../errors.js";
import { chunkForDiscord } from "../utils/format.js";

let contextCache: string | null = null;

async function buildContext(): Promise<string> {
  if (contextCache) return contextCache;
  const skills = await loadAllSkills();
  const leads = await loadLeadsFile();
  const parts: string[] = [];
  for (const [name, body] of Object.entries(skills)) {
    parts.push(`--- skills/${name}.md ---\n${body}`);
  }
  if (leads) parts.push(`--- memory/leads/vegas-pool-leads.md ---\n${leads}`);
  contextCache = parts.join("\n\n");
  return contextCache;
}

export function attachOutreachListener(client: Client): void {
  client.on("messageCreate", (msg) => {
    void withErrorBoundary("outreach_chat", () => handleMessage(client, msg));
  });
}

async function handleMessage(client: Client, msg: Message): Promise<void> {
  if (msg.author.bot) return;
  if (msg.channelId !== env.channels.outreach) return;
  if (!msg.content || msg.content.trim().length < 2) return;

  if ("sendTyping" in msg.channel) {
    await msg.channel.sendTyping().catch(() => undefined);
  }

  const systemContext = await buildContext();
  const reply = await chat({
    model: env.models.outreach,
    systemContext,
    userPrompt: msg.content,
    maxTokens: 1400,
  });

  for (const chunk of chunkForDiscord(reply)) {
    await msg.reply({ content: chunk, allowedMentions: { repliedUser: false } });
  }
  log.info("outreach_reply_sent", { user: msg.author.tag, in: msg.content.length, out: reply.length });
  void client;
}
