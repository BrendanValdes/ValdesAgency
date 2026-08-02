import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { OverturePlacesLiveDiscoveryProvider } from "../../src/lead-engine/providers/adapters/overture-places-live.js";
import { existsSync } from "node:fs";
import {
  parseOvertureCanaryArguments,
  runOverturePlacesCanary,
} from "../../scripts/run-overture-places-canary.js";
import { createTestOnlyOvertureRangeHttpTransport } from "../../src/lead-engine/providers/overture/range-http-transport.js";
import {
  validateOvertureParquetMetadata,
  type OvertureParquetFooter,
  type OvertureParquetMetadata,
} from "../../src/lead-engine/providers/overture/parquet-metadata.js";
import { planOvertureRowGroupReads } from "../../src/lead-engine/providers/overture/row-group-pruning.js";
import {
  createSecureOvertureAssetQueryEngine,
  type OvertureParquetReader,
} from "../../src/lead-engine/providers/overture/secure-asset-query-engine.js";
import { OVERTURE_SELECTED_PLACE_COLUMNS } from "../../src/lead-engine/providers/overture/query.js";
import { OvertureBudgetTracker } from "../../src/lead-engine/providers/overture/budgets.js";
import {
  SYNTHETIC_OVERTURE_RELEASE,
  SYNTHETIC_OVERTURE_RELEASE_PIN,
  syntheticBudget,
  syntheticDiscoveryRequest,
  syntheticLivePolicy,
  syntheticPhoenixCell,
  syntheticQueryPlan,
} from "./fixtures/overture/synthetic-live.js";

const CELL = syntheticPhoenixCell();
const BOUNDS = CELL.bounds;

// --- pure row-group pruning ---------------------------------------------------

function spatialGroup(index: number, extent: { xmin: number; xmax: number; ymin: number; ymax: number } | null, bytes = 1_000) {
  return {
    index,
    startRow: index * 10,
    rowCount: 10,
    projectedCompressedBytes: bytes,
    projectedUncompressedBytes: bytes * 2,
    extent,
  };
}

const INSIDE = { xmin: -112.08, xmax: -112.05, ymin: 33.44, ymax: 33.47 };
const OUTSIDE = { xmin: -100, xmax: -99, ymin: 40, ymax: 41 };

const PRUNE_LIMITS = {
  maxSelectedRowGroups: 16,
  maxUnprunableRowGroups: 4,
  maxProjectedDownloadBytes: 32 * 1024 * 1024,
  maxProjectedProcessedBytes: 64 * 1024 * 1024,
};

