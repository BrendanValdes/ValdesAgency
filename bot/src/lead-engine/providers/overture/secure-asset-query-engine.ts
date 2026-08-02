import { parquetReadObjects } from "hyparquet";
import {
  assertRuntimeLeadPolicy,
  requireProviderPolicy,
  type RuntimeLeadPolicy,
} from "../../config/lead-policy.js";
import {
  assertPublicWebCapability,
  type PublicWebCapability,
} from "../../config/network-capability.js";
import type { BoundingArea } from "../../geography/types.js";
import {
  createCapabilityRangeSource,
  type CapabilityRangeSource,
  type OvertureRangeAuditEvent,
} from "./capability-range-source.js";
import {
  trustOvertureAssetQueryEngine,
  type OvertureAssetQueryEngine,
} from "./asset-query-engine.js";
import { overtureFailure } from "./errors.js";
import {
  OVERTURE_PARQUET_DECOMPRESSORS,
  readOvertureParquetFooter,
  type OvertureParquetFooter,
  type OvertureParquetMetadata,
  type OvertureParquetMetadataLimits,
} from "./parquet-metadata.js";
import {
  planOvertureRowGroupReads,
  type OvertureRowGroupExtent,
  type OvertureRowGroupSpatialPlan,
} from "./row-group-pruning.js";
import { OVERTURE_SELECTED_PLACE_COLUMNS } from "./query.js";
import type { OvertureRangeHttpTransport } from "./range-http-transport.js";
import {
  OVERTURE_FEATURE_TYPE,
  OVERTURE_PLACES_PROVIDER_ID,
  OVERTURE_PLACES_SCHEMA_CONTRACT_VERSION,
  OVERTURE_THEME,
  type OvertureAssetQueryInput,
  type OvertureAssetQueryResult,
  type OverturePlaceSchemaDescriptor,
  type ValidatedOvertureAsset,
} from "./types.js";
import type { OvertureBudgetSnapshot, OvertureBudgetTracker } from "./budgets.js";

export const OVERTURE_SECURE_ENGINE_VERSION = "overture-secure-geoparquet-engine-1.0.0";

// The bbox struct leaf columns whose statistics drive spatial pruning. Read only
// as metadata statistics — never decoded as data.
const BBOX_COLUMN_XMIN = "bbox.xmin";
const BBOX_COLUMN_XMAX = "bbox.xmax";
const BBOX_COLUMN_YMIN = "bbox.ymin";
const BBOX_COLUMN_YMAX = "bbox.ymax";

// File-level metadata caps. These bound the footer itself, not the number of
// rows the reader will decode (that is the per-query row budget). A real Overture
// part legitimately holds millions of rows across thousands of groups.
const METADATA_LIMITS: OvertureParquetMetadataLimits = Object.freeze({
  maxRows: 200_000_000,
  maxRowGroups: 100_000,
  maxColumnsPerRowGroup: 512,
});

const OVERTURE_PLACES_SCHEMA_DESCRIPTOR: OverturePlaceSchemaDescriptor = Object.freeze({
  schemaVersion: OVERTURE_PLACES_SCHEMA_CONTRACT_VERSION,
  theme: OVERTURE_THEME,
  featureType: OVERTURE_FEATURE_TYPE,
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
  ]),
});

/**
 * Reader seam. The production reader is hyparquet driven through the injected
 * capability range source; tests substitute a synthetic reader so the engine's
 * orchestration, pruning, projection, filtering, and accounting are exercised
 * without crafting nested Parquet bytes.
 */
export interface OvertureParquetReader {
  readMetadata(input: {
    source: CapabilityRangeSource;
    limits: OvertureParquetMetadataLimits;
    signal: AbortSignal;
  }): Promise<OvertureParquetFooter>;
  readColumns(input: {
    footer: OvertureParquetFooter;
    source: CapabilityRangeSource;
    columns: ReadonlyArray<string>;
    rowStart: number;
    rowEnd: number;
    signal: AbortSignal;
  }): Promise<ReadonlyArray<Record<string, unknown>>>;
}

