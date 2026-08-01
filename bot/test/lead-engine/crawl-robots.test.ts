import { describe, expect, it } from "vitest";
import { createTestOnlyDirectHttpFetcher } from "../../src/lead-engine/crawl/fetchers/direct-http.js";
import { RobotsPolicyService } from "../../src/lead-engine/crawl/robots.js";
import { WebsiteCrawler } from "../../src/lead-engine/crawl/crawler.js";
import { startSyntheticHttpServer } from "./helpers/local-http-server.js";

describe("robots policy", () => {
  it("honors crawler-specific denial and stops before the homepage", async () => {
    const server = await startSyntheticHttpServer({ robots: "deny" });
    try {
      const fetcher = createTestOnlyDirectHttpFetcher({ allowedOrigin: server.origin });
      const result = await new WebsiteCrawler({ fetcher }).crawl({ websiteUrl: server.origin });
      expect(result.robots).toMatchObject({ status: "denied", reason: "matched_disallow", matchedRule: "/" });
      expect(result.pages[0]?.inspectionStatus).toBe("blocked");
      expect(server.counts.get("/") ?? 0).toBe(0);
    } finally {
      await server.close();
    }
  });

  it("uses wildcard fallback with longest-match allow semantics", async () => {
    const server = await startSyntheticHttpServer({ robots: "wildcard" });
    try {
      const service = new RobotsPolicyService({ fetcher: createTestOnlyDirectHttpFetcher({ allowedOrigin: server.origin }) });
      await expect(service.decide(server.url("/blocked"))).resolves.toMatchObject({ status: "denied" });
      await expect(service.decide(server.url("/blocked/public"))).resolves.toMatchObject({ status: "allowed", reason: "matched_allow" });
      expect(server.counts.get("/robots.txt")).toBe(1);
      expect(service.cacheSize).toBe(1);
    } finally {
      await server.close();
    }
  });

  it("allows a missing robots file but fails closed on robots fetch failure", async () => {
    const missing = await startSyntheticHttpServer({ robots: "missing" });
    try {
      const service = new RobotsPolicyService({ fetcher: createTestOnlyDirectHttpFetcher({ allowedOrigin: missing.origin }) });
      await expect(service.decide(missing.url("/"))).resolves.toMatchObject({ status: "allowed", reason: "not_published" });
    } finally {
      await missing.close();
    }
    const failed = await startSyntheticHttpServer({ robots: "failure" });
    try {
      const service = new RobotsPolicyService({ fetcher: createTestOnlyDirectHttpFetcher({ allowedOrigin: failed.origin }) });
      await expect(service.decide(failed.url("/"))).resolves.toMatchObject({ status: "unavailable", reason: "fetch_failed" });
    } finally {
      await failed.close();
    }
  });

  it("expires cached robots decisions at the explicit TTL", async () => {
    const server = await startSyntheticHttpServer();
    let now = new Date("2026-01-15T12:00:00.000Z");
    try {
      const service = new RobotsPolicyService({
        fetcher: createTestOnlyDirectHttpFetcher({ allowedOrigin: server.origin }),
        ttlMs: 1_000,
        now: () => now,
      });
      await service.decide(server.url("/"));
      await service.decide(server.url("/contact"));
      expect(server.counts.get("/robots.txt")).toBe(1);
      now = new Date("2026-01-15T12:00:01.001Z");
      await service.decide(server.url("/"));
      expect(server.counts.get("/robots.txt")).toBe(2);
    } finally {
      await server.close();
    }
  });
});
