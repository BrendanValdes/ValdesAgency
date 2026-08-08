import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  createAssessmentStore,
  type AssessmentStore,
} from "../../src/lead-engine/assessment/assessment-store.js";
import { qualifyAndRankBatch } from "../../src/lead-engine/assessment/batch-runner.js";
import {
  selectAssessableCandidates,
  type EligibleCandidate,
} from "../../src/lead-engine/assessment/candidate-gate.js";
import {
  runLiveWebsiteAssessment,
  type LiveWebsiteAssessmentLimits,
} from "../../src/lead-engine/assessment/live-website-assessment.js";
import { planSuburbanCoverage } from "../../src/lead-engine/assessment/suburban-discovery.js";
import { parseBatchCanaryArguments } from "../../scripts/run-pool-batch-canary.js";
import { DISCOVERY_COVERAGE_SCHEME } from "../../src/lead-engine/geography/coverage-keys.js";
import { loadNicheConfigurations } from "../../src/lead-engine/config/niches.js";
import { extractServiceEvidence } from "../../src/lead-engine/extraction/services.js";
import { POOL_SERVICE_ICP_V1 } from "../../src/lead-engine/qualification/pool-service-model.js";
import {
  classifyOverturePoolCategory,
  OVERTURE_POOL_SERVICE_CALIBRATION_VERSION,
  OVERTURE_POOL_SERVICE_CATEGORY_CALIBRATION,
  OVERTURE_POOL_SERVICE_TAXONOMY_V1,
  poolServiceExcludedFromServiceFit,
  poolServiceFitCategories,
} from "../../src/lead-engine/providers/overture/taxonomy.js";
import { createOvertureAssetSession } from "../../src/lead-engine/providers/overture/asset-session.js";
import { OvertureBudgetTracker } from "../../src/lead-engine/providers/overture/budgets.js";
import { createTestOnlyOvertureRangeHttpTransport } from "../../src/lead-engine/providers/overture/range-http-transport.js";
import {
  validateOvertureParquetMetadata,
  type OvertureParquetFooter,
  type OvertureParquetMetadata,
} from "../../src/lead-engine/providers/overture/parquet-metadata.js";
import {
  createSecureOvertureAssetQueryEngine,
  type OvertureParquetReader,
} from "../../src/lead-engine/providers/overture/secure-asset-query-engine.js";
import { OVERTURE_SELECTED_PLACE_COLUMNS } from "../../src/lead-engine/providers/overture/query.js";
import {
  SYNTHETIC_OVERTURE_RELEASE,
  SYNTHETIC_OVERTURE_RELEASE_PIN,
  syntheticBudget,
  syntheticLivePolicy,
  syntheticPhoenixCell,
  syntheticQueryPlan,
} from "./fixtures/overture/synthetic-live.js";
import type { CoverageCell, CoverageManifest } from "../../src/lead-engine/geography/types.js";
import type { NicheConfiguration } from "../../src/lead-engine/config/niches.js";
import type { CrawlPage, CrawlResult, RobotsDecision } from "../../src/lead-engine/crawl/types.js";
import type { SqliteDatabase } from "../../src/lead-engine/db/database.js";
import type {
  NormalizedDiscoveryResult,
  ProviderEnvelope,
} from "../../src/lead-engine/providers/contracts.js";

/**
 * Scale readiness for the pool-service discovery path.
 *
 * Three questions, all answered against production modules:
 *   1. does the configured category vocabulary match the identifiers the live
 *      classifier actually admits, and does it still refuse retail, facilities,
 *      recreation, and builder-ambiguous identifiers;
 *   2. what does a coverage-cell traversal cost, and does sharing one pinned
 *      asset across a pass remove duplicate IO without changing what is admitted;
 *   3. do the budget stops and the session's scope guards still hold.
 */

// --- A. taxonomy calibration --------------------------------------------------

function poolNiche(): NicheConfiguration {
  const niche = loadNicheConfigurations().get("pool_service");
  if (!niche) throw new Error("pool_service niche configuration is missing");
  return niche;
}

