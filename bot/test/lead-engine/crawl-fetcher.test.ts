import { describe, expect, it } from "vitest";
import { createTestOnlyDirectHttpFetcher } from "../../src/lead-engine/crawl/fetchers/direct-http.js";
import { DEFAULT_CRAWL_LIMITS, retryDelayMs } from "../../src/lead-engine/crawl/policies.js";
import { startSyntheticHttpServer } from "./helpers/local-http-server.js";

describe("bounded direct HTTP fetcher", () => {
  it("enforces response timeout and cancellation", async () => {
    const server = await startSyntheticHttpServer();
    try {
      const fetcher = createTestOnlyDirectHttpFetcher({
        allowedOrigin: server.origin,
        limits: { ...DEFAULT_CRAWL_LIMITS, maxRetries: 1, responseTimeoutMs: 100 },
      });
      await expect(fetcher.fetch({ url: server.url("/timeout") })).resolves.toMatchObject({ ok: false, errorCode: "response_timeout" });
      const controller = new AbortController();
      controller.abort();
      await expect(fetcher.fetch({ url: server.url("/") , signal: controller.signal })).resolves.toMatchObject({ ok: false, errorCode: "cancelled" });
    } finally {
      await server.close();
    }
  });

  it("enforces content type plus compressed and decompressed size limits", async () => {
    const server = await startSyntheticHttpServer();
    try {
      const small = createTestOnlyDirectHttpFetcher({
        allowedOrigin: server.origin,
        limits: { ...DEFAULT_CRAWL_LIMITS, maxRetries: 1, maxCompressedBytes: 1_024, maxDecompressedBytes: 2_048 },
      });
      await expect(small.fetch({ url: server.url("/unsupported") })).resolves.toMatchObject({ ok: false, errorCode: "unsupported_content_type" });
      await expect(small.fetch({ url: server.url("/oversized") })).resolves.toMatchObject({ ok: false, errorCode: "compressed_size_exceeded" });
      await expect(small.fetch({ url: server.url("/compressed-oversized") })).resolves.toMatchObject({ ok: false, errorCode: "decompressed_size_exceeded" });
    } finally {
      await server.close();
    }
  });

  it("retries only transient statuses and honors Retry-After", async () => {
    const server = await startSyntheticHttpServer();
    try {
      const fetcher = createTestOnlyDirectHttpFetcher({ allowedOrigin: server.origin });
      await expect(fetcher.fetch({ url: server.url("/rate-limited") })).resolves.toMatchObject({ ok: true, attempts: 2 });
      await expect(fetcher.fetch({ url: server.url("/temporary-500") })).resolves.toMatchObject({ ok: true, attempts: 3 });
      await expect(fetcher.fetch({ url: server.url("/permanent-500") })).resolves.toMatchObject({ ok: false, errorCode: "server_failure", attempts: 3 });
      expect(retryDelayMs(1, "2", 0, () => 0)).toBe(2_000);
      expect(server.counts.get("/permanent-500")).toBe(3);
    } finally {
      await server.close();
    }
  }, 10_000);

  it("does not send credentials, retain cookies, or submit forms", async () => {
    const server = await startSyntheticHttpServer();
    try {
      const fetcher = createTestOnlyDirectHttpFetcher({ allowedOrigin: server.origin });
      await expect(fetcher.fetch({ url: server.url("/auth") })).resolves.toMatchObject({ ok: false, errorCode: "authentication_required", attempts: 1 });
      const cookie = await fetcher.fetch({ url: server.url("/set-cookie") });
      expect(cookie).toMatchObject({ ok: true });
      if (cookie.ok) expect(cookie.body).toContain("no cookie");
      await fetcher.fetch({ url: server.url("/contact") });
      expect(server.counts.get("/submit") ?? 0).toBe(0);
      expect(server.requests.every((request) => request.method === "GET")).toBe(true);
      expect(server.requests.every((request) => request.authorization === null)).toBe(true);
    } finally {
      await server.close();
    }
  });
});