describe("Overture row-group pruning", () => {
  it("selects intersecting groups and skips definitely-nonintersecting groups", () => {
    const selection = planOvertureRowGroupReads({
      groups: [spatialGroup(0, INSIDE), spatialGroup(1, OUTSIDE), spatialGroup(2, INSIDE)],
      bounds: BOUNDS,
      limits: PRUNE_LIMITS,
    });
    expect(selection.selected.map((group) => group.index)).toEqual([0, 2]);
    expect(selection.skippedCount).toBe(1);
    expect(selection.missingStatisticsCount).toBe(0);
    expect(selection.projectedDownloadBytes).toBe(2_000);
  });

  it("treats a boundary-touching group as intersecting", () => {
    const boundary = { xmin: BOUNDS.east, xmax: BOUNDS.east + 1, ymin: BOUNDS.south, ymax: BOUNDS.north };
    const selection = planOvertureRowGroupReads({
      groups: [spatialGroup(0, boundary)],
      bounds: BOUNDS,
      limits: PRUNE_LIMITS,
    });
    expect(selection.selectedCount).toBe(1);
  });

  it("conservatively keeps groups with missing or invalid statistics up to the cap", () => {
    const selection = planOvertureRowGroupReads({
      groups: [spatialGroup(0, null), spatialGroup(1, INSIDE)],
      bounds: BOUNDS,
      limits: PRUNE_LIMITS,
    });
    expect(selection.missingStatisticsCount).toBe(1);
    expect(selection.selected.map((group) => group.index)).toEqual([0, 1]);

    const invalid = { xmin: 10, xmax: 5, ymin: 0, ymax: 1 };
    const invalidSelection = planOvertureRowGroupReads({
      groups: [spatialGroup(0, invalid)],
      bounds: BOUNDS,
      limits: PRUNE_LIMITS,
    });
    expect(invalidSelection.missingStatisticsCount).toBe(1);
  });

  it("fails closed when too many groups lack usable statistics", () => {
    const groups = Array.from({ length: 5 }, (_unused, index) => spatialGroup(index, null));
    expect(() => planOvertureRowGroupReads({ groups, bounds: BOUNDS, limits: PRUNE_LIMITS }))
      .toThrow(/spatial statistics/);
  });

  it("fails closed when projected download or processed bytes exceed the budget", () => {
    expect(() => planOvertureRowGroupReads({
      groups: [spatialGroup(0, INSIDE, 40 * 1024 * 1024)],
      bounds: BOUNDS,
      limits: PRUNE_LIMITS,
    })).toThrow(/projected download bytes/);
    expect(() => planOvertureRowGroupReads({
      groups: [spatialGroup(0, INSIDE, 1_000)],
      bounds: BOUNDS,
      limits: { ...PRUNE_LIMITS, maxProjectedProcessedBytes: 100 },
    })).toThrow(/projected processed bytes/);
  });

  it("fails closed when too many groups intersect to read within budget", () => {
    const groups = Array.from({ length: 6 }, (_unused, index) => spatialGroup(index, INSIDE));
    expect(() => planOvertureRowGroupReads({
      groups,
      bounds: BOUNDS,
      limits: { ...PRUNE_LIMITS, maxSelectedRowGroups: 5 },
    })).toThrow(/intersect the cell/);
  });
});

// --- metadata statistics + startRow extension ---------------------------------

function rawColumn(path: string, options: {
  compressed?: number;
  uncompressed?: number;
  min?: number;
  max?: number;
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
      data_page_offset: 4,
      ...(statistics ? { statistics } : {}),
    },
  };
}

const SELECTED = [...OVERTURE_SELECTED_PLACE_COLUMNS];

function rawGroup(input: {
  rows: number;
  projectedBytes: number;
  extent: { xmin: number; xmax: number; ymin: number; ymax: number } | null;
}) {
  const columns = SELECTED.map((name, index) =>
    rawColumn(name, index === 0 ? { compressed: input.projectedBytes, uncompressed: input.projectedBytes * 2 } : {}),
  );
  if (input.extent) {
    columns.push(
      rawColumn("bbox.xmin", { min: input.extent.xmin, max: input.extent.xmin }),
      rawColumn("bbox.xmax", { min: input.extent.xmax, max: input.extent.xmax }),
      rawColumn("bbox.ymin", { min: input.extent.ymin, max: input.extent.ymin }),
      rawColumn("bbox.ymax", { min: input.extent.ymax, max: input.extent.ymax }),
    );
  }
  return { num_rows: input.rows, total_byte_size: input.projectedBytes * 2, columns };
}

function gappedGroup(input: { rows: number; gapBytes: number; base: number; extent: typeof INSIDE }) {
  const columns = SELECTED.map((name, index) => ({
    meta_data: {
      path_in_schema: name.split("."),
      codec: "SNAPPY",
      total_compressed_size: index < 2 ? 100 : 0,
      total_uncompressed_size: index < 2 ? 200 : 0,
      // Spread the two sized chunks apart so the coalesced span is much larger
      // than the compressed bytes the pruner projects.
      data_page_offset: index === 1 ? input.base + input.gapBytes : input.base + 4,
    },
  }));
  columns.push(
    rawColumn("bbox.xmin", { min: input.extent.xmin, max: input.extent.xmin }),
    rawColumn("bbox.xmax", { min: input.extent.xmax, max: input.extent.xmax }),
    rawColumn("bbox.ymin", { min: input.extent.ymin, max: input.extent.ymin }),
    rawColumn("bbox.ymax", { min: input.extent.ymax, max: input.extent.ymax }),
  );
  return { num_rows: input.rows, total_byte_size: 400, columns };
}

