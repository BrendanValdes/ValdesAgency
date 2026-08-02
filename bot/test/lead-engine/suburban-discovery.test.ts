import { describe, expect, it } from "vitest";
import {
  selectAssessableCandidates,
  type CandidateBlockReason,
} from "../../src/lead-engine/assessment/candidate-gate.js";
import {
  discoverSuburbanWebsiteCandidates,
  planSuburbanCells,
  suburbanPhoenixTargets,
} from "../../src/lead-engine/assessment/suburban-discovery.js";
import { classifyOverturePoolCategory } from "../../src/lead-engine/providers/overture/taxonomy.js";
import type { CoverageCell } from "../../src/lead-engine/geography/types.js";
import type {
  NormalizedDiscoveryResult,
  ProviderEnvelope,
} from "../../src/lead-engine/providers/contracts.js";

// Exactly the four existing strong mapping identifiers — none invented here.
const STRONG_CATEGORIES = [
  "pool_cleaning_service",
  "pool_maintenance_service",
  "swimming_pool_contractor",
  "swimming_pool_repair_service",
] as const;

function envelopeFor(input: {
  category: string;
  placeId: string;
  host?: string;
  accepted?: boolean;
  operatingStatus?: "open" | "permanently_closed";
}): ProviderEnvelope<NormalizedDiscoveryResult> {
  const disposition = classifyOverturePoolCategory({
    basicCategory: input.category,
    taxonomy: { primary: input.category, hierarchy: [], alternates: [] },
  }).disposition;
  const accepted = (input.accepted ?? true) && disposition !== "excluded" && disposition !== "missing";
  const host = input.host ?? `${input.placeId.replace(/[^a-z0-9]+/gi, "-")}.invalid`;
  const result = {
    providerPlaceId: input.placeId,
    name: `Business ${input.placeId}`,
    categories: [input.category],
    address: { line1: "1 Way", city: "Mesa", region: "AZ", postalCode: "85201", countryCode: "US" },
    domains: [`https://${host}/`],
    phones: [],
    brandName: null,
    groupHint: null,
    providerObservation: {
      releaseId: "2026-07-22.0",
      featureVersion: 1,
      schemaVersion: "1.0.0",
      taxonomyMappingVersion: "overture_pool_service_taxonomy_v1",
      basicCategory: input.category,
      taxonomyPrimary: input.category,
      taxonomyHierarchy: [],
      taxonomyAlternates: [],
      categoryDisposition: disposition,
      providerConfidence: 0.9,
      operatingStatus: input.operatingStatus ?? "open",
      sourceMetadata: [],
    },
  } as unknown as NormalizedDiscoveryResult;
  return {
    providerId: "overture_places_live",
    sourceClass: "local_public_dataset",
    claimState: "public_unverified_candidate",
    operation: "discovery",
    providerSchemaVersion: "1.0.0",
    correlationId: "run:query",
    providerResultId: input.placeId,
    observedAt: "2026-08-02T00:00:00.000Z",
    retrievedAt: "2026-08-02T00:00:00.000Z",
    cost: { billable: false, billableUnits: 0, unit: "none", microUsd: 0 },
    cache: { status: "bypassed", key: null },
    normalizedResult: accepted ? result : null,
    validation: accepted ? { status: "accepted", issues: [] } : { status: "rejected", issues: [] },
    error: accepted ? null : { category: "schema_validation_failed", retryable: false },
    rawReferenceChecksum: null,
  };
}

function cells(): ReadonlyArray<CoverageCell> {
  return planSuburbanCells({
    configurationVersion: "1.0.0",
    queryVersion: "overture-suburban-test-1.0.0",
    maxCells: 5,
  });
}

const LIMITS = { maxCells: 5, targetWebsiteCandidates: 3, maxAcceptedCandidates: 15 };

