// Gate 5 approval flow — emoji-reaction review in #content-valdes.
// ============================================================================
// Every batch posts each draft as its own message. Brendan reacts:
//   👍 approve  → text drafts get a LinkedIn slot in the posting queue;
//                 video drafts go to the shoot list, NEVER the queue
//   👎 kill     → removed, archived KILLED
//   🔄 rewrite  → ONE rewrite per draft; bot prompts for a reply with notes,
//                 the reply text feeds regenerateDraft()
// Idempotency: an entry leaves `pending` on its first action, so double-reacts
// and reacts on already-handled drafts find nothing and no-op silently.
// ============================================================================

import type { Client, Message, MessageReaction, PartialMessageReaction, PartialUser, User } from "discord.js";
import { Events } from "discord.js";
import { env } from "../env.js";
import { withErrorBoundary } from "../errors.js";
import { log } from "../logger.js";
import { getBrand } from "../services/brand-config.js";
import {
  findPendingByReactMessageId,
  findPendingByRegenPrompt,
  getState,
  laDate,
  mutateState,
  appendArchive,
  unapprovedCount,
} from "../services/state.js";
import type { PendingDraft } from "../services/state.js";
import { generateDrafts, getSpec, regenerateDraft } from "./content.js";
import type { Draft } from "./content.js";
import { postToChannel, postToChannelTracked } from "./daily-brief.js";
import { assignSlot, formatSlotForHumans } from "./scheduler.js";

const UNAPPROVED_CAP = 6;
const EMOJI_APPROVE = "👍";
const EMOJI_KILL = "👎";
const EMOJI_REGEN = "🔄";
const CONTROL_LEGEND = `${EMOJI_APPROVE} approve · ${EMOJI_KILL} kill · ${EMOJI_REGEN} rewrite once (reply with notes)`;

function draftId(scenarioId: number): string {
  const ymd = laDate().replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ymd}-S${scenarioId}-${rand}`;
}

function renderApprovalDraft(n: number, total: number, d: Draft): string {
  const spec = getSpec(d.scenarioId);
  const formatTag = d.format === "video" ? " 🎬 VIDEO SCRIPT (approves to shoot list)" : "";
  const status = d.passed ? "✅ PASS" : `🚩 FLAGGED after ${d.attempts} attempts`;
  const lines = [
    `**Draft ${n}/${total} — S${d.scenarioId} ${spec.name} — ${spec.platform}${formatTag}**`,
    `Voice: ${status}`,
  ];
  if (d.failures.length > 0) {
    const label = d.passed ? "Review flags" : "Failures";
    lines.push(`${label}: ${d.failures.map((f) => `${f.check} — ${f.detail}`).join("; ")}`);
  }
  lines.push("", d.body, "", `— ${CONTROL_LEGEND}`);
  return lines.join("\n");
}

async function seedReactions(msg: Message, includeRegen: boolean): Promise<void> {
  await msg.react(EMOJI_APPROVE);
  await msg.react(EMOJI_KILL);
  if (includeRegen) await msg.react(EMOJI_REGEN);
}

async function postPendingDraft(
  client: Client,
  channelId: string,
  d: Draft,
  opts: { n: number; total: number; regenCount: 0 | 1; replacesId?: string },
): Promise<void> {
  const seeds = d.seeds.map((s) => ({ city: s.city, tier: s.tier, diagnosis: s.diagnosis }));
  const header = opts.regenCount === 1 ? `🔄 **Rewrite** of the draft below — ${EMOJI_APPROVE} or ${EMOJI_KILL} only.\n\n` : "";
  const text = header + renderApprovalDraft(opts.n, opts.total, d);
  const messages = await postToChannelTracked(client, channelId, text);
  const last = messages[messages.length - 1];
  if (!last) throw new Error("postToChannelTracked returned no messages");
  await seedReactions(last, opts.regenCount === 0);

  const entry: PendingDraft = {
    id: opts.replacesId ?? draftId(d.scenarioId),
    channelId,
    messageIds: messages.map((m) => m.id),
    reactMessageId: last.id,
    scenarioId: d.scenarioId,
    format: d.format,
    body: d.body,
    seeds,
    passed: d.passed,
    failures: d.failures,
    createdAt: new Date().toISOString(),
    regenCount: opts.regenCount,
    status: "pending",
  };
  // Persist IMMEDIATELY (per draft) — the reaction can arrive any moment.
  await mutateState((s) => {
    s.pending = s.pending.filter((p) => p.id !== entry.id);
    s.pending.push(entry);
  });
  await appendArchive(env.content.defaultBrand, [
    `## ${entry.id} — S${d.scenarioId} [${d.format}] ${opts.regenCount === 1 ? "REGEN" : "PENDING"}`,
    "",
    d.body,
  ].join("\n"));
}