function craftGappedMetadata(count: number, gapBytes: number): OvertureParquetMetadata {
  return validateOvertureParquetMetadata(
    {
      num_rows: count * 2,
      // Each group occupies its own region so its warmed span is a distinct
      // range rather than a cache hit on a previous group's span.
      row_groups: Array.from({ length: count }, (_unused, index) =>
        gappedGroup({ rows: 2, gapBytes, base: index * (gapBytes + 1024 * 1024), extent: INSIDE })),
      key_value_metadata: [{ key: "geo" }],
    },
    100 * 1024 * 1024,
    { maxRows: 1_000_000, maxRowGroups: 1_000, maxColumnsPerRowGroup: 512 },
  );
}

function craftMetadata(groups: ReadonlyArray<Parameters<typeof rawGroup>[0]>): OvertureParquetMetadata {
  const rawGroups = groups.map((group) => rawGroup(group));
  const totalRows = groups.reduce((sum, group) => sum + group.rows, 0);
  return validateOvertureParquetMetadata(
    { num_rows: totalRows, row_groups: rawGroups, key_value_metadata: [{ key: "geo" }] },
    100 * 1024 * 1024,
    { maxRows: 1_000_000, maxRowGroups: 1_000, maxColumnsPerRowGroup: 512 },
  );
}

describe("Overture Parquet metadata statistics extension", () => {
  it("exposes decoded numeric statistics and cumulative start rows", () => {
    const metadata = craftMetadata([
      { rows: 5, projectedBytes: 1_000, extent: INSIDE },
      { rows: 7, projectedBytes: 2_000, extent: OUTSIDE },
    ]);
    expect(metadata.rowGroups[0]?.startRow).toBe(0);
    expect(metadata.rowGroups[1]?.startRow).toBe(5);
    const xmin = metadata.rowGroups[0]?.columns.find((column) => column.path === "bbox.xmin");
    expect(xmin?.statMin).toBe(INSIDE.xmin);
    expect(metadata.isGeoParquet).toBe(true);
  });
});

// --- secure query engine (synthetic reader) -----------------------------------

const RANGE_TOTAL = 4_096;

function footerServer(total = RANGE_TOTAL) {
  return createTestOnlyOvertureRangeHttpTransport(async (request) => {
    const start = request.start;
    const end = request.endExclusive;
    const body = Buffer.alloc(end - start);
    if (start === 0 && end >= 4) body.write("PAR1", 0, "ascii");
    return {
      status: 206,
      headers: {
        "content-type": "application/octet-stream",
        "content-encoding": "identity",
        "content-range": `bytes ${start}-${end - 1}/${total}`,
        "content-length": String(end - start),
        "etag": '"engine-fixture"',
      },
      body,
      connectedAddress: "203.0.113.10",
      destinationHost: new URL(request.asset.url).hostname,
      headerBytes: 200,
    };
  });
}

interface ReaderCall {
  columns: string[];
  rowStart: number;
  rowEnd: number;
}

function syntheticReader(input: {
  metadata: OvertureParquetMetadata;
  rows: (rowStart: number, rowEnd: number) => ReadonlyArray<Record<string, unknown>>;
  calls: ReaderCall[];
}): OvertureParquetReader {
  const footer: OvertureParquetFooter = { metadata: input.metadata, raw: { placeholder: true } as never };
  return {
    async readMetadata() {
      return footer;
    },
    async readColumns(request) {
      input.calls.push({ columns: [...request.columns], rowStart: request.rowStart, rowEnd: request.rowEnd });
      return input.rows(request.rowStart, request.rowEnd);
    },
  };
}