describe("Phase 5A.3 suburban cell planning", () => {
  it("plans bounded suburban cells inside the area budget and away from downtown", () => {
    const targets = suburbanPhoenixTargets();
    expect(targets.length).toBeGreaterThanOrEqual(7);
    for (const target of targets) {
      expect(target.subdivisionCode).toBe("AZ");
      // Same span as the original canary cell, so each stays under 25 km².
      expect(Number((target.bounds.east - target.bounds.west).toFixed(3))).toBe(0.05);
      expect(Number((target.bounds.north - target.bounds.south).toFixed(3))).toBe(0.04);
      // None of these overlap the downtown core cell used in Phase 5A.2.
      const overlapsDowntown = !(target.bounds.east < -112.094 || target.bounds.west > -112.044 ||
        target.bounds.north < 33.438 || target.bounds.south > 33.478);
      expect(overlapsDowntown).toBe(false);
    }
  });

  it("orders cells deterministically and honours the cell budget", () => {
    const first = cells().map((cell) => cell.coverageKey);
    const second = cells().map((cell) => cell.coverageKey);
    expect(second).toEqual(first);
    expect(first).toHaveLength(5);
    expect([...first].sort()).toEqual(first);
    expect(planSuburbanCells({
      configurationVersion: "1.0.0", queryVersion: "overture-suburban-test-1.0.0", maxCells: 2,
    })).toHaveLength(2);
  });
});

describe("Phase 5A.3 taxonomy admissibility is unchanged", () => {
  it("accepts only the four existing strong service categories", () => {
    for (const category of STRONG_CATEGORIES) {
      const gate = selectAssessableCandidates([envelopeFor({ category, placeId: `p-${category}` })]);
      expect(gate.eligible).toHaveLength(1);
    }
  });

  it("keeps downtown facilities, retail supply, and adjacent services out", () => {
    const cases: Array<[string, CandidateBlockReason]> = [
      ["swimming_pool", "review_disposition"],
      ["public_swimming_pool", "review_disposition"],
      ["recreation_center", "review_disposition"],
      ["swimming_pool_supply_store", "review_disposition"],
      ["pool_and_spa_service", "supporting_disposition"],
      ["hot_tub_repair_service", "supporting_disposition"],
      ["water_park", "not_accepted"],
      ["fountain_contractor", "not_accepted"],
      ["pond_contractor", "not_accepted"],
    ];
    for (const [category, reason] of cases) {
      const gate = selectAssessableCandidates([envelopeFor({ category, placeId: `p-${category}` })]);
      expect(gate.eligible).toHaveLength(0);
      expect(gate.blockedCounts[reason]).toBe(1);
    }
  });

  it("still blocks closed, rejected, and unsafe candidates regardless of category", () => {
    const closed = selectAssessableCandidates([
      envelopeFor({ category: "pool_cleaning_service", placeId: "p-closed", operatingStatus: "permanently_closed" }),
    ]);
    expect(closed.blockedCounts.not_operating).toBe(1);
    const rejected = selectAssessableCandidates([
      envelopeFor({ category: "pool_cleaning_service", placeId: "p-rejected", accepted: false }),
    ]);
    expect(rejected.blockedCounts.not_accepted).toBe(1);
  });
});