// ---------------------------------------------------------------------------
// Batch generation (cron + /content)
// ---------------------------------------------------------------------------

export async function runApprovalBatch(
  client: Client,
  opts: { scenarios?: number[] } = {},
): Promise<{ posted: number; skippedAtCap: boolean }> {
  const channelId = env.channels.contentValdes;
  if (!channelId) {
    throw new Error("CHANNEL_CONTENT_VALDES is not set — can't post the approval batch.");
  }

  const planned = opts.scenarios?.length ?? 3;
  const backlog = unapprovedCount();
  if (backlog + planned > UNAPPROVED_CAP) {
    await postToChannel(
      client,
      channelId,
      `⏸️ Backlog at cap (${backlog} pending, cap ${UNAPPROVED_CAP}). Skipping today's batch — clear ${EMOJI_APPROVE}/${EMOJI_KILL} to resume.`,
    );
    log.info("gate5_batch_skipped_at_cap", { backlog });
    return { posted: 0, skippedAtCap: true };
  }

  const { brand, cluster, drafts } = await generateDrafts(
    opts.scenarios ? { scenarios: opts.scenarios } : {},
  );

  await postToChannel(
    client,
    channelId,
    `📝 **Content batch — ${brand.display_name}** · ${drafts.length} draft${drafts.length === 1 ? "" : "s"} · seeds from ${cluster.length} pool diagnoses · react to review`,
  );

  let n = 0;
  for (const d of drafts) {
    n += 1;
    await postPendingDraft(client, channelId, d, { n, total: drafts.length, regenCount: 0 });
  }
  log.info("gate5_batch_posted", { drafts: drafts.length });
  return { posted: drafts.length, skippedAtCap: false };
}

// ---------------------------------------------------------------------------
// Approver identity
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
// Reaction + regen-reply listeners
// ---------------------------------------------------------------------------

export function attachApprovalListeners(client: Client): void {
  client.on(Events.MessageReactionAdd, (reaction, user) => {
    void withErrorBoundary("gate5:reaction", () => handleReaction(client, reaction, user));
  });
  client.on(Events.MessageCreate, (message) => {
    void withErrorBoundary("gate5:regen-reply", () => handleRegenReply(client, message));
  });
}

async function handleReaction(
  client: Client,
  reactionRaw: MessageReaction | PartialMessageReaction,
  userRaw: User | PartialUser,
): Promise<void> {
  const reaction = reactionRaw.partial ? await reactionRaw.fetch() : reactionRaw;
  const user = userRaw.partial ? await userRaw.fetch() : userRaw;
  if (user.bot) return;
  if (reaction.message.channelId !== env.channels.contentValdes) return;

  const emoji = reaction.emoji.name;
  if (emoji !== EMOJI_APPROVE && emoji !== EMOJI_KILL && emoji !== EMOJI_REGEN) return;
  if (!(await isApprover(client, user.id))) return;

  const pending = findPendingByReactMessageId(reaction.message.id);
  if (!pending) return; // already handled / not a draft → silent no-op

  const message = reaction.message.partial ? await reaction.message.fetch() : reaction.message;

  if (emoji === EMOJI_APPROVE) {
    if (pending.format === "video") {
      await approveVideo(message, pending);
    } else {
      await approveText(message, pending);
    }
    return;
  }
  if (emoji === EMOJI_KILL) {
    await mutateState((s) => {
      s.pending = s.pending.filter((p) => p.id !== pending.id);
    });
    await appendArchive(env.content.defaultBrand, `## ${pending.id} — KILLED\n\n${pending.body}`);
    await message.reply("Killed.");
    return;
  }
  // 🔄
  if (pending.regenCount >= 1) {
    await message.reply(`Already rewritten once — ${EMOJI_APPROVE} or ${EMOJI_KILL}.`);
    return;
  }
  const prompt = await message.reply(
    "Reply to THIS message with what to change (or reply `go` for a plain retry).",
  );
  await mutateState((s) => {
    const p = s.pending.find((x) => x.id === pending.id);
    if (p) {
      p.status = "awaiting_regen_comment";
      p.regenPromptMessageId = prompt.id;
    }
  });
}

