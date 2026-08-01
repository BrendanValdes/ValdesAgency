import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function files(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const target = path.join(directory, entry);
    return statSync(target).isDirectory() ? files(target) : [target];
  });
}

describe("Phase 3 containment", () => {
  it("does not connect Lead Engine modules to the existing Rocco startup", () => {
    const startup = readFileSync(path.join(process.cwd(), "src/index.ts"), "utf8");
    expect(startup).not.toMatch(/lead-engine/);
  });

  it("does not activate policy or network fetchers through production surfaces", () => {
    const productionFiles = [
      path.join(process.cwd(), "src/index.ts"),
      ...files(path.join(process.cwd(), "src/features")),
      ...files(path.join(process.cwd(), "src/services")),
      ...files(path.join(process.cwd(), "src/cron")),
      ...files(path.join(process.cwd(), "src/commands")),
    ].filter((file) => file.endsWith(".ts"));
    const source = productionFiles.map((file) => readFileSync(file, "utf8")).join("\n");

    expect(source).not.toMatch(/lead-engine\/(?:config\/(?:lead-policy|network-capability)|crawl\/fetchers\/direct-http)/);
    expect(source).not.toMatch(/(?:createDirectHttpFetcher|NetworkPolicyAuthorizer|issuePublicWebCapability)\s*\(/);
  });

  it("contains no Discord, Anthropic, Composio, CRM, messaging, booking, or social adapter imports", () => {
    const source = files(path.join(process.cwd(), "src/lead-engine"))
      .filter((file) => file.endsWith(".ts"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    expect(source).not.toMatch(/from\s+["'](?:discord\.js|@anthropic-ai\/sdk|composio|.*(?:crm|social|booking|sms|email|calling).*adapter)/i);
    expect(source).not.toMatch(/(?:sendMessage|sendEmail|sendSms|placeCall|createBooking|publishPost)\s*\(/);
  });
});