function place(id: string, longitude: number, latitude: number): Record<string, unknown> {
  return {
    id,
    version: 1,
    sources: [],
    names: { primary: `Place ${id}`, common: {} },
    basic_category: "pool_cleaning_service",
    taxonomy: { primary: "pool_cleaning_service", hierarchy: [], alternates: [] },
    confidence: 0.9,
    operating_status: "open",
    websites: [],
    emails: [],
    phones: [],
    addresses: [{ freeform: "1 Test Way", locality: "Phoenix", region: "AZ", postcode: "85004", country: "US" }],
    geometry: { type: "Point", coordinates: [longitude, latitude] },
  };
}

async function runEngine(input: {
  metadata: OvertureParquetMetadata;
  rows: (rowStart: number, rowEnd: number) => ReadonlyArray<Record<string, unknown>>;
  maxRows?: number;
  candidateTarget?: number | null;
  isCandidate?: (row: Record<string, unknown>) => boolean;
  budget?: OvertureBudgetTracker;
  signal?: AbortSignal;
  rangeTotal?: number;
}) {
  const live = syntheticLivePolicy();
  const calls: ReaderCall[] = [];
  const budget = input.budget ?? syntheticBudget();
  try {
    const engine = createSecureOvertureAssetQueryEngine({
      policy: live.policy,
      capability: live.capability,
      runId: "run-synthetic-overture",
      assessmentId: "scope-synthetic-overture",
      transport: footerServer(input.rangeTotal ?? RANGE_TOTAL),
      reader: syntheticReader({ metadata: input.metadata, rows: input.rows, calls }),
      now: () => "2026-08-01T12:00:00.000Z",
      ...(input.candidateTarget === undefined ? {} : { candidateTarget: input.candidateTarget }),
      ...(input.isCandidate ? { isCandidate: input.isCandidate } : {}),
    });
    const result = await engine.query({
      release: SYNTHETIC_OVERTURE_RELEASE_PIN,
      coverageCell: CELL,
      plan: syntheticQueryPlan(SYNTHETIC_OVERTURE_RELEASE, input.maxRows ?? 100),
      signal: input.signal ?? new AbortController().signal,
      budget,
    });
    return { result, calls, budget };
  } finally {
    live.cleanup();
  }
}

