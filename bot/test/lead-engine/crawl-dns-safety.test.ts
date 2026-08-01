import { describe, expect, it } from "vitest";
import { assertPinnedConnection, isBlockedIpAddress, resolveSafeDestination } from "../../src/lead-engine/crawl/dns-safety.js";
import { classifyIpAddress } from "../../src/lead-engine/crawl/ip-safety.js";

describe("crawl DNS and SSRF safety", () => {
  it.each([
    "0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.169.254", "172.16.0.1",
    "192.0.0.1", "192.0.2.1", "192.31.196.1", "192.52.193.1", "192.88.99.1", "192.168.1.1",
    "192.175.48.1", "198.18.0.1", "198.51.100.1", "203.0.113.1", "224.0.0.1", "255.255.255.255",
    "::", "::1", "::192.0.2.1", "::ffff:127.0.0.1", "::ffff:8.8.8.8", "::ffff:0:127.0.0.1",
    "64:ff9b::127.0.0.1", "64:ff9b:1::1", "100::1", "fe80::1", "fec0::1", "fc00::1", "ff02::1",
    "2001::1", "2001:2::1", "2001:10::1", "2001:20::1", "2001:db8::1", "2002:7f00:1::1",
    "2001:0:808:808::fefe:fefe", "2001:4860::5efe:7f00:1", "3ffe::1", "3fff::1", "5f00::1",
  ])("blocks non-public address %s", (address) => {
    expect(isBlockedIpAddress(address)).toBe(true);
  });

  it.each([
    "8.8.8.8", "1.1.1.1", "9.255.255.255", "11.0.0.0", "100.63.255.255", "100.128.0.0",
    "126.255.255.255", "128.0.0.0", "169.253.255.255", "169.255.0.0", "172.15.255.255",
    "172.32.0.0", "192.167.255.255", "192.169.0.0", "198.17.255.255", "198.20.0.0", "223.255.255.255",
    "2001:4860:4860::8888", "2606:4700:4700::1111", "3fff:1000::1",
  ])("permits syntactically public address %s", (address) => {
    expect(isBlockedIpAddress(address)).toBe(false);
  });

  it.each([
    ["0.0.0.0", "unspecified"],
    ["0.0.0.1", "current_network"],
    ["100.64.0.0", "carrier_grade_nat"],
    ["127.255.255.255", "loopback"],
    ["169.254.0.0", "link_local"],
    ["192.0.0.255", "protocol_assignment"],
    ["198.19.255.255", "benchmarking"],
    ["239.255.255.255", "multicast"],
    ["240.0.0.0", "reserved"],
    ["255.255.255.255", "limited_broadcast"],
    ["100::1", "discard_only"],
    ["fdff::1", "unique_local"],
    ["febf::1", "link_local"],
    ["feff::1", "deprecated_site_local"],
    ["2001:db8:ffff:ffff:ffff:ffff:ffff:ffff", "documentation"],
  ])("returns structured block category for %s", (address, category) => {
    expect(classifyIpAddress(address)).toMatchObject({ allowed: false, category });
  });

  it("recursively classifies embedded IPv4 addresses in transition and translation wrappers", () => {
    expect(classifyIpAddress("::ffff:127.0.0.1").embeddedIpv4?.[0]).toMatchObject({ category: "loopback" });
    expect(classifyIpAddress("64:ff9b::10.0.0.1").embeddedIpv4?.[0]).toMatchObject({ category: "private" });
    expect(classifyIpAddress("2002:7f00:1::1").embeddedIpv4?.[0]).toMatchObject({ category: "loopback" });
    expect(classifyIpAddress("2001:0:808:808::fefe:fefe").embeddedIpv4).toEqual(expect.arrayContaining([
      expect.objectContaining({ normalizedAddress: "8.8.8.8", allowed: true }),
      expect.objectContaining({ normalizedAddress: "1.1.1.1", allowed: true }),
    ]));
  });

  it("rejects a hostname when any DNS result is blocked", async () => {
    await expect(resolveSafeDestination("public.example", {
      resolve: async () => [{ address: "8.8.8.8", family: 4 }, { address: "127.0.0.1", family: 4 }],
    })).rejects.toThrow("blocked");
  });

  it("normalizes and deduplicates every safe answer while preserving resolver selection order", async () => {
    const destination = await resolveSafeDestination("public.example", {
      resolve: async () => [
        { address: "2606:4700:4700:0:0:0:0:1111", family: 6 },
        { address: "8.8.8.8", family: 4 },
        { address: "2606:4700:4700::1111", family: 6 },
      ],
    });
    expect(destination.addresses).toEqual([
      { address: "2606:4700:4700::1111", family: 6 },
      { address: "8.8.8.8", family: 4 },
    ]);
    expect(destination.selected).toEqual({ address: "2606:4700:4700::1111", family: 6 });
  });

  it("fails closed for empty, malformed, failed, and timed-out DNS results", async () => {
    await expect(resolveSafeDestination("empty.example", { resolve: async () => [] })).rejects.toThrow("no addresses");
    await expect(resolveSafeDestination("malformed.example", {
      resolve: async () => [{ address: "not-an-ip", family: 4 }],
    })).rejects.toThrow("malformed");
    await expect(resolveSafeDestination("family.example", {
      resolve: async () => [{ address: "8.8.8.8", family: 6 }],
    })).rejects.toThrow("malformed");
    await expect(resolveSafeDestination("failed.example", {
      resolve: async () => { throw new Error("synthetic resolver failure"); },
    })).rejects.toThrow("failed");
    await expect(resolveSafeDestination("timeout.example", {
      resolve: async () => await new Promise<never>(() => undefined),
    }, { timeoutMs: 5 })).rejects.toThrow("timed out");
  });

  it("pins a validated address and detects rebinding or connection drift", async () => {
    const destination = await resolveSafeDestination("public.example", {
      resolve: async () => [{ address: "8.8.8.8", family: 4 }],
    });
    expect(() => assertPinnedConnection(destination, "8.8.8.8")).not.toThrow();
    expect(() => assertPinnedConnection(destination, "127.0.0.1")).toThrow("pinned");
    expect(() => assertPinnedConnection(destination, "1.1.1.1")).toThrow("pinned");
  });

  it("rejects simulated DNS rebinding on revalidation", async () => {
    let call = 0;
    const resolver = { resolve: async () => (++call === 1 ? [{ address: "8.8.8.8", family: 4 as const }] : [{ address: "10.0.0.1", family: 4 as const }]) };
    await expect(resolveSafeDestination("changing.example", resolver)).resolves.toMatchObject({ selected: { address: "8.8.8.8" } });
    await expect(resolveSafeDestination("changing.example", resolver)).rejects.toThrow("blocked");
  });
});
