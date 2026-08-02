import { describe, expect, it } from "vitest";
import { validateOvertureParquetMetadata } from "../../src/lead-engine/providers/overture/parquet-metadata.js";
import {
  createSecureOvertureAssetQueryEngine,
  type OvertureParquetReader,
} from "../../src/lead-engine/providers/overture/secure-asset-query-engine.js";
import { createTestOnlyOvertureRangeHttpTransport } from "../../src/lead-engine/providers/overture/range-http-transport.js";
import { OVERTURE_SELECTED_PLACE_COLUMNS } from "../../src/lead-engine/providers/overture/query.js";
import { OVERTURE_POOL_SERVICE_TAXONOMY_V1 } from "../../src/lead-engine/providers/overture/taxonomy.js";
import {
  SYNTHETIC_OVERTURE_RELEASE,
  SYNTHETIC_OVERTURE_RELEASE_PIN,
  syntheticBudget,
  syntheticLivePolicy,
  syntheticPhoenixCell,
  syntheticQueryPlan,
} from "./fixtures/overture/synthetic-live.js";

const CELL = syntheticPhoenixCell();
const INSIDE = { xmin: -112.08, xmax: -112.05, ymin: 33.44, ymax: 33.47 };
const RANGE_TOTAL = 8_192;
const SELECTED = [...OVERTURE_SELECTED_PLACE_COLUMNS];

const STRONG_VALUES = [...OVERTURE_POOL_SERVICE_TAXONOMY_V1.strong];
const accepts = (row: Record<string, unknown>): boolean =>
  typeof row.basic_category === "string" && STRONG_VALUES.includes(row.basic_category);

function column(path: string, options: {
  compressed?: number; offset?: number; min?: string; max?: string; numericMin?: number; numericMax?: number;
} = {}) {
  const statistics = options.min !== undefined || options.numericMin !== undefined
    ? {
        min_value: options.min ?? options.numericMin,
        max_value: options.max ?? options.numericMax,
      }
    : undefined;
  return {
    meta_data: {
      path_in_schema: path.split("."),
      codec: "SNAPPY",
      total_compressed_size: options.compressed ?? 100,
      total_uncompressed_size: (options.compressed ?? 100) * 2,
      data_page_offset: options.offset ?? 4,
      ...(statistics ? { statistics } : {}),
    },
  };
}

/** One row group with bbox statistics inside the cell and optional category stats. */
function group(input: { rows: number; categoryMin?: string; categoryMax?: string; withCategoryStats: boolean }) {
  const columns = SELECTED.map((name) =>
    name === "basic_category"
      ? column(name, input.withCategoryStats
          ? { min: input.categoryMin ?? "a", max: input.categoryMax ?? "z", offset: 4 }
          : { offset: 4 })
      : column(name, { offset: 4 }),
  );
  columns.push(
    column("bbox.xmin", { numericMin: INSIDE.xmin, numericMax: INSIDE.xmin }),
    column("bbox.xmax", { numericMin: INSIDE.xmax, numericMax: INSIDE.xmax }),
    column("bbox.ymin", { numericMin: INSIDE.ymin, numericMax: INSIDE.ymin }),
    column("bbox.ymax", { numericMin: INSIDE.ymax, numericMax: INSIDE.ymax }),
  );
  return { num_rows: input.rows, total_byte_size: 400, columns };
}

function metadataOf(groups: ReadonlyArray<Parameters<typeof group>[0]>) {
  return validateOvertureParquetMetadata(
    {
      num_rows: groups.reduce((sum, entry) => sum + entry.rows, 0),
      row_groups: groups.map((entry) => group(entry)),
      key_value_metadata: [{ key: "geo" }],
    },
    10 * 1024 * 1024,
    { maxRows: 1_000_000, maxRowGroups: 1_000, maxColumnsPerRowGroup: 512 },
  );
}

function place(id: string, category: string): Record<string, unknown> {
  return {
    id, version: 1, sources: [], names: { primary: `Place ${id}`, common: {} },
    basic_category: category,
    taxonomy: { primary: category, hierarchy: [], alternates: [] },
    confidence: 0.9, operating_status: "open",
    websites: [], emails: [], phones: [],
    addresses: [{ freeform: "1 Way", locality: "Mesa", region: "AZ", postcode: "85201", country: "US" }],
    geometry: { type: "Point", coordinates: [-112.07, 33.45] },
  };
}

