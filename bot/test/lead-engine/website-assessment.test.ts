import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DisabledBrowserRenderer } from "../../src/lead-engine/crawl/fetchers/browser-renderer.js";
import type { CrawlResult } from "../../src/lead-engine/crawl/types.js";
import { extractBusinessIdentity } from "../../src/lead-engine/extraction/business-identity.js";
import { extractConversionSignals } from "../../src/lead-engine/extraction/conversion.js";
import { extractHtml } from "../../src/lead-engine/extraction/html.js";
import { extractJsonLd } from "../../src/lead-engine/extraction/json-ld.js";
import { assessBusinessOperationalEvidence } from "../../src/lead-engine/validation/business-operational.js";
import { assessConversionFeatures } from "../../src/lead-engine/validation/website-assessment.js";
import { startSyntheticHttpServer } from "./helpers/local-http-server.js";
import { createSyntheticLoopbackFetcher } from "./helpers/test-loopback-fetcher.js";

const assessedAt = "2026-01-15T12:00:00.000Z";
const freshUntil = "2026-01-16T12:00:00.000Z";

function crawlWith(status: "successful" | "blocked" | "failed", html: string | null, url = "https://clearwater.example/"): CrawlResult {
  const checksum = html ? createHash("sha256").update(html).digest("hex") : null;
  const fetch = status === "successful" && html ? {
    ok: true as const, requestedUrl: url, finalUrl: url, status: 200, contentType: "text/html", body: html,
    compressedBytes: Buffer.byteLength(html), decompressedBytes: Buffer.byteLength(html), contentChecksum: checksum!, etag: null,
    lastModified: null, redirectHistory: [], fetchedAt: assessedAt, attempts: 1,
  } : status === "failed" ? {
    ok: false as const, requestedUrl: url, finalUrl: url, errorCode: "connection_failure" as const, retryable: true,
    attempts: 3, redirectHistory: [], fetchedAt: assessedAt, httpStatus: null,
  } : null;
  const robots = { origin: new URL(url).origin, robotsUrl: new URL("/robots.txt", url).href, status: status === "blocked" ? "denied" as const : "allowed" as const, reason: status === "blocked" ? "matched_disallow" as const : "no_matching_rule" as const, matchedRule: status === "blocked" ? "/" : null, fetchedAt: assessedAt, expiresAt: freshUntil, contentChecksum: null, sitemapUrls: [] };
  return { requestedUrl: url, sourceClass: "synthetic_fixture", canonicalHomepage: url, startedAt: assessedAt, completedAt: assessedAt,
    pages: [{ url, kind: "homepage", inspectionStatus: status, fetch, html }], robots, robotsDecisions: [robots],
    complete: status === "successful", timedOut: false };
}

describe("website assessment semantics", () => {
  it("allows absence only after a complete, successful, fresh inspection", async () => {
    const server = await startSyntheticHttpServer();
    try {
      const fetched = await createSyntheticLoopbackFetcher({ allowedOrigin: server.origin }).fetch({ url: server.url("/missing-features") });
      expect(fetched.ok).toBe(true);
      if (!fetched.ok) return;
      const context = { pageUrl: fetched.finalUrl, observedAt: assessedAt, fetchedAt: fetched.fetchedAt, contentChecksum: fetched.contentChecksum };
      const html = extractHtml(fetched.body, context);
      const crawl = crawlWith("successful", fetched.body, fetched.finalUrl);
      const signals = extractConversionSignals({ html, homepage: fetched.finalUrl, validResponse: true });
      const result = assessConversionFeatures({ crawl, signals, browser: { status: "not_checked" }, assessedAt, freshUntil });
      expect(result.find(({ feature }) => feature === "contact_form")?.status).toBe("absent_after_successful_inspection");
      expect(result.find(({ feature }) => feature === "contact_form")?.claimState).toBe("observed");
      expect(result.find(({ feature }) => feature === "valid_page_response")?.status).toBe("present");
      expect(result.every(({ sourceClass, claimState }) => sourceClass === "synthetic_fixture" && ["observed", "unknown"].includes(claimState))).toBe(true);
    } finally {
      await server.close();
    }
  });

  it.each([
    ["blocked", "blocked"],
    ["failed", "unavailable"],
  ] as const)("does not infer absence from a %s page", (inspection, expected) => {
    const result = assessConversionFeatures({ crawl: crawlWith(inspection, null), signals: [], browser: { status: "not_checked" }, assessedAt, freshUntil });
    expect(result.every(({ status }) => status === expected)).toBe(true);
  });

  it("does not infer absence when browser rendering is unavailable", async () => {
    const browser = await new DisabledBrowserRenderer().render({ url: "https://clearwater.example/" });
    const result = assessConversionFeatures({ crawl: crawlWith("successful", "<html><head><title>Example</title></head><body></body></html>"), signals: [], browser, assessedAt, freshUntil });
    expect(result.every(({ status }) => status === "unavailable")).toBe(true);
  });

  it("marks expired evidence stale instead of retaining a current claim", () => {
    const result = assessConversionFeatures({ crawl: crawlWith("successful", "<html><head><title>Example</title></head><body></body></html>"), signals: [], browser: { status: "not_checked" }, assessedAt, freshUntil: "2026-01-14T12:00:00.000Z" });
    expect(result.every(({ status }) => status === "stale")).toBe(true);
  });

  it("routes conflicting website identity to review without overriding provider identity", () => {
    const source = "<html><head><title>Unrelated Example Roofing</title></head><body><h1>Roof repair</h1></body></html>";
    const context = { pageUrl: "https://clearwater.example/", observedAt: assessedAt, fetchedAt: assessedAt, contentChecksum: createHash("sha256").update(source).digest("hex") };
    const html = extractHtml(source, context);
    const identity = extractBusinessIdentity({ html, jsonLd: extractJsonLd(source, context) });
    const result = assessBusinessOperationalEvidence({ expectedBusinessName: "Clearwater Example Pool Care", crawl: crawlWith("successful", source), identity });
    expect(result.identityState).toBe("conflicts");
    expect(result.reviewRequired).toBe(true);
    expect(result.evidence.find(({ kind }) => kind === "contact_consistency")?.claimState).toBe("unknown");
  });
});