export function createHyparquetOvertureParquetReader(): OvertureParquetReader {
  return {
    async readMetadata(input) {
      return readOvertureParquetFooter(input.source, input.limits);
    },
    async readColumns(input) {
      return parquetReadObjects({
        file: input.source,
        metadata: input.footer.raw,
        columns: [...input.columns],
        rowStart: input.rowStart,
        rowEnd: input.rowEnd,
        compressors: OVERTURE_PARQUET_DECOMPRESSORS,
        // geoparquet:true decodes the geometry column to GeoJSON point objects.
      });
    },
  };
}

function dataLayoutUnsupported(reason: string): never {
  throw overtureFailure(
    "overture_data_layout_unsupported",
    `Overture asset layout cannot be read within the canary budget: ${reason}`,
    { category: "schema_validation_failed" },
  );
}

function topLevel(path: string): string {
  const dot = path.indexOf(".");
  return dot === -1 ? path : path.slice(0, dot);
}

function statFor(
  metadata: OvertureParquetMetadata,
  groupIndex: number,
  path: string,
  kind: "min" | "max",
): number | null {
  const group = metadata.rowGroups[groupIndex];
  const column = group?.columns.find((candidate) => candidate.path === path);
  if (!column) return null;
  return kind === "min" ? column.statMin : column.statMax;
}

function extentForGroup(metadata: OvertureParquetMetadata, groupIndex: number): OvertureRowGroupExtent | null {
  const xmin = statFor(metadata, groupIndex, BBOX_COLUMN_XMIN, "min");
  const xmax = statFor(metadata, groupIndex, BBOX_COLUMN_XMAX, "max");
  const ymin = statFor(metadata, groupIndex, BBOX_COLUMN_YMIN, "min");
  const ymax = statFor(metadata, groupIndex, BBOX_COLUMN_YMAX, "max");
  if (xmin === null || xmax === null || ymin === null || ymax === null) return null;
  return { xmin, xmax, ymin, ymax };
}

function pointInBounds(row: Record<string, unknown>, bounds: BoundingArea): boolean {
  const geometry = row.geometry;
  if (!geometry || typeof geometry !== "object") return false;
  const coordinates = (geometry as { coordinates?: unknown }).coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return false;
  const [longitude, latitude] = coordinates;
  if (typeof longitude !== "number" || typeof latitude !== "number" ||
    !Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return false;
  }
  return longitude >= bounds.west && longitude <= bounds.east &&
    latitude >= bounds.south && latitude <= bounds.north;
}

interface EngineSpatialPlan extends OvertureRowGroupSpatialPlan {
  readonly projectedUncompressedBytes: number;
}

function buildSpatialPlans(
  metadata: OvertureParquetMetadata,
  selectedColumns: ReadonlySet<string>,
): EngineSpatialPlan[] {
  return metadata.rowGroups.map((group, index) => {
    let compressed = 0;
    let uncompressed = 0;
    for (const column of group.columns) {
      if (selectedColumns.has(topLevel(column.path))) {
        compressed += column.compressedBytes;
        uncompressed += column.uncompressedBytes;
      }
    }
    return {
      index,
      startRow: group.startRow,
      rowCount: group.rowCount,
      projectedCompressedBytes: compressed,
      projectedUncompressedBytes: uncompressed,
      extent: extentForGroup(metadata, index),
    };
  });
}

function requireSelectedColumnsPresent(
  metadata: OvertureParquetMetadata,
  selectedColumns: ReadonlyArray<string>,
): void {
  const present = new Set(metadata.columnPaths.map(topLevel));
  for (const column of selectedColumns) {
    if (!present.has(column)) dataLayoutUnsupported(`required column ${column} is absent from the asset`);
  }
}

