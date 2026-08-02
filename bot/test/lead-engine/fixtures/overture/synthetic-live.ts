import { createHash } from "node:crypto";
import { loadRuntimeLeadPolicy, type RuntimeLeadPolicy } from "../../../../src/lead-engine/config/lead-policy.js";
import {
  NetworkPolicyAuthorizer,
  type PublicWebCapability,
} from "../../../../src/lead-engine/config/network-capability.js";
import { planCoverage } from "../../../../src/lead-engine/geography/coverage-planner.js";
import type { CoverageCell } from "../../../../src/lead-engine/geography/types.js";
import type { DiscoveryProviderRequest } from "../../../../src/lead-engine/providers/contracts.js";
import { validateOvertureAsset } from "../../../../src/lead-engine/providers/overture/asset-validator.js";
import {
  OvertureBudgetTracker,
  type OvertureBudgetLimits,
} from "../../../../src/lead-engine/providers/overture/budgets.js";
import { createOverturePlacesQueryPlan } from "../../../../src/lead-engine/providers/overture/query.js";
import type { OverturePlaceRecord } from "../../../../src/lead-engine/providers/overture/schema.js";
import {
  OVERTURE_PLACES_PROVIDER_ID,
  OVERTURE_PLACES_SCHEMA_CONTRACT_VERSION,
  type OverturePlaceSchemaDescriptor,
  type OverturePlacesQueryPlan,
  type OvertureReleasePin,
} from "../../../../src/lead-engine/providers/overture/types.js";
import {
  createTemporaryLeadPolicyRoot,
  updatePolicyYaml,
} from "../../helpers/lead-policy-fixture.js";

export const SYNTHETIC_OVERTURE_RELEASE = "2026-07-23.0";

export const SYNTHETIC_OVERTURE_SCHEMA: OverturePlaceSchemaDescriptor = Object.freeze({
  schemaVersion: OVERTURE_PLACES_SCHEMA_CONTRACT_VERSION,
  theme: "places",
  featureType: "place",
  fields: Object.freeze([
    { name: "id", type: "string", required: true },
    { name: "version", type: "int64", required: true },
    { name: "sources", type: "list<struct>", required: true },
    { name: "names", type: "struct", required: true },
    { name: "basic_category", type: "string", required: true },
    { name: "taxonomy", type: "struct", required: true },
    { name: "confidence", type: "double", required: true },
    { name: "operating_status", type: "string", required: true },
    { name: "websites", type: "list<string>", required: true },
    { name: "emails", type: "list<string>", required: true },
    { name: "phones", type: "list<string>", required: true },
    { name: "addresses", type: "list<struct>", required: true },
    { name: "geometry", type: "geometry", required: true },
    { name: "synthetic_additive_field", type: "string", required: false },
  ]),
});

export const SYNTHETIC_OVERTURE_ASSET = validateOvertureAsset({
  url: `https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/release/${SYNTHETIC_OVERTURE_RELEASE}/theme=places/type=place/part-synthetic.parquet`,
  releaseId: SYNTHETIC_OVERTURE_RELEASE,
  theme: "places",
  featureType: "place",
  mediaType: "application/vnd.apache.parquet",
});

export const SYNTHETIC_OVERTURE_RELEASE_PIN: OvertureReleasePin = Object.freeze({
  releaseId: SYNTHETIC_OVERTURE_RELEASE,
  schemaVersion: OVERTURE_PLACES_SCHEMA_CONTRACT_VERSION,
  catalogUrl: `https://stac.overturemaps.org/${SYNTHETIC_OVERTURE_RELEASE}/collections/places.json`,
  catalogChecksum: createHash("sha256").update("synthetic-overture-catalog").digest("hex"),
  resolvedAt: "2026-08-01T12:00:00.000Z",
  assets: Object.freeze([SYNTHETIC_OVERTURE_ASSET]),
  license: "CDLA-Permissive-2.0",
  attribution: "Synthetic test metadata representing Overture Maps Foundation attribution",
});

export function syntheticPhoenixCell(): CoverageCell {
  const manifest = planCoverage({
    nicheId: "pool_service",
    configurationVersion: "1.0.0",
    queryVersion: "overture-synthetic-query-1.0.0",
    strategy: "dense",
    targets: [{
      level: "grid_cell",
      label: "Synthetic Phoenix canary cell",
      countryCode: "US",
      subdivisionCode: "AZ",
      bounds: { west: -112.094, south: 33.438, east: -112.044, north: 33.478 },
      density: "dense",
    }],
    resultCap: 100,
    maxDepth: 0,
  });
  return manifest.cells[0] as CoverageCell;
}

