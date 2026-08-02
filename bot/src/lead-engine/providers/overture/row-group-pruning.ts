import type { BoundingArea } from "../../geography/types.js";
import { overtureFailure } from "./errors.js";

/**
 * Pure geographic row-group pruning for the Phase 5A Overture reader.
 *
 * Given per-row-group spatial extents (derived from bbox column statistics) and
 * the projected byte cost of the columns to be read, select only the row groups
 * that may intersect the approved coverage cell. Groups with absent or unusable
 * statistics are treated conservatively as potentially intersecting and counted
 * against a hard cap. When bounded reading is impossible — too many unprunable
 * groups, too many intersecting groups, or projected bytes over budget — the
 * planner fails closed with overture_data_layout_unsupported instead of widening
 * the read.
 */

export interface OvertureRowGroupExtent {
  readonly xmin: number;
  readonly xmax: number;
  readonly ymin: number;
  readonly ymax: number;
}

export interface OvertureRowGroupSpatialPlan {
  readonly index: number;
  readonly startRow: number;
  readonly rowCount: number;
  readonly projectedCompressedBytes: number;
  readonly projectedUncompressedBytes: number;
  // Null when the row group has no usable spatial statistics.
  readonly extent: OvertureRowGroupExtent | null;
}

export interface OvertureRowGroupPruningLimits {
  readonly maxSelectedRowGroups: number;
  readonly maxUnprunableRowGroups: number;
  readonly maxProjectedDownloadBytes: number;
  readonly maxProjectedProcessedBytes: number;
}

export interface OvertureSelectedRowGroup {
  readonly index: number;
  readonly startRow: number;
  readonly rowCount: number;
  readonly hadStatistics: boolean;
}

export interface OvertureRowGroupSelection {
  readonly selected: ReadonlyArray<OvertureSelectedRowGroup>;
  readonly inspectedCount: number;
  readonly selectedCount: number;
  readonly skippedCount: number;
  readonly missingStatisticsCount: number;
  readonly projectedDownloadBytes: number;
  readonly projectedProcessedBytes: number;
}

function dataLayoutUnsupported(reason: string): never {
  throw overtureFailure(
    "overture_data_layout_unsupported",
    `Overture asset layout cannot be read within the canary budget: ${reason}`,
    { category: "schema_validation_failed" },
  );
}

function usableExtent(extent: OvertureRowGroupExtent | null): OvertureRowGroupExtent | null {
  if (!extent) return null;
  const values = [extent.xmin, extent.xmax, extent.ymin, extent.ymax];
  if (!values.every((value) => typeof value === "number" && Number.isFinite(value))) return null;
  if (extent.xmin > extent.xmax || extent.ymin > extent.ymax) return null;
  if (extent.xmin < -180 || extent.xmax > 180 || extent.ymin < -90 || extent.ymax > 90) return null;
  return extent;
}

// A group intersects the cell unless it is strictly outside on some axis.
function intersects(extent: OvertureRowGroupExtent, bounds: BoundingArea): boolean {
  return !(extent.xmax < bounds.west || extent.xmin > bounds.east ||
    extent.ymax < bounds.south || extent.ymin > bounds.north);
}

function boundedField(value: number, detail: string): number {
  if (!Number.isSafeInteger(value) || value < 0) dataLayoutUnsupported(detail);
  return value;
}

export function planOvertureRowGroupReads(input: {
  groups: ReadonlyArray<OvertureRowGroupSpatialPlan>;
  bounds: BoundingArea;
  limits: OvertureRowGroupPruningLimits;
}): OvertureRowGroupSelection {
  const { groups, bounds, limits } = input;
  for (const [name, value] of [
    ["maxSelectedRowGroups", limits.maxSelectedRowGroups],
    ["maxUnprunableRowGroups", limits.maxUnprunableRowGroups],
    ["maxProjectedDownloadBytes", limits.maxProjectedDownloadBytes],
    ["maxProjectedProcessedBytes", limits.maxProjectedProcessedBytes],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`Overture row-group pruning limit ${name} must be a nonnegative integer`);
    }
  }

  const selected: OvertureSelectedRowGroup[] = [];
  let skippedCount = 0;
  let missingStatisticsCount = 0;
  let projectedDownloadBytes = 0;
  let projectedProcessedBytes = 0;

  for (const group of groups) {
    boundedField(group.index, "row group index is invalid");
    boundedField(group.startRow, "row group start row is invalid");
    boundedField(group.rowCount, "row group row count is invalid");
    const compressed = boundedField(group.projectedCompressedBytes, "projected compressed bytes are invalid");
    const uncompressed = boundedField(group.projectedUncompressedBytes, "projected uncompressed bytes are invalid");

    const extent = usableExtent(group.extent);
    const hadStatistics = extent !== null;
    if (!hadStatistics) {
      missingStatisticsCount += 1;
    } else if (!intersects(extent, bounds)) {
      skippedCount += 1;
      continue;
    }

    selected.push({
      index: group.index,
      startRow: group.startRow,
      rowCount: group.rowCount,
      hadStatistics,
    });
    projectedDownloadBytes += compressed;
    projectedProcessedBytes += uncompressed;
  }

  if (missingStatisticsCount > limits.maxUnprunableRowGroups) {
    dataLayoutUnsupported(
      `${missingStatisticsCount} row groups lack usable spatial statistics (cap ${limits.maxUnprunableRowGroups})`,
    );
  }
  if (selected.length > limits.maxSelectedRowGroups) {
    dataLayoutUnsupported(
      `${selected.length} row groups intersect the cell (cap ${limits.maxSelectedRowGroups})`,
    );
  }
  if (projectedDownloadBytes > limits.maxProjectedDownloadBytes) {
    dataLayoutUnsupported("projected download bytes exceed the canary budget");
  }
  if (projectedProcessedBytes > limits.maxProjectedProcessedBytes) {
    dataLayoutUnsupported("projected processed bytes exceed the canary budget");
  }

  return Object.freeze({
    selected: Object.freeze(selected),
    inspectedCount: groups.length,
    selectedCount: selected.length,
    skippedCount,
    missingStatisticsCount,
    projectedDownloadBytes,
    projectedProcessedBytes,
  });
}
