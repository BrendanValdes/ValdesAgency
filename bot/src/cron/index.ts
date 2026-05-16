import type { Client } from "discord.js";
import cron from "node-cron";
import { env } from "../env.js";
import { withErrorBoundary } from "../errors.js";
import { runDailyBrief } from "../features/daily-brief.js";
import { runWeeklyAudit } from "../features/weekly-audit.js";
import { log } from "../logger.js";

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

  log.info("cron_started", {
    timezone: env.timezone,
    jobs: ["daily-brief Mon-Sat 06:00", "weekly-audit Mon 06:00"],
  });
}