describe("pool-service provider category calibration", () => {
  it("covers every identifier the discovery classifier can admit", () => {
    const admissible = [
      ...OVERTURE_POOL_SERVICE_TAXONOMY_V1.strong,
      ...OVERTURE_POOL_SERVICE_TAXONOMY_V1.supporting,
      ...OVERTURE_POOL_SERVICE_TAXONOMY_V1.review,
      ...OVERTURE_POOL_SERVICE_TAXONOMY_V1.excluded,
    ].sort();
    const calibrated = OVERTURE_POOL_SERVICE_CATEGORY_CALIBRATION
      .map((entry) => entry.identifier).sort();
    // No identifier can be admitted without a recorded service-fit decision, so
    // the vocabulary can never silently miss a category the classifier accepts.
    expect(calibrated).toEqual(admissible);
    for (const entry of OVERTURE_POOL_SERVICE_CATEGORY_CALIBRATION) {
      expect(entry.rationale.trim().length).toBeGreaterThan(20);
    }
    expect(OVERTURE_POOL_SERVICE_CALIBRATION_VERSION)
      .toBe("overture_pool_service_category_calibration_v1");
  });

  it("credits only unambiguous cleaning, maintenance, and repair service identifiers", () => {
    expect(poolServiceFitCategories()).toEqual([
      "pool_cleaning",
      "pool_cleaning_service",
      "pool_maintenance_service",
      "swimming_pool_repair_service",
    ]);
    // The observed live identifier is included, and it is a strong admission.
    expect(OVERTURE_POOL_SERVICE_TAXONOMY_V1.strong).toContain("pool_cleaning");
  });

  it("refuses retail, facilities, recreation, spa-adjacent, and builder-ambiguous identifiers", () => {
    const refused = poolServiceExcludedFromServiceFit();
    for (const identifier of [
      "hot_tub_and_pool_store", "swimming_pool_supply_store",
      "swimming_pool", "public_swimming_pool", "recreation_center",
      "water_park", "fountain_contractor", "pond_contractor",
      "pool_and_spa_service", "hot_tub_repair_service",
      // Ambiguous between a builder and a service contractor: still crawlable,
      // but it must not assert service fit on a dataset field alone.
      "swimming_pool_contractor",
    ]) expect(refused).toContain(identifier);
    // A builder-ambiguous place is still admitted for crawling, so its own site
    // can supply service evidence. Exclusion is from credit, not from discovery.
    expect(classifyOverturePoolCategory({
      basicCategory: "swimming_pool_contractor",
      taxonomy: { primary: "swimming_pool_contractor", hierarchy: [], alternates: [] },
    }).disposition).toBe("strong");
  });

  it("keeps the niche configuration and the ICP vocabulary in agreement", () => {
    const configured = poolNiche().relevant_categories;
    const model = POOL_SERVICE_ICP_V1.relevantCategories;
    for (const identifier of poolServiceFitCategories()) {
      // Both lists must carry it: the config decides whether service evidence is
      // produced at all, the model decides whether it can be recognised.
      expect(configured).toContain(identifier);
      expect(model).toContain(identifier);
    }
    for (const identifier of poolServiceExcludedFromServiceFit()) {
      expect(configured).not.toContain(identifier);
      expect(model).not.toContain(identifier);
    }
    // Weights, thresholds, rule ids, and component maxima are untouched by the
    // vocabulary recalibration.
    expect(POOL_SERVICE_ICP_V1.version).toBe("pool_service_icp_v1");
    expect(POOL_SERVICE_ICP_V1.thresholds).toEqual({
      highPriorityMinimum: 80, qualifiedMinimum: 65, qualifiedWithReviewMinimum: 50,
    });
    expect(POOL_SERVICE_ICP_V1.scoreRules.find((rule) => rule.id === "niche.relevant_category")
      ?.maximumPoints).toBe(5);
  });

  it("turns an observed live identifier into provider-category service evidence", () => {
    const niche = poolNiche();
    const html = {
      headings: [], visibleText: "", title: null, metaDescription: null,
      language: null, viewport: null,
    } as never;
    const jsonLd = { services: [], organizationNames: [], people: [] } as never;
    const observations = extractServiceEvidence({
      html, jsonLd, niche,
      providerCategories: ["pool_cleaning"],
      providerSourceClass: "local_public_dataset",
    });
    const category = observations.filter((entry) => entry.basis === "provider_category");
    expect(category).toHaveLength(1);
    expect(category[0]).toMatchObject({
      state: "positive",
      term: "pool_cleaning",
      // Discovery provenance is preserved verbatim and the claim stays observed:
      // no verification state, verifier, or human confirmation is introduced.
      sourceClass: "local_public_dataset",
      claimState: "observed",
    });
  });

  it("produces no provider-category evidence for a refused identifier", () => {
    const niche = poolNiche();
    const html = {
      headings: [], visibleText: "", title: null, metaDescription: null,
      language: null, viewport: null,
    } as never;
    const jsonLd = { services: [], organizationNames: [], people: [] } as never;
    for (const identifier of poolServiceExcludedFromServiceFit()) {
      const observations = extractServiceEvidence({
        html, jsonLd, niche,
        providerCategories: [identifier],
        providerSourceClass: "local_public_dataset",
      });
      expect(observations.filter((entry) => entry.basis === "provider_category")).toEqual([]);
    }
  });
});

// --- B/C. traversal economics and the shared asset session --------------------

const CELL = syntheticPhoenixCell();
const SELECTED = [...OVERTURE_SELECTED_PLACE_COLUMNS];
const RANGE_TOTAL = 4_096;

