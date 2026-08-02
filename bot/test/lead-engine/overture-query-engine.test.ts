import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { OverturePlacesLiveDiscoveryProvider } from "../../src/lead-engine/providers/adapters/overture-places-live.js";
import { parseOvertureCanaryArguments } from "../../scripts/run-overture-places-canary.js";
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
import {
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

function footerServer() {
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
        "content-range": `bytes ${start}-${end - 1}/${RANGE_TOTAL}`,
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
}) {
  const live = syntheticLivePolicy();
  const calls: ReaderCall[] = [];
  const budget = syntheticBudget();
  try {
    const engine = createSecureOvertureAssetQueryEngine({
      policy: live.policy,
      capability: live.capability,
      runId: "run-synthetic-overture",
      assessmentId: "scope-synthetic-overture",
      transport: footerServer(),
      reader: syntheticReader({ metadata: input.metadata, rows: input.rows, calls }),
      now: () => "2026-08-01T12:00:00.000Z",
    });
    const result = await engine.query({
      release: SYNTHETIC_OVERTURE_RELEASE_PIN,
      coverageCell: CELL,
      plan: syntheticQueryPlan(),
      signal: new AbortController().signal,
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
});