describe("secure Overture asset query engine", () => {
  it("reads only intersecting groups, projects only the selected columns, and filters to the exact cell", async () => {
    const metadata = craftMetadata([
      { rows: 2, projectedBytes: 1_000, extent: INSIDE },
      { rows: 2, projectedBytes: 1_000, extent: OUTSIDE },
    ]);
    const { result, calls } = await runEngine({
      metadata,
      rows: (rowStart) => rowStart === 0
        ? [place("in-cell", -112.07, 33.45), place("out-of-cell", -100, 40)]
        : [place("other", -100, 40)],
    });
    // Only the intersecting group (rows 0..2) is read.
    expect(calls).toHaveLength(1);
    expect(calls[0]?.rowStart).toBe(0);
    expect(calls[0]?.columns).toEqual(SELECTED);
    // Exact bbox filter drops the out-of-cell row.
    expect(result.records).toHaveLength(1);
    expect((result.records[0] as { id: string }).id).toBe("in-cell");
    expect(result.rowsRead).toBe(2);
    expect(result.schema.schemaVersion).toBe("1.0.0");
    expect(result.assets).toHaveLength(1);
    expect(result.requestCount).toBeGreaterThanOrEqual(1);
  });

  it("preserves truthful taxonomy and contact fields for the adapter to classify", async () => {
    const metadata = craftMetadata([{ rows: 1, projectedBytes: 500, extent: INSIDE }]);
    const { result } = await runEngine({
      metadata,
      rows: () => [place("keeps-fields", -112.07, 33.45)],
    });
    expect(result.records[0]).toMatchObject({
      taxonomy: { primary: "pool_cleaning_service" },
      operating_status: "open",
      confidence: 0.9,
    });
  });

  it("bounds decoded rows to the plan row limit across groups", async () => {
    const metadata = craftMetadata([
      { rows: 60, projectedBytes: 1_000, extent: INSIDE },
      { rows: 60, projectedBytes: 1_000, extent: INSIDE },
    ]);
    const { result, calls } = await runEngine({
      metadata,
      rows: (rowStart, rowEnd) =>
        Array.from({ length: rowEnd - rowStart }, (_unused, offset) =>
          place(`row-${rowStart + offset}`, -112.07, 33.45)),
    });
    expect(result.rowsRead).toBeLessThanOrEqual(100);
    // Second group is only partially read (up to the 100-row cap).
    const totalRequested = calls.reduce((sum, call) => sum + (call.rowEnd - call.rowStart), 0);
    expect(totalRequested).toBeLessThanOrEqual(100);
  });

  it("reconciles reported usage with the capability budget deltas", async () => {
    const metadata = craftMetadata([{ rows: 2, projectedBytes: 1_000, extent: INSIDE }]);
    const { result, budget } = await runEngine({
      metadata,
      rows: () => [place("a", -112.07, 33.45), place("b", -112.06, 33.46)],
    });
    const consumed = budget.snapshot().consumed;
    // The adapter enforces these equalities; assert them here directly.
    expect(result.requestCount).toBe(consumed.assetRequests);
    expect(result.downloadedBytes).toBe(consumed.downloadedBytes);
    expect(result.processedBytes).toBeLessThanOrEqual(consumed.processedBytes + result.processedBytes);
  });

  it("warms one coalesced range per selected group so column chunks are cache hits", async () => {
    // Official Places parts split each row group across one chunk per column.
    // Without a single warming read per group the projected columns would cost
    // one range request each and exhaust the bounded asset-request budget.
    const ranges: Array<[number, number]> = [];
    const live = syntheticLivePolicy();
    try {
      const transport = createTestOnlyOvertureRangeHttpTransport(async (request) => {
        ranges.push([request.start, request.endExclusive]);
        const body = Buffer.alloc(request.endExclusive - request.start);
        if (request.start === 0 && request.endExclusive >= 4) body.write("PAR1", 0, "ascii");
        return {
          status: 206,
          headers: {
            "content-type": "application/octet-stream",
            "content-encoding": "identity",
            "content-range": `bytes ${request.start}-${request.endExclusive - 1}/${RANGE_TOTAL}`,
            "content-length": String(request.endExclusive - request.start),
            "etag": '"engine-fixture"',
          },
          body,
          connectedAddress: "203.0.113.10",
          destinationHost: new URL(request.asset.url).hostname,
          headerBytes: 200,
        };
      });
      const metadata = craftMetadata([{ rows: 2, projectedBytes: 512, extent: INSIDE }]);
      const engine = createSecureOvertureAssetQueryEngine({
        policy: live.policy,
        capability: live.capability,
        runId: "run-synthetic-overture",
        assessmentId: "scope-synthetic-overture",
        transport,
        reader: {
          async readMetadata() {
            return { metadata, raw: { placeholder: true } as never };
          },
          async readColumns(request) {
            // Every projected column chunk sits inside the warmed span, so each
            // of these reads must be served from cache, not from the network.
            for (const _column of request.columns) await request.source.slice(4, 300);
            return [place("in-cell", -112.07, 33.45)];
          },
        },
        now: () => "2026-08-01T12:00:00.000Z",
      });
      await engine.query({
        release: SYNTHETIC_OVERTURE_RELEASE_PIN,
        coverageCell: CELL,
        plan: syntheticQueryPlan(),
        signal: new AbortController().signal,
        budget: syntheticBudget(),
      });
      // One warming read for the group's projected span; the 13 column reads add
      // no further requests. Well under the bounded per-run asset-request cap.
      expect(ranges.length).toBeLessThanOrEqual(2);
      expect(ranges.length).toBeGreaterThanOrEqual(1);
    } finally {
      live.cleanup();
    }
  });

  it("fails closed with overture_data_layout_unsupported when a required column is absent", async () => {
    const metadata = craftMetadata([{ rows: 1, projectedBytes: 500, extent: INSIDE }]);
    // Strip the geometry column from the descriptor to simulate a foreign layout.
    const stripped: OvertureParquetMetadata = {
      ...metadata,
      columnPaths: metadata.columnPaths.filter((columnPath) => columnPath !== "geometry"),
      rowGroups: metadata.rowGroups.map((group) => ({
        ...group,
        columns: group.columns.filter((column) => column.path !== "geometry"),
      })),
    };
    await expect(runEngine({ metadata: stripped, rows: () => [] }))
      .rejects.toMatchObject({ code: "overture_data_layout_unsupported" });
  });
});