function rawColumn(path: string, options: {
  compressed?: number; uncompressed?: number; min?: number; max?: number; offset?: number;
} = {}) {
  const statistics = options.min !== undefined || options.max !== undefined
    ? { min_value: options.min, max_value: options.max }
    : undefined;
  return {
    meta_data: {
      path_in_schema: path.split("."),
      codec: "SNAPPY",
      total_compressed_size: options.compressed ?? 0,
      total_uncompressed_size: options.uncompressed ?? 0,
      data_page_offset: options.offset ?? 4,
      ...(statistics ? { statistics } : {}),
    },
  };
}

/**
 * One row group per synthetic partition region, each holding its own byte span so
 * a warmed range is a genuinely distinct request rather than a coincidental hit.
 */
interface RowGroupExtent {
  readonly xmin: number;
  readonly xmax: number;
  readonly ymin: number;
  readonly ymax: number;
}

function group(input: {
  index: number; rows: number; bytes: number; extent: RowGroupExtent;
}) {
  const base = 8 + input.index * 256;
  const columns = SELECTED.map((name, position) => rawColumn(name, {
    compressed: position === 0 ? input.bytes : 0,
    uncompressed: position === 0 ? input.bytes * 2 : 0,
    offset: base + position,
  }));
  columns.push(
    rawColumn("bbox.xmin", { min: input.extent.xmin, max: input.extent.xmin, offset: base }),
    rawColumn("bbox.xmax", { min: input.extent.xmax, max: input.extent.xmax, offset: base }),
    rawColumn("bbox.ymin", { min: input.extent.ymin, max: input.extent.ymin, offset: base }),
    rawColumn("bbox.ymax", { min: input.extent.ymax, max: input.extent.ymax, offset: base }),
  );
  return { num_rows: input.rows, total_byte_size: input.bytes * 2, columns };
}

const WIDE: RowGroupExtent = {
  xmin: CELL.bounds.west - 0.5, xmax: CELL.bounds.east + 0.5,
  ymin: CELL.bounds.south - 0.5, ymax: CELL.bounds.north + 0.5,
};

function metadataFor(groupCount: number): OvertureParquetMetadata {
  return validateOvertureParquetMetadata(
    {
      num_rows: groupCount * 2,
      row_groups: Array.from({ length: groupCount }, (_unused, index) =>
        group({ index, rows: 2, bytes: 128, extent: WIDE })),
      key_value_metadata: [{ key: "geo" }],
    },
    100 * 1024 * 1024,
    { maxRows: 1_000_000, maxRowGroups: 1_000, maxColumnsPerRowGroup: 512 },
  );
}

interface TransportTally {
  requests: number;
  bodyBytes: number;
}

function countingTransport(tally: TransportTally) {
  return createTestOnlyOvertureRangeHttpTransport(async (request) => {
    const start = request.start;
    const end = request.endExclusive;
    tally.requests += 1;
    tally.bodyBytes += end - start;
    const body = Buffer.alloc(end - start);
    if (start === 0 && end >= 4) body.write("PAR1", 0, "ascii");
    return {
      status: 206,
      headers: {
        "content-type": "application/octet-stream",
        "content-encoding": "identity",
        "content-range": `bytes ${start}-${end - 1}/${RANGE_TOTAL}`,
        "content-length": String(end - start),
        "etag": '"scale-fixture"',
      },
      body,
      connectedAddress: "203.0.113.10",
      destinationHost: new URL(request.asset.url).hostname,
      headerBytes: 200,
    };
  });
}

function reader(metadata: OvertureParquetMetadata, decodes: { count: number }): OvertureParquetReader {
  const footer: OvertureParquetFooter = { metadata, raw: { placeholder: true } as never };
  return {
    async readMetadata() {
      return footer;
    },
    async readColumns(request) {
      decodes.count += 1;
      return Array.from({ length: request.rowEnd - request.rowStart }, (_unused, offset) => ({
        id: `place-${request.rowStart + offset}`,
        version: 1,
        sources: [],
        names: { primary: `Place ${request.rowStart + offset}`, common: {} },
        basic_category: "pool_cleaning",
        taxonomy: { primary: "pool_cleaning", hierarchy: [], alternates: [] },
        confidence: 0.9,
        operating_status: "open",
        websites: [],
        emails: [],
        phones: [],
        addresses: [{ freeform: "1 Way", locality: "Phoenix", region: "AZ", postcode: "85004", country: "US" }],
        geometry: {
          type: "Point",
          coordinates: [
            (CELL.bounds.west + CELL.bounds.east) / 2,
            (CELL.bounds.south + CELL.bounds.north) / 2,
          ],
        },
      }));
    },
  };
}

/** Cells that all sit inside the same partition, as a real metro traversal does. */
function cells(count: number): CoverageCell[] {
  return Array.from({ length: count }, (_unused, index) => ({
    ...CELL,
    coverageKey: `${CELL.coverageKey}-${index}`,
    label: `${CELL.label} ${index}`,
  }));
}

