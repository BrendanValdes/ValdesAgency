import { describe, expect, it, vi } from "vitest";
import { acceptedDiscoveryObservations } from "../../src/lead-engine/discovery/result-normalizer.js";
import { createSqliteRepositories } from "../../src/lead-engine/db/sqlite-repositories.js";
import { FixtureDiscoveryProvider } from "../../src/lead-engine/providers/adapters/fixture.js";
import {
  PROVIDER_ERROR_CATEGORIES,
  type DiscoveryProviderRequest,
  type FixtureScenario,
} from "../../src/lead-engine/providers/contracts.js";
import { createTestDatabase, syntheticRun } from "./fixtures/synthetic.js";
import { syntheticDiscoveryRecords } from "./fixtures/discovery/synthetic.js";

const request = (scenario: FixtureScenario = "success"): DiscoveryProviderRequest => ({
  operation: "discovery",
  correlationId: `correlation-${scenario}`,
  queryId: "query-synthetic-001",
  queryText: "synthetic pool service testville",
  nicheId: "pool_service",
  coverageKey: "coverage-synthetic-001",
  observedAt: "2026-01-15T12:00:00.000Z",
  retrievedAt: "2026-01-15T12:00:01.000Z",
  fixtureScenario: scenario,
});

describe("provider envelopes and fixture provider", () => {
  it("defines every safe provider error category without leaking provider details", () => {
    expect(PROVIDER_ERROR_CATEGORIES).toEqual([
      "unavailable",
      "timeout",
      "rate_limited",
      "authentication_failed",
      "authorization_failed",
      "schema_validation_failed",
      "policy_blocked",
      "unsupported_operation",
      "budget_blocked",
      "cancelled",
      "provider_failure",
    ]);
  });

  it("returns stable successful results with cost and cache metadata", async () => {
    const provider = new FixtureDiscoveryProvider({ records: syntheticDiscoveryRecords });
    const first = await provider.discover(request());
    const second = await provider.discover(request());
    expect(second).toEqual(first);
    expect(first.status).toBe("complete");
    expect(first.envelopes[0]).toMatchObject({
      providerId: "fixture",
      providerSchemaVersion: "fixture-discovery-1.0.0",
      validation: { status: "accepted", issues: [] },
      cost: { billable: false, billableUnits: 0, unit: "none", microUsd: 0 },
      cache: { status: "bypassed", key: null },
    });
  });

  it.each([
    ["timeout", "timeout"],
    ["rate_limited", "rate_limited"],
    ["unavailable", "unavailable"],
  ] as const)("represents %s as a safe provider failure", async (scenario, category) => {
    const batch = await new FixtureDiscoveryProvider({ records: syntheticDiscoveryRecords }).discover(request(scenario));
    expect(batch.status).toBe("failed");
    expect(batch.envelopes[0]?.error?.category).toBe(category);
    expect(batch.envelopes[0]?.normalizedResult).toBeNull();
  });

  it("represents schema drift without accepting any evidence claim", async () => {
    const batch = await new FixtureDiscoveryProvider({ records: syntheticDiscoveryRecords }).discover(request("malformed"));
    expect(batch.envelopes[0]?.validation.status).toBe("rejected");
    expect(batch.envelopes[0]?.error?.category).toBe("schema_validation_failed");
    expect(acceptedDiscoveryObservations(batch.envelopes)).toEqual([]);
  });

  it("supports deterministic empty, duplicate, and partial-failure scenarios", async () => {
    const provider = new FixtureDiscoveryProvider({ records: syntheticDiscoveryRecords });
    expect((await provider.discover(request("empty"))).envelopes).toEqual([]);
    expect((await provider.discover(request("duplicate"))).envelopes).toHaveLength(4);
    const partial = await provider.discover(request("partial_failure"));
    expect(partial.status).toBe("partial");
    expect(partial.envelopes.filter((entry) => entry.validation.status === "rejected")).toHaveLength(1);
  });

  it("records provider call metadata through Phase 1 repositories", async () => {
    const fixture = createTestDatabase();
    try {
      const repositories = createSqliteRepositories(fixture.database, { dataRoot: fixture.dataRoot });
      repositories.runs.create(syntheticRun);
      const provider = new FixtureDiscoveryProvider({
        records: syntheticDiscoveryRecords,
        providerCalls: repositories.providerCalls,
        runId: syntheticRun.id,
      });
      await provider.discover(request());
      const row = fixture.database.prepare("SELECT provider, operation, state, actual_cost_micro_usd, cache_hit FROM provider_calls").get();
      expect(row).toEqual({ provider: "fixture", operation: "discovery", state: "accepted", actual_cost_micro_usd: 0, cache_hit: 0 });
    } finally {
      fixture.cleanup();
    }
  });

  it("makes zero network requests and does not expose request bodies", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const provider = new FixtureDiscoveryProvider({ records: syntheticDiscoveryRecords });
    const batch = await provider.discover(request());
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(JSON.stringify(batch)).not.toContain("queryText");
    fetchSpy.mockRestore();
  });
});
