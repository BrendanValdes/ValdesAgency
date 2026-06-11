// Gate 5 startup self-check — one message to #content-valdes on every boot.
// ============================================================================
// Production runs on Railway where env vars and the volume are mirrored by
// hand; this check makes a misconfiguration loud instead of a silent failure
// at 9am slot time. Falls back to logs + the daily-briefing alert channel if
// the content channel itself is broken.
// ============================================================================

import type { Client } from "discord.js";
import { ChannelType } from "discord.js";
import { env } from "../env.js";
import { log } from "../logger.js";
import { getToneSectionCount } from "../services/anthropic.js";
import { getBrand } from "../services/brand-config.js";
import {
  LINKEDIN_POST_TOOL,
  getConnectedAccount,
  listToolSlugs,
} from "../services/composio.js";
import { getState, resolveStateDir } from "../services/state.js";
import { postToChannel } from "./daily-brief.js";

const CONNECTION_PLACEHOLDER = "[set after connect]";

type CheckLine = { ok: boolean; text: string };

export async function runGate5SelfCheck(client: Client): Promise<void> {
  const lines: CheckLine[] = [];
  const brandKey = env.content.defaultBrand;

  // 1. Brand config
  const brand = await getBrand(brandKey);
  if (brand && brand.status === "active") {
    lines.push({ ok: true, text: `brand config \`${brandKey}\` loaded, active` });
  } else {
    lines.push({
      ok: false,
      text: `brand config \`${brandKey}\` ${brand ? `status=${brand.status}` : "NOT FOUND"} — check bundle-data ran and config/brands shipped`,
    });
  }

  // 2. Tone samples
  const sections = await getToneSectionCount(brandKey);
  lines.push(
    sections > 0
      ? { ok: true, text: `tone samples loaded — ${sections} sections` }
      : { ok: false, text: "tone samples MISSING — drafts will fall back to YAML-only voice. Check bundle-data memory/voice." },
  );

  // 3. Content channel
  let channelOk = false;
  if (!env.channels.contentValdes) {
    lines.push({ ok: false, text: "CHANNEL_CONTENT_VALDES not set" });
  } else {
    try {
      const ch = await client.channels.fetch(env.channels.contentValdes);
      channelOk = ch?.type === ChannelType.GuildText;
      lines.push(
        channelOk
          ? { ok: true, text: "CHANNEL_CONTENT_VALDES resolves to a text channel" }
          : { ok: false, text: "CHANNEL_CONTENT_VALDES set but is not a guild text channel" },
      );
    } catch (err) {
      lines.push({ ok: false, text: `CHANNEL_CONTENT_VALDES fetch failed: ${String(err).slice(0, 120)}` });
    }
  }

  // 4. Composio + LinkedIn connection
  const connectionId = brand?.accounts.linkedin?.composio_connection_id ?? "";
  if (!env.content.composioKey) {
    lines.push({ ok: false, text: "COMPOSIO_API_KEY not set — posting disabled" });
  } else if (!connectionId || connectionId === CONNECTION_PLACEHOLDER) {
    lines.push({
      ok: false,
      text: "LinkedIn composio_connection_id is the placeholder — run the Composio connect step, paste the ca_... id into valdes.yaml, redeploy",
    });
  } else {
    try {
      const account = await getConnectedAccount(connectionId);
      const active = account.status.toUpperCase() === "ACTIVE";
      lines.push(
        active
          ? { ok: true, text: "Composio LinkedIn connection ACTIVE" }
          : { ok: false, text: `Composio LinkedIn connection status=${account.status}` },
      );
      const slugs = await listToolSlugs("linkedin");
      lines.push(
        slugs.includes(LINKEDIN_POST_TOOL)
          ? { ok: true, text: `post tool \`${LINKEDIN_POST_TOOL}\` available` }
          : { ok: false, text: `post tool \`${LINKEDIN_POST_TOOL}\` NOT in toolkit (${slugs.length} tools listed) — slug drift, update composio.ts` },
      );
    } catch (err) {
      lines.push({ ok: false, text: `Composio API check failed: ${String(err).slice(0, 150)}` });
    }
  }

  // 5. State dir (initStateStore already write-probed; report what loaded)
  try {
    const s = getState();
    lines.push({
      ok: true,
      text: `state at \`${resolveStateDir()}\` — pending ${s.pending.length} / queue ${s.queue.length} / shoot ${s.shootList.length}`,
    });
  } catch (err) {
    lines.push({ ok: false, text: `state store NOT initialized: ${String(err).slice(0, 120)}` });
  }

  // 6. Approver
  if (env.discord.approverUserId) {
    lines.push({ ok: true, text: `approver = APPROVER_USER_ID (${env.discord.approverUserId})` });
  } else {
    try {
      const guild = await client.guilds.fetch(env.discord.guildId);
      const owner = await guild.fetchOwner();
      lines.push({ ok: true, text: `approver = guild owner fallback (${owner.user.tag})` });
    } catch (err) {
      lines.push({ ok: false, text: `approver unresolvable: APPROVER_USER_ID unset and guild owner fetch failed (${String(err).slice(0, 100)})` });
    }
  }

  const okCount = lines.filter((l) => l.ok).length;
  const header =
    okCount === lines.length
      ? `🔎 **Gate 5 self-check — ${okCount}/${lines.length} OK**`
      : `🔎 **Gate 5 self-check — ${okCount}/${lines.length}** ⚠️ fix the ❌ lines before relying on auto-posting`;
  const report = [header, ...lines.map((l) => `${l.ok ? "✅" : "❌"} ${l.text}`)].join("\n");

  log.info("gate5_self_check", { ok: okCount, total: lines.length });
  if (channelOk && env.channels.contentValdes) {
    await postToChannel(client, env.channels.contentValdes, report);
  } else {
    // Content channel broken — alert via the daily-briefing channel instead.
    await postToChannel(client, env.channels.dailyBriefing, report);
  }
}