async function traverse(input: {
  cellCount: number;
  groupCount: number;
  shared: boolean;
  budget?: OvertureBudgetTracker;
}) {
  const live = syntheticLivePolicy();
  const tally: TransportTally = { requests: 0, bodyBytes: 0 };
  const decodes = { count: 0 };
  // Legal ceilings only: the budget validator caps asset inspections at 16,
  // asset requests at 32, and rows read at 10,000. Nothing here is raised past
  // what the tracker already permits.
  const budget = input.budget ?? syntheticBudget({
    maxAssetsInspected: 16, maxAssetRequests: 32, maxRowGroupsInspected: 256,
  });
  const controller = new AbortController();
  const session = input.shared
    ? createOvertureAssetSession({ budget, signal: controller.signal })
    : null;
  try {
    const metadata = metadataFor(input.groupCount);
    const results = [];
    for (const cell of cells(input.cellCount)) {
      const engine = createSecureOvertureAssetQueryEngine({
        policy: live.policy,
        capability: live.capability,
        runId: "run-synthetic-overture",
        assessmentId: "scope-synthetic-overture",
        transport: countingTransport(tally),
        reader: reader(metadata, decodes),
        now: () => "2026-08-01T12:00:00.000Z",
        ...(session ? { session } : {}),
      });
      results.push(await engine.query({
        release: SYNTHETIC_OVERTURE_RELEASE_PIN,
        coverageCell: cell,
        plan: syntheticQueryPlan(SYNTHETIC_OVERTURE_RELEASE, 100),
        signal: controller.signal,
        budget,
      }));
    }
    return { tally, decodes, results, session, budget };
  } finally {
    session?.close();
    live.cleanup();
  }
}

describe("discovery traversal economics", () => {
  it("reports the full candidate funnel and cache behaviour per query", async () => {
    const { results } = await traverse({ cellCount: 1, groupCount: 2, shared: false });
    const result = results[0];
    if (!result) throw new Error("no traversal result");
    expect(result.funnel.decodedRows).toBeGreaterThan(0);
    expect(result.funnel.acceptedCandidates).toBe(result.funnel.decodedRows -
      result.funnel.rejectedOutsideCell - result.funnel.rejectedDuplicateId -
      result.funnel.rejectedByCategory);
    // Cache accounting adds up to the ranged reads that actually happened.
    expect(result.cache.rangeHits + result.cache.rangeMisses).toBeGreaterThan(0);
    expect(result.cache.assetHandleReused).toBe(false);
    expect(result.rowGroupsSelected).toBeGreaterThanOrEqual(result.rowGroupsRead);
  });

  it("counts locality and category rejections separately", async () => {
    const live = syntheticLivePolicy();
    const tally: TransportTally = { requests: 0, bodyBytes: 0 };
    const decodes = { count: 0 };
    try {
      const engine = createSecureOvertureAssetQueryEngine({
        policy: live.policy,
        capability: live.capability,
        runId: "run-synthetic-overture",
        assessmentId: "scope-synthetic-overture",
        transport: countingTransport(tally),
        reader: reader(metadataFor(1), decodes),
        now: () => "2026-08-01T12:00:00.000Z",
        // Refuse everything: every in-cell row must land in rejectedByCategory,
        // never silently in the locality bucket.
        isCandidate: () => false,
      });
      const result = await engine.query({
        release: SYNTHETIC_OVERTURE_RELEASE_PIN,
        coverageCell: CELL,
        plan: syntheticQueryPlan(SYNTHETIC_OVERTURE_RELEASE, 100),
        signal: new AbortController().signal,
        budget: syntheticBudget(),
      });
      expect(result.funnel.acceptedCandidates).toBe(0);
      expect(result.funnel.rejectedByCategory).toBe(result.funnel.decodedRows);
      expect(result.funnel.rejectedOutsideCell).toBe(0);
    } finally {
      live.cleanup();
    }
  });

  it("removes duplicate asset IO across the cells of one pass without changing results", async () => {
    const unshared = await traverse({ cellCount: 6, groupCount: 3, shared: false });
    const shared = await traverse({ cellCount: 6, groupCount: 3, shared: true });

    // Identical admitted output: the optimization is IO-only.
    expect(shared.results.map((result) => result.records.length))
      .toEqual(unshared.results.map((result) => result.records.length));
    expect(shared.results.map((result) => result.rowsRead))
      .toEqual(unshared.results.map((result) => result.rowsRead));
    expect(shared.results.map((result) => result.funnel.acceptedCandidates))
      .toEqual(unshared.results.map((result) => result.funnel.acceptedCandidates));

    // Strictly fewer network requests and bytes for the same work.
    expect(shared.tally.requests).toBeLessThan(unshared.tally.requests);
    expect(shared.tally.bodyBytes).toBeLessThan(unshared.tally.bodyBytes);
    // The asset is opened once and reused by every later cell of the pass.
    expect(shared.results[0]?.cache.assetHandleReused).toBe(false);
    expect(shared.results.slice(1).every((result) => result.cache.assetHandleReused)).toBe(true);
    expect(unshared.results.every((result) => result.cache.assetHandleReused === false)).toBe(true);
  });

  it("charges one asset inspection per pass instead of one per cell", async () => {
    const unshared = await traverse({ cellCount: 5, groupCount: 2, shared: false });
    const shared = await traverse({ cellCount: 5, groupCount: 2, shared: true });
    expect(unshared.budget.snapshot().consumed.assetsInspected).toBe(5);
    expect(shared.budget.snapshot().consumed.assetsInspected).toBe(1);
  });

  it("still stops on the row budget rather than reading past it", async () => {
    const live = syntheticLivePolicy();
    const tally: TransportTally = { requests: 0, bodyBytes: 0 };
    const decodes = { count: 0 };
    try {
      const engine = createSecureOvertureAssetQueryEngine({
        policy: live.policy,
        capability: live.capability,
        runId: "run-synthetic-overture",
        assessmentId: "scope-synthetic-overture",
        transport: countingTransport(tally),
        reader: reader(metadataFor(4), decodes),
        now: () => "2026-08-01T12:00:00.000Z",
      });
      const result = await engine.query({
        release: SYNTHETIC_OVERTURE_RELEASE_PIN,
        coverageCell: CELL,
        plan: syntheticQueryPlan(SYNTHETIC_OVERTURE_RELEASE, 2),
        signal: new AbortController().signal,
        budget: syntheticBudget(),
      });
      expect(result.rowsRead).toBeLessThanOrEqual(2);
      expect(result.stopReason).toBe("row_budget_exhausted");
    } finally {
      live.cleanup();
    }
  });
});

