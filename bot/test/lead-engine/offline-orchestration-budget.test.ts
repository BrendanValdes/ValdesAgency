import { describe, expect, it } from "vitest";
import { runOfflineLeadAssessment } from "../../src/lead-engine/orchestration/offline-lead-pipeline.js";
import { createOfflinePipelineFixture } from "./helpers/offline-pipeline-fixture.js";

describe("offline orchestration budget enforcement", () => {
  it("blocks discovery before a provider operation when the provider-call budget is zero", async () => {
    const fixture = createOfflinePipelineFixture();
    try {
      const result = await runOfflineLeadAssessment(
        fixture.makeInput({ budget: { maxProviderCalls: 0 } }),
        fixture.dependencies,
      );
      expect(result.status).toBe("budget_blocked");
      expect(result.budget).toMatchObject({
        consumed: { providerCalls: 0, costMicroUsd: 0 },
        denialReason: "provider_call_budget_exhausted",
      });
      expect(result.rejectionReasons).toContain("provider_call_budget_exhausted");
      expect(fixture.database.prepare("SELECT COUNT(*) AS count FROM provider_calls").get())
        .toEqual({ count: 0 });
      expect(fixture.database.prepare("SELECT status FROM offline_orchestration_runs").get())
        .toEqual({ status: "budget_blocked" });
    } finally {
      fixture.cleanup();
    }
  });

  it.each([
    ["page", { maxPages: 0 }, "page_budget_exhausted"],
    ["request", { maxWebsiteRequests: 0 }, "website_request_budget_exhausted"],
  ] as const)("blocks crawl before the first %s operation", async (_kind, budget, reason) => {
    const fixture = createOfflinePipelineFixture();
    try {
      const result = await runOfflineLeadAssessment(
        fixture.makeInput({ budget }),
        fixture.dependencies,
      );
      expect(result.status).toBe("budget_blocked");
      expect(result.budget.denialReason).toBe(reason);
      expect(result.websiteAssessment).toBeNull();
      expect(fixture.database.prepare("SELECT COUNT(*) AS count FROM website_assessments").get())
        .toEqual({ count: 0 });
    } finally {
      fixture.cleanup();
    }
  });

  it("enforces the configured page limit and reports exact remaining budget", async () => {
    const fixture = createOfflinePipelineFixture();
    try {
      const result = await runOfflineLeadAssessment(
        fixture.makeInput({ budget: { maxPages: 1, maxWebsiteRequests: 5 } }),
        fixture.dependencies,
      );
      expect(result.status).toBe("completed");
      expect(result.websiteAssessment?.pages).toHaveLength(1);
      expect(result.budget).toMatchObject({
        consumed: {
          providerCalls: 6,
          websiteRequests: 3,
          pages: 1,
          costMicroUsd: 0,
        },
        remaining: {
          maxProviderCalls: 4,
          maxWebsiteRequests: 2,
          maxPages: 0,
        },
        denialReason: null,
      });
    } finally {
      fixture.cleanup();
    }
  });

  it("denies extraction when a synthetic response exceeds the byte budget", async () => {
    const fixture = createOfflinePipelineFixture();
    try {
      const result = await runOfflineLeadAssessment(
        fixture.makeInput({
          budget: {
            maxCompressedBytes: 1_024,
            maxDecompressedBytes: 100_000,
          },
        }),
        fixture.dependencies,
      );
      expect(result.status).toBe("budget_blocked");
      expect(result.budget.denialReason).toBe("compressed_byte_budget_exhausted");
      expect(result.budget.consumed.compressedBytes).toBeGreaterThan(1_024);
      expect(result.budget.remaining.maxCompressedBytes).toBe(0);
      expect(result.websiteAssessment).toBeNull();
      expect(fixture.database.prepare("SELECT COUNT(*) AS count FROM evidence").get())
        .toEqual({ count: 0 });
    } finally {
      fixture.cleanup();
    }
  });

  it("denies extraction when decompressed bytes exceed their independent limit", async () => {
    const fixture = createOfflinePipelineFixture();
    try {
      const originalFetcher = fixture.dependencies.fixtureFetcher;
      const result = await runOfflineLeadAssessment(
        fixture.makeInput({
          budget: {
            maxCompressedBytes: 100_000,
            maxDecompressedBytes: 100_000,
          },
        }),
        {
          ...fixture.dependencies,
          fixtureFetcher: {
            sourceClass: "synthetic_fixture",
            handles: (url) => originalFetcher.handles(url),
            async fetch(request) {
              const response = await originalFetcher.fetch(request);
              if (!response.ok || new URL(request.url).pathname === "/robots.txt") {
                return response;
              }
              return {
                ...response,
                compressedBytes: 1_024,
                decompressedBytes: 100_001,
              };
            },
          },
        },
      );
      expect(result.status).toBe("budget_blocked");
      expect(result.budget.denialReason).toBe("decompressed_byte_budget_exhausted");
      expect(result.budget.consumed.compressedBytes).toBeLessThanOrEqual(100_000);
      expect(result.budget.consumed.decompressedBytes).toBeGreaterThan(100_000);
      expect(result.budget.remaining.maxDecompressedBytes).toBe(0);
      expect(result.websiteAssessment).toBeNull();
    } finally {
      fixture.cleanup();
    }
  });

  it("blocks a crawl whose reported elapsed time exceeds the duration budget", async () => {
    const fixture = createOfflinePipelineFixture();
    try {
      const result = await runOfflineLeadAssessment(
        fixture.makeInput({ budget: { maxElapsedCrawlMs: 5_000 } }),
        {
          ...fixture.dependencies,
          createWebsiteCrawler: () => ({
            async crawl(input) {
              const robots = {
                origin: new URL(input.websiteUrl).origin,
                robotsUrl: new URL("/robots.txt", input.websiteUrl).href,
                status: "unavailable" as const,
                reason: "not_published" as const,
                matchedRule: null,
                fetchedAt: "2026-01-15T12:00:00.000Z",
                expiresAt: "2026-01-16T12:00:00.000Z",
                contentChecksum: null,
                sitemapUrls: [],
              };
              return {
                requestedUrl: input.websiteUrl,
                sourceClass: "synthetic_fixture" as const,
                canonicalHomepage: input.websiteUrl,
                startedAt: "2026-01-15T12:00:00.000Z",
                completedAt: "2026-01-15T12:00:05.001Z",
                pages: [],
                robots,
                robotsDecisions: [robots],
                complete: false,
                timedOut: true,
              };
            },
          }),
        },
      );
      expect(result.status).toBe("budget_blocked");
      expect(result.budget).toMatchObject({
        consumed: { elapsedCrawlMs: 5_001, costMicroUsd: 0 },
        remaining: { maxElapsedCrawlMs: 0 },
        denialReason: "crawl_duration_budget_exhausted",
      });
      expect(result.websiteAssessment).toBeNull();
    } finally {
      fixture.cleanup();
    }
  });

  it("rejects structurally invalid budgets before run creation", async () => {
    const fixture = createOfflinePipelineFixture();
    try {
      await expect(runOfflineLeadAssessment(
        fixture.makeInput({ budget: { maxProviderCalls: -1 } }),
        fixture.dependencies,
      )).rejects.toThrow("nonnegative safe integer");
      await expect(runOfflineLeadAssessment(
        fixture.makeInput({ budget: { maxCompressedBytes: 100 } }),
        fixture.dependencies,
      )).rejects.toThrow("zero or at least 1024");
      expect(fixture.database.prepare("SELECT COUNT(*) AS count FROM lead_runs").get())
        .toEqual({ count: 0 });
    } finally {
      fixture.cleanup();
    }
  });
});
