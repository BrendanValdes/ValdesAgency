import { describe, expect, it } from "vitest";
import { createDirectHttpFetcher, createTestOnlyDirectHttpFetcher } from "../../src/lead-engine/crawl/fetchers/direct-http.js";
import {
  issueTestLoopbackCapability,
  type TestLoopbackCapability,
} from "../../src/lead-engine/crawl/fetchers/test-loopback-capability.js";
import { startSyntheticHttpServer } from "./helpers/local-http-server.js";

function loopbackFetcher(capability: TestLoopbackCapability, testScopeId: string) {
  return createTestOnlyDirectHttpFetcher({ capability, testScopeId });
}

describe("test-only loopback capability", () => {
  it("allows only the explicitly granted 127.0.0.1 origin and ephemeral port", async () => {
    const server = await startSyntheticHttpServer();
    const testScopeId = "loopback-authorized-test";
    try {
      const capability = issueTestLoopbackCapability({
        testScopeId,
        allowedOrigin: server.origin,
      });
      const fetcher = loopbackFetcher(capability, testScopeId);
      expect(fetcher).toMatchObject({ sourceClass: "test_loopback" });
      await expect(fetcher.fetch({ url: server.url("/") })).resolves.toMatchObject({
        ok: true,
        status: 200,
      });
      await expect(fetcher.fetch({ url: "http://127.0.0.1:1/" })).resolves.toMatchObject({ ok: false });
      await expect(fetcher.fetch({ url: `http://2130706433:${new URL(server.origin).port}/` })).resolves.toMatchObject({ ok: false });
      await expect(fetcher.fetch({ url: `http://127.0.0.2:${new URL(server.origin).port}/` })).resolves.toMatchObject({ ok: false });
      await expect(fetcher.fetch({ url: `http://[::1]:${new URL(server.origin).port}/` })).resolves.toMatchObject({ ok: false });
      await expect(fetcher.fetch({ url: `http://localhost:${new URL(server.origin).port}/` })).resolves.toMatchObject({ ok: false });
      await expect(fetcher.fetch({ url: `https://127.0.0.1:${new URL(server.origin).port}/` })).resolves.toMatchObject({ ok: false });
      await expect(fetcher.fetch({ url: "http://10.0.0.1/" })).resolves.toMatchObject({ ok: false });
      await expect(fetcher.fetch({ url: "http://169.254.169.254/" })).resolves.toMatchObject({ ok: false });
      await expect(fetcher.fetch({ url: `http://public.example:${new URL(server.origin).port}/` })).resolves.toMatchObject({ ok: false });
    } finally {
      await server.close();
    }
  });

  it("rejects non-loopback and non-explicit origins at issuance", () => {
    expect(() => issueTestLoopbackCapability({
      testScopeId: "private-address",
      allowedOrigin: "http://10.0.0.1:1234",
    })).toThrow("origin_not_explicit_ipv4_loopback");
    expect(() => issueTestLoopbackCapability({
      testScopeId: "public-host",
      allowedOrigin: "https://public.example:1234",
    })).toThrow("origin_not_explicit_ipv4_loopback");
    expect(() => issueTestLoopbackCapability({
      testScopeId: "missing-port",
      allowedOrigin: "http://127.0.0.1",
    })).toThrow("origin_not_explicit_ipv4_loopback");
  });

  it("rejects wrong scopes, fabricated grants, and production-capability use", async () => {
    const server = await startSyntheticHttpServer();
    try {
      const capability = issueTestLoopbackCapability({
        testScopeId: "correct-scope",
        allowedOrigin: server.origin,
      });
      expect(() => loopbackFetcher(capability, "wrong-scope")).toThrow("scope_mismatch");
      expect(() => loopbackFetcher({
        kind: "test_loopback_capability",
        testScopeId: "correct-scope",
        allowedOrigin: server.origin,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }, "correct-scope")).toThrow("capability_untrusted");
      expect(() => createDirectHttpFetcher({
        capability: capability as unknown as Parameters<typeof createDirectHttpFetcher>[0]["capability"],
        providerId: "website_http",
        runId: "loopback-run",
        assessmentId: "loopback-assessment",
      })).toThrow("capability_untrusted");
    } finally {
      await server.close();
    }
  });

  it("rejects redirects from the authorized loopback origin to another address", async () => {
    const server = await startSyntheticHttpServer();
    const testScopeId = "loopback-redirect-test";
    try {
      const capability = issueTestLoopbackCapability({ testScopeId, allowedOrigin: server.origin });
      await expect(loopbackFetcher(capability, testScopeId).fetch({
        url: server.url("/redirect-blocked"),
      })).resolves.toMatchObject({ ok: false, errorCode: "destination_blocked" });
    } finally {
      await server.close();
    }
  });

  it("revalidates capability lifetime for every request", async () => {
    let now = Date.parse("2026-01-15T12:00:00.000Z");
    const testScopeId = "loopback-expiry-test";
    const allowedOrigin = "http://127.0.0.1:49124";
    const capability = issueTestLoopbackCapability({
      testScopeId,
      allowedOrigin,
      ttlMs: 1_000,
      now: () => now,
    });
    const fetcher = loopbackFetcher(capability, testScopeId);
    now += 1_000;
    await expect(fetcher.fetch({ url: `${allowedOrigin}/` })).resolves.toMatchObject({
      ok: false,
      errorCode: "policy_rejected",
      attempts: 0,
    });
  });
});