describe("asset session safety", () => {
  it("refuses reuse across a different budget or cancellation scope", async () => {
    const budget = syntheticBudget();
    const controller = new AbortController();
    const session = createOvertureAssetSession({ budget, signal: controller.signal });
    const handle = { source: { clearCache: () => undefined, cacheSnapshot: () => ({ entries: 0, bytes: 0 }) } } as never;
    await expect(session.acquire("key", { budget, signal: controller.signal }, async () => handle))
      .resolves.toBe(handle);
    await expect(session.acquire(
      "key", { budget: new OvertureBudgetTracker({ limits: budget.snapshot().allowed }), signal: controller.signal },
      async () => handle,
    )).rejects.toThrow(/different budget or cancellation scope/);
    await expect(session.acquire(
      "key", { budget, signal: new AbortController().signal }, async () => handle,
    )).rejects.toThrow(/different budget or cancellation scope/);
  });

  it("refuses use after close and zeroes its cached ranges", async () => {
    const budget = syntheticBudget();
    const controller = new AbortController();
    const session = createOvertureAssetSession({ budget, signal: controller.signal });
    let cleared = 0;
    const handle = {
      source: { clearCache: () => { cleared += 1; }, cacheSnapshot: () => ({ entries: 1, bytes: 10 }) },
    } as never;
    await session.acquire("key", { budget, signal: controller.signal }, async () => handle);
    expect(session.metrics()).toMatchObject({ assetsOpened: 1, handleReuses: 0, cacheBytes: 10 });
    session.close();
    expect(cleared).toBe(1);
    await expect(session.acquire("key", { budget, signal: controller.signal }, async () => handle))
      .rejects.toThrow(/already closed/);
  });
});

describe("measured duplicate-IO reduction", () => {
  it("pins the per-pass saving for a metro-shaped traversal", async () => {
    // Six coverage cells over one pinned asset holding three relevant row groups
    // — the shape a metro traversal actually has, where every cell re-reads the
    // same partition.
    const unshared = await traverse({ cellCount: 6, groupCount: 3, shared: false });
    const shared = await traverse({ cellCount: 6, groupCount: 3, shared: true });

    // Unshared: each cell reopens the asset and re-downloads all three group
    // spans, so cost scales with cells x groups.
    expect(unshared.tally.requests).toBe(24);
    expect(unshared.tally.bodyBytes).toBe(2_328);
    // Shared: one open plus one download per distinct group, for the whole pass.
    expect(shared.tally.requests).toBe(4);
    expect(shared.tally.bodyBytes).toBe(388);

    // Same decode work and the same admitted rows: nothing was skipped to get here.
    expect(shared.decodes.count).toBe(unshared.decodes.count);
    expect(shared.results.reduce((total, result) => total + result.records.length, 0))
      .toBe(unshared.results.reduce((total, result) => total + result.records.length, 0));
  });
});


// --- C. resume harness --------------------------------------------------------

const REPO_ROOT = path.resolve(process.cwd(), "..");
const SCALE_NOW = "2026-08-03T00:00:00.000Z";
const scaleTemporaryRoots: string[] = [];
const scaleOpenStores: AssessmentStore[] = [];

