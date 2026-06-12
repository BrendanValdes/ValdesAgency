// Gate 5 scheduler — slot assignment + the 5-minute posting tick.
// ============================================================================
// Slots are LA wall-clock times from valdes.yaml cadence.slot_times. The tick
// (cron */5) scans the persistent queue for due entries and posts them via
// Composio. Failures HOLD the entry in queue and flag #content-valdes —
// nothing is ever dropped. After 3 attempts an entry goes to "failed" but
// stays in state for manual inspection.
// ============================================================================

import type { Client } from "discord.js";
import { env } from "../env.js";
import { log } from "../logger.js";
import { getBrand } from "../services/brand-config.js";
import {
  isIgMediaNotReady,
  postToFacebook,
  postToInstagram,
  postToLinkedIn,
} from "../services/composio.js";
import { publicImageUrl } from "../services/image-cards.js";
import { getState, mutateState } from "../services/state.js";
import { sweepLapsed } from "./approval.js";
import { postToChannel } from "./daily-brief.js";

const MAX_POST_ATTEMPTS = 3;
const CONNECTION_PLACEHOLDER = "[set after connect]";

// ---------------------------------------------------------------------------
// LA wall-clock helpers (no tz library — Intl does the offset math)
// ---------------------------------------------------------------------------

/** Date parts of an instant as seen in the configured timezone. */
function tzParts(d: Date): { ymd: string; weekday: number } {
  const ymd = d.toLocaleDateString("en-CA", { timeZone: env.timezone });
  const weekdayName = d.toLocaleDateString("en-US", {
    timeZone: env.timezone,
    weekday: "short",
  });
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekdayName);
  return { ymd, weekday };
}

/** The UTC instant at which the given LA wall-clock (ymd + HH:MM) occurs.
 *  Offset computed at the naive instant, then corrected once for the result —
 *  handles the spring-forward/fall-back hour. */
export function laInstant(ymd: string, hhmm: string): Date {
  const naive = new Date(`${ymd}T${hhmm}:00Z`);
  let instant = new Date(naive.getTime() + offsetAt(naive));
  instant = new Date(naive.getTime() + offsetAt(instant));
  return instant;
}