async function approveText(message: Message, pending: PendingDraft): Promise<void> {
  const brand = await getBrand(env.content.defaultBrand);
  const slotTimes = brand?.cadence.slot_times?.linkedin ?? ["09:00"];
  const skipSundays = brand?.cadence.weekly_pattern.sunday === "no_originals";
  const taken = getState()
    .queue.filter((q) => q.platform === "linkedin" && (q.status === "queued" || q.status === "held"))
    .map((q) => q.slotAt);
  const slotAt = assignSlot({
    platform: "linkedin",
    slotTimes,
    takenSlots: taken,
    now: new Date(),
    skipSundays,
  });

  await mutateState((s) => {
    s.pending = s.pending.filter((p) => p.id !== pending.id);
    s.queue.push({
      id: pending.id,
      scenarioId: pending.scenarioId,
      body: pending.body,
      platform: "linkedin",
      slotAt,
      status: "queued",
      attempts: 0,
      approvedAt: new Date().toISOString(),
    });
  });
  await appendArchive(
    env.content.defaultBrand,
    `## ${pending.id} — APPROVED → LinkedIn slot ${slotAt}\n\n${pending.body}`,
  );
  await message.reply(`Approved. LinkedIn slot: ${formatSlotForHumans(slotAt)}.`);
}

async function approveVideo(message: Message, pending: PendingDraft): Promise<void> {
  let position = 0;
  await mutateState((s) => {
    s.pending = s.pending.filter((p) => p.id !== pending.id);
    s.shootList.push({
      id: pending.id,
      scenarioId: pending.scenarioId,
      body: pending.body,
      cities: [...new Set(pending.seeds.map((x) => x.city))],
      approvedAt: new Date().toISOString(),
    });
    position = s.shootList.length;
  });
  await appendArchive(
    env.content.defaultBrand,
    `## ${pending.id} — APPROVED-SHOOT (video script)\n\n${pending.body}`,
  );
  await message.reply(`Script approved → shoot list (#${position}). Never auto-posts.`);
}

async function handleRegenReply(client: Client, message: Message): Promise<void> {
  if (message.author.bot) return;
  if (message.channelId !== env.channels.contentValdes) return;
  const refId = message.reference?.messageId;
  if (!refId) return;
  if (!(await isApprover(client, message.author.id))) return;

  const pending =
    findPendingByRegenPrompt(refId) ??
    (findPendingByReactMessageId(refId)?.status === "awaiting_regen_comment"
      ? findPendingByReactMessageId(refId)
      : undefined);
  if (!pending || pending.status !== "awaiting_regen_comment") return;

  const feedback = message.content.trim().toLowerCase() === "go"
    ? "No specific notes — produce a meaningfully different rewrite of the same scenario."
    : message.content.trim();

  await message.reply("🔄 Rewriting…");
  const draft = await regenerateDraft({
    brandKey: env.content.defaultBrand,
    scenarioId: pending.scenarioId,
    seeds: pending.seeds,
    previousBody: pending.body,
    feedback,
  });

  // Mark the old draft message superseded (edit, not delete — audit trail).
  try {
    const channel = await client.channels.fetch(pending.channelId);
    if (channel?.isTextBased() && "messages" in channel) {
      const old = await channel.messages.fetch(pending.reactMessageId);
      await old.edit(`${old.content}\n\n⛔ Superseded by rewrite below.`);
    }
  } catch (err) {
    log.warn("gate5_supersede_edit_failed", { err: String(err) });
  }

  // Same id, regenCount 1 — postPendingDraft replaces the pending entry.
  await postPendingDraft(client, pending.channelId, draft, {
    n: 1,
    total: 1,
    regenCount: 1,
    replacesId: pending.id,
  });
}

// ---------------------------------------------------------------------------
// Lapse sweep (called from the scheduler tick)
// ---------------------------------------------------------------------------

export async function sweepLapsed(client: Client): Promise<void> {
  const brand = await getBrand(env.content.defaultBrand);
  const lapseHours = brand?.approval.approval_lapse_hours ?? 48;
  const cutoff = Date.now() - lapseHours * 3_600_000;
  const lapsed = getState().pending.filter((p) => new Date(p.createdAt).getTime() < cutoff);
  if (lapsed.length === 0) return;

  await mutateState((s) => {
    s.pending = s.pending.filter((p) => new Date(p.createdAt).getTime() >= cutoff);
  });
  for (const p of lapsed) {
    await appendArchive(env.content.defaultBrand, `## ${p.id} — LAPSED (${lapseHours}h)\n\n${p.body}`);
    try {
      const channel = await client.channels.fetch(p.channelId);
      if (channel?.isTextBased() && "messages" in channel) {
        const msg = await channel.messages.fetch(p.reactMessageId);
        await msg.edit(`${msg.content}\n\n⏳ Lapsed (${lapseHours}h) — regenerate via /content if still wanted.`);
      }
    } catch (err) {
      log.warn("gate5_lapse_edit_failed", { id: p.id, err: String(err) });
    }
  }
  log.info("gate5_lapsed_swept", { count: lapsed.length });
}
