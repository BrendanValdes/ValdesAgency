import { describe, expect, it } from "vitest";
import { DisabledBrowserRenderer } from "../../src/lead-engine/crawl/fetchers/browser-renderer.js";
import { PlaywrightRenderer } from "../../src/lead-engine/crawl/fetchers/playwright-renderer.js";

describe("browser renderer boundary", () => {
  it("is disabled by default", async () => {
    await expect(new DisabledBrowserRenderer().render({ url: "https://clearwater.example/" })).resolves.toEqual({ status: "unavailable", reason: "disabled" });
    await expect(new PlaywrightRenderer().render({ url: "https://clearwater.example/" })).resolves.toEqual({ status: "unavailable", reason: "disabled" });
  });

  it("requires an explicit executable and still refuses without a later approved network profile", async () => {
    await expect(new PlaywrightRenderer({ enabled: true }).render({ url: "https://clearwater.example/" })).resolves.toEqual({ status: "unavailable", reason: "executable_not_configured" });
    await expect(new PlaywrightRenderer({ enabled: true, executablePath: "/definitely/not/a/browser" }).render({ url: "https://clearwater.example/" })).resolves.toEqual({ status: "unavailable", reason: "executable_unavailable" });
  });
});
