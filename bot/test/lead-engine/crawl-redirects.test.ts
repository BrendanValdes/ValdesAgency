import { describe, expect, it } from "vitest";
import { DEFAULT_CRAWL_LIMITS } from "../../src/lead-engine/crawl/policies.js";
import { createTestOnlyDirectHttpFetcher } from "../../src/lead-engine/crawl/fetchers/direct-http.js";
import { startSyntheticHttpServer } from "./helpers/local-http-server.js";

describe("safe redirects", () => {
  it("records a bounded safe redirect history", async () => {
    const server = await startSyntheticHttpServer();
    try {
      const result = await createTestOnlyDirectHttpFetcher({ allowedOrigin: server.origin }).fetch({ url: server.url("/redirect/one") });
      expect(result).toMatchObject({ ok: true, status: 200 });
      if (result.ok) expect(result.redirectHistory).toHaveLength(2);
    } finally {
      await server.close();
    }
  });

  it("rejects redirect loops and redirect limits", async () => {
    const server = await startSyntheticHttpServer();
    try {
      const loop = await createTestOnlyDirectHttpFetcher({ allowedOrigin: server.origin }).fetch({ url: server.url("/redirect-loop-a") });
      expect(loop).toMatchObject({ ok: false, errorCode: "redirect_loop" });
      const limited = await createTestOnlyDirectHttpFetcher({ allowedOrigin: server.origin, limits: { ...DEFAULT_CRAWL_LIMITS, maxRedirects: 1 } }).fetch({ url: server.url("/redirect/one") });
      expect(limited).toMatchObject({ ok: false, errorCode: "redirect_limit" });
    } finally {
      await server.close();
    }
  });

  it("rejects a redirect from the allowed test origin to another address", async () => {
    const server = await startSyntheticHttpServer();
    try {
      const result = await createTestOnlyDirectHttpFetcher({ allowedOrigin: server.origin }).fetch({ url: server.url("/redirect-blocked") });
      expect(result).toMatchObject({ ok: false, errorCode: "destination_blocked" });
    } finally {
      await server.close();
    }
  });
});