/** Minutes-as-ms that UTC is AHEAD of the configured tz at the given instant. */
function offsetAt(d: Date): number {
  const utc = new Date(d.toLocaleString("sv-SE", { timeZone: "UTC" }).replace(" ", "T") + "Z");
  const local = new Date(
    d.toLocaleString("sv-SE", { timeZone: env.timezone }).replace(" ", "T") + "Z",
  );
  return utc.getTime() - local.getTime();
}

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`); // noon UTC avoids date-line edges
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Slot assignment
// ---------------------------------------------------------------------------

export type AssignSlotOpts = {
  platform: string;
  slotTimes: string[]; // "HH:MM" LA wall-clock, e.g. ["09:00", "13:00"]
  takenSlots: string[]; // ISO instants already claimed (queued/held entries)
  now: Date;
  skipSundays: boolean;
};

/** First free future slot: walk days from today forward, skip Sundays when
 *  the brand's weekly_pattern says no_originals, skip instants within 5
 *  minutes of now (the tick might already be past them), skip taken slots. */
export function assignSlot(opts: AssignSlotOpts): string {
  const taken = new Set(opts.takenSlots);
  const minStart = opts.now.getTime() + 5 * 60_000;
  const { ymd: todayYmd } = tzParts(opts.now);
  const sorted = [...opts.slotTimes].sort();

  for (let d = 0; d <= 30; d++) {
    const ymd = addDaysYmd(todayYmd, d);
    const probe = laInstant(ymd, "12:00");
    if (opts.skipSundays && tzParts(probe).weekday === 0) continue;
    for (const hhmm of sorted) {
      const instant = laInstant(ymd, hhmm);
      if (instant.getTime() <= minStart) continue;
      const iso = instant.toISOString();
      if (taken.has(iso)) continue;
      return iso;
    }
  }
  throw new Error(`No free ${opts.platform} slot within 30 days — queue pathology`);
}

export function formatSlotForHumans(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: env.timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

// ---------------------------------------------------------------------------
// Posting tick
// ---------------------------------------------------------------------------

export async function runSchedulerTick(client: Client): Promise<void> {
  await sweepLapsed(client);

  const now = Date.now();
  const due = getState().queue.filter(
    (q) =>
      (q.status === "queued" || q.status === "held") &&
      q.attempts < MAX_POST_ATTEMPTS &&
      new Date(q.slotAt).getTime() <= now,
  );
  if (due.length === 0) return;

  const channelId = env.channels.contentValdes;
  const brand = await getBrand(env.content.defaultBrand);

  for (const entry of due) {
    const platform = entry.platform;
    const connectionId = brand?.accounts[platform]?.composio_connection_id ?? "";
    const connectionReady = connectionId !== "" && connectionId !== CONNECTION_PLACEHOLDER;

    // Hold with an explicit flag — never throw the whole tick, never drop.
    const hold = async (reason: string) => {
      await mutateState((s) => {
        const q = s.queue.find((x) => x.id === entry.id);
        if (q) {
          q.status = "held";
          q.lastError = reason;
        }
      });
      if (channelId) {
        await postToChannel(client, channelId, `⚠️ ${platform} post \`${entry.id}\` is due but held: ${reason}`);
      }
    };

    if (!connectionReady) {
      await hold(`${platform} Composio connection not configured (valdes.yaml accounts.${platform}.composio_connection_id)`);
      continue;
    }

    // IG/FB are image posts — both need the public card URL.
    let imageUrl = "";
    if (platform === "instagram" || platform === "facebook") {
      if (!entry.imageFile) {
        await hold("entry has no imageFile — image posts cannot ship without one");
        continue;
      }
      if (!env.http.publicBaseUrl) {
        await hold("PUBLIC_BASE_URL not set — IG/FB need a public image URL");
        continue;
      }
      imageUrl = publicImageUrl(env.http.publicBaseUrl, entry.imageFile);
    }

    try {
      let postUrl: string | null = null;
      switch (platform) {
        case "linkedin": {
          ({ postUrl } = await postToLinkedIn(entry.body, connectionId));
          break;
        }
        case "instagram": {
          const result = await postToInstagram({
            caption: entry.body,
            imageUrl,
            connectedAccountId: connectionId,
            existingCreationId: entry.igCreationId,
          });
          postUrl = result.postUrl;
          break;
        }
        case "facebook": {
          ({ postUrl } = await postToFacebook({
            message: entry.body,
            imageUrl,
            connectedAccountId: connectionId,
            configuredPageId: brand?.accounts.facebook?.page_id,
          }));
          break;
        }
      }

      await mutateState((s) => {
        const q = s.queue.find((x) => x.id === entry.id);
        if (q) {
          q.status = "posted";
          q.postedAt = new Date().toISOString();
          q.postUrl = postUrl ?? undefined;
        }
      });
      log.info("gate6_posted", { id: entry.id, platform, postUrl });
      if (channelId) {
        await postToChannel(
          client,
          channelId,
          `✅ Posted to ${platform} (\`${entry.id}\`): ${postUrl ?? "(no URL returned by the API — check the profile)"}`,
        );
      }
    } catch (err) {
      // IG "media not ready": persist the container id and hold WITHOUT
      // counting an attempt — the next tick retries publish-only.
      const creationId = (err as Error & { creationId?: string }).creationId;
      if (platform === "instagram" && creationId && isIgMediaNotReady(err)) {
        await mutateState((s) => {
          const q = s.queue.find((x) => x.id === entry.id);
          if (q) {
            q.status = "held";
            q.igCreationId = creationId;
            q.lastError = `IG media processing — publish retries next tick (${String(err).slice(0, 150)})`;
          }
        });
        log.info("gate6_ig_media_pending", { id: entry.id, creationId });
        continue;
      }

      const attempts = entry.attempts + 1;
      const final = attempts >= MAX_POST_ATTEMPTS;
      await mutateState((s) => {
        const q = s.queue.find((x) => x.id === entry.id);
        if (q) {
          q.attempts = attempts;
          q.lastError = String(err).slice(0, 300);
          q.status = final ? "failed" : "held";
          // A stored container id that errored as invalid/expired must not
          // poison retries — drop it so the next attempt recreates it.
          if (platform === "instagram" && !isIgMediaNotReady(err)) {
            q.igCreationId = undefined;
          }
        }
      });
      log.error("gate6_post_failed", { id: entry.id, platform, attempts, err: String(err) });
      if (channelId) {
        await postToChannel(
          client,
          channelId,
          final
            ? `🛑 ${platform} post FAILED permanently (\`${entry.id}\`, ${attempts}/${MAX_POST_ATTEMPTS} attempts): ${String(err).slice(0, 200)}\nDraft stays in state — repost manually or fix the connection and reset its status.`
            : `⚠️ ${platform} post failed (\`${entry.id}\`, attempt ${attempts}/${MAX_POST_ATTEMPTS}): ${String(err).slice(0, 200)}\nHeld in queue — retrying next tick.`,
        );
      }
    }
  }
}
