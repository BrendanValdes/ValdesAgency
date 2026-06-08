import { REST, Routes } from "discord.js";
import { env } from "../env.js";
import { log } from "../logger.js";
import { auditNow } from "./audit-now.js";
import { briefNow } from "./brief-now.js";
import { content } from "./content.js";
import { leads } from "./leads.js";
import { onboard } from "./onboard.js";
import { ping } from "./ping.js";
import { script } from "./script.js";
import type { SlashCommand } from "./types.js";

export const commands: SlashCommand[] = [ping, briefNow, auditNow, onboard, leads, script, content];

export const commandMap = new Map<string, SlashCommand>(
  commands.map((c) => [c.data.name, c]),
);

export async function registerGuildCommands(): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(env.discord.token);
  const body = commands.map((c) => c.data.toJSON());
  await rest.put(
    Routes.applicationGuildCommands(env.discord.clientId, env.discord.guildId),
    { body },
  );
  log.info("commands_registered", { count: commands.length });
}
