import { describe, expect, it, vi } from "vitest";
import { DiscoveryService } from "../../src/lead-engine/discovery/discovery-service.js";
import { planCoverage } from "../../src/lead-engine/geography/coverage-planner.js";
import { FixtureDiscoveryProvider } from "../../src/lead-engine/providers/adapters/fixture.js";
import { ProviderRegistry } from "../../src/lead-engine/providers/registry.js";
import { syntheticDiscoveryRecords } from "./fixtures/discovery/synthetic.js";
import { syntheticMetro } from "./fixtures/geography/synthetic.js";

function geography() {
  return planCoverage({
    nicheId: "pool_service",
    configurationVersion: "1.0.0",
    queryVersion: "query-1.0.0",
    strategy: "rural",
    targets: [syntheticMetro],
    resultCap: 1000,
    maxDepth: 5,
  }).cells[0]!;
}

function service() {
  const registry = new ProviderRegistry();
  const provider = new FixtureDiscoveryProvider({ records: syntheticDiscoveryRecords });
  registry.register(provider);
  return { service: new DiscoveryService(registry), provider };
}

const input = {
  providerId: "fixture",
  geography: geography(),
  queryVersion: "query-1.0.0",
  correlationId: "run-synthetic-discovery",
  observedAt: "2026-01-15T12:00:00.000Z",
  retrievedAt: "2026-01-15T12:00:01.000Z",
} as const;

describe("fixture-only discovery service", () => {
  it("uses pool service by default and deduplicates provider identities across queries", async () => {
    const result = await service().service.discover(input);
    expect(result).toHaveLength(2);
    expect(result.map((entry) => entry.providerResultId)).toEqual(["fixture-place-001", "fixture-place-002"]);
  });

  it("rejects disabled niches before a provider task", async () => {
    const fixture = service();
    const discoverSpy = vi.spyOn(fixture.provider, "discover");
    await expect(fixture.service.discover({ ...input, nicheId: "septic_pumping_repair" })).rejects.toThrow("benchmark gate");
    expect(discoverSpy).not.toHaveBeenCalled();
  });

  it("rejects unsupported niches before a provider task", async () => {
    const fixture = service();
    const discoverSpy = vi.spyOn(fixture.provider, "discover");
    await expect(fixture.service.discover({ ...input, nicheId: "unsupported" })).rejects.toThrow("Unsupported niche");
    expect(discoverSpy).not.toHaveBeenCalled();
  });

  it("accepts no observation from malformed provider data", async () => {
    expect(await service().service.discover({ ...input, fixtureScenario: "malformed" })).toEqual([]);
  });

  it("performs no network work", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await service().service.discover(input);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

