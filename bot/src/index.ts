import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import { commandMap, registerGuildCommands } from "./commands/index.js";
import { startCron } from "./cron/index.js";
import { assertEnv, env } from "./env.js";
import { bindClient, installGlobalHandlers, reportError, withErrorBoundary } from "./errors.js";
import { attachOutreachListener } from "./features/outreach-chat.js";
import { handleOnboardingSubmit, isOnboardingModal } from "./features/onboarding.js";
import { markDiscordReady, startHealthServer } from "./health.js";
import { log } from "./logger.js";

async function main(): Promise<void> {
  assertEnv();
  installGlobalHandlers();
  startHealthServer();

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel, Partials.Message],
  });

  bindClient(client);

  client.once(Events.ClientReady, (c) => {
    markDiscordReady();
    log.info("discord_ready", { tag: c.user.tag });
  });

  client.on(Events.InteractionCreate, (interaction) => {
    void withErrorBoundary("interaction", async () => {
      if (interaction.isChatInputCommand()) {
        const cmd = commandMap.get(interaction.commandName);
        if (!cmd) return;
        await cmd.execute(interaction, client);
        return;
      }
      if (interaction.isModalSubmit()) {
        if (isOnboardingModal(interaction.customId)) {
          await handleOnboardingSubmit(interaction);
        }
      }
    });
  });

  attachOutreachListener(client);

  await registerGuildCommands();
  await client.login(env.discord.token);

  startCron(client);

  log.info("rocco_online", {
    daily_brief_channel: env.channels.dailyBriefing,
    weekly_audit_channel: env.channels.weeklyAudit,
    outreach_channel: env.channels.outreach,
    onboarding_channel: env.channels.onboarding,
    models: env.models,
  });
}

main().catch((err) => {
  log.error("startup_failed", { err: String(err) });
  void reportError("startup", err);
  process.exitCode = 1;
});