function transport() {
  return createTestOnlyOvertureRangeHttpTransport(async (request) => {
    const body = Buffer.alloc(request.endExclusive - request.start);
    if (request.start === 0 && request.endExclusive >= 4) body.write("PAR1", 0, "ascii");
    return {
      status: 206,
      headers: {
        "content-type": "application/octet-stream", "content-encoding": "identity",
        "content-range": `bytes ${request.start}-${request.endExclusive - 1}/${RANGE_TOTAL}`,
        "content-length": String(request.endExclusive - request.start),
        "etag": '"pushdown-fixture"',
      },
      body, connectedAddress: "203.0.113.10",
      destinationHost: new URL(request.asset.url).hostname, headerBytes: 200,
    };
  });
}

interface ReadCall { columns: string[]; rowStart: number; rowEnd: number }

async function run(input: {
  groups: ReadonlyArray<Parameters<typeof group>[0]>;
  rowsFor: (rowStart: number) => ReadonlyArray<Record<string, unknown>>;
  withEarlyFilter?: boolean;
  signal?: AbortSignal;
  maxRows?: number;
}) {
  const live = syntheticLivePolicy();
  const calls: ReadCall[] = [];
  try {
    const metadata = metadataOf(input.groups);
    const reader: OvertureParquetReader = {
      async readMetadata() {
        return { metadata, raw: { placeholder: true } as never };
      },
      async readColumns(request) {
        calls.push({ columns: [...request.columns], rowStart: request.rowStart, rowEnd: request.rowEnd });
        return input.rowsFor(request.rowStart);
      },
    };
    const engine = createSecureOvertureAssetQueryEngine({
      policy: live.policy, capability: live.capability,
      runId: "run-synthetic-overture", assessmentId: "scope-synthetic-overture",
      transport: transport(), reader, now: () => "2026-08-02T00:00:00.000Z",
      isCandidate: (row) => accepts(row),
      retainOnlyCandidates: true,
      ...(input.withEarlyFilter === false ? {} : {
        earlyFilterColumns: ["basic_category"],
        earlyFilterAccepts: accepts,
        earlyFilterValues: STRONG_VALUES,
      }),
    });
    const result = await engine.query({
      release: SYNTHETIC_OVERTURE_RELEASE_PIN,
      coverageCell: CELL,
      plan: syntheticQueryPlan(SYNTHETIC_OVERTURE_RELEASE, input.maxRows ?? 100),
      signal: input.signal ?? new AbortController().signal,
      budget: syntheticBudget(),
    });
    return { result, calls };
  } finally {
    live.cleanup();
  }
}

