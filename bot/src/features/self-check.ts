// Gate 5 startup self-check — one message to #content-valdes on every boot.
// ============================================================================
// Production runs on Railway where env vars and the volume are mirrored by
// hand; this check makes a misconfiguration loud instead of a silent failure
// at 9am slot time. Falls back to logs + the daily-briefing alert channel if
// the content channel itself is broken.
// ============================================================================

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Client } from "discord.js";
import { ChannelType } from "discord.js";
import { request } from "undici";
import { env } from "../env.js";
import { log } from "../logger.js";
import { getToneSectionCount } from "../services/anthropic.js";
import { getBrand, resolveDataDir } from "../services/brand-config.js";
import {
  REQUIRED_TOOLS,
  getConnectedAccount,
  listToolSlugs,
} from "../services/composio.js";
import { imagesDir } from "../services/image-cards.js";
import { getState, resolveStateDir } from "../services/state.js";
import { getActiveWeek } from "../services/week-state.js";
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

  // 4. Composio connections + tool slugs — one pass per platform that is
  //    actually enabled for auto-posting (present in cadence.slot_times).
  const enabledPlatforms = Object.keys(brand?.cadence.slot_times ?? {}).filter(
    (p): p is "linkedin" | "instagram" | "facebook" => p in REQUIRED_TOOLS,
  );
  if (!env.content.composioKey) {
    lines.push({ ok: false, text: "COMPOSIO_API_KEY not set — posting disabled" });
  } else {
    for (const platform of enabledPlatforms) {
      const connectionId =
        brand?.accounts[platform]?.composio_connection_id ?? "";
      if (!connectionId || connectionId === CONNECTION_PLACEHOLDER) {
        lines.push({
          ok: false,
          text: `${platform} composio_connection_id is the placeholder — run the Composio connect step, paste the ca_... id into valdes.yaml, redeploy`,
        });
        continue;
      }
      try {
        const account = await getConnectedAccount(connectionId);
        const active = account.status.toUpperCase() === "ACTIVE";
        lines.push(
          active
            ? { ok: true, text: `Composio ${platform} connection ACTIVE` }
            : { ok: false, text: `Composio ${platform} connection status=${account.status}` },
        );
        const slugs = await listToolSlugs(platform);
        const missing = REQUIRED_TOOLS[platform].filter((t) => !slugs.includes(t));
        lines.push(
          missing.length === 0
            ? { ok: true, text: `${platform} tools available (${REQUIRED_TOOLS[platform].length})` }
            : { ok: false, text: `${platform} tools MISSING: ${missing.join(", ")} — slug drift, update composio.ts` },
        );
      } catch (err) {
        lines.push({ ok: false, text: `Composio ${platform} check failed: ${String(err).slice(0, 150)}` });
      }
    }
  }

  // 4b. Gate 6 image pipeline — only meaningful once IG/FB auto-post or the
  //     weekly cycle is on; silent otherwise to keep the daily-mode report short.
  const imagePlatforms = enabledPlatforms.filter((p) => p !== "linkedin");
  const weeklyMode = brand?.approval.mode === "weekly";
  if (imagePlatforms.length > 0 || weeklyMode) {
    try {
      const fontsDir = resolveDataDir("assets/fonts");
      await Promise.all(
        ["Fraunces-Bold.ttf", "Inter-Regular.ttf", "Inter-Medium.ttf", "Syne-Bold.ttf"].map((f) =>
          readFile(join(fontsDir, f)),
        ),
      );
      lines.push({ ok: true, text: "card fonts present (4)" });
    } catch (err) {
      lines.push({ ok: false, text: `card fonts MISSING — check bot/assets/fonts shipped: ${String(err).slice(0, 100)}` });
    }
    try {
      await mkdir(imagesDir(), { recursive: true });
      await writeFile(join(imagesDir(), ".write-probe"), "ok", "utf8");
      lines.push({ ok: true, text: `images dir writable at \`${imagesDir()}\`` });
    } catch (err) {
      lines.push({ ok: false, text: `images dir NOT writable: ${String(err).slice(0, 100)}` });
    }
  }
  if (imagePlatforms.length > 0) {
    if (!env.http.publicBaseUrl) {
      lines.push({
        ok: false,
        text: "PUBLIC_BASE_URL not set — IG/FB need a public image URL. Set it to the Railway domain.",
      });
    } else {
      try {
        const res = await request(`${env.http.publicBaseUrl}/health`, {
          method: "GET",
          headersTimeout: 10_000,
          bodyTimeout: 10_000,
        });
        await res.body.text();
        lines.push(
          res.statusCode === 200
            ? { ok: true, text: `PUBLIC_BASE_URL reachable (\`${env.http.publicBaseUrl}\`)` }
            : { ok: false, text: `PUBLIC_BASE_URL /health → ${res.statusCode} — check Railway public networking` },
        );
      } catch (err) {
        lines.push({ ok: false, text: `PUBLIC_BASE_URL unreachable: ${String(err).slice(0, 120)}` });
      }
    }
  }

  // 4c. Active week cycle, if the week store is initialized (Gate 6).
  try {
    const week = getActiveWeek();
    if (week) {
      const counts = week.posts.reduce<Record<string, number>>((acc, p) => {
        acc[p.fate] = (acc[p.fate] ?? 0) + 1;
        return acc;
      }, {});
      lines.push({
        ok: true,
        text: `active week \`${week.id}\` phase=${week.phase} (${Object.entries(counts)
          .map(([k, v]) => `${v} ${k}`)
          .join(", ")})`,
      });
    }
  } catch {
    // Week store not initialized — fine in daily mode.
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
