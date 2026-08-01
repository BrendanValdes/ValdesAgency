import { describe, expect, it } from "vitest";
import { leadEngineConfigSchema } from "../../src/lead-engine/config/schema.js";
import { createDirectHttpFetcher, createTestOnlyDirectHttpFetcher } from "../../src/lead-engine/crawl/fetchers/direct-http.js";
import { normalizeWebUrl } from "../../src/lead-engine/crawl/url-safety.js";
import { startSyntheticHttpServer } from "./helpers/local-http-server.js";

describe("crawl URL safety", () => {
  it.each(["file:///etc/passwd", "ftp://example.com/file", "data:text/plain,test", "javascript:alert(1)"])("rejects unsupported scheme %s", (url) => {
    expect(() => normalizeWebUrl(url)).toThrow("Only HTTP and HTTPS");
  });

  it("rejects credentials, internal hostnames, malformed hosts, and unexpected ports", () => {
    expect(() => normalizeWebUrl("https://user:secret@example.com/")).toThrow("credentials");
    expect(() => normalizeWebUrl("http://localhost/")).toThrow("Internal");
    expect(() => normalizeWebUrl("https://service.internal/")).toThrow("Internal");
    expect(() => normalizeWebUrl("https://bad_host.example/")).toThrow("Malformed");
    expect(() => normalizeWebUrl("https://example.com:22/")).toThrow("port");
  });

  it("normalizes equivalent URLs deterministically and strips fragments", () => {
    expect(normalizeWebUrl("HTTPS://EXAMPLE.COM:443/a/../b#private")).toBe("https://example.com/b");
    expect(normalizeWebUrl("http://example.com:80")).toBe("http://example.com/");
    expect(normalizeWebUrl("https://[2606:4700:4700::1111]/#fragment")).toBe("https://[2606:4700:4700::1111]/");
  });

  it("keeps production loopback denial separate from explicit test-only transport", async () => {
    const server = await startSyntheticHttpServer();
    try {
      const production = await createDirectHttpFetcher().fetch({ url: server.url("/") });
      expect(production).toMatchObject({ ok: false, errorCode: "port_rejected" });
      await expect(createDirectHttpFetcher().fetch({ url: "http://127.0.0.1/" })).resolves.toMatchObject({ ok: false, errorCode: "destination_blocked" });
      await expect(createDirectHttpFetcher().fetch({ url: "http://[::1]/" })).resolves.toMatchObject({ ok: false, errorCode: "destination_blocked" });
      const testFetcher = createTestOnlyDirectHttpFetcher({ allowedOrigin: server.origin });
      expect(await testFetcher.fetch({ url: server.url("/") })).toMatchObject({ ok: true, status: 200 });
    } finally {
      await server.close();
    }
  });

  it("cannot enable test transport through production configuration", () => {
    expect(() => leadEngineConfigSchema.parse({ dataRoot: "/tmp/phase3", networkMode: "test", testTransport: true })).toThrow();
    const before = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(() => createTestOnlyDirectHttpFetcher({ allowedOrigin: "http://127.0.0.1:9999" })).toThrow("NODE_ENV=test");
    } finally {
      process.env.NODE_ENV = before;
    }
  });
});
