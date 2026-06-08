import { SlashCommandBuilder } from "discord.js";
import { runContentBatch } from "../features/content.js";
import type { SlashCommand } from "./types.js";

export const content: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("content")
    .setDescription("Generate a content batch into #content-valdes for review")
    .addIntegerOption((opt) =>
      opt
        .setName("scenario")
        .setDescription("Generate just one scenario (1=mistake, 6=short-video, 7=long-form)")
        .setRequired(false),
    ),
  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });
    try {
      const scenario = interaction.options.getInteger("scenario");
      const scenarios = scenario === null ? undefined : [scenario];
      const { posted, clean, flagged } = await runContentBatch(client, { scenarios });
      await interaction.editReply(
        `${posted} draft${posted === 1 ? "" : "s"} posted to #content-valdes — ${clean} clean, ${flagged} flagged.`,
      );
    } catch (err) {
      await interaction.editReply(`Content batch failed: ${String(err).slice(0, 500)}`);
    }
  },
};
