import { describe, expect, it } from "vitest";
import { leadEngineConfigSchema } from "../../src/lead-engine/config/schema.js";
import { createDirectHttpFetcher } from "../../src/lead-engine/crawl/fetchers/direct-http.js";
import { issueTestLoopbackCapability } from "../../src/lead-engine/crawl/fetchers/test-loopback-capability.js";
import { MAX_WEB_URL_LENGTH, normalizeWebUrl } from "../../src/lead-engine/crawl/url-safety.js";
import { startSyntheticHttpServer } from "./helpers/local-http-server.js";
import { createSyntheticLoopbackFetcher } from "./helpers/test-loopback-fetcher.js";

describe("crawl URL safety", () => {
  it.each(["file:///etc/passwd", "ftp://example.com/file", "data:text/plain,test", "javascript:alert(1)"])("rejects unsupported scheme %s", (url) => {
    expect(() => normalizeWebUrl(url)).toThrow("Only HTTP and HTTPS");
  });

  it.each([
    "//example.com/path",
    "https:example.com",
    "https:///",
    "https://example.com/%",
    "https://example.com/%zz",
    "https://example.com/\u0000secret",
    "https://example.com/line\nbreak",
    "https:\\example.com\\private",
  ])("rejects malformed or ambiguous URL %s", (url) => {
    expect(() => normalizeWebUrl(url)).toThrow();
  });

  it("rejects credentials, internal hostnames, malformed hosts, and unexpected ports", () => {
    expect(() => normalizeWebUrl("https://user:secret@example.com/")).toThrow("credentials");
    expect(() => normalizeWebUrl("https://@example.com/")).toThrow("credentials");
    expect(() => normalizeWebUrl("https://user%40name@example.com/")).toThrow();
    expect(() => normalizeWebUrl("http://localhost/")).toThrow("Internal");
    expect(() => normalizeWebUrl("http://sub.localhost/")).toThrow("Internal");
    expect(() => normalizeWebUrl("http://service.local/")).toThrow("Internal");
    expect(() => normalizeWebUrl("https://service.internal/")).toThrow("Internal");
    expect(() => normalizeWebUrl("https://bad_host.example/")).toThrow("Malformed");
    expect(() => normalizeWebUrl("https://example.com:22/")).toThrow("port");
    expect(() => normalizeWebUrl("https://example.com:0/")).toThrow("port");
    expect(() => normalizeWebUrl("https://example.com:65536/")).toThrow();
    expect(() => normalizeWebUrl("https://example.com:not-a-port/")).toThrow();
  });

  it("normalizes equivalent URLs, mixed-case hostnames, relative redirects, and fragments deterministically", () => {
    expect(normalizeWebUrl("HTTPS://EXAMPLE.COM:443/a/../b#private")).toBe("https://example.com/b");
    expect(normalizeWebUrl("http://example.com:80")).toBe("http://example.com/");
    expect(normalizeWebUrl("https://[2606:4700:4700::1111]/#fragment")).toBe("https://[2606:4700:4700::1111]/");
    expect(normalizeWebUrl("../contact#private", { baseUrl: "https://example.com/a/page" })).toBe("https://example.com/contact");
    expect(normalizeWebUrl("//EXAMPLE.COM/services", { baseUrl: "https://example.com/" })).toBe("https://example.com/services");
  });

  it("rejects hostname aliases and normalization ambiguity while accepting explicit ASCII punycode", () => {
    expect(() => normalizeWebUrl("https://example.com./")).toThrow("Trailing-dot");
    expect(() => normalizeWebUrl("https://bücher.example/")).toThrow("ASCII");
    expect(() => normalizeWebUrl("https://%65xample.com/")).toThrow("ASCII");
    expect(() => normalizeWebUrl("http://[fe80::1%25eth0]/")).toThrow();
    expect(normalizeWebUrl("https://xn--bcher-kva.example/")).toBe("https://xn--bcher-kva.example/");
  });

  it.each([
    ["http://2130706433/", "127.0.0.1"],
    ["http://0x7f000001/", "127.0.0.1"],
    ["http://0177.0.0.1/", "127.0.0.1"],
    ["http://127.1/", "127.0.0.1"],
    ["http://0x0a000001/", "10.0.0.1"],
    ["http://[::ffff:127.0.0.1]/", "[::ffff:7f00:1]"],
  ])("documents Node normalization of deceptive host %s to %s and blocks it", (input, normalizedHostname) => {
    expect(new URL(input).hostname).toBe(normalizedHostname);
    expect(() => normalizeWebUrl(input)).toThrow();
  });

  it("rejects alternate numeric syntax even when it normalizes to a public literal", () => {
    expect(new URL("http://0x08080808/").hostname).toBe("8.8.8.8");
    expect(() => normalizeWebUrl("http://0x08080808/")).toThrow("Non-canonical IPv4");
  });

  it("rejects excessive URL and hostname lengths", () => {
    expect(() => normalizeWebUrl(`https://example.com/${"x".repeat(MAX_WEB_URL_LENGTH)}`)).toThrow("too long");
    expect(() => normalizeWebUrl(`https://${"a".repeat(64)}.example/`)).toThrow();
  });

  it("keeps capability-gated production construction separate from explicit test-only transport", async () => {
    const server = await startSyntheticHttpServer();
    try {
      expect(() => (createDirectHttpFetcher as unknown as () => unknown)()).toThrow("capability_missing");
      const testFetcher = createSyntheticLoopbackFetcher({ allowedOrigin: server.origin });
      expect(await testFetcher.fetch({ url: server.url("/") })).toMatchObject({ ok: true, status: 200 });
      await expect(testFetcher.fetch({ url: "http://127.0.0.1:1/" })).resolves.toMatchObject({ ok: false });
      await expect(testFetcher.fetch({ url: "http://10.0.0.1/" })).resolves.toMatchObject({ ok: false });
      await expect(testFetcher.fetch({ url: "https://public.example/" })).resolves.toMatchObject({ ok: false });
    } finally {
      await server.close();
    }
  });

  it("cannot enable test transport through production configuration", () => {
    expect(() => leadEngineConfigSchema.parse({ dataRoot: "/tmp/phase3", networkMode: "test", testTransport: true })).toThrow();
    const before = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(() => issueTestLoopbackCapability({
        testScopeId: "production-forbidden",
        allowedOrigin: "http://127.0.0.1:9999",
      })).toThrow("test_environment_required");
    } finally {
      process.env.NODE_ENV = before;
    }
  });
});
