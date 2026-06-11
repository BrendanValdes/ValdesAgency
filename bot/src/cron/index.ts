import type { Client } from "discord.js";
import cron from "node-cron";
import { env } from "../env.js";
import { withErrorBoundary } from "../errors.js";
import { runApprovalBatch } from "../features/approval.js";
import { runDailyBrief } from "../features/daily-brief.js";
import { runSchedulerTick } from "../features/scheduler.js";
import { runWeeklyAudit } from "../features/weekly-audit.js";
import { log } from "../logger.js";
import { getBrand } from "../services/brand-config.js";
import { getState, laDate, mutateState } from "../services/state.js";

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

  // Gate 5: daily batch generation. Cron expression comes from the brand's
  // approval.daily_preview_time so yaml stays the source of truth; the
  // lastBatchDate guard makes restarts/redeploys idempotent for the day.
  void getBrand(env.content.defaultBrand).then((brand) => {
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
  });

  // Gate 5: posting tick — scans the queue for due posts every 5 minutes.
  cron.schedule(
    "*/5 * * * *",
    () => {
      void withErrorBoundary("cron:gate5-tick", () => runSchedulerTick(client));
    },
    { timezone: env.timezone },
  );

  log.info("cron_started", {
    timezone: env.timezone,
    jobs: [
      "daily-brief Mon-Sat 06:00",
      "weekly-audit Mon 06:00",
      "gate5-batch (from valdes.yaml daily_preview_time)",
      "gate5-tick */5min",
    ],
  });
}
