import { describe, expect, it, vi } from "vitest";
import { DiscoveryService } from "../../src/lead-engine/discovery/discovery-service.js";
import { acceptedDiscoveryObservations } from "../../src/lead-engine/discovery/result-normalizer.js";
import { OverturePlacesLiveDiscoveryProvider } from "../../src/lead-engine/providers/adapters/overture-places-live.js";
import {
  createTestOnlyOvertureAssetQueryEngine,
  createUnavailableOvertureAssetQueryEngine,
} from "../../src/lead-engine/providers/overture/asset-query-engine.js";
import { ProviderRegistry } from "../../src/lead-engine/providers/registry.js";
import type { OverturePlaceRecord } from "../../src/lead-engine/providers/overture/schema.js";
import type { OvertureAssetQueryEngine } from "../../src/lead-engine/providers/overture/asset-query-engine.js";
import {
  SYNTHETIC_OVERTURE_ASSET,
  SYNTHETIC_OVERTURE_RELEASE_PIN,
  SYNTHETIC_OVERTURE_SCHEMA,
  syntheticBudget,
  syntheticDiscoveryRequest,
  syntheticLivePolicy,
  syntheticPhoenixCell,
  syntheticPlace,
  syntheticQueryPlan,
} from "./fixtures/overture/synthetic-live.js";

function engineFor(records: ReadonlyArray<unknown>): OvertureAssetQueryEngine {
  return createTestOnlyOvertureAssetQueryEngine(async ({ budget }) => {
    budget.reserveRequest("asset", 1_024);
    budget.recordDownload(512);
    return {
      schema: SYNTHETIC_OVERTURE_SCHEMA,
      records,
      assets: [SYNTHETIC_OVERTURE_ASSET],
      requestCount: 1,
      downloadedBytes: 512,
      processedBytes: Math.max(1, records.length * 256),
      rowsRead: records.length,
    };
  });
}

function providerFor(input: {
  engine?: OvertureAssetQueryEngine;
  records?: ReadonlyArray<unknown>;
  signal?: AbortSignal;
  budgetOverrides?: Parameters<typeof syntheticBudget>[0];
} = {}) {
  const live = syntheticLivePolicy();
  const provider = new OverturePlacesLiveDiscoveryProvider({
    policy: live.policy,
    capability: live.capability,
    runId: "run-synthetic-overture",
    assessmentId: "scope-synthetic-overture",
    release: SYNTHETIC_OVERTURE_RELEASE_PIN,
    coverageCell: syntheticPhoenixCell(),
    plan: syntheticQueryPlan(),
    budget: syntheticBudget(input.budgetOverrides),
    signal: input.signal ?? new AbortController().signal,
    queryEngine: input.engine ?? engineFor(input.records ?? [syntheticPlace()]),
  });
  return { provider, live };
}

