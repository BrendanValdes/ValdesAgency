import { describe, expect, it } from "vitest";
import { CrawlMetadataCache } from "../../src/lead-engine/crawl/cache.js";

describe("crawl metadata cache", () => {
  it("stores bounded metadata without retaining raw pages", () => {
    const cache = new CrawlMetadataCache(1);
    cache.put({
      url: "https://clearwater.example/",
      fetchedAt: "2026-01-15T12:00:00.000Z",
      expiresAt: "2026-01-16T12:00:00.000Z",
      etag: '"synthetic"',
      lastModified: null,
      contentChecksum: "a".repeat(64),
      httpStatus: 200,
      contentType: "text/html",
      robotsStatus: "allowed",
      extractionPolicyVersion: "website-extraction-1.0.0",
    });
    const value = cache.get("https://clearwater.example/", new Date("2026-01-15T13:00:00.000Z"));
    expect(value).toMatchObject({ etag: '"synthetic"', httpStatus: 200 });
    expect(value).not.toHaveProperty("body");
    cache.put({ ...value!, contentChecksum: null, etag: null, expiresAt: "2026-01-17T12:00:00.000Z" });
    expect(cache.get("https://clearwater.example/", new Date("2026-01-16T13:00:00.000Z"))?.contentChecksum).toBe("a".repeat(64));
    cache.put({ ...value!, url: "https://clearwater.example/contact" });
    expect(cache.size).toBe(1);
  });

  it("expires stale cache metadata", () => {
    const cache = new CrawlMetadataCache();
    cache.put({ url: "https://clearwater.example/", fetchedAt: "2026-01-15T12:00:00.000Z", expiresAt: "2026-01-15T13:00:00.000Z", etag: null, lastModified: null, contentChecksum: null, httpStatus: null, contentType: null, robotsStatus: "unavailable", extractionPolicyVersion: "v1" });
    expect(cache.get("https://clearwater.example/", new Date("2026-01-15T14:00:00.000Z"))).toBeNull();
  });
});
