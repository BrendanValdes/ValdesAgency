import type { ChatInputCommandInteraction, ModalSubmitInteraction } from "discord.js";
import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { env } from "../env.js";
import { log } from "../logger.js";
import { fireOnboardingWebhook } from "../services/ghl.js";

const MODAL_ID = "rocco-onboarding-modal";

export function buildOnboardingModal(): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(MODAL_ID).setTitle("Client Onboarding");

  const fields = [
    { id: "business_name", label: "Business name", style: TextInputStyle.Short, required: true },
    { id: "owner_name", label: "Owner name", style: TextInputStyle.Short, required: true },
    { id: "phone", label: "Phone", style: TextInputStyle.Short, required: true },
    { id: "email", label: "Email", style: TextInputStyle.Short, required: true },
    {
      id: "notes",
      label: "Service + monthly retainer + start date",
      style: TextInputStyle.Paragraph,
      required: true,
    },
  ] as const;

  for (const f of fields) {
    const input = new TextInputBuilder()
      .setCustomId(f.id)
      .setLabel(f.label)
      .setStyle(f.style)
      .setRequired(f.required);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  }

  return modal;
}

export async function presentOnboardingModal(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (interaction.channelId !== env.channels.onboarding) {
    await interaction.reply({
      content: `Run /onboard in <#${env.channels.onboarding}> — that's where client intake lives.`,
      ephemeral: true,
    });
    return;
  }
  await interaction.showModal(buildOnboardingModal());
}

export async function handleOnboardingSubmit(
  interaction: ModalSubmitInteraction,
): Promise<void> {
  if (interaction.customId !== MODAL_ID) return;

  const payload = {
    business_name: interaction.fields.getTextInputValue("business_name"),
    owner_name: interaction.fields.getTextInputValue("owner_name"),
    phone: interaction.fields.getTextInputValue("phone"),
    email: interaction.fields.getTextInputValue("email"),
    notes: interaction.fields.getTextInputValue("notes"),
    source: "discord-rocco-onboard",
    discord_user: interaction.user.tag,
    submitted_at: new Date().toISOString(),
  };

  await interaction.deferReply({ ephemeral: true });

  try {
    await fireOnboardingWebhook(payload);
    log.info("onboarding_submitted", { business: payload.business_name });

    await interaction.editReply({
      content: `Client logged: **${payload.business_name}** — ${payload.owner_name}. Webhook fired to GHL. Kickoff call goes in the next 48 hours.`,
    });
  } catch (err) {
    log.error("onboarding_webhook_failed", { err: String(err) });
    await interaction.editReply({
      content: `Webhook failed — payload captured in logs. Open GHL manually and create the contact: ${payload.business_name} / ${payload.email}.`,
    });
  }
}

export function isOnboardingModal(customId: string): boolean {
  return customId === MODAL_ID;
}