describe("Phase 5A.3 bounded multi-cell traversal", () => {
  it("finds strong candidates across cells when the first cell yields none", async () => {
    const planned = cells();
    const summary = await discoverSuburbanWebsiteCandidates({
      cells: planned,
      limits: LIMITS,
      queryCell: async (cell) => cell.coverageKey === planned[0]?.coverageKey
        ? [envelopeFor({ category: "swimming_pool", placeId: "facility-1" })]
        : [envelopeFor({ category: "pool_cleaning_service", placeId: `svc-${cell.coverageKey.slice(-4)}` })],
    });
    expect(summary.eligibleWebsiteCandidates.length).toBeGreaterThan(0);
    expect(summary.cellsQueried).toBeGreaterThan(1);
    expect(summary.gateBlockedCounts.review_disposition).toBe(1);
  });

  it("stops as soon as the website-candidate target is reached", async () => {
    const summary = await discoverSuburbanWebsiteCandidates({
      cells: cells(),
      limits: LIMITS,
      queryCell: async (cell) => [
        envelopeFor({ category: "pool_cleaning_service", placeId: `a-${cell.coverageKey.slice(-4)}` }),
        envelopeFor({ category: "swimming_pool_contractor", placeId: `b-${cell.coverageKey.slice(-4)}` }),
      ],
    });
    expect(summary.eligibleWebsiteCandidates).toHaveLength(3);
    expect(summary.stopReason).toBe("website_candidate_target_reached");
    expect(summary.cellsQueried).toBe(2);
  });

  it("never yields the same place or host twice across cells", async () => {
    const summary = await discoverSuburbanWebsiteCandidates({
      cells: cells(),
      limits: LIMITS,
      // The same chain appears in every suburb with one shared website.
      queryCell: async () => [envelopeFor({ category: "pool_cleaning_service", placeId: "chain-1", host: "chain.invalid" })],
    });
    expect(summary.eligibleWebsiteCandidates).toHaveLength(1);
    expect(summary.duplicatesAcrossCells).toBe(4);
    expect(summary.stopReason).toBe("all_cells_exhausted");
  });

  it("stops on the accepted-candidate budget, provider budget, and cancellation", async () => {
    const many = async (cell: CoverageCell) => Array.from({ length: 4 }, (_unused, index) =>
      envelopeFor({ category: "pool_cleaning_service", placeId: `x-${cell.coverageKey.slice(-4)}-${index}` }));

    const accepted = await discoverSuburbanWebsiteCandidates({
      cells: cells(),
      limits: { ...LIMITS, targetWebsiteCandidates: 99, maxAcceptedCandidates: 4 },
      queryCell: many,
    });
    expect(accepted.stopReason).toBe("accepted_candidate_budget_reached");

    let exhausted = false;
    const provider = await discoverSuburbanWebsiteCandidates({
      cells: cells(),
      limits: { ...LIMITS, targetWebsiteCandidates: 99 },
      isBudgetExhausted: () => exhausted,
      queryCell: async (cell) => {
        exhausted = true;
        return [envelopeFor({ category: "pool_cleaning_service", placeId: `y-${cell.coverageKey.slice(-4)}` })];
      },
    });
    expect(provider.stopReason).toBe("provider_budget_exhausted");
    expect(provider.cellsQueried).toBe(1);

    const thrown = await discoverSuburbanWebsiteCandidates({
      cells: cells(),
      limits: { ...LIMITS, targetWebsiteCandidates: 99 },
      queryCell: async () => { throw new Error("row budget exhausted"); },
    });
    expect(thrown.stopReason).toBe("provider_budget_exhausted");
    expect(thrown.cellsQueried).toBe(0);

    const controller = new AbortController();
    controller.abort();
    const cancelled = await discoverSuburbanWebsiteCandidates({
      cells: cells(),
      limits: LIMITS,
      signal: controller.signal,
      queryCell: async () => [envelopeFor({ category: "pool_cleaning_service", placeId: "never" })],
    });
    expect(cancelled.stopReason).toBe("cancelled");
    expect(cancelled.cellsQueried).toBe(0);
  });

  it("summarises aggregates only, with no business-identifying values", async () => {
    const summary = await discoverSuburbanWebsiteCandidates({
      cells: cells(),
      limits: LIMITS,
      queryCell: async (cell) => [
        envelopeFor({ category: "pool_cleaning_service", placeId: `svc-${cell.coverageKey.slice(-4)}` }),
        envelopeFor({ category: "swimming_pool_supply_store", placeId: `sup-${cell.coverageKey.slice(-4)}` }),
      ],
    });
    // The per-cell report and counters carry no names, domains, or addresses.
    const reportable = {
      cellsPlanned: summary.cellsPlanned,
      cellsQueried: summary.cellsQueried,
      envelopesConsidered: summary.envelopesConsidered,
      acceptedCandidates: summary.acceptedCandidates,
      eligible: summary.eligibleWebsiteCandidates.length,
      duplicatesAcrossCells: summary.duplicatesAcrossCells,
      gateBlockedCounts: summary.gateBlockedCounts,
      perCell: summary.perCell,
      stopReason: summary.stopReason,
    };
    const serialized = JSON.stringify(reportable).toLowerCase();
    for (const forbidden of ["business ", ".invalid", "https://", "85201", "1 way"]) {
      expect(serialized).not.toContain(forbidden);
    }
    for (const cell of summary.perCell) {
      expect(cell.coverageCellSafeId).toMatch(/^coverage_[0-9a-f]+$/);
    }
    expect(summary.gateBlockedCounts.review_disposition).toBeGreaterThan(0);
  });
});