describe("Phase 5E early category filtering", () => {
  it("retains a strong-category row through the early filter", async () => {
    const { result } = await run({
      groups: [{ rows: 2, withCategoryStats: false }],
      rowsFor: () => [place("strong", "pool_cleaning"), place("other", "dental_clinic")],
    });
    expect(result.records).toHaveLength(1);
    expect((result.records[0] as { id: string }).id).toBe("strong");
    expect(result.rowsMaterialised).toBeGreaterThan(0);
  });

  it("excludes the review-grade retailer and unknown categories", async () => {
    for (const category of ["hot_tub_and_pool_store", "swimming_pool", "dental_clinic", "home_service"]) {
      const { result } = await run({
        groups: [{ rows: 1, withCategoryStats: false }],
        rowsFor: () => [place("candidate", category)],
      });
      expect(result.records).toHaveLength(0);
    }
  });

  it("skips full materialisation for groups with no strong category", async () => {
    const { result, calls } = await run({
      groups: [{ rows: 2, withCategoryStats: false }, { rows: 2, withCategoryStats: false }],
      rowsFor: (rowStart) => rowStart === 0
        ? [place("a", "dental_clinic"), place("b", "home_service")]
        : [place("c", "pool_cleaning"), place("d", "home_service")],
    });
    // Both groups were probed with the single filter column.
    const probes = calls.filter((call) => call.columns.length === 1 && call.columns[0] === "basic_category");
    expect(probes).toHaveLength(2);
    // Only the group holding a strong row was materialised with the full projection.
    const full = calls.filter((call) => call.columns.length === SELECTED.length);
    expect(full).toHaveLength(1);
    expect(result.earlyFilteredGroups).toBe(1);
    expect(result.rowsScanned).toBeGreaterThan(result.rowsMaterialised);
  });

  it("prunes a group whose category statistics exclude every strong value", async () => {
    const { result, calls } = await run({
      // Statistics say this group only holds values between "aa" and "ab".
      groups: [{ rows: 2, withCategoryStats: true, categoryMin: "aa", categoryMax: "ab" }],
      rowsFor: () => [place("hidden", "pool_cleaning")],
    });
    expect(result.statisticsPrunedGroups).toBe(1);
    expect(calls).toHaveLength(0);
    expect(result.records).toHaveLength(0);
  });

  it("never prunes when statistics are missing or unusable", async () => {
    const missing = await run({
      groups: [{ rows: 1, withCategoryStats: false }],
      rowsFor: () => [place("strong", "pool_cleaning")],
    });
    expect(missing.result.statisticsPrunedGroups).toBe(0);
    expect(missing.result.records).toHaveLength(1);

    // A range that spans the strong value must keep the group.
    const spanning = await run({
      groups: [{ rows: 1, withCategoryStats: true, categoryMin: "a", categoryMax: "z" }],
      rowsFor: () => [place("strong", "pool_cleaning")],
    });
    expect(spanning.result.statisticsPrunedGroups).toBe(0);
    expect(spanning.result.records).toHaveLength(1);
  });

  it("produces no false negatives: filtered and unfiltered runs agree", async () => {
    const groups = [
      { rows: 2, withCategoryStats: false },
      { rows: 2, withCategoryStats: true, categoryMin: "a", categoryMax: "z" },
    ];
    const rowsFor = (rowStart: number) => rowStart === 0
      ? [place("a", "home_service"), place("b", "pool_cleaning")]
      : [place("c", "pool_maintenance_service"), place("d", "dental_clinic")];
    const filtered = await run({ groups, rowsFor });
    const unfiltered = await run({ groups, rowsFor, withEarlyFilter: false });
    expect(filtered.result.records.map((row) => (row as { id: string }).id))
      .toEqual(unfiltered.result.records.map((row) => (row as { id: string }).id));
  });

  it("is deterministic across repeated runs", async () => {
    const groups = [{ rows: 2, withCategoryStats: false }];
    const rowsFor = () => [place("b", "pool_cleaning"), place("a", "pool_cleaning")];
    const first = await run({ groups, rowsFor });
    const second = await run({ groups, rowsFor });
    expect(second.result.records).toEqual(first.result.records);
    expect(second.result.rowsScanned).toBe(first.result.rowsScanned);
    expect(second.result.rowsMaterialised).toBe(first.result.rowsMaterialised);
  });

  it("still honours the row budget and cancellation", async () => {
    const budgeted = await run({
      groups: [{ rows: 4, withCategoryStats: false }, { rows: 4, withCategoryStats: false }],
      rowsFor: () => [place("a", "pool_cleaning")],
      maxRows: 1,
    });
    expect(budgeted.result.rowsRead).toBeLessThanOrEqual(1);

    const controller = new AbortController();
    controller.abort();
    const cancelled = await run({
      groups: [{ rows: 2, withCategoryStats: false }],
      rowsFor: () => [place("a", "pool_cleaning")],
      signal: controller.signal,
    });
    expect(cancelled.result.stopReason).toBe("cancelled");
    expect(cancelled.calls).toHaveLength(0);
  });

  it("emits aggregate counters only", async () => {
    const { result } = await run({
      groups: [{ rows: 1, withCategoryStats: false }],
      rowsFor: () => [place("strong", "pool_cleaning")],
    });
    const counters = {
      rowsScanned: result.rowsScanned,
      rowsMaterialised: result.rowsMaterialised,
      earlyFilteredGroups: result.earlyFilteredGroups,
      statisticsPrunedGroups: result.statisticsPrunedGroups,
      rowGroupsSelected: result.rowGroupsSelected,
      rowGroupsRead: result.rowGroupsRead,
      stopReason: result.stopReason,
    };
    for (const value of Object.values(counters)) {
      expect(["number", "string"]).toContain(typeof value);
    }
    expect(JSON.stringify(counters).toLowerCase()).not.toContain("place ");
  });
});
