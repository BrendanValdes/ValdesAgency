import { SlashCommandBuilder } from "discord.js";
import { runDailyBrief } from "../features/daily-brief.js";
import type { SlashCommand } from "./types.js";

export const briefNow: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("brief-now")
    .setDescription("Trigger the daily brief on demand"),
  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });
    try {
      await runDailyBrief(client);
      await interaction.editReply("Daily brief posted. Check the daily-briefing channel.");
    } catch (err) {
      await interaction.editReply(`Brief failed: ${String(err).slice(0, 500)}`);
    }
  },
};
