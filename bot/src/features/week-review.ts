// Gate 6 Discord review flow — Round 1 (text), image gen, Round 2 (final confirm).
// ============================================================================
// Round 1: one message per post, grouped under day-header messages.
//   Emoji: 👍 approve · 👎 kill · 🔄 rewrite-once (reply with notes)
//   When allFatesResolved → runImageGenPhase() → Round 2
//
// Round 2: compiled day×platform grid + attached card images + ✅/❌ confirm.
//   ✅ from approver → schedule all approved posts into Gate5 queue.
//   ❌ → abandon, phase = cancelled.
//
// Phase deadlines: 72h text_review, 48h final_review.
//   Reminder fires at deadline-24h; lapse at deadline.
//
// Lapse sweep lives here and is called by the scheduler tick.
// ============================================================================

import { readFile, rm, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { Client, Message, MessageReaction, PartialMessageReaction, PartialUser, User } from "discord.js";
import { AttachmentBuilder, Events } from "discord.js";
import { env } from "../env.js";
import { withErrorBoundary } from "../errors.js";
import { log } from "../logger.js";
import { buildContentSystemPrompt, chat } from "../services/anthropic.js";
import { appendArchive } from "../services/state.js";
import { getBrand } from "../services/brand-config.js";
import { isBlockedByPatterns } from "../services/kg.js";
import {
  checkContentSanity,
  stripDashes,
  stripScaffolding,
  validateDraft,
} from "../services/voice-check.js";
import type { BrandConfig } from "../services/brand-config.js";
import type { WeekPlan, WeekPost } from "../services/week-state.js";
import {
  allFatesResolved,
  findWeekPostByReactMessageId,
  findWeekPostByRegenPrompt,
  getActiveWeek,
  mutateWeekState,
} from "../services/week-state.js";
import { imagesDir, renderCardToVolume } from "../services/image-cards.js";
import { WEEK_GRID } from "./week-content.js";
import { postToChannel, postToChannelTracked } from "./daily-brief.js";
import { assignSlot, formatSlotForHumans, laInstant } from "./scheduler.js";
import { getState, mutateState, resolveStateDir } from "../services/state.js";

const EMOJI_APPROVE = "👍";
const EMOJI_KILL = "👎";
const EMOJI_REGEN = "🔄";
const EMOJI_CONFIRM = "✅";
const EMOJI_ABORT = "❌";

const ROUND1_LEGEND = `${EMOJI_APPROVE} approve · ${EMOJI_KILL} kill · ${EMOJI_REGEN} rewrite once`;
const ROUND2_LEGEND = `${EMOJI_CONFIRM} schedule the week · ${EMOJI_ABORT} abort`;

const PHASE_DEADLINE_TEXT_REVIEW = 72 * 3_600_000;
const PHASE_DEADLINE_FINAL_REVIEW = 48 * 3_600_000;

// ---------------------------------------------------------------------------
// Approver identity (mirrors approval.ts)
// ---------------------------------------------------------------------------

let cachedOwnerId: string | null = null;

async function isApprover(client: Client, userId: string): Promise<boolean> {
  if (env.discord.approverUserId) return userId === env.discord.approverUserId;
  if (!cachedOwnerId) {
    const guild = await client.guilds.fetch(env.discord.guildId);
    cachedOwnerId = guild.ownerId;
  }
  return userId === cachedOwnerId;
}

// ---------------------------------------------------------------------------
// Round 1 posting
// ---------------------------------------------------------------------------

function platformEmoji(platform: string): string {
  return { linkedin: "💼", instagram: "📸", facebook: "📘" }[platform] ?? "📱";
}

function voiceStatus(post: WeekPost): string {
  return post.passed ? "✅" : `🚩 after ${post.attempts} tries`;
}

function renderPostMessage(post: WeekPost): string {
  const lines = [
    `${platformEmoji(post.platform)} **${post.platform.toUpperCase()}** — ${post.weekday} ${post.theme.replace(/_/g, " ")}`,
    `Voice: ${voiceStatus(post)}`,
  ];
  if (!post.passed && post.failures.length > 0) {
    lines.push(`Flags: ${post.failures.map((f) => `${f.check}: ${f.detail}`).join("; ")}`);
  }
  lines.push("", post.body, "", `— ${ROUND1_LEGEND}`);
  return lines.join("\n");
}

/** Post one WeekPost to Discord and update its message IDs in state. */
async function postWeekPost(
  client: Client,
  channelId: string,
  post: WeekPost,
  isRegen = false,
): Promise<void> {
  const header = isRegen ? `🔄 **Rewrite** — ${EMOJI_APPROVE} or ${EMOJI_KILL} only.\n\n` : "";
  const messages = await postToChannelTracked(client, channelId, header + renderPostMessage(post));
  const last = messages[messages.length - 1];
  if (!last) return;

  await last.react(EMOJI_APPROVE);
  await last.react(EMOJI_KILL);
  if (!isRegen) await last.react(EMOJI_REGEN);

  await mutateWeekState((s) => {
    const p = s.activeWeek?.posts.find((x) => x.id === post.id);
    if (p) {
      p.messageIds = messages.map((m) => m.id);
      p.reactMessageId = last.id;
    }
  });
}

/** Post all Round 1 messages for the active week. */
export async function postWeekRound1(client: Client): Promise<void> {
  const week = getActiveWeek();
  if (!week) throw new Error("No active week to post");
  const channelId = env.channels.contentValdes;
  if (!channelId) throw new Error("CHANNEL_CONTENT_VALDES not set");

  const header = [
    `📅 **Week ${week.id} — Round 1 text review**`,
    `${week.posts.length} posts (${WEEK_GRID.length} days × 3 platforms)`,
    `Review deadline: 72h — ${EMOJI_APPROVE}/${EMOJI_KILL}/${EMOJI_REGEN} each post.`,
  ].join("\n");
  await postToChannel(client, channelId, header);

  // Post by day so they're grouped visually.
  for (const slot of WEEK_GRID) {
    const dayPosts = week.posts.filter((p) => p.weekday === slot.weekday);
    if (dayPosts.length === 0) continue;
    const dayDate = dayPosts[0]?.day ?? "";
    await postToChannel(client, channelId, `\n📆 **${slot.weekday.toUpperCase()} · ${dayDate} — ${slot.theme.replace(/_/g, " ")}**`);
    for (const post of dayPosts) {
      await postWeekPost(client, channelId, post);
    }
  }

  const deadline = new Date(Date.now() + PHASE_DEADLINE_TEXT_REVIEW).toISOString();
  await mutateWeekState((s) => {
    if (s.activeWeek) {
      s.activeWeek.phase = "text_review";
      s.activeWeek.phaseDeadline = deadline;
    }
  });
  log.info("week_round1_posted", { weekId: week.id, posts: week.posts.length, deadline });
}

// ---------------------------------------------------------------------------
// Rewrite (Round 1 🔄)
// ---------------------------------------------------------------------------

async function regenerateWeekPost(
  client: Client,
  post: WeekPost,
  feedback: string,
): Promise<WeekPost | null> {
  const week = getActiveWeek();
  if (!week) return null;
  const brand = await getBrand(week.brandKey);
  if (!brand) return null;

  const slot = WEEK_GRID.find((s) => s.weekday === post.weekday);
  if (!slot) return null;

  const sys = await buildContentSystemPrompt(week.brandKey, { scenarioId: slot.scenarioId });
  const prompt = [
    `Rewrite the ${post.platform.toUpperCase()} post below. Brendan's notes:`,
    feedback,
    "",
    "Previous draft:",
    post.body,
    "",
    "Output ONLY the new body for this platform. No delimiters. No preamble.",
  ].join("\n");

  let body = await chat({
    model: env.models.content,
    systemContext: sys.prompt,
    userPrompt: prompt,
    maxTokens: 600,
  });
  body = brand.voice.dash_policy === "none"
    ? stripDashes(stripScaffolding(body))
    : stripScaffolding(body);

  const result = validateDraft({ voice: brand.voice }, body, { regenAttempt: 1 });
  const sanity = checkContentSanity(body, new Date().getFullYear());
  const leaked = isBlockedByPatterns(body, brand.sources.kg_blocked_patterns);
  const failures = [...result.hardFailures, ...sanity.hard, ...(leaked ? [{ check: "kg_leak_guard", detail: "blocked" }] : [])];
  const passed = failures.length === 0;

  await mutateWeekState((s) => {
    const p = s.activeWeek?.posts.find((x) => x.id === post.id);
    if (p) {
      p.body = body;
      p.passed = passed;
      p.failures = failures;
      p.attempts += 1;
      p.regenCount = 1;
      p.fate = "pending";
      p.regenPromptMessageId = undefined;
    }
  });

  // Return updated post reference for posting.
  return getActiveWeek()?.posts.find((x) => x.id === post.id) ?? null;
}

// ---------------------------------------------------------------------------
// Image gen phase
// ---------------------------------------------------------------------------

async function runImageGenPhase(client: Client): Promise<void> {
  const week = getActiveWeek();
  if (!week) return;
  const channelId = env.channels.contentValdes;
  const brand = await getBrand(week.brandKey);
  if (!brand) return;

  await mutateWeekState((s) => {
    if (s.activeWeek) s.activeWeek.phase = "image_gen";
  });
  if (channelId) await postToChannel(client, channelId, `🎨 Generating cards for approved IG/FB posts…`);

  const imagePosts = week.posts.filter(
    (p) => p.fate === "approved" && (p.platform === "instagram" || p.platform === "facebook") && !p.imageFile,
  );

  for (const post of imagePosts) {
    const slot = WEEK_GRID.find((s) => s.weekday === post.weekday);
    if (!slot) continue;
    try {
      const filename = await renderCardToVolume({
        brand,
        template: slot.cardTemplate,
        headline: post.headline,
        size: post.platform === "instagram" ? "ig" : "fb",
      });
      await mutateWeekState((s) => {
        const p = s.activeWeek?.posts.find((x) => x.id === post.id);
        if (p) p.imageFile = filename;
      });
      log.info("week_image_gen", { postId: post.id, filename });
    } catch (err) {
      log.error("week_image_gen_failed", { postId: post.id, err: String(err) });
      if (channelId) {
        await postToChannel(client, channelId, `⚠️ Card render failed for \`${post.id}\`: ${String(err).slice(0, 200)}`);
      }
    }
  }

  log.info("week_image_gen_phase_done", { weekId: week.id, rendered: imagePosts.length });
  await postWeekFinalReview(client);
}

// ---------------------------------------------------------------------------
// Round 2 — compiled final review
// ---------------------------------------------------------------------------

function formatDayGrid(week: WeekPlan, brand: BrandConfig): string {
  const lines: string[] = ["**Post plan — approve or abort:**", ""];
  const slotTimes = (brand.cadence.slot_times ?? {}) as Record<string, string[]>;

  for (const slot of WEEK_GRID) {
    const dayPosts = week.posts.filter((p) => p.weekday === slot.weekday);
    if (dayPosts.length === 0) continue;
    const dayDate = dayPosts[0]?.day ?? "";
    lines.push(`**${slot.weekday.toUpperCase()} ${dayDate}**`);
    for (const post of dayPosts) {
      if (post.fate === "killed") {
        lines.push(`  ${EMOJI_KILL} ${post.platform} — killed`);
      } else if (post.fate === "approved") {
        const platformSlots = slotTimes[post.platform] ?? ["09:00"];
        const time = platformSlots[0] ?? "09:00";
        const slotAt = laInstant(post.day, time).toISOString();
        lines.push(`  ${EMOJI_APPROVE} ${post.platform} — ${formatSlotForHumans(slotAt)}`);
      } else {
        lines.push(`  ⏳ ${post.platform} — pending (shouldn't be here, review state)`);
      }
    }
    lines.push("");
  }

  const approved = week.posts.filter((p) => p.fate === "approved").length;
  const killed = week.posts.filter((p) => p.fate === "killed").length;
  lines.push(`Total: ${approved} approved / ${killed} killed`);
  lines.push(``, `${EMOJI_CONFIRM} to schedule · ${EMOJI_ABORT} to abort`);
  return lines.join("\n");
}

export async function postWeekFinalReview(client: Client): Promise<void> {
  const week = getActiveWeek();
  if (!week) return;
  const channelId = env.channels.contentValdes;
  if (!channelId) return;
  const brand = await getBrand(week.brandKey);
  if (!brand) return;

  await mutateWeekState((s) => {
    if (s.activeWeek) {
      s.activeWeek.phase = "final_review";
      s.activeWeek.phaseDeadline = new Date(Date.now() + PHASE_DEADLINE_FINAL_REVIEW).toISOString();
    }
  });

  // Post day images first, then the summary.
  for (const slot of WEEK_GRID) {
    const imagePosts = week.posts.filter(
      (p) => p.weekday === slot.weekday && p.fate === "approved" &&
             (p.platform === "instagram" || p.platform === "facebook") && p.imageFile,
    );
    if (imagePosts.length === 0) continue;

    const header = `📸 **${slot.weekday.toUpperCase()} cards:**`;
    const ch = await client.channels.fetch(channelId);
    if (ch?.isTextBased() && "send" in ch) {
      const attachments = await Promise.all(
        imagePosts.map(async (post) => {
          const buf = await readFile(join(imagesDir(), post.imageFile!));
          return new AttachmentBuilder(buf, { name: `${post.id}.jpg` });
        }),
      );
      const captionLines = imagePosts.map(
        (p) => `${platformEmoji(p.platform)} ${p.platform}: ${p.headline}`,
      );
      await (ch as { send: (opts: unknown) => Promise<unknown> }).send({
        content: [header, ...captionLines].join("\n"),
        files: attachments,
      });
    }
  }

  // Summary message with grid.
  const grid = formatDayGrid(week, brand);
  const messages = await postToChannelTracked(client, channelId, grid);
  const last = messages[messages.length - 1];
  if (!last) return;

  await last.react(EMOJI_CONFIRM);
  await last.react(EMOJI_ABORT);

  await mutateWeekState((s) => {
    if (s.activeWeek) s.activeWeek.finalReviewMessageId = last.id;
  });
  log.info("week_final_review_posted", { weekId: week.id, messageId: last.id });
}

// ---------------------------------------------------------------------------
// Schedule confirmed week → Gate 5 queue
// ---------------------------------------------------------------------------

async function scheduleConfirmedWeek(client: Client, week: WeekPlan): Promise<void> {
  const brand = await getBrand(week.brandKey);
  if (!brand) throw new Error(`Brand ${week.brandKey} not found`);
  const channelId = env.channels.contentValdes;
  const slotTimes = brand.cadence.slot_times as Record<string, string[]>;
  const skipSundays = brand.cadence.weekly_pattern?.sunday === "no_originals";

  const toSchedule = week.posts.filter((p) => p.fate === "approved");
  const now = new Date();
  const takenByPlatform = new Map<string, string[]>();

  // Seed taken-slots from existing queue per platform.
  for (const entry of getState().queue.filter((q) => q.status === "queued" || q.status === "held")) {
    if (!takenByPlatform.has(entry.platform)) takenByPlatform.set(entry.platform, []);
    takenByPlatform.get(entry.platform)!.push(entry.slotAt);
  }

  const scheduled: Array<{ id: string; platform: string; slotAt: string }> = [];

  await mutateState((s) => {
    for (const post of toSchedule) {
      const platformSlotTimes = slotTimes[post.platform] ?? ["09:00"];
      const taken = takenByPlatform.get(post.platform) ?? [];

      // Try deterministic slot first (post.day + platform's first slot time).
      const ideal = laInstant(post.day, platformSlotTimes[0] ?? "09:00");
      const idealIso = ideal.toISOString();
      let slotAt: string;
      if (ideal.getTime() > now.getTime() + 5 * 60_000 && !taken.includes(idealIso)) {
        slotAt = idealIso;
      } else {
        // Fall back to assignSlot.
        slotAt = assignSlot({
          platform: post.platform,
          slotTimes: platformSlotTimes,
          takenSlots: taken,
          now,
          skipSundays,
        });
      }

      takenByPlatform.get(post.platform)!.push(slotAt);

      s.queue.push({
        id: post.id,
        scenarioId: post.scenarioId,
        body: post.body,
        platform: post.platform as "linkedin" | "instagram" | "facebook",
        imageFile: post.imageFile,
        slotAt,
        status: "queued",
        attempts: 0,
        approvedAt: now.toISOString(),
      });
      scheduled.push({ id: post.id, platform: post.platform, slotAt });
    }
  });

  await mutateWeekState((s) => {
    if (s.activeWeek) {
      s.activeWeek.phase = "scheduled";
      s.lastCycleStart = s.activeWeek.startDate;
    }
  });

  // Write compiled archive.
  await writeWeekArchive(week, scheduled);

  log.info("week_scheduled", { weekId: week.id, count: scheduled.length });
  if (channelId) {
    const summary = scheduled
      .map((e) => `  ${e.platform}: ${formatSlotForHumans(e.slotAt)}`)
      .join("\n");
    await postToChannel(client, channelId, `✅ **Week ${week.id} scheduled — ${scheduled.length} posts:**\n${summary}`);
  }
}

// ---------------------------------------------------------------------------
// Archive writer
// ---------------------------------------------------------------------------

async function writeWeekArchive(
  week: WeekPlan,
  scheduled: Array<{ id: string; platform: string; slotAt: string }>,
): Promise<void> {
  const slotMap = new Map(scheduled.map((e) => [e.id, e.slotAt]));
  const lines = [
    `# Week ${week.id} — ${week.startDate}`,
    `Brand: ${week.brandKey} | Cycle: ${week.cycleWeeks}w | Scheduled: ${new Date().toISOString()}`,
    "",
  ];
  for (const slot of WEEK_GRID) {
    lines.push(`## ${slot.weekday.toUpperCase()} — ${slot.theme}`);
    const dayPosts = week.posts.filter((p) => p.weekday === slot.weekday);
    for (const post of dayPosts) {
      const slotAt = slotMap.get(post.id);
      const fate = post.fate === "approved" && slotAt
        ? `SCHEDULED → ${formatSlotForHumans(slotAt)}`
        : post.fate.toUpperCase();
      lines.push(`### ${post.platform} — ${fate}`);
      lines.push(`HEADLINE: ${post.headline}`);
      lines.push("");
      lines.push(post.body);
      lines.push("");
    }
  }
  await appendArchive(week.brandKey, lines.join("\n"));
}

// ---------------------------------------------------------------------------
// React + reply listeners
// ---------------------------------------------------------------------------

export function attachWeekReviewListeners(client: Client): void {
  client.on(Events.MessageReactionAdd, (reaction, user) => {
    void withErrorBoundary("gate6:reaction", () => handleWeekReaction(client, reaction, user));
  });
  client.on(Events.MessageCreate, (message) => {
    void withErrorBoundary("gate6:regen-reply", () => handleWeekRegenReply(client, message));
  });
}

async function handleWeekReaction(
  client: Client,
  reactionRaw: MessageReaction | PartialMessageReaction,
  userRaw: User | PartialUser,
): Promise<void> {
  const reaction = reactionRaw.partial ? await reactionRaw.fetch() : reactionRaw;
  const user = userRaw.partial ? await userRaw.fetch() : userRaw;
  if (user.bot) return;
  if (reaction.message.channelId !== env.channels.contentValdes) return;
  if (!(await isApprover(client, user.id))) return;

  const emoji = reaction.emoji.name;
  const messageId = reaction.message.id;

  // Round 2 confirm/abort
  const week = getActiveWeek();
  if (week?.finalReviewMessageId === messageId) {
    if (emoji === EMOJI_CONFIRM && week.phase === "final_review") {
      await scheduleConfirmedWeek(client, week);
    } else if (emoji === EMOJI_ABORT && week.phase === "final_review") {
      await mutateWeekState((s) => {
        if (s.activeWeek) s.activeWeek.phase = "cancelled";
      });
      const channelId = env.channels.contentValdes;
      if (channelId) await postToChannel(client, channelId, `❌ Week ${week.id} aborted.`);
    }
    return;
  }

  // Round 1 per-post reactions
  if (!week || week.phase !== "text_review") return;
  if (emoji !== EMOJI_APPROVE && emoji !== EMOJI_KILL && emoji !== EMOJI_REGEN) return;

  const post = findWeekPostByReactMessageId(messageId);
  if (!post || post.fate !== "pending") return; // already handled

  const message = reaction.message.partial ? await reaction.message.fetch() : reaction.message;

  if (emoji === EMOJI_APPROVE) {
    await mutateWeekState((s) => {
      const p = s.activeWeek?.posts.find((x) => x.id === post.id);
      if (p) p.fate = "approved";
    });
    await message.reply(`✅ Approved.`);
  } else if (emoji === EMOJI_KILL) {
    await mutateWeekState((s) => {
      const p = s.activeWeek?.posts.find((x) => x.id === post.id);
      if (p) p.fate = "killed";
    });
    await message.reply(`💀 Killed.`);
  } else if (emoji === EMOJI_REGEN) {
    if (post.regenCount >= 1) {
      await message.reply(`Already rewritten once — ${EMOJI_APPROVE} or ${EMOJI_KILL}.`);
      return;
    }
    const prompt = await message.reply("Reply to THIS message with what to change (or `go` for a plain retry).");
    await mutateWeekState((s) => {
      const p = s.activeWeek?.posts.find((x) => x.id === post.id);
      if (p) {
        p.fate = "awaiting_regen_comment";
        p.regenPromptMessageId = prompt.id;
      }
    });
    return;
  }

  // Check if all fates resolved after this reaction.
  const updated = getActiveWeek();
  if (updated && allFatesResolved(updated)) {
    await message.reply("All posts reviewed — generating image cards…");
    void withErrorBoundary("gate6:image-gen", () => runImageGenPhase(client));
  }
}

async function handleWeekRegenReply(client: Client, message: Message): Promise<void> {
  if (message.author.bot) return;
  if (message.channelId !== env.channels.contentValdes) return;
  const refId = message.reference?.messageId;
  if (!refId) return;
  if (!(await isApprover(client, message.author.id))) return;

  const post =
    findWeekPostByRegenPrompt(refId) ??
    (findWeekPostByReactMessageId(refId)?.fate === "awaiting_regen_comment"
      ? findWeekPostByReactMessageId(refId)
      : undefined);
  if (!post || post.fate !== "awaiting_regen_comment") return;

  const feedback =
    message.content.trim().toLowerCase() === "go"
      ? "No specific notes — produce a meaningfully different rewrite."
      : message.content.trim();

  await message.reply("🔄 Rewriting…");

  const channelId = env.channels.contentValdes;
  if (!channelId) return;

  const updated = await regenerateWeekPost(client, post, feedback);
  if (!updated) {
    await message.reply("Regen failed — check logs.");
    return;
  }

  // Mark old message superseded.
  try {
    const ch = await client.channels.fetch(channelId);
    if (ch?.isTextBased() && "messages" in ch) {
      const old = await (ch as { messages: { fetch: (id: string) => Promise<Message> } }).messages.fetch(post.reactMessageId!);
      await old.edit(`${old.content}\n\n⛔ Superseded by rewrite below.`);
    }
  } catch (err) {
    log.warn("gate6_supersede_edit_failed", { err: String(err) });
  }

  await postWeekPost(client, channelId, updated, true);

  // If this was the last pending fate, kick image gen.
  const week = getActiveWeek();
  if (week && allFatesResolved(week)) {
    await postToChannel(client, channelId, "All posts reviewed — generating image cards…");
    void withErrorBoundary("gate6:image-gen", () => runImageGenPhase(client));
  }
}

// ---------------------------------------------------------------------------
// Lapse sweep (called from scheduler tick)
// ---------------------------------------------------------------------------

export async function sweepWeekLapsed(client: Client): Promise<void> {
  const week = getActiveWeek();
  if (!week || !["text_review", "final_review"].includes(week.phase)) return;

  const channelId = env.channels.contentValdes;
  const now = Date.now();
  const deadline = new Date(week.phaseDeadline).getTime();

  // Reminder at deadline - 24h (fire once).
  if (!week.reminderSentAt && now >= deadline - 24 * 3_600_000) {
    await mutateWeekState((s) => {
      if (s.activeWeek) s.activeWeek.reminderSentAt = new Date().toISOString();
    });
    if (channelId) {
      const pending = week.posts.filter((p) => p.fate === "pending" || p.fate === "awaiting_regen_comment");
      await postToChannel(
        client,
        channelId,
        `⏰ Week ${week.id} review deadline in 24h — ${pending.length} post${pending.length === 1 ? "" : "s"} still need ${EMOJI_APPROVE}/${EMOJI_KILL}.`,
      );
    }
    return;
  }

  // Lapse at deadline.
  if (now >= deadline) {
    await mutateWeekState((s) => {
      if (s.activeWeek) s.activeWeek.phase = "lapsed";
    });
    if (channelId) {
      await postToChannel(
        client,
        channelId,
        `⏳ Week ${week.id} ${week.phase} lapsed — deadline passed. Start a new week with /week generate.`,
      );
    }
    log.info("week_lapsed", { weekId: week.id, phase: week.phase });
  }
}

// ---------------------------------------------------------------------------
// Image cleanup — delete files >30 days old not referenced by active queue
// ---------------------------------------------------------------------------

export async function cleanupOldImages(): Promise<void> {
  const { readdir, stat } = await import("node:fs/promises");
  const dir = imagesDir();
  const cutoff = Date.now() - 30 * 24 * 3_600_000;
  const activeFiles = new Set(
    getState().queue
      .filter((q) => q.status === "queued" || q.status === "held")
      .map((q) => q.imageFile)
      .filter((f): f is string => Boolean(f)),
  );

  try {
    const files = await readdir(dir);
    let deleted = 0;
    for (const file of files) {
      if (!file.endsWith(".jpg")) continue;
      if (activeFiles.has(file)) continue;
      const fstat = await stat(join(dir, file)).catch(() => null);
      if (fstat && fstat.mtimeMs < cutoff) {
        await unlink(join(dir, file)).catch(() => null);
        deleted++;
      }
    }
    if (deleted > 0) log.info("week_image_cleanup", { deleted });
  } catch {
    // dir might not exist yet — fine.
  }
}

// ---------------------------------------------------------------------------
// Status helper (used by /week status)
// ---------------------------------------------------------------------------

export function weekStatusSummary(): string {
  const week = getActiveWeek();
  if (!week) return "No active week cycle.";
  const counts = week.posts.reduce<Record<string, number>>((acc, p) => {
    acc[p.fate] = (acc[p.fate] ?? 0) + 1;
    return acc;
  }, {});
  const countStr = Object.entries(counts)
    .map(([k, v]) => `${v} ${k}`)
    .join(" / ");
  return [
    `Week \`${week.id}\` · phase: **${week.phase}**`,
    `Start: ${week.startDate} · deadline: ${new Date(week.phaseDeadline).toLocaleString("en-US", { timeZone: env.timezone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}`,
    `Posts: ${countStr}`,
  ].join("\n");
}
