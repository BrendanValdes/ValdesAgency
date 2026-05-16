import type { Client, TextBasedChannel } from "discord.js";
import { ChannelType } from "discord.js";
import { env } from "./env.js";
import { log } from "./logger.js";

let client: Client | null = null;

export function bindClient(c: Client): void {
  client = c;
}

async function postAlert(title: string, body: string): Promise<void> {
  if (!client) return;
  try {
    const ch = await client.channels.fetch(env.channels.dailyBriefing);
    if (!ch || ch.type !== ChannelType.GuildText) return;
    const text = `**${title}**\n\`\`\`\n${body.slice(0, 1800)}\n\`\`\``;
    await (ch as TextBasedChannel & { send: (s: string) => Promise<unknown> }).send(text);
  } catch (err) {
    log.error("alert_post_failed", { err: String(err) });
  }
}

export async function reportError(where: string, err: unknown): Promise<void> {
  const stack = err instanceof Error ? (err.stack ?? err.message) : String(err);
  log.error("error", { where, err: stack });
  await postAlert(`ROCCO error: ${where}`, stack);
}

export function installGlobalHandlers(): void {
  process.on("unhandledRejection", (reason) => {
    void reportError("unhandledRejection", reason);
  });
  process.on("uncaughtException", (err) => {
    void reportError("uncaughtException", err);
  });
}

export async function withErrorBoundary<T>(
  where: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    await reportError(where, err);
    return null;
  }
}
