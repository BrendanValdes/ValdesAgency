import { SlashCommandBuilder } from "discord.js";
import { runWeeklyAudit } from "../features/weekly-audit.js";
import type { SlashCommand } from "./types.js";

export const auditNow: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("audit-now")
    .setDescription("Trigger the weekly audit on demand"),
  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });
    try {
      await runWeeklyAudit(client);
      await interaction.editReply("Weekly audit posted. Check the weekly-audit channel.");
    } catch (err) {
      await interaction.editReply(`Audit failed: ${String(err).slice(0, 500)}`);
    }
  },
};