class SecureOvertureAssetQueryEngine implements OvertureAssetQueryEngine {
  readonly available = true;
  readonly transportKind = "secure_remote_geoparquet" as const;
  readonly #policy: RuntimeLeadPolicy;
  readonly #capability: PublicWebCapability;
  readonly #runId: string;
  readonly #assessmentId: string;
  readonly #transport: OvertureRangeHttpTransport;
  readonly #reader: OvertureParquetReader;
  readonly #audit?: { record(event: OvertureRangeAuditEvent): void };
  readonly #now: () => string;
  readonly #maxAssetsInspected: number;
  readonly #maxSelectedRowGroups: number;
  readonly #maxUnprunableRowGroups: number;

  constructor(input: {
    policy: RuntimeLeadPolicy;
    capability: PublicWebCapability;
    runId: string;
    assessmentId: string;
    transport: OvertureRangeHttpTransport;
    reader: OvertureParquetReader;
    audit?: { record(event: OvertureRangeAuditEvent): void };
    now: () => string;
    maxAssetsInspected: number;
    maxSelectedRowGroups: number;
    maxUnprunableRowGroups: number;
  }) {
    this.#policy = input.policy;
    this.#capability = input.capability;
    this.#runId = input.runId;
    this.#assessmentId = input.assessmentId;
    this.#transport = input.transport;
    this.#reader = input.reader;
    this.#audit = input.audit;
    this.#now = input.now;
    this.#maxAssetsInspected = input.maxAssetsInspected;
    this.#maxSelectedRowGroups = input.maxSelectedRowGroups;
    this.#maxUnprunableRowGroups = input.maxUnprunableRowGroups;
  }

  async query(
    input: OvertureAssetQueryInput & { readonly budget: OvertureBudgetTracker },
  ): Promise<OvertureAssetQueryResult> {
    const { release, plan, signal, budget } = input;
    assertPublicWebCapability(this.#capability, {
      providerId: OVERTURE_PLACES_PROVIDER_ID,
      runId: this.#runId,
      assessmentId: this.#assessmentId,
      operation: "discovery",
    });
    if (release.schemaVersion !== OVERTURE_PLACES_SCHEMA_CONTRACT_VERSION) {
      throw overtureFailure("schema_unsupported", "Overture release pin uses an unsupported schema version", {
        category: "schema_validation_failed",
      });
    }
    const selectedColumns = [...OVERTURE_SELECTED_PLACE_COLUMNS];
    const selectedColumnSet = new Set(selectedColumns);
    const bounds = plan.bounds;
    const maxRows = plan.maxRows;

    const before = budget.snapshot().consumed;
    const records: Record<string, unknown>[] = [];
    const assetsUsed: ValidatedOvertureAsset[] = [];
    let rowsRead = 0;
    let processedBytes = 0;

