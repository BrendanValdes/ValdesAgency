import { SlashCommandBuilder } from "discord.js";
import { formatLeadList, topLeads } from "../features/leads.js";
import type { SlashCommand } from "./types.js";

export const leads: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("leads")
    .setDescription("Top 5 Vegas pool leads with ICP scores"),
  async execute(interaction) {
    await interaction.deferReply();
    const top = await topLeads(5);
    await interaction.editReply(formatLeadList(top));
  },
};