afterAll(() => {
  while (scaleOpenStores.length > 0) {
    const store = scaleOpenStores.pop() as AssessmentStore;
    if (store.database.open) store.close();
  }
  while (scaleTemporaryRoots.length > 0) {
    rmSync(scaleTemporaryRoots.pop() as string, { recursive: true, force: true });
  }
});

function scaleDatabase(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "rocco-scale-"));
  scaleTemporaryRoots.push(root);
  return path.join(root, "batch.sqlite");
}

function scaleCoverage(): CoverageManifest {
  return planSuburbanCoverage({
    configurationVersion: "1.0.0",
    queryVersion: "discovery-scale-readiness-1.0.0",
    maxCells: 2,
  });
}

/** The production admission gate, then the cell attachment discovery performs. */
function scaleCandidate(
  input: { placeId: string; name: string; host: string },
  coverageKey: string,
): EligibleCandidate {
  const result = {
    providerPlaceId: input.placeId,
    name: input.name,
    categories: ["pool_cleaning"],
    address: {
      line1: "1 Test Way", city: "Mesa", region: "AZ", postalCode: "85201", countryCode: "US",
    },
    domains: [`https://${input.host}/`],
    phones: ["+15550101001"],
    brandName: null,
    groupHint: null,
    providerObservation: {
      releaseId: "2026-07-22.0", featureVersion: 1, schemaVersion: "1.0.0",
      taxonomyMappingVersion: "overture_pool_service_taxonomy_v2",
      basicCategory: "pool_cleaning", taxonomyPrimary: "pool_cleaning",
      taxonomyHierarchy: [], taxonomyAlternates: [],
      categoryDisposition: "strong", providerConfidence: 0.9, operatingStatus: "open",
      sourceMetadata: [], coverageKey: "cell", queryFingerprint: "fingerprint",
      assetIds: ["a".repeat(64)],
    },
  } as NormalizedDiscoveryResult;
  const envelope: ProviderEnvelope<NormalizedDiscoveryResult> = {
    providerId: "overture_places_live",
    sourceClass: "local_public_dataset",
    claimState: "public_unverified_candidate",
    operation: "discovery",
    providerSchemaVersion: "1.0.0",
    correlationId: "run:query",
    providerResultId: input.placeId,
    observedAt: SCALE_NOW,
    retrievedAt: SCALE_NOW,
    cost: { billable: false, billableUnits: 0, unit: "none", microUsd: 0 },
    cache: { status: "bypassed", key: null },
    normalizedResult: result,
    validation: { status: "accepted", issues: [] },
    error: null,
    rawReferenceChecksum: null,
  };
  const admitted = selectAssessableCandidates([envelope]).eligible[0];
  if (!admitted) throw new Error("Scale candidate did not pass the production admission gate");
  return { ...admitted, discoveredCoverageKey: coverageKey };
}

function scaleHtml(name: string): string {
  return [
    `<html lang="en"><head><title>${name}</title>`,
    '<meta name="viewport" content="width=device-width">',
    '<script type="application/ld+json">',
    JSON.stringify({ "@type": "Organization", name }),
    "</script></head><body><h1>Pool cleaning</h1><h2>Pool service</h2>",
    '<a href="tel:+15550101001">Call us</a>',
    '<a href="/contact">Contact</a>',
    "</body></html>",
  ].join("");
}

function scaleCrawl(candidate: EligibleCandidate): CrawlResult {
  const body = scaleHtml(candidate.expectedBusinessName);
  const page: CrawlPage = {
    url: candidate.candidateUrl, kind: "homepage", inspectionStatus: "successful",
    fetch: {
      ok: true, requestedUrl: candidate.candidateUrl, finalUrl: candidate.candidateUrl,
      status: 200, contentType: "text/html", body,
      compressedBytes: 2_000, decompressedBytes: 4_000,
      contentChecksum: createHash("sha256").update(body).digest("hex"),
      etag: null, lastModified: null, redirectHistory: [], fetchedAt: SCALE_NOW, attempts: 1,
    },
    html: body,
  };
  const decision: RobotsDecision = {
    origin: candidate.candidateUrl, robotsUrl: `${candidate.candidateUrl}robots.txt`,
    status: "allowed", reason: "no_matching_rule", matchedRule: null,
    fetchedAt: SCALE_NOW, expiresAt: "2026-08-04T00:00:00.000Z",
    contentChecksum: null, sitemapUrls: [],
  };
  return {
    requestedUrl: candidate.candidateUrl, sourceClass: "public_business_website",
    canonicalHomepage: candidate.candidateUrl,
    startedAt: SCALE_NOW, completedAt: "2026-08-03T00:00:01.000Z",
    pages: [page], robots: decision, robotsDecisions: [decision],
    complete: true, timedOut: false,
  };
}

