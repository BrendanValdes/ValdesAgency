import { describe, expect, it } from "vitest";
import { WebsiteCrawler } from "../../src/lead-engine/crawl/crawler.js";
import { createTestOnlyDirectHttpFetcher } from "../../src/lead-engine/crawl/fetchers/direct-http.js";
import { DEFAULT_CRAWL_LIMITS, validateCrawlLimits } from "../../src/lead-engine/crawl/policies.js";
import { startSyntheticHttpServer } from "./helpers/local-http-server.js";

describe("bounded crawl", () => {
  it("keeps page, sitemap, domain, and concurrency limits deterministic", async () => {
    const server = await startSyntheticHttpServer();
    try {
      const fetcher = createTestOnlyDirectHttpFetcher({ allowedOrigin: server.origin });
      const result = await new WebsiteCrawler({ fetcher }).crawl({ websiteUrl: server.origin });
      expect(result.pages.length).toBeLessThanOrEqual(7);
      expect(result.pages[0]).toMatchObject({ kind: "homepage", inspectionStatus: "successful" });
      expect(result.pages.every((page) => new URL(page.url).origin === server.origin)).toBe(true);
      expect(result.pages.some((page) => page.url.includes("/blog/"))).toBe(false);
      expect(server.counts.get("/sitemap.xml")).toBe(1);
    } finally {
      await server.close();
    }
  });

  it("validates hard maximums and fixes same-domain concurrency at one", () => {
    expect(() => validateCrawlLimits({ ...DEFAULT_CRAWL_LIMITS, maxPages: 0 })).toThrow();
    expect(() => validateCrawlLimits({ ...DEFAULT_CRAWL_LIMITS, maxRetries: 4 })).toThrow();
    expect(() => validateCrawlLimits({ ...DEFAULT_CRAWL_LIMITS, sameDomainConcurrency: 2 as 1 })).toThrow("fixed at one");
  });
});
