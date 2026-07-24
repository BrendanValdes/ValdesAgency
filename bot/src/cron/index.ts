import type { Client } from "discord.js";
import cron from "node-cron";
import { env } from "../env.js";
import { withErrorBoundary } from "../errors.js";
import { runApprovalBatch } from "../features/approval.js";
import { runDailyBrief } from "../features/daily-brief.js";
import { runSchedulerTick } from "../features/scheduler.js";
import { runWeeklyAudit } from "../features/weekly-audit.js";
import {
  cleanupOldImages,
  postWeekRound1,
  sweepWeekLapsed,
} from "../features/week-review.js";
import { generateWeek, buildWeekPlan } from "../features/week-content.js";
import { log } from "../logger.js";
import { getBrand } from "../services/brand-config.js";
import { getState, laDate, mutateState } from "../services/state.js";
import { getActiveWeek, mutateWeekState } from "../services/week-state.js";

/** Brand yaml cron strings carry a trailing timezone token
 *  ("0 7 * * * America/Los_Angeles") — node-cron takes the tz separately. */
export function splitCronTz(value: string): { expr: string; timezone: string } {
  const parts = value.trim().split(/\s+/);
  if (parts.length >= 6 && (parts[parts.length - 1] ?? "").includes("/")) {
    return { expr: parts.slice(0, -1).join(" "), timezone: parts[parts.length - 1] ?? env.timezone };
  }
  return { expr: value.trim(), timezone: env.timezone };
}

export function startCron(client: Client): void {
  cron.schedule(
    "0 6 * * 1-6",
    () => {
      log.info("cron_daily_brief_fired");
      void withErrorBoundary("cron:daily-brief", () => runDailyBrief(client));
    },
    { timezone: env.timezone },
  );

  cron.schedule(
    "0 6 * * 1",
    () => {
      log.info("cron_weekly_audit_fired");
      void withErrorBoundary("cron:weekly-audit", () => runWeeklyAudit(client));
    },
    { timezone: env.timezone },
  );

  // Gate 5: daily batch generation. Gated on approval.mode === "daily" so
  // the weekly cycle mode silences it. Cron expression comes from the brand's
  // approval.daily_preview_time; lastBatchDate guard makes it idempotent.
  void getBrand(env.content.defaultBrand).then((brand) => {
    if (brand?.approval.mode === "weekly") {
      log.info("cron_gate5_batch_disabled", { reason: "approval.mode=weekly — Gate 6 weekly cycle active" });
    } else {
      const raw = brand?.approval.daily_preview_time ?? "0 7 * * 1-6";
      const { expr, timezone } = splitCronTz(raw);
      cron.schedule(
        expr,
        () => {
          const today = laDate();
          if (getState().lastBatchDate === today) {
            log.info("cron_gate5_batch_already_ran", { today });
            return;
          }
          log.info("cron_gate5_batch_fired", { today });
          void withErrorBoundary("cron:gate5-batch", async () => {
            await mutateState((s) => {
              s.lastBatchDate = today;
            });
            await runApprovalBatch(client);
          });
        },
        { timezone },
      );
      log.info("cron_gate5_batch_scheduled", { expr, timezone });
    }

    // Gate 6: weekly plan cron (Sun 8pm LA from approval.weekly_plan_time).
    // Only registers when approval.mode === "weekly".
    if (brand?.approval.mode === "weekly") {
      const raw = brand.approval.weekly_plan_time ?? "0 20 * * 0 America/Los_Angeles";
      const { expr, timezone } = splitCronTz(raw);
      cron.schedule(
        expr,
        () => {
          log.info("cron_gate6_weekly_fired");
          void withErrorBoundary("cron:gate6-weekly", async () => {
            const existing = getActiveWeek();
            if (existing && !["scheduled", "cancelled", "lapsed"].includes(existing.phase)) {
              log.info("cron_gate6_weekly_skipped", { weekId: existing.id, phase: existing.phase });
              return;
            }
            const brandKey = env.content.defaultBrand;
            const b = await getBrand(brandKey);
            if (!b) throw new Error(`Brand ${brandKey} not found`);
            // Next Monday (LA)
            const now = new Date();
            const todayLA = now.toLocaleDateString("en-CA", { timeZone: timezone });
            const day = new Date(`${todayLA}T12:00:00Z`);
            const weekday = day.getUTCDay();
            const daysUntilMon = weekday === 0 ? 1 : (8 - weekday) % 7 || 7;
            day.setUTCDate(day.getUTCDate() + daysUntilMon);
            const startDate = day.toISOString().slice(0, 10);
            const result = await generateWeek({ brandKey, startDate });
            const plan = buildWeekPlan(result, brandKey, startDate, b.cadence.cycle_weeks ?? 1);
            await mutateWeekState((s) => {
              s.activeWeek = plan;
              s.lastCycleStart = startDate;
            });
            await postWeekRound1(client);
            log.info("cron_gate6_weekly_done", { weekId: result.weekId, posts: result.posts.length });
          });
        },
        { timezone },
      );
      log.info("cron_gate6_weekly_scheduled", { expr, timezone });
    }
  });

  // Gate 5: posting tick — scans the queue for due posts every 5 minutes.
  // Also sweeps Gate 6 week lapse deadlines.
  cron.schedule(
    "*/5 * * * *",
    () => {
      if (env.content.socialPublishingEnabled) {
        void withErrorBoundary("cron:gate5-tick", () => runSchedulerTick(client));
      }
      void withErrorBoundary("cron:gate6-lapse", () => sweepWeekLapsed(client));
    },
    { timezone: env.timezone },
  );
  if (!env.content.socialPublishingEnabled) {
    log.info("cron_gate5_tick_disabled", { reason: "SOCIAL_PUBLISHING_ENABLED is not true" });
  }

  // Gate 6: daily image cleanup (3am LA — offpeak, before any morning posts).
  cron.schedule(
    "0 3 * * *",
    () => {
      void withErrorBoundary("cron:gate6-image-cleanup", () => cleanupOldImages());
    },
    { timezone: env.timezone },
  );

  log.info("cron_started", {
    timezone: env.timezone,
    jobs: [
      "daily-brief Mon-Sat 06:00",
      "weekly-audit Mon 06:00",
      "gate5-batch (from valdes.yaml daily_preview_time, mode=daily only)",
      "gate6-weekly (from valdes.yaml weekly_plan_time, mode=weekly only)",
      "gate5-tick + gate6-lapse-sweep */5min",
      "gate6-image-cleanup daily 03:00",
    ],
  });
}