describe("bounded candidate-yield traversal", () => {
  // Three intersecting groups: the first two decode rows that fall outside the
  // cell, the third holds the only in-cell matches.
  const THREE_GROUPS = () => craftMetadata([
    { rows: 2, projectedBytes: 500, extent: INSIDE },
    { rows: 2, projectedBytes: 500, extent: INSIDE },
    { rows: 2, projectedBytes: 500, extent: INSIDE },
  ]);
  const lateMatch = (rowStart: number) => rowStart < 4
    ? [place(`far-${rowStart}-a`, -100, 40), place(`far-${rowStart}-b`, -101, 41)]
    : [place("late-hit-1", -112.07, 33.45), place("late-hit-2", -112.06, 33.46)];

  it("keeps traversing when the first group yields no matches and finds a later one", async () => {
    const { result, calls } = await runEngine({ metadata: THREE_GROUPS(), rows: lateMatch, maxRows: 100 });
    expect(calls.map((call) => call.rowStart)).toEqual([0, 2, 4]);
    expect(result.records.map((row) => (row as { id: string }).id)).toEqual(["late-hit-1", "late-hit-2"]);
    expect(result.rowGroupsRead).toBe(3);
    expect(result.stopReason).toBe("no_relevant_row_groups_remaining");
  });

  it("stops as soon as the candidate target is reached", async () => {
    const { result, calls } = await runEngine({
      metadata: craftMetadata([
        { rows: 2, projectedBytes: 500, extent: INSIDE },
        { rows: 2, projectedBytes: 500, extent: INSIDE },
        { rows: 2, projectedBytes: 500, extent: INSIDE },
      ]),
      rows: (rowStart) => [place(`hit-${rowStart}-a`, -112.07, 33.45), place(`hit-${rowStart}-b`, -112.06, 33.46)],
      maxRows: 100,
      candidateTarget: 2,
    });
    // Target met inside the first group; later groups are never requested.
    expect(calls).toHaveLength(1);
    expect(result.rowGroupsRead).toBe(1);
    expect(result.stopReason).toBe("candidate_target_reached");
  });

  it("honours an injected authoritative candidate predicate", async () => {
    const { result, calls } = await runEngine({
      metadata: THREE_GROUPS(),
      rows: (rowStart) => [place(`hit-${rowStart}`, -112.07, 33.45), place(`skip-${rowStart}`, -112.06, 33.46)],
      maxRows: 100,
      candidateTarget: 2,
      // Only ids beginning "hit-" count, standing in for taxonomy acceptance.
      isCandidate: (row) => String((row as { id: string }).id).startsWith("hit-"),
    });
    expect(result.stopReason).toBe("candidate_target_reached");
    expect(calls).toHaveLength(2);
  });

  it("stops on the row budget", async () => {
    const { result } = await runEngine({
      metadata: THREE_GROUPS(),
      rows: lateMatch,
      maxRows: 2,
    });
    expect(result.rowsRead).toBe(2);
    expect(result.rowGroupsRead).toBe(1);
    expect(result.stopReason).toBe("row_budget_exhausted");
  });

  it("stops on the byte budget", async () => {
    // Each group's warmed span is far larger than the compressed bytes the
    // pruner projects, so real consumption outruns the projection and the
    // traversal must halt at a group boundary instead of overrunning the budget.
    const gap = 6 * 1024 * 1024;
    const budget = syntheticBudget();
    const { result } = await runEngine({
      metadata: craftGappedMetadata(3, gap),
      rows: lateMatch,
      maxRows: 100,
      budget,
      rangeTotal: 24 * 1024 * 1024,
    });
    expect(result.stopReason).toBe("byte_budget_exhausted");
    expect(result.rowGroupsRead).toBeGreaterThanOrEqual(1);
    expect(result.rowGroupsRead).toBeLessThan(3);
  });

  it("stops on the asset request budget", async () => {
    const budget = syntheticBudget({ maxAssetRequests: 2 });
    const { result } = await runEngine({ metadata: THREE_GROUPS(), rows: lateMatch, maxRows: 100, budget });
    expect(result.stopReason).toBe("request_budget_exhausted");
  });

  it("stops on cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    const { result } = await runEngine({
      metadata: THREE_GROUPS(), rows: lateMatch, maxRows: 100, signal: controller.signal,
    });
    expect(result.stopReason).toBe("cancelled");
    expect(result.rowGroupsRead).toBe(0);
  });

  it("never yields the same place twice across row groups", async () => {
    const { result } = await runEngine({
      metadata: THREE_GROUPS(),
      // The same place id repeats in every group.
      rows: () => [place("repeated", -112.07, 33.45), place("also-repeated", -112.06, 33.46)],
      maxRows: 100,
    });
    expect(result.records).toHaveLength(2);
    expect(result.duplicateRowsSkipped).toBe(4);
  });

  it("produces identical deterministic output across repeated runs", async () => {
    const ids = async () => (await runEngine({
      metadata: THREE_GROUPS(),
      rows: (rowStart) => [place(`b-${rowStart}`, -112.07, 33.45), place(`a-${rowStart}`, -112.06, 33.46)],
      maxRows: 100,
    })).result.records.map((row) => (row as { id: string }).id);
    const first = await ids();
    expect(await ids()).toEqual(first);
    expect(await ids()).toEqual(first);
  });

  it("resumes a retry against the same pinned release without rereading more groups", async () => {
    const run = async () => runEngine({ metadata: THREE_GROUPS(), rows: lateMatch, maxRows: 100 });
    const first = await run();
    const second = await run();
    expect(second.result.rowGroupsRead).toBe(first.result.rowGroupsRead);
    expect(second.result.rowsRead).toBe(first.result.rowsRead);
    expect(second.result.assets.map((asset) => asset.url)).toEqual(first.result.assets.map((asset) => asset.url));
  });

  it("never broadens beyond the pruned groups or the projected columns", async () => {
    const { result, calls } = await runEngine({
      metadata: craftMetadata([
        { rows: 2, projectedBytes: 500, extent: INSIDE },
        { rows: 2, projectedBytes: 500, extent: OUTSIDE },
        { rows: 2, projectedBytes: 500, extent: INSIDE },
      ]),
      rows: () => [place("in", -112.07, 33.45)],
      maxRows: 100,
    });
    // The nonintersecting middle group is never decoded.
    expect(calls.map((call) => call.rowStart)).toEqual([0, 4]);
    expect(result.rowGroupsSelected).toBe(2);
    for (const call of calls) expect(call.columns).toEqual([...OVERTURE_SELECTED_PLACE_COLUMNS]);
  });
});