    const assets = release.assets.slice(0, Math.max(1, this.#maxAssetsInspected));
    for (const asset of assets) {
      if (rowsRead >= maxRows) break;
      budget.assertActive();
      const source = await createCapabilityRangeSource({
        policy: this.#policy,
        capability: this.#capability,
        runId: this.#runId,
        assessmentId: this.#assessmentId,
        release,
        asset,
        budget,
        signal,
        transport: this.#transport,
        ...(this.#audit ? { audit: this.#audit } : {}),
        now: this.#now,
      });
      assetsUsed.push(asset);
      try {
        const footer = await this.#reader.readMetadata({ source, limits: METADATA_LIMITS, signal });
        requireSelectedColumnsPresent(footer.metadata, selectedColumns);
        const spatialPlans = buildSpatialPlans(footer.metadata, selectedColumnSet);
        const remaining = this.#pruningBudget(budget.snapshot());
        const selection = planOvertureRowGroupReads({
          groups: spatialPlans,
          bounds,
          limits: {
            maxSelectedRowGroups: Math.min(this.#maxSelectedRowGroups, remaining.rowGroups),
            maxUnprunableRowGroups: this.#maxUnprunableRowGroups,
            maxProjectedDownloadBytes: remaining.download,
            maxProjectedProcessedBytes: remaining.processed,
          },
        });
        if (selection.selectedCount > 0) budget.recordRowGroupInspection(selection.selectedCount);
        const uncompressedByIndex = new Map(
          spatialPlans.map((group) => [group.index, group.projectedUncompressedBytes]),
        );

        for (const group of selection.selected) {
          if (rowsRead >= maxRows) break;
          const toRead = Math.min(group.rowCount, maxRows - rowsRead);
          if (toRead <= 0) break;
          const rows = await this.#reader.readColumns({
            footer,
            source,
            columns: selectedColumns,
            rowStart: group.startRow,
            rowEnd: group.startRow + toRead,
            signal,
          });
          const decoded = Math.min(rows.length, toRead);
          rowsRead += decoded;
          const groupUncompressed = uncompressedByIndex.get(group.index) ?? 0;
          processedBytes += group.rowCount > 0
            ? Math.round(groupUncompressed * (decoded / group.rowCount))
            : 0;
          for (const row of rows.slice(0, decoded)) {
            if (pointInBounds(row, bounds)) records.push(row);
          }
        }
      } finally {
        source.clearCache();
      }
    }

    const after = budget.snapshot().consumed;
    return {
      schema: OVERTURE_PLACES_SCHEMA_DESCRIPTOR,
      records,
      assets: assetsUsed,
      requestCount: after.assetRequests - before.assetRequests,
      downloadedBytes: after.downloadedBytes - before.downloadedBytes,
      processedBytes,
      rowsRead,
    };
  }

  #pruningBudget(snapshot: OvertureBudgetSnapshot): {
    rowGroups: number;
    download: number;
    processed: number;
  } {
    return {
      rowGroups: snapshot.remaining.maxRowGroupsInspected,
      download: snapshot.remaining.maxDownloadedBytes,
      processed: snapshot.remaining.maxProcessedBytes,
    };
  }
}

export function createSecureOvertureAssetQueryEngine(input: {
  policy: RuntimeLeadPolicy;
  capability: PublicWebCapability;
  runId: string;
  assessmentId: string;
  transport: OvertureRangeHttpTransport;
  reader?: OvertureParquetReader;
  audit?: { record(event: OvertureRangeAuditEvent): void };
  now?: () => string;
  maxAssetsInspected?: number;
  maxSelectedRowGroups?: number;
  maxUnprunableRowGroups?: number;
}): OvertureAssetQueryEngine {
  assertRuntimeLeadPolicy(input.policy);
  const provider = requireProviderPolicy(input.policy, OVERTURE_PLACES_PROVIDER_ID);
  if (!provider.enabled || provider.sourceClass !== "local_public_dataset" ||
    !provider.requiresNetwork || provider.access !== "official_overture_https_only" ||
    !provider.pinnedReleaseRequired || provider.canIncurCost ||
    !provider.operations.includes("discovery")) {
    throw overtureFailure("query_invalid", "Policy does not authorize the secure Overture query engine", {
      category: "policy_blocked",
    });
  }
  assertPublicWebCapability(input.capability, {
    providerId: OVERTURE_PLACES_PROVIDER_ID,
    runId: input.runId,
    assessmentId: input.assessmentId,
    operation: "discovery",
  });
  const maxAssetsInspected = input.maxAssetsInspected ?? 2;
  const maxSelectedRowGroups = input.maxSelectedRowGroups ?? 16;
  const maxUnprunableRowGroups = input.maxUnprunableRowGroups ?? 4;
  if (![maxAssetsInspected, maxSelectedRowGroups, maxUnprunableRowGroups].every(
    (value) => Number.isSafeInteger(value) && value >= 1,
  )) {
    throw new Error("Secure Overture engine limits must be positive integers");
  }
  return trustOvertureAssetQueryEngine(new SecureOvertureAssetQueryEngine({
    policy: input.policy,
    capability: input.capability,
    runId: input.runId,
    assessmentId: input.assessmentId,
    transport: input.transport,
    reader: input.reader ?? createHyparquetOvertureParquetReader(),
    ...(input.audit ? { audit: input.audit } : {}),
    now: input.now ?? (() => new Date().toISOString()),
    maxAssetsInspected,
    maxSelectedRowGroups,
    maxUnprunableRowGroups,
  }));
}
