import { describe, expect, it } from "vitest";
import { DEFAULT_CRAWL_LIMITS } from "../../src/lead-engine/crawl/policies.js";
import { createTestOnlyDirectHttpFetcher } from "../../src/lead-engine/crawl/fetchers/direct-http.js";
import { issueTestLoopbackCapability } from "../../src/lead-engine/crawl/fetchers/test-loopback-capability.js";
import type { PinnedHttpTransport } from "../../src/lead-engine/crawl/types.js";
import { startSyntheticHttpServer } from "./helpers/local-http-server.js";
import { createSyntheticLoopbackFetcher } from "./helpers/test-loopback-fetcher.js";

describe("safe redirects", () => {
  it("records a bounded safe redirect history", async () => {
    const server = await startSyntheticHttpServer();
    try {
      const result = await createSyntheticLoopbackFetcher({ allowedOrigin: server.origin }).fetch({ url: server.url("/redirect/one") });
      expect(result).toMatchObject({ ok: true, status: 200 });
      if (result.ok) expect(result.redirectHistory).toHaveLength(2);
    } finally {
      await server.close();
    }
  });

  it("rejects redirect loops and redirect limits", async () => {
    const server = await startSyntheticHttpServer();
    try {
      const loop = await createSyntheticLoopbackFetcher({ allowedOrigin: server.origin }).fetch({ url: server.url("/redirect-loop-a") });
      expect(loop).toMatchObject({ ok: false, errorCode: "redirect_loop" });
      const limited = await createSyntheticLoopbackFetcher({ allowedOrigin: server.origin, limits: { ...DEFAULT_CRAWL_LIMITS, maxRedirects: 1 } }).fetch({ url: server.url("/redirect/one") });
      expect(limited).toMatchObject({ ok: false, errorCode: "redirect_limit" });
    } finally {
      await server.close();
    }
  });

  it("rejects a redirect from the allowed test origin to another address", async () => {
    const server = await startSyntheticHttpServer();
    try {
      const result = await createSyntheticLoopbackFetcher({ allowedOrigin: server.origin }).fetch({ url: server.url("/redirect-blocked") });
      expect(result).toMatchObject({ ok: false, errorCode: "destination_blocked" });
    } finally {
      await server.close();
    }
  });

  it("resolves safe relative and scheme-relative redirects against the current URL", async () => {
    const server = await startSyntheticHttpServer();
    try {
      await expect(createSyntheticLoopbackFetcher({ allowedOrigin: server.origin }).fetch({
        url: server.url("/redirect-relative"),
      })).resolves.toMatchObject({ ok: true, finalUrl: server.url("/contact?from=relative") });
      await expect(createSyntheticLoopbackFetcher({ allowedOrigin: server.origin }).fetch({
        url: server.url("/redirect-scheme-relative"),
      })).resolves.toMatchObject({ ok: true, finalUrl: server.url("/contact") });
    } finally {
      await server.close();
    }
  });

  it.each([
    ["/redirect-blocked", "destination_blocked"],
    ["/redirect-ipv6-loopback", "destination_blocked"],
    ["/redirect-link-local", "destination_blocked"],
    ["/redirect-public-host", "destination_blocked"],
    ["/redirect-hostname-case", "destination_blocked"],
    ["/redirect-wrong-port", "destination_blocked"],
    ["/redirect-credentials", "redirect_invalid"],
    ["/redirect-trailing-dot", "redirect_invalid"],
  ])("revalidates and rejects unsafe redirect target %s", async (path, errorCode) => {
    const server = await startSyntheticHttpServer();
    try {
      await expect(createSyntheticLoopbackFetcher({ allowedOrigin: server.origin }).fetch({
        url: server.url(path),
      })).resolves.toMatchObject({ ok: false, errorCode });
    } finally {
      await server.close();
    }
  });

  it("treats a fragment-only redirect as a cycle after fragment normalization", async () => {
    const server = await startSyntheticHttpServer();
    try {
      await expect(createSyntheticLoopbackFetcher({ allowedOrigin: server.origin }).fetch({
        url: server.url("/redirect-fragment"),
      })).resolves.toMatchObject({ ok: false, errorCode: "redirect_loop" });
    } finally {
      await server.close();
    }
  });

  it("resolves again at each redirect hop and fails closed when the answer changes", async () => {
    const server = await startSyntheticHttpServer();
    const testScopeId = "redirect-dns-change";
    let resolution = 0;
    try {
      const capability = issueTestLoopbackCapability({ testScopeId, allowedOrigin: server.origin });
      const fetcher = createTestOnlyDirectHttpFetcher({
        capability,
        testScopeId,
        resolver: {
          async resolve() {
            resolution += 1;
            return [{ address: resolution === 1 ? "127.0.0.1" : "127.0.0.2", family: 4 }];
          },
        },
      });
      await expect(fetcher.fetch({ url: server.url("/redirect/one") })).resolves.toMatchObject({
        ok: false,
        errorCode: "destination_blocked",
      });
      expect(resolution).toBe(2);
      expect(server.counts.get("/redirect/two") ?? 0).toBe(0);
    } finally {
      await server.close();
    }
  });

  it("fails closed when a transport reports a connected address different from the approved address", async () => {
    const allowedOrigin = "http://127.0.0.1:49123";
    const testScopeId = "connected-address-mismatch";
    const capability = issueTestLoopbackCapability({ testScopeId, allowedOrigin });
    const mismatchedTransport: PinnedHttpTransport = {
      async request() {
        return {
          status: 200,
          headers: { "content-type": "text/html" },
          compressedBody: Buffer.from("<html><body>synthetic</body></html>"),
          connectedAddress: "127.0.0.2",
        };
      },
    };
    await expect(createTestOnlyDirectHttpFetcher({
      capability,
      testScopeId,
      transport: mismatchedTransport,
    }).fetch({ url: `${allowedOrigin}/` })).resolves.toMatchObject({
      ok: false,
      errorCode: "dns_rebinding",
    });
  });
});
