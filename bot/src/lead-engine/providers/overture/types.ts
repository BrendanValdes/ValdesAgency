import type { BoundingArea, CoverageCell } from "../../geography/types.js";

export const OVERTURE_PLACES_PROVIDER_ID = "overture_places_live" as const;
export const OVERTURE_PLACES_ADAPTER_VERSION = "overture-places-live-1.0.0" as const;
export const OVERTURE_PLACES_SCHEMA_CONTRACT_VERSION = "1.0.0" as const;
export const OVERTURE_POOL_TAXONOMY_MAPPING_VERSION =
  "overture_pool_service_taxonomy_v2" as const;
export const OVERTURE_TAXONOMY_ARTIFACT_VERSION =
  "overture-places-taxonomy-contract-1.0.0" as const;
export const OVERTURE_THEME = "places" as const;
export const OVERTURE_FEATURE_TYPE = "place" as const;

export interface OvertureReleasePin {
  readonly releaseId: string;
  readonly schemaVersion: string;
  readonly catalogUrl: string;
  readonly catalogChecksum: string;
  readonly resolvedAt: string;
  readonly assets: ReadonlyArray<ValidatedOvertureAsset>;
  readonly license: string;
  readonly attribution: string;
}

export interface ValidatedOvertureAsset {
  readonly assetId: string;
  readonly url: string;
  readonly releaseId: string;
  readonly theme: typeof OVERTURE_THEME;
  readonly featureType: typeof OVERTURE_FEATURE_TYPE;
  readonly mediaType: "application/vnd.apache.parquet" | "application/x-parquet";
}

export interface OvertureCategoryInput {
  readonly basicCategory: string | null;
  readonly taxonomy: Readonly<{
    primary: string | null;
    hierarchy: ReadonlyArray<string>;
    alternates: ReadonlyArray<string>;
  }>;
}

export type OverturePoolCategoryDisposition =
  | "strong"
  | "supporting"
  | "review"
  | "excluded"
  | "missing";

export interface OverturePoolCategoryDecision {
  readonly disposition: OverturePoolCategoryDisposition;
  readonly matchedCategories: ReadonlyArray<string>;
  readonly mappingVersion: typeof OVERTURE_POOL_TAXONOMY_MAPPING_VERSION;
  readonly taxonomyArtifactVersion: typeof OVERTURE_TAXONOMY_ARTIFACT_VERSION;
}

export interface OverturePlacesQueryPlan {
  readonly version: "overture-places-query-1.0.0";
  readonly releaseId: string;
  readonly theme: typeof OVERTURE_THEME;
  readonly featureType: typeof OVERTURE_FEATURE_TYPE;
  readonly coverageKey: string;
  readonly bounds: BoundingArea;
  readonly areaSquareKm: number;
  readonly selectedColumns: ReadonlyArray<string>;
  readonly taxonomyMappingVersion: typeof OVERTURE_POOL_TAXONOMY_MAPPING_VERSION;
  readonly maxRows: number;
  readonly fingerprint: string;
}

export interface OverturePlaceSchemaDescriptor {
  readonly schemaVersion: string;
  readonly theme: typeof OVERTURE_THEME;
  readonly featureType: typeof OVERTURE_FEATURE_TYPE;
  readonly fields: ReadonlyArray<{
    readonly name: string;
    readonly type: string;
    readonly required: boolean;
  }>;
}

/**
 * Why a bounded candidate-yield traversal stopped. Aggregate only — never tied
 * to an individual record.
 */
export type OvertureTraversalStopReason =
  | "candidate_target_reached"
  | "row_budget_exhausted"
  | "byte_budget_exhausted"
  | "request_budget_exhausted"
  | "cancelled"
  | "no_relevant_row_groups_remaining";

export interface OvertureAssetQueryResult {
  readonly schema: OverturePlaceSchemaDescriptor;
  readonly records: ReadonlyArray<unknown>;
  readonly assets: ReadonlyArray<ValidatedOvertureAsset>;
  readonly requestCount: number;
  readonly downloadedBytes: number;
  readonly processedBytes: number;
  readonly rowsRead: number;
  // Aggregate traversal progress.
  readonly rowGroupsSelected: number;
  readonly rowGroupsRead: number;
  readonly duplicateRowsSkipped: number;
  readonly stopReason: OvertureTraversalStopReason;
  /** Rows read through the cheap early-filter projection. */
  readonly rowsScanned: number;
  /** Rows decoded through the full candidate projection. */
  readonly rowsMaterialised: number;
  /** Row groups skipped by the early filter before full materialisation. */
  readonly earlyFilteredGroups: number;
  /** Row groups skipped using column statistics, before any row was read. */
  readonly statisticsPrunedGroups: number;
  /**
   * Candidate funnel, aggregate counts only. Every stage is a count of decoded
   * rows, never a business value, so this can be reported verbatim.
   */
  readonly funnel: OvertureCandidateFunnel;
  /** Byte-range cache behaviour for this query. */
  readonly cache: OvertureQueryCacheMetrics;
}

export interface OvertureCandidateFunnel {
  /** Rows decoded through the full projection, before any row-level filter. */
  readonly decodedRows: number;
  /** Decoded rows whose point geometry fell outside the coverage cell. */
  readonly rejectedOutsideCell: number;
  /** In-cell rows already seen in this query, by provider place id. */
  readonly rejectedDuplicateId: number;
  /** In-cell, first-seen rows the injected category predicate refused. */
  readonly rejectedByCategory: number;
  /** In-cell, first-seen rows the category predicate accepted. */
  readonly acceptedCandidates: number;
}

export interface OvertureQueryCacheMetrics {
  /** Ranged reads served from the bounded byte cache without a network request. */
  readonly rangeHits: number;
  /** Ranged reads that required a network request. */
  readonly rangeMisses: number;
  /** True when this query reused an asset handle a previous cell had opened. */
  readonly assetHandleReused: boolean;
}

export interface OvertureAssetQueryInput {
  readonly release: OvertureReleasePin;
  readonly coverageCell: CoverageCell;
  readonly plan: OverturePlacesQueryPlan;
  readonly signal: AbortSignal;
}
