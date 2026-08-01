import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Phase 4B internal queue containment", () => {
  it("is absent from startup, external integrations, schedulers, and export scripts", () => {
    const root = path.resolve(process.cwd());
    const startup = readFileSync(path.join(root, "src/index.ts"), "utf8");
    const packageJson = readFileSync(path.join(root, "package.json"), "utf8");
    expect(startup).not.toMatch(/internal-calling-queue|generateInternalCallingQueue|lead_queue_/i);
    expect(packageJson).not.toMatch(/calling.queue|queue.export|lead.export/i);
    const rankingSources = ["internal-calling-queue.ts", "queue-repository.ts", "ranker.ts"]
      .map((name) => readFileSync(path.join(root, "src/lead-engine/ranking", name), "utf8")).join("\n");
    expect(rankingSources).not.toMatch(/discord|retell|crm|node-cron|scheduler|csv|fetch\(|https?:\/\//i);
  });
});
