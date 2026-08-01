import type { CrawlLimits } from "./types.js";

export const RESEARCH_CRAWLER_USER_AGENT =
  "RoccoResearchCrawler/2.0 (+https://valdesagency.example/crawler-policy)";
export const RESEARCH_CRAWLER_TOKEN = "RoccoResearchCrawler";

export const DEFAULT_CRAWL_LIMITS: CrawlLimits = Object.freeze({
  maxPages: 7,
  maxSitemapFiles: 2,
  maxSitemapUrls: 100,
  maxRedirects: 5,
  maxRetries: 3,
  maxCompressedBytes: 1_000_000,
  maxDecompressedBytes: 2_000_000,
  connectionTimeoutMs: 5_000,
  responseTimeoutMs: 10_000,
  crawlDurationMs: 30_000,
  sameDomainConcurrency: 1,
});

function boundedInteger(
  name: string,
  value: number,
  minimum: number,
  maximum: number,
): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
}

export function validateCrawlLimits(limits: CrawlLimits): CrawlLimits {
  boundedInteger("Maximum pages", limits.maxPages, 1, 20);
  boundedInteger("Maximum sitemap files", limits.maxSitemapFiles, 0, 5);
  boundedInteger("Maximum sitemap URLs", limits.maxSitemapUrls, 0, 500);
  boundedInteger("Maximum redirects", limits.maxRedirects, 0, 10);
  boundedInteger("Maximum retries", limits.maxRetries, 1, 3);
  boundedInteger("Maximum compressed bytes", limits.maxCompressedBytes, 1_024, 5_000_000);
  boundedInteger("Maximum decompressed bytes", limits.maxDecompressedBytes, 1_024, 10_000_000);
  boundedInteger("Connection timeout", limits.connectionTimeoutMs, 100, 30_000);
  boundedInteger("Response timeout", limits.responseTimeoutMs, 100, 60_000);
  boundedInteger("Crawl duration", limits.crawlDurationMs, 500, 120_000);
  if (limits.maxDecompressedBytes < limits.maxCompressedBytes) {
    throw new Error("Maximum decompressed bytes cannot be smaller than compressed bytes");
  }
  if (limits.sameDomainConcurrency !== 1) {
    throw new Error("Phase 3 same-domain concurrency is fixed at one");
  }
  return { ...limits };
}

export const PERMITTED_CONTENT_TYPES = new Set([
  "text/html",
  "application/xhtml+xml",
  "text/plain",
  "application/xml",
  "text/xml",
  "application/json",
  "application/ld+json",
]);

export const RETRYABLE_HTTP_STATUSES = new Set([429, 500, 502, 503, 504]);

export function retryDelayMs(
  attempt: number,
  retryAfter: string | null,
  nowMs = Date.now(),
  random = Math.random,
): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, 30_000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.min(Math.max(0, date - nowMs), 30_000);
  }
  const base = Math.min(250 * 2 ** Math.max(0, attempt - 1), 4_000);
  return Math.round(base * (0.75 + random() * 0.5));
}