describe("secure engine wired into the live adapter", () => {
  it("flows decoded records through the adapter into truthful normalized envelopes", async () => {
    const live = syntheticLivePolicy();
    const calls: ReaderCall[] = [];
    const metadata = craftMetadata([{ rows: 2, projectedBytes: 1_000, extent: INSIDE }]);
    try {
      const engine = createSecureOvertureAssetQueryEngine({
        policy: live.policy,
        capability: live.capability,
        runId: "run-synthetic-overture",
        assessmentId: "scope-synthetic-overture",
        transport: footerServer(),
        reader: syntheticReader({
          metadata,
          rows: () => [place("adapter-in", -112.07, 33.45), place("adapter-out", -100, 40)],
          calls,
        }),
        now: () => "2026-08-01T12:00:00.000Z",
      });
      const provider = new OverturePlacesLiveDiscoveryProvider({
        policy: live.policy,
        capability: live.capability,
        runId: "run-synthetic-overture",
        assessmentId: "scope-synthetic-overture",
        release: SYNTHETIC_OVERTURE_RELEASE_PIN,
        coverageCell: CELL,
        plan: syntheticQueryPlan(),
        budget: syntheticBudget(),
        signal: new AbortController().signal,
        queryEngine: engine,
      });
      const batch = await provider.discover(syntheticDiscoveryRequest());
      expect(batch.status).toBe("complete");
      expect(batch.envelopes).toHaveLength(1);
      expect(batch.envelopes[0]?.providerResultId).toBe("adapter-in");
      expect(JSON.stringify(batch)).not.toMatch(/verified_phone|verified_email|verified_owner|externally_verified/);
      expect(provider.audit()).toMatchObject({ acceptedCount: 1, status: "complete" });
    } finally {
      live.cleanup();
    }
  });
});