describe("versioned live Overture Places adapter", () => {
  it("normalizes provider observations without claiming external verification", async () => {
    const fixture = providerFor();
    try {
      const batch = await fixture.provider.discover(syntheticDiscoveryRequest());
      expect(batch.status).toBe("complete");
      expect(batch.envelopes).toHaveLength(1);
      const envelope = batch.envelopes[0];
      expect(envelope).toMatchObject({
        providerId: "overture_places_live",
        providerResultId: "synthetic-overture-place-001",
        sourceClass: "local_public_dataset",
        claimState: "public_unverified_candidate",
        validation: { status: "accepted" },
        cost: { billable: false, microUsd: 0 },
      });
      expect(envelope?.normalizedResult).toMatchObject({
        phones: ["+15550101001"],
        emails: ["contact@synthetic-pool-alpha.invalid"],
        domains: ["https://synthetic-pool-alpha.invalid/"],
        providerObservation: {
          releaseId: "2026-07-23.0",
          featureVersion: 1,
          providerConfidence: 0.91,
          operatingStatus: "open",
          categoryDisposition: "strong",
        },
      });
      expect(JSON.stringify(envelope)).not.toMatch(/externally_verified|verified_phone|verified_email|verified_owner/);
      expect(fixture.provider.audit()).toMatchObject({
        acceptedCount: 1,
        rejectedCount: 0,
        reviewCount: 0,
        duplicateCount: 0,
        status: "complete",
      });
    } finally {
      fixture.live.cleanup();
    }
  });

  it("routes facility and retail categories to review and excludes unrelated water features", async () => {
    const records: OverturePlaceRecord[] = [
      syntheticPlace({
        id: "synthetic-facility",
        basic_category: "swimming_pool",
        taxonomy: { primary: "swimming_pool", hierarchy: [], alternates: [] },
      }),
      syntheticPlace({
        id: "synthetic-retail",
        basic_category: "swimming_pool_supply_store",
        taxonomy: { primary: "swimming_pool_supply_store", hierarchy: [], alternates: [] },
      }),
      syntheticPlace({
        id: "synthetic-water-feature",
        basic_category: "fountain_contractor",
        taxonomy: { primary: "fountain_contractor", hierarchy: [], alternates: [] },
      }),
    ];
    const fixture = providerFor({ records });
    try {
      const batch = await fixture.provider.discover(syntheticDiscoveryRequest());
      expect(batch.envelopes).toHaveLength(2);
      expect(batch.envelopes.every((envelope) =>
        envelope.normalizedResult?.providerObservation?.categoryDisposition === "review"
      )).toBe(true);
      expect(fixture.provider.audit()).toMatchObject({
        acceptedCount: 2,
        rejectedCount: 1,
        reviewCount: 2,
      });
    } finally {
      fixture.live.cleanup();
    }
  });

  it("deduplicates identical feature IDs and fails closed on conflicting versions", async () => {
    const duplicate = syntheticPlace();
    const identical = providerFor({ records: [duplicate, duplicate] });
    try {
      const batch = await identical.provider.discover(syntheticDiscoveryRequest());
      expect(batch.envelopes).toHaveLength(1);
      expect(identical.provider.audit()).toMatchObject({ duplicateCount: 1 });
    } finally {
      identical.live.cleanup();
    }

    const conflict = providerFor({ records: [duplicate, { ...duplicate, version: 2 }] });
    try {
      const batch = await conflict.provider.discover(syntheticDiscoveryRequest());
      expect(batch.status).toBe("failed");
      expect(conflict.provider.audit()).toMatchObject({ failureCode: "result_invalid" });
    } finally {
      conflict.live.cleanup();
    }
  });

  it("rejects invalid records, outside-cell geometry, and engine budget-accounting mismatches", async () => {
    const invalid = providerFor({ records: [
      { ...syntheticPlace(), confidence: "high" },
      syntheticPlace({ id: "synthetic-outside", geometry: { type: "Point", coordinates: [-110, 35] } }),
    ] });
    try {
      const batch = await invalid.provider.discover(syntheticDiscoveryRequest());
      expect(batch.status).toBe("partial");
      expect(batch.envelopes).toEqual([]);
      expect(invalid.provider.audit()).toMatchObject({ rejectedCount: 2 });
    } finally {
      invalid.live.cleanup();
    }

    const lyingEngine = createTestOnlyOvertureAssetQueryEngine(async () => ({
      schema: SYNTHETIC_OVERTURE_SCHEMA,
      records: [syntheticPlace()],
      assets: [SYNTHETIC_OVERTURE_ASSET],
      requestCount: 1,
      downloadedBytes: 512,
      processedBytes: 256,
      rowsRead: 1,
    }));
    const mismatch = providerFor({ engine: lyingEngine });
    try {
      expect((await mismatch.provider.discover(syntheticDiscoveryRequest())).status).toBe("failed");
      expect(mismatch.provider.audit()).toMatchObject({ failureCode: "result_invalid" });
    } finally {
      mismatch.live.cleanup();
    }
  });

  it("is idempotent for the same release/cell/query/result and changes the query fingerprint for a new release", async () => {
    const fixture = providerFor({ budgetOverrides: { maxAssetRequests: 4, maxCandidates: 4 } });
    try {
      const first = await fixture.provider.discover(syntheticDiscoveryRequest());
      const second = await fixture.provider.discover(syntheticDiscoveryRequest());
      const observations = acceptedDiscoveryObservations([...first.envelopes, ...second.envelopes]);
      expect(observations).toHaveLength(1);
      expect(observations[0]?.observationId).toMatch(/^observation_/);
      expect(syntheticQueryPlan("2026-07-30.0").fingerprint).not.toBe(syntheticQueryPlan().fingerprint);
    } finally {
      fixture.live.cleanup();
    }
  });

  it("fails closed before live access when the secure remote GeoParquet transport is unavailable", async () => {
    const fixture = providerFor({ engine: createUnavailableOvertureAssetQueryEngine() });
    try {
      const batch = await fixture.provider.discover(syntheticDiscoveryRequest());
      expect(batch.status).toBe("failed");
      expect(fixture.provider.audit()).toMatchObject({
        failureCode: "secure_remote_geoparquet_transport_unavailable",
      });
    } finally {
      fixture.live.cleanup();
    }
  });

  it("honors cancellation before invoking the query engine", async () => {
    const controller = new AbortController();
    controller.abort();
    const handler = vi.fn(engineFor([]).query);
    const engine = createTestOnlyOvertureAssetQueryEngine(handler);
    const fixture = providerFor({ engine, signal: controller.signal });
    try {
      const batch = await fixture.provider.discover(syntheticDiscoveryRequest());
      expect(batch.status).toBe("failed");
      expect(handler).not.toHaveBeenCalled();
      expect(fixture.provider.audit()).toMatchObject({ failureCode: "cancelled" });
    } finally {
      fixture.live.cleanup();
    }
  });

  it("enters the existing registry, discovery query generator, and observation normalizer", async () => {
    const live = syntheticLivePolicy();
    const provider = new OverturePlacesLiveDiscoveryProvider({
      policy: live.policy,
      capability: live.capability,
      runId: "run-synthetic-overture",
      assessmentId: "scope-synthetic-overture",
      release: SYNTHETIC_OVERTURE_RELEASE_PIN,
      coverageCell: syntheticPhoenixCell(),
      plan: syntheticQueryPlan(),
      budget: syntheticBudget({
        maxAssetRequests: 32,
        maxDownloadedBytes: 2 * 1024 * 1024,
        maxProcessedBytes: 2 * 1024 * 1024,
        maxRowsRead: 100,
        maxCandidates: 100,
      }),
      signal: new AbortController().signal,
      queryEngine: engineFor([syntheticPlace()]),
    });
    try {
      const registry = new ProviderRegistry(live.policy);
      registry.register(provider);
      const service = new DiscoveryService(registry);
      const observations = await service.discover({
        nicheId: "pool_service",
        providerId: "overture_places_live",
        geography: syntheticPhoenixCell(),
        queryVersion: "overture-synthetic-query-1.0.0",
        correlationId: "run-synthetic-overture",
        observedAt: "2026-08-01T12:00:00.000Z",
        retrievedAt: "2026-08-01T12:00:01.000Z",
      });
      expect(observations).toHaveLength(1);
      expect(observations[0]).toMatchObject({
        providerId: "overture_places_live",
        sourceClass: "local_public_dataset",
        claimState: "public_unverified_candidate",
      });
    } finally {
      live.cleanup();
    }
  });
});
