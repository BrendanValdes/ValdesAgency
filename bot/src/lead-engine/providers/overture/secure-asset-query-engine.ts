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
  type OvertureTraversalStopReason,
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
  // Byte span covering just the projected column chunks of this row group.
  readonly projectedStartOffset: number;
  readonly projectedEndOffset: number;
}

function buildSpatialPlans(
  metadata: OvertureParquetMetadata,
  selectedColumns: ReadonlySet<string>,
): EngineSpatialPlan[] {
  return metadata.rowGroups.map((group, index) => {
    let compressed = 0;
    let uncompressed = 0;
    let spanStart = Number.POSITIVE_INFINITY;
    let spanEnd = 0;
    for (const column of group.columns) {
      if (selectedColumns.has(topLevel(column.path))) {
        compressed += column.compressedBytes;
        uncompressed += column.uncompressedBytes;
        spanStart = Math.min(spanStart, column.startOffset);
        spanEnd = Math.max(spanEnd, column.endOffset);
      }
    }
    return {
      index,
      startRow: group.startRow,
      rowCount: group.rowCount,
      projectedCompressedBytes: compressed,
      projectedUncompressedBytes: uncompressed,
      projectedStartOffset: Number.isFinite(spanStart) ? spanStart : 0,
      projectedEndOffset: spanEnd,
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
  readonly #maxCoalescedSpanBytes: number;
  readonly #candidateTarget: number | null;
  readonly #isCandidate: (row: Record<string, unknown>) => boolean;
  readonly #retainOnlyCandidates: boolean;
  readonly #earlyFilterColumns: ReadonlyArray<string>;
  readonly #earlyFilterAccepts: ((row: Record<string, unknown>) => boolean) | null;
  readonly #earlyFilterValues: ReadonlyArray<string>;

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
    maxCoalescedSpanBytes: number;
    candidateTarget: number | null;
    isCandidate: (row: Record<string, unknown>) => boolean;
    retainOnlyCandidates: boolean;
    earlyFilterColumns: ReadonlyArray<string>;
    earlyFilterAccepts: ((row: Record<string, unknown>) => boolean) | null;
    earlyFilterValues: ReadonlyArray<string>;
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
    this.#maxCoalescedSpanBytes = input.maxCoalescedSpanBytes;
    this.#candidateTarget = input.candidateTarget;
    this.#isCandidate = input.isCandidate;
    this.#retainOnlyCandidates = input.retainOnlyCandidates;
    this.#earlyFilterColumns = input.earlyFilterColumns;
    this.#earlyFilterAccepts = input.earlyFilterAccepts;
    this.#earlyFilterValues = input.earlyFilterValues;
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
    // Overture place ids are globally unique, so one seen-set deduplicates rows
    // across row groups and across mirrored assets.
    const seenIds = new Set<string>();
    let rowsRead = 0;
    let processedBytes = 0;
    let rowGroupsSelected = 0;
    let rowGroupsRead = 0;
    let duplicateRowsSkipped = 0;
    let rowsScanned = 0;
    let rowsMaterialised = 0;
    let earlyFilteredGroups = 0;
    let statisticsPrunedGroups = 0;
    let candidateCount = 0;
    let stopReason: OvertureTraversalStopReason = "no_relevant_row_groups_remaining";
    let halted = false;

    // A traversal stops only for an explicit bounded reason. An empty row group
    // is never one of them: the next relevant group is still read.
    const haltReason = (needBytes = 0): OvertureTraversalStopReason | null => {
      if (signal.aborted) return "cancelled";
      if (this.#candidateTarget !== null && candidateCount >= this.#candidateTarget) {
        return "candidate_target_reached";
      }
      if (rowsRead >= maxRows) return "row_budget_exhausted";
      const remaining = budget.snapshot().remaining;
      // Halt before a read that the remaining byte budget cannot cover, rather
      // than letting the reservation throw mid-traversal.
      if (remaining.maxDownloadedBytes <= 0 || remaining.maxDownloadedBytes < needBytes) {
        return "byte_budget_exhausted";
      }
      if (remaining.maxAssetRequests <= 0) return "request_budget_exhausted";
      return null;
    };

    const assets = release.assets.slice(0, Math.max(1, this.#maxAssetsInspected));
    for (const asset of assets) {
      const assetHalt = haltReason();
      if (assetHalt) {
        stopReason = assetHalt;
        halted = true;
        break;
      }
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
        const filterSpanByIndex = new Map(
          footer.metadata.rowGroups.map((rowGroup) => {
            const probeColumns = rowGroup.columns.filter((entry) =>
              this.#earlyFilterColumns.includes(topLevel(entry.path)));
            if (probeColumns.length === 0) return [rowGroup.index, null];
            const start = Math.min(...probeColumns.map((entry) => entry.startOffset));
            const end = Math.max(...probeColumns.map((entry) => entry.endOffset));
            return [rowGroup.index, [start, end] as const];
          }),
        );
        const spanByIndex = new Map(
          spatialPlans.map((group) => [group.index, [group.projectedStartOffset, group.projectedEndOffset] as const]),
        );

        rowGroupsSelected += selection.selectedCount;
        // Deterministic traversal order, most spatially relevant group first.
        // A group whose extent barely clips the cell yields almost nothing per
        // decoded row, so reading it first would spend the whole row budget for
        // no candidates. Relevance is the share of the group's own extent that
        // overlaps the cell; ties break on ascending index, so the order is a
        // pure function of the metadata and repeats exactly across runs.
        const extentByIndex = new Map(spatialPlans.map((group) => [group.index, group.extent]));
        const relevance = (index: number): number => {
          const extent = extentByIndex.get(index) ?? null;
          if (!extent) return 0;
          const width = extent.xmax - extent.xmin;
          const height = extent.ymax - extent.ymin;
          const overlapWidth = Math.min(extent.xmax, bounds.east) - Math.max(extent.xmin, bounds.west);
          const overlapHeight = Math.min(extent.ymax, bounds.north) - Math.max(extent.ymin, bounds.south);
          if (overlapWidth <= 0 || overlapHeight <= 0) return 0;
          const area = width * height;
          // A degenerate (zero-area) extent that still overlaps is maximally specific.
          if (area <= 0) return 1;
          return (overlapWidth * overlapHeight) / area;
        };
        // Statistics pruning: skip a group outright when the recorded min/max of
        // the filter column excludes every accepted value. Absent or undecodable
        // statistics keep the group, so this can never prune a real match.
        const statisticsAllows = (index: number): boolean => {
          const statsColumn = this.#earlyFilterColumns[0];
          if (!statsColumn || this.#earlyFilterValues.length === 0) return true;
          const column = footer.metadata.rowGroups[index]?.columns
            .find((entry) => entry.path === statsColumn);
          const minimum = column?.statMinText ?? null;
          const maximum = column?.statMaxText ?? null;
          if (minimum === null || maximum === null || minimum > maximum) return true;
          return this.#earlyFilterValues.some((value) => value >= minimum && value <= maximum);
        };
        const ordered = [...selection.selected]
          .filter((group) => {
            if (statisticsAllows(group.index)) return true;
            statisticsPrunedGroups += 1;
            return false;
          })
          .sort((left, right) =>
            relevance(right.index) - relevance(left.index) || left.index - right.index);
        for (const group of ordered) {
          const plannedSpan = spanByIndex.get(group.index);
          const groupHalt = haltReason(
            plannedSpan && plannedSpan[1] > plannedSpan[0] ? plannedSpan[1] - plannedSpan[0] : 0,
          );
          if (groupHalt) {
            stopReason = groupHalt;
            halted = true;
            break;
          }
          const toRead = Math.min(group.rowCount, maxRows - rowsRead);
          if (toRead <= 0) {
            stopReason = "row_budget_exhausted";
            halted = true;
            break;
          }
          // Warm the bounded range cache with the row group's projected column
          // span in a single range read. The cache serves enclosing sub-ranges,
          // so each column chunk below is a cache hit instead of its own request.
          // This lowers the request count for identical bytes; it does not widen
          // any byte, capability, or destination limit.
          const span = spanByIndex.get(group.index);

          // Phase 1 — early column-projection filter. Read only the filter
          // column for this group. Groups with no accepted value never have
          // their full projection downloaded or decoded.
          if (this.#earlyFilterColumns.length > 0 && this.#earlyFilterAccepts) {
            const filterSpan = filterSpanByIndex.get(group.index);
            if (filterSpan && filterSpan[1] > filterSpan[0] &&
              filterSpan[1] - filterSpan[0] <= this.#maxCoalescedSpanBytes) {
              await source.slice(filterSpan[0], filterSpan[1]);
            }
            const probe = await this.#reader.readColumns({
              footer, source, columns: this.#earlyFilterColumns,
              rowStart: group.startRow, rowEnd: group.startRow + toRead, signal,
            });
            rowsScanned += Math.min(probe.length, toRead);
            const accepts = this.#earlyFilterAccepts;
            const columns = this.#earlyFilterColumns;
            const window = probe.slice(0, toRead);
            // Safe fallback: if the probe produced no usable value for any
            // filter column, the filter is not informative for this group and
            // the group is materialised in full. Skipping here would be a false
            // negative, which the filter must never introduce.
            const readable = window.some((row) =>
              columns.some((column) => row[column] !== undefined && row[column] !== null));
            const matched = !readable || window.some((row) => accepts(row));
            if (!matched) {
              earlyFilteredGroups += 1;
              rowGroupsRead += 1;
              // Scanned rows still count against the row budget; the expensive
              // full-projection read is what was avoided.
              rowsRead += Math.min(probe.length, toRead);
              continue;
            }
          }

          if (span && span[1] > span[0] && span[1] - span[0] <= this.#maxCoalescedSpanBytes) {
            await source.slice(span[0], span[1]);
          }
          const rows = await this.#reader.readColumns({
            footer,
            source,
            columns: selectedColumns,
            rowStart: group.startRow,
            rowEnd: group.startRow + toRead,
            signal,
          });
          rowsMaterialised += Math.min(rows.length, toRead);
          if (this.#earlyFilterColumns.length === 0) rowsScanned += Math.min(rows.length, toRead);
          const decoded = Math.min(rows.length, toRead);
          rowsRead += decoded;
          rowGroupsRead += 1;
          const groupUncompressed = uncompressedByIndex.get(group.index) ?? 0;
          processedBytes += group.rowCount > 0
            ? Math.round(groupUncompressed * (decoded / group.rowCount))
            : 0;
          for (const row of rows.slice(0, decoded)) {
            if (!pointInBounds(row, bounds)) continue;
            const id = typeof row.id === "string" ? row.id : null;
            if (id !== null) {
              if (seenIds.has(id)) {
                duplicateRowsSkipped += 1;
                continue;
              }
              seenIds.add(id);
            }
            const isCandidate = this.#isCandidate(row);
            if (isCandidate || !this.#retainOnlyCandidates) records.push(row);
            if (!isCandidate) continue;
            candidateCount += 1;
            // Enforce the candidate target inside the group as well as between
            // groups, so a single dense group cannot overshoot the hard ceiling.
            if (this.#candidateTarget !== null && candidateCount >= this.#candidateTarget) {
              stopReason = "candidate_target_reached";
              halted = true;
              break;
            }
          }
          if (halted) break;
        }
      } finally {
        source.clearCache();
      }
      if (halted) break;
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
      rowGroupsSelected,
      rowGroupsRead,
      duplicateRowsSkipped,
      stopReason,
      rowsScanned,
      rowsMaterialised,
      earlyFilteredGroups,
      statisticsPrunedGroups,
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
  maxCoalescedSpanBytes?: number;
  /**
   * Stop the bounded traversal once this many candidates have been collected.
   * Null reads until a budget stop. The predicate is injected so the caller's
   * authoritative classifier decides what counts — the engine never embeds its
   * own taxonomy rules.
   */
  candidateTarget?: number | null;
  isCandidate?: (row: Record<string, unknown>) => boolean;
  /**
   * When true, only rows the predicate accepts are returned. Used by targeted
   * runs that must not materialise off-target records at all; the default
   * returns every in-bounds row so broad discovery is unchanged.
   */
  retainOnlyCandidates?: boolean;
  /**
   * Optional early filter. When set, each row group is first read with ONLY this
   * column projected; the full projection is materialised only for groups that
   * contain an accepted value. This is client-side early column-projection
   * filtering, not provider-side predicate pushdown: Overture serves static
   * Parquet over byte ranges and evaluates nothing server side.
   */
  earlyFilterColumns?: ReadonlyArray<string>;
  earlyFilterAccepts?: (row: Record<string, unknown>) => boolean;
  /**
   * Exact accepted values, used only for statistics-based row-group pruning. A
   * group is skipped without reading a row when every accepted value falls
   * outside the group's recorded [min, max]. Missing or undecodable statistics
   * always keep the group, so pruning can never cause a false negative.
   */
  earlyFilterValues?: ReadonlyArray<string>;
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
  // Never coalesce more than one bounded range request's worth of bytes.
  const maxCoalescedSpanBytes = input.maxCoalescedSpanBytes ?? 8 * 1024 * 1024;
  if (!Number.isSafeInteger(maxCoalescedSpanBytes) || maxCoalescedSpanBytes < 1 ||
    maxCoalescedSpanBytes > 8 * 1024 * 1024) {
    throw new Error("Secure Overture engine coalesced span must be a positive integer up to 8 MiB");
  }
  if (![maxAssetsInspected, maxSelectedRowGroups, maxUnprunableRowGroups].every(
    (value) => Number.isSafeInteger(value) && value >= 1,
  )) {
    throw new Error("Secure Overture engine limits must be positive integers");
  }
  const candidateTarget = input.candidateTarget ?? null;
  if (candidateTarget !== null &&
    (!Number.isSafeInteger(candidateTarget) || candidateTarget < 1 || candidateTarget > 10_000)) {
    throw new Error("Secure Overture engine candidate target must be a positive integer up to 10000");
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
    maxCoalescedSpanBytes,
    candidateTarget,
    isCandidate: input.isCandidate ?? (() => true),
    retainOnlyCandidates: input.retainOnlyCandidates ?? false,
    earlyFilterColumns: Object.freeze([...(input.earlyFilterColumns ?? [])]),
    earlyFilterAccepts: input.earlyFilterAccepts ?? null,
    earlyFilterValues: Object.freeze([...(input.earlyFilterValues ?? [])]),
  }));
}
