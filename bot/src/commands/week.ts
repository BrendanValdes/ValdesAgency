import { SlashCommandBuilder } from "discord.js";
import { env } from "../env.js";
import { getBrand } from "../services/brand-config.js";
import { initWeekStateStore, getActiveWeek, mutateWeekState } from "../services/week-state.js";
import { generateWeek, buildWeekPlan } from "../features/week-content.js";
import { postWeekRound1, weekStatusSummary } from "../features/week-review.js";
import type { SlashCommand } from "./types.js";

export const week: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("week")
    .setDescription("Manage the weekly content cycle (Gate 6)")
    .addSubcommand((sub) =>
      sub
        .setName("generate")
        .setDescription("Generate a new weekly content batch and post for Round 1 review")
        .addStringOption((opt) =>
          opt
            .setName("start")
            .setDescription("Monday start date YYYY-MM-DD (defaults to next Monday LA)")
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("status").setDescription("Show the current week cycle status"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("cancel")
        .setDescription("Cancel and discard the active week (irreversible)")
        .addBooleanOption((opt) =>
          opt.setName("confirm").setDescription("Must be true to cancel").setRequired(true),
        ),
    ),
  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();

    if (sub === "status") {
      await interaction.reply({ content: weekStatusSummary(), ephemeral: true });
      return;
    }

    if (sub === "cancel") {
      const confirm = interaction.options.getBoolean("confirm", true);
      if (!confirm) {
        await interaction.reply({ content: "Pass `confirm: True` to cancel.", ephemeral: true });
        return;
      }
      const week = getActiveWeek();
      if (!week) {
        await interaction.reply({ content: "No active week to cancel.", ephemeral: true });
        return;
      }
      await mutateWeekState((s) => {
        if (s.activeWeek) s.activeWeek.phase = "cancelled";
      });
      await interaction.reply({ content: `Week \`${week.id}\` cancelled.`, ephemeral: true });
      return;
    }

    // generate
    await interaction.deferReply({ ephemeral: true });
    try {
      const existing = getActiveWeek();
      if (existing && !["scheduled", "cancelled", "lapsed"].includes(existing.phase)) {
        await interaction.editReply(
          `Week \`${existing.id}\` is still in **${existing.phase}** — cancel it first with \`/week cancel confirm:True\`.`,
        );
        return;
      }

      const brandKey = env.content.defaultBrand;
      const brand = await getBrand(brandKey);
      if (!brand) throw new Error(`Brand ${brandKey} not found`);

      // Resolve start date.
      const startArg = interaction.options.getString("start");
      let startDate: string;
      if (startArg) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(startArg)) {
          await interaction.editReply("Invalid start date — use YYYY-MM-DD.");
          return;
        }
        startDate = startArg;
      } else {
        // Next Monday LA.
        const now = new Date();
        const day = new Date(
          now.toLocaleDateString("en-CA", { timeZone: env.timezone }) + "T12:00:00Z",
        );
        const weekday = day.getUTCDay();
        const daysUntilMon = weekday === 0 ? 1 : (8 - weekday) % 7 || 7;
        day.setUTCDate(day.getUTCDate() + daysUntilMon);
        startDate = day.toISOString().slice(0, 10);
      }

      await interaction.editReply(`Generating week starting ${startDate}… (~30–90s, making API calls)`);

      const result = await generateWeek({ brandKey, startDate });
      const plan = buildWeekPlan(result, brandKey, startDate, brand.cadence.cycle_weeks ?? 1);

      await mutateWeekState((s) => {
        s.activeWeek = plan;
        s.lastCycleStart = startDate;
      });

      await postWeekRound1(client);

      const passCount = result.posts.filter((p) => p.passed).length;
      await interaction.editReply(
        `✅ Week \`${result.weekId}\` posted — ${result.posts.length} posts, ${passCount} passed voice-check. Review in #content-valdes.`,
      );
    } catch (err) {
      await interaction.editReply(`/week generate failed: ${String(err).slice(0, 500)}`);
    }
  },
};