export function syntheticQueryPlan(
  releaseId = SYNTHETIC_OVERTURE_RELEASE,
): OverturePlacesQueryPlan {
  return createOverturePlacesQueryPlan({
    releaseId,
    coverageCell: syntheticPhoenixCell(),
    maxRows: 100,
    maxAreaSquareKm: 25,
  });
}

export const SYNTHETIC_OVERTURE_BUDGET_LIMITS: OvertureBudgetLimits = Object.freeze({
  maxStacRequests: 4,
  maxAssetRequests: 16,
  maxAssetsInspected: 4,
  maxRowGroupsInspected: 64,
  maxDownloadedBytes: 16 * 1024 * 1024,
  maxProcessedBytes: 32 * 1024 * 1024,
  maxRowsRead: 100,
  maxCandidates: 25,
  maxAreaSquareKm: 25,
  maxRuntimeMs: 60_000,
  maxRetryAttempts: 2,
  maxCostMicroUsd: 0,
});

export function syntheticBudget(
  overrides: Partial<OvertureBudgetLimits> = {},
): OvertureBudgetTracker {
  return new OvertureBudgetTracker({
    limits: { ...SYNTHETIC_OVERTURE_BUDGET_LIMITS, ...overrides },
    now: () => Date.parse("2026-08-01T12:00:00.000Z"),
  });
}

export function syntheticPlace(
  overrides: Partial<OverturePlaceRecord> = {},
): OverturePlaceRecord {
  return {
    id: "synthetic-overture-place-001",
    version: 1,
    sources: [{
      property: "synthetic_source",
      dataset: "synthetic_overture_contract",
      record_id: "synthetic-source-record-001",
      update_time: "2026-07-23T00:00:00.000Z",
      confidence: 0.84,
    }],
    names: { primary: "Synthetic Pool Service Alpha", common: {} },
    basic_category: "pool_cleaning_service",
    taxonomy: {
      primary: "pool_cleaning_service",
      hierarchy: ["pool_and_spa_service"],
      alternates: ["pool_maintenance_service"],
    },
    confidence: 0.91,
    operating_status: "open",
    websites: ["https://synthetic-pool-alpha.invalid/"],
    emails: ["contact@synthetic-pool-alpha.invalid"],
    phones: ["+15550101001"],
    addresses: [{
      freeform: "100 Synthetic Test Way",
      locality: "Phoenix",
      region: "AZ",
      postcode: "85004",
      country: "US",
    }],
    brand: null,
    geometry: { type: "Point", coordinates: [-112.07, 33.45] },
    ...overrides,
  };
}

export function syntheticDiscoveryRequest(
  overrides: Partial<DiscoveryProviderRequest> = {},
): DiscoveryProviderRequest {
  const cell = syntheticPhoenixCell();
  return {
    operation: "discovery",
    correlationId: "run-synthetic-overture:query-synthetic-overture",
    queryId: "query-synthetic-overture",
    queryText: "synthetic pool service phoenix",
    nicheId: "pool_service",
    coverageKey: cell.coverageKey,
    observedAt: "2026-08-01T12:00:00.000Z",
    retrievedAt: "2026-08-01T12:00:01.000Z",
    ...overrides,
  };
}

export function syntheticLivePolicy(): {
  policy: RuntimeLeadPolicy;
  capability: PublicWebCapability;
  cleanup(): void;
} {
  const fixture = createTemporaryLeadPolicyRoot();
  updatePolicyYaml(fixture.root, "schema.yaml", (value) => {
    value.network_mode = "public_web";
    value.request_budget = 24;
    value.byte_budget = 16 * 1024 * 1024;
    value.max_request_duration_ms = 30_000;
  });
  updatePolicyYaml(fixture.root, "providers.yaml", (value) => {
    const providers = value.providers as Record<string, Record<string, unknown>>;
    const provider = providers[OVERTURE_PLACES_PROVIDER_ID] as Record<string, unknown>;
    provider.enabled = true;
    provider.request_budget = 24;
    provider.byte_budget = 16 * 1024 * 1024;
    provider.max_request_duration_ms = 30_000;
  });
  const policy = loadRuntimeLeadPolicy({ configurationRoot: fixture.root });
  const capability = new NetworkPolicyAuthorizer(policy, {
    now: () => Date.parse("2026-08-01T12:00:00.000Z"),
  }).issuePublicWebCapability({
    providerId: OVERTURE_PLACES_PROVIDER_ID,
    runId: "run-synthetic-overture",
    assessmentId: "scope-synthetic-overture",
    operation: "discovery",
    maxRequests: 24,
    maxBytes: 16 * 1024 * 1024,
    maxBytesPerRequest: 1024 * 1024,
    maxRequestDurationMs: 30_000,
    costBudgetMicroUsd: 0,
    ttlMs: 60_000,
  });
  return { policy, capability, cleanup: fixture.cleanup };
}