describe("canary secure-engine opt-in", () => {
  it("parses the explicit opt-in flag and keeps it off by default", () => {
    const repositoryRoot = path.resolve(process.cwd(), "..");
    const base = [
      "--confirm-live-overture",
      "--market", "phoenix-canary",
      "--max-results", "25",
      "--max-bytes", String(32 * 1024 * 1024),
      "--max-seconds", "60",
      "--database", path.join(os.tmpdir(), `rocco-canary-parse-${process.pid}.sqlite`),
      "--release", "latest",
    ];
    expect(parseOvertureCanaryArguments(base, repositoryRoot).enableSecureEngine).toBe(false);
    expect(parseOvertureCanaryArguments([...base, "--enable-secure-engine"], repositoryRoot).enableSecureEngine).toBe(true);
  });

  it("emits an aggregate-only report with no raw business or contact fields", async () => {
    const repositoryRoot = path.resolve(process.cwd(), "..");
    const databasePath = path.join(os.tmpdir(), `rocco-canary-aggregate-${process.pid}.sqlite`);
    // Default path: no --enable-secure-engine, so this performs zero network I/O.
    const report = await runOverturePlacesCanary({
      argv: [
        "--confirm-live-overture",
        "--market", "phoenix-canary",
        "--max-results", "25",
        "--max-bytes", String(32 * 1024 * 1024),
        "--max-seconds", "60",
        "--database", databasePath,
        "--release", "latest",
      ],
      repositoryRoot,
    });

    // Every field is a count, an identifier, a version, or a verdict.
    expect(Object.keys(report).sort()).toEqual([
      "acceptedCount", "aggregateVerdict", "approvedDestinationsContacted", "budgetRemaining", "bytes",
      "candidateTarget", "coverageCellSafeId", "duplicateCount", "duplicateRowsSkipped", "elapsedMs",
      "ran", "rejectedCount", "releaseId", "requests", "reviewCount", "rowGroupsRead",
      "rowGroupsSelected", "rowsConsidered", "safetyWarnings", "schemaVersion", "taxonomyMappingVersion",
      "traversalStopReason",
    ]);
    for (const [key, value] of Object.entries(report)) {
      if (key === "budgetRemaining") continue;
      const kind = Array.isArray(value) ? "array" : typeof value;
      expect(["number", "string", "boolean", "array", "object"]).toContain(kind);
    }
    // No raw business or contact field ever appears in the serialized report.
    const serialized = JSON.stringify(report).toLowerCase();
    for (const forbidden of ["phone", "email", "website", "address", "freeform", "locality", "postcode", "geometry"]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(report.coverageCellSafeId).toMatch(/^coverage_[0-9a-f]+$/);
    expect(existsSync(databasePath)).toBe(false);
  });
});