const SCALE_NICHE = {
  service_synonyms: ["pool cleaning", "pool service"],
  required_indicators: ["pool"],
  negative_keywords: [],
  excluded_adjacent_industries: [],
  relevant_categories: ["pool_service", "pool_cleaning"],
} as never;

const SCALE_LIMITS: LiveWebsiteAssessmentLimits = {
  maxBusinessesAttempted: 8, maxWebsitesAssessed: 8, maxPagesPerBusiness: 2,
  maxRequestsPerBusiness: 4, maxTotalRequests: 40,
  maxDownloadedBytes: 8 * 1024 * 1024, maxProcessedBytes: 16 * 1024 * 1024,
  maxDurationMs: 60_000, maxRetriesPerBusiness: 1,
};

/** Row counts at every layer resume must not duplicate. */
function scaleCounts(database: SqliteDatabase): Record<string, number> {
  const count = (sql: string, ...parameters: string[]): number =>
    (database.prepare(sql).get(...parameters) as { total: number }).total;
  return {
    businesses: count("SELECT COUNT(*) AS total FROM businesses"),
    website_assessments: count("SELECT COUNT(*) AS total FROM website_assessments"),
    website_pages: count("SELECT COUNT(*) AS total FROM website_pages"),
    icp_qualification_evaluations: count("SELECT COUNT(*) AS total FROM icp_qualification_evaluations"),
    service_evidence: count("SELECT COUNT(*) AS total FROM service_evidence"),
    provider_categories: count("SELECT COUNT(*) AS total FROM service_evidence WHERE basis = 'provider_category'"),
    operational_evidence: count("SELECT COUNT(*) AS total FROM evidence WHERE field_name LIKE 'operational:%'"),
    business_locations: count("SELECT COUNT(*) AS total FROM business_locations"),
    coverage_identifiers: count(
      "SELECT COUNT(*) AS total FROM business_identifiers WHERE scheme = ?", DISCOVERY_COVERAGE_SCHEME,
    ),
    lead_queue_entries: count("SELECT COUNT(*) AS total FROM lead_queue_entries"),
    lead_queue_snapshots: count("SELECT COUNT(*) AS total FROM lead_queue_snapshots"),
  };
}

async function runScaleBatch(input: {
  candidates: ReadonlyArray<EligibleCandidate>;
  coverage: CoverageManifest;
  databasePath: string;
  /** Simulate an interruption by capping how many businesses this attempt does. */
  stopAfter?: number;
}) {
  const store = createAssessmentStore({
    databasePath: input.databasePath, repositoryRoot: REPO_ROOT,
    candidates: input.candidates, coverage: input.coverage,
    now: () => new Date(SCALE_NOW),
  });
  scaleOpenStores.push(store);
  const websites = await runLiveWebsiteAssessment({
    candidates: input.candidates,
    limits: input.stopAfter === undefined
      ? SCALE_LIMITS
      : { ...SCALE_LIMITS, maxBusinessesAttempted: input.stopAfter },
    niche: SCALE_NICHE,
    now: () => new Date(SCALE_NOW),
    assessmentId: (candidate) => `wa_${candidate.candidateKey}`,
    createCrawler: (candidate) => ({ crawl: async () => scaleCrawl(candidate) }),
    sink: store.sink,
  });
  const queue = qualifyAndRankBatch({
    database: store.database,
    assessments: store.assessmentBusinessIds()
      .map((row) => ({ assessmentId: row.assessmentId, businessId: row.businessId })),
    runId: "discovery-scale-readiness",
    evaluatedAt: SCALE_NOW,
    maximumCallable: 10, maximumReview: 10,
    coverageKeys: input.coverage.cells.map((cell) => cell.coverageKey),
    signal: new AbortController().signal,
  });
  return { store, websites, queue };
}

// --- C. resume and idempotence ------------------------------------------------

