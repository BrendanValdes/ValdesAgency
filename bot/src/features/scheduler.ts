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
import { postToLinkedIn } from "../services/composio.js";
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
  const connectionId = brand?.accounts.linkedin?.composio_connection_id ?? "";
  const connectionReady =
    connectionId !== "" && connectionId !== CONNECTION_PLACEHOLDER;

  for (const entry of due) {
    if (!connectionReady) {
      // Hold with an explicit flag — never throw the whole tick, never drop.
      await mutateState((s) => {
        const q = s.queue.find((x) => x.id === entry.id);
        if (q) {
          q.status = "held";
          q.lastError = "LinkedIn Composio connection not configured";
        }
      });
      if (channelId) {
        await postToChannel(
          client,
          channelId,
          `⚠️ Post S${entry.scenarioId} is due but the LinkedIn Composio connection isn't configured (valdes.yaml accounts.linkedin.composio_connection_id). Held in queue.`,
        );
      }
      continue;
    }

    try {
      const { postUrl } = await postToLinkedIn(entry.body, connectionId);
      await mutateState((s) => {
        const q = s.queue.find((x) => x.id === entry.id);
        if (q) {
          q.status = "posted";
          q.postedAt = new Date().toISOString();
          q.postUrl = postUrl ?? undefined;
        }
      });
      log.info("gate5_posted", { id: entry.id, postUrl });
      if (channelId) {
        await postToChannel(
          client,
          channelId,
          `✅ Posted to LinkedIn (S${entry.scenarioId}): ${postUrl ?? "(no URL returned by the API — check the profile)"}`,
        );
      }
    } catch (err) {
      const attempts = entry.attempts + 1;
      const final = attempts >= MAX_POST_ATTEMPTS;
      await mutateState((s) => {
        const q = s.queue.find((x) => x.id === entry.id);
        if (q) {
          q.attempts = attempts;
          q.lastError = String(err).slice(0, 300);
          q.status = final ? "failed" : "held";
        }
      });
      log.error("gate5_post_failed", { id: entry.id, attempts, err: String(err) });
      if (channelId) {
        await postToChannel(
          client,
          channelId,
          final
            ? `🛑 LinkedIn post FAILED permanently (S${entry.scenarioId}, ${attempts}/${MAX_POST_ATTEMPTS} attempts): ${String(err).slice(0, 200)}\nDraft stays in state — repost manually or fix the connection and reset its status.`
            : `⚠️ LinkedIn post failed (S${entry.scenarioId}, attempt ${attempts}/${MAX_POST_ATTEMPTS}): ${String(err).slice(0, 200)}\nHeld in queue — retrying next tick.`,
        );
      }
    }
  }
}
