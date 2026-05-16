import { SlashCommandBuilder } from "discord.js";
import { presentOnboardingModal } from "../features/onboarding.js";
import type { SlashCommand } from "./types.js";

export const onboard: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("onboard")
    .setDescription("Start client onboarding flow"),
  async execute(interaction) {
    await presentOnboardingModal(interaction);
  },
};