describe("bounded retained-run resume", () => {
  it("accepts an existing retained artifact only behind --resume, keeping every path guard", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "rocco-resume-args-"));
    scaleTemporaryRoots.push(root);
    const database = path.join(root, "batch.sqlite");
    // Missing artifact: resume has nothing to continue.
    expect(() => parseBatchCanaryArguments(
      ["--confirm-live-batch", "--resume", "--database", database], REPO_ROOT,
    )).toThrow(/requires an existing retained database/);

    writeFileSync(database, "");
    // Without --resume an existing artifact is still refused.
    expect(() => parseBatchCanaryArguments(
      ["--confirm-live-batch", "--database", database], REPO_ROOT,
    )).toThrow(/must not already exist/);
    const parsed = parseBatchCanaryArguments(
      ["--confirm-live-batch", "--resume", "--database", database], REPO_ROOT,
    );
    expect(parsed.resume).toBe(true);
    // Resuming implies retention: the artifact being continued is never deleted.
    expect(parsed.retainDatabase).toBe(true);
    // Resume never implies a live batch.
    expect(parsed.enableLiveBatch).toBe(false);

    // Containment is unchanged: no path guard is relaxed by resuming.
    expect(() => parseBatchCanaryArguments(
      ["--confirm-live-batch", "--resume", "--database", path.join(REPO_ROOT, "inside.sqlite")], REPO_ROOT,
    )).toThrow(/temp directory/);
    expect(() => parseBatchCanaryArguments(
      ["--confirm-live-batch", "--resume", "--database", path.join(root, "batch.db")], REPO_ROOT,
    )).toThrow(/temp directory/);
    expect(() => parseBatchCanaryArguments(
      ["--confirm-live-batch", "--resume", "--database", "relative.sqlite"], REPO_ROOT,
    )).toThrow(/absolute path/);
    expect(() => parseBatchCanaryArguments(
      ["--resume", "--database", database], REPO_ROOT,
    )).toThrow(/confirm/);
  });

  it("continues an interrupted batch and duplicates nothing", async () => {
    const coverage = scaleCoverage();
    const cellKey = coverage.cells[0]?.coverageKey as string;
    const candidates = [
      scaleCandidate({ placeId: "resume-1", name: "Mesa Pool Repair", host: "resume-one.invalid" }, cellKey),
      scaleCandidate({ placeId: "resume-2", name: "Gilbert Pool Repair", host: "resume-two.invalid" }, cellKey),
    ];
    const databasePath = scaleDatabase();

    // First attempt is interrupted after the first candidate: the second never
    // gets an assessment, which is exactly the state resume has to repair.
    const interrupted = await runScaleBatch({
      candidates, coverage, databasePath, stopAfter: 1,
    });
    const afterInterruption = scaleCounts(interrupted.store.database);
    expect(afterInterruption.website_assessments).toBe(1);
    interrupted.store.close();

    // Resume over the retained artifact with the full candidate list.
    const resumed = await runScaleBatch({ candidates, coverage, databasePath });
    const afterResume = scaleCounts(resumed.store.database);
    // The completed candidate is skipped rather than reassessed.
    expect(resumed.websites.duplicateAssessmentsSkipped).toBe(1);
    expect(resumed.websites.businessesAttempted).toBe(1);
    // Both candidates now exist, exactly once each, at every layer.
    expect(afterResume.businesses).toBe(2);
    expect(afterResume.website_assessments).toBe(2);
    expect(afterResume.icp_qualification_evaluations).toBe(2);
    expect(afterResume.business_locations).toBe(2);
    expect(afterResume.coverage_identifiers).toBe(2);

    // Running the same completed batch a third time adds nothing anywhere.
    const repeated = await runScaleBatch({ candidates, coverage, databasePath });
    const afterRepeat = scaleCounts(repeated.store.database);
    expect(repeated.websites.duplicateAssessmentsSkipped).toBe(2);
    expect(repeated.websites.businessesAttempted).toBe(0);
    expect(afterRepeat).toEqual(afterResume);
    repeated.store.close();
  });

  it("never leaves an assessment row without the evidence it claims to have", () => {
    const coverage = scaleCoverage();
    const cellKey = coverage.cells[0]?.coverageKey as string;
    const candidate = scaleCandidate(
      { placeId: "atomic-1", name: "Mesa Pool Repair", host: "atomic-one.invalid" }, cellKey,
    );
    const databasePath = scaleDatabase();
    const store = createAssessmentStore({
      databasePath, repositoryRoot: REPO_ROOT, candidates: [candidate], coverage,
      now: () => new Date(SCALE_NOW),
    });
    scaleOpenStores.push(store);
    // A page whose checksum violates the persisted CHECK: the evidence flush
    // fails partway through writing this assessment.
    store.sink.recordPageEvidence?.({
      assessmentId: "wa_atomic", pageUrl: candidate.candidateUrl, pageKind: "homepage",
      contentChecksum: "not-a-checksum", fetchedAt: SCALE_NOW, observedAt: SCALE_NOW,
      title: null, metaDescription: null, language: null, viewport: null,
      contacts: [], people: [], services: [], conversions: [], structuredData: [],
      serviceLanguage: { hits: [], facilityOrRetail: false } as never,
    });
    expect(() => store.sink.recordAssessment({
      assessmentId: "wa_atomic", candidateKey: candidate.candidateKey,
      sourceWebsiteUrl: candidate.candidateUrl, canonicalHomepageUrl: candidate.candidateUrl,
      status: "complete", identityState: "agrees", reviewRequired: false,
      startedAt: SCALE_NOW, assessedAt: SCALE_NOW,
      pages: 1, requests: 1, downloadedBytes: 10, processedBytes: 20,
    })).toThrow();
    // Everything rolled back together: no bare assessment row, no half-written
    // business, nothing for a later resume to misread as finished.
    const counts = scaleCounts(store.database);
    expect(counts.website_assessments).toBe(0);
    expect(counts.website_pages).toBe(0);
    expect(counts.businesses).toBe(0);
  });
});
