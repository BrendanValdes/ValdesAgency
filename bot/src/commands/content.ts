import { SlashCommandBuilder } from "discord.js";
import { runApprovalBatch } from "../features/approval.js";
import type { SlashCommand } from "./types.js";

export const content: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("content")
    .setDescription("Generate a content batch into #content-valdes for emoji review")
    .addIntegerOption((opt) =>
      opt
        .setName("scenario")
        .setDescription("Generate just one scenario (1=mistake, 6=short-video, 7=long-form, 9-14=video)")
        .setRequired(false),
    ),
  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });
    try {
      const scenario = interaction.options.getInteger("scenario");
      const opts = scenario === null ? {} : { scenarios: [scenario] };
      const { posted, skippedAtCap } = await runApprovalBatch(client, opts);
      await interaction.editReply(
        skippedAtCap
          ? "Backlog at cap — clear pending drafts with 👍/👎 first."
          : `${posted} draft${posted === 1 ? "" : "s"} posted to #content-valdes — react 👍/👎/🔄 to review.`,
      );
    } catch (err) {
      await interaction.editReply(`Content batch failed: ${String(err).slice(0, 500)}`);
    }
  },
};
