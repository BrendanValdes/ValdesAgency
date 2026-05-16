import { SlashCommandBuilder } from "discord.js";
import { env } from "../env.js";
import { findLead } from "../features/leads.js";
import { chat } from "../services/anthropic.js";
import { loadSkill } from "../services/skills.js";
import { chunkForDiscord } from "../utils/format.js";
import type { SlashCommand } from "./types.js";

export const script: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("script")
    .setDescription("Personalized cold call script for a specific company")
    .addStringOption((opt) =>
      opt.setName("company").setDescription("Company name (partial match ok)").setRequired(true),
    ) as SlashCommandBuilder,
  async execute(interaction) {
    await interaction.deferReply();
    const company = interaction.options.getString("company", true);
    const lead = await findLead(company);

    const sales = await loadSkill("sales");

    const leadBlock = lead
      ? [
          `Target: ${lead.name} (Score ${lead.score})`,
          lead.owner ? `Owner: ${lead.owner}` : "",
          lead.phone ? `Phone: ${lead.phone}` : "",
          lead.website ? `Site: ${lead.website}` : "",
          lead.angle ? `Pre-built angle: ${lead.angle}` : "",
        ]
          .filter(Boolean)
          .join("\n")
      : `Target: ${company} (not in scored leads file — write the script from cold-research first principles)`;

    const reply = await chat({
      model: env.models.outreach,
      systemContext: `--- skills/sales.md ---\n${sales}`,
      userPrompt: `Write a personalized cold call script for this Vegas pool service lead.

${leadBlock}

Use the STAGE 1 — COLD DIAL structure from sales.md:
1. Opener (verbatim, customized with their actual business detail)
2. The "I'm busy" pivot
3. Qualifying questions tailored to what we know about them
4. Two objection handles likely for THIS specific lead
5. Close trigger (booking the discovery call)

Format with clear section headers. Keep the actual spoken lines short and conversational — pool guys hang up on monologues. Solo operator (Brendan dials it himself), so no Tyler references.`,
      maxTokens: 1400,
    });

    for (const chunk of chunkForDiscord(reply)) {
      await interaction.followUp({ content: chunk });
    }
  },
};
