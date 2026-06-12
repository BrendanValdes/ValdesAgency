import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import { commandMap, registerGuildCommands } from "./commands/index.js";
import { startCron } from "./cron/index.js";
import { assertEnv, env } from "./env.js";
import { bindClient, installGlobalHandlers, reportError, withErrorBoundary } from "./errors.js";
import { attachApprovalListeners } from "./features/approval.js";
import { attachOutreachListener } from "./features/outreach-chat.js";
import { attachWeekReviewListeners } from "./features/week-review.js";
import { handleOnboardingSubmit, isOnboardingModal } from "./features/onboarding.js";
import { runGate5SelfCheck } from "./features/self-check.js";
import { markDiscordReady, startHealthServer } from "./health.js";
import { log } from "./logger.js";
import { initStateStore } from "./services/state.js";
import { initWeekStateStore } from "./services/week-state.js";

async function main(): Promise<void> {
  assertEnv();
  installGlobalHandlers();
  startHealthServer();

  // Gate 5 persistence — fail startup loudly if STATE_DIR is unwritable.
  await initStateStore();
  // Gate 6 persistence — separate file, same directory.
  await initWeekStateStore();

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      // Gate 5 approval flow — without this the reaction listener never fires.
      GatewayIntentBits.GuildMessageReactions,
    ],
    // Reaction + User partials: reactions on messages posted before the last
    // restart arrive partial and must be fetch()ed in the handler.
    partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User],
  });

  bindClient(client);

  client.once(Events.ClientReady, (c) => {
    markDiscordReady();
    log.info("discord_ready", { tag: c.user.tag });
    void withErrorBoundary("gate5:self-check", () => runGate5SelfCheck(client));
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
  attachApprovalListeners(client);
  attachWeekReviewListeners(client);

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
