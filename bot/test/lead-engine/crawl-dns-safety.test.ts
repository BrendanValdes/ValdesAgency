import { describe, expect, it } from "vitest";
import { assertPinnedConnection, isBlockedIpAddress, resolveSafeDestination } from "../../src/lead-engine/crawl/dns-safety.js";

describe("crawl DNS and SSRF safety", () => {
  it.each([
    "0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.169.254", "172.16.0.1",
    "192.168.1.1", "192.0.2.1", "198.18.0.1", "198.51.100.1", "203.0.113.1", "224.0.0.1", "255.255.255.255",
    "::", "::1", "fe80::1", "fc00::1", "ff02::1", "2001:db8::1", "::ffff:127.0.0.1", "::ffff:192.168.1.1",
  ])("blocks non-public address %s", (address) => {
    expect(isBlockedIpAddress(address)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])("permits syntactically public address %s", (address) => {
    expect(isBlockedIpAddress(address)).toBe(false);
  });

  it("rejects a hostname when any DNS result is blocked", async () => {
    await expect(resolveSafeDestination("public.example", {
      resolve: async () => [{ address: "8.8.8.8", family: 4 }, { address: "127.0.0.1", family: 4 }],
    })).rejects.toThrow("blocked");
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
