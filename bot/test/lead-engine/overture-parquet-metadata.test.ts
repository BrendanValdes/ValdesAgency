import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createTestOnlyOvertureRangeHttpTransport } from "../../src/lead-engine/providers/overture/range-http-transport.js";
import { createCapabilityRangeSource } from "../../src/lead-engine/providers/overture/capability-range-source.js";
import {
  OVERTURE_PARQUET_DECOMPRESSORS,
  OVERTURE_PARQUET_MAX_COLUMN_UNCOMPRESSED_BYTES,
  OVERTURE_PARQUET_SUPPORTED_CODECS,
  readOvertureParquetMetadata,
  validateOvertureParquetMetadata,
  type OvertureParquetMetadataLimits,
} from "../../src/lead-engine/providers/overture/parquet-metadata.js";
import { createHyparquetOvertureParquetReader } from "../../src/lead-engine/providers/overture/secure-asset-query-engine.js";
import {
  SYNTHETIC_OVERTURE_ASSET,
  SYNTHETIC_OVERTURE_RELEASE_PIN,
  syntheticBudget,
  syntheticLivePolicy,
} from "./fixtures/overture/synthetic-live.js";

const LIMITS: OvertureParquetMetadataLimits = Object.freeze({
  maxRows: 100,
  maxRowGroups: 64,
  maxColumnsPerRowGroup: 64,
});

interface RawColumn {
  meta_data?: {
    path_in_schema?: unknown;
    codec?: string;
    total_compressed_size?: bigint | number;
    total_uncompressed_size?: bigint | number;
    data_page_offset?: bigint | number;
    dictionary_page_offset?: bigint | number;
    statistics?: unknown;
  };
}

function baseColumn(overrides: Partial<NonNullable<RawColumn["meta_data"]>> = {}): RawColumn {
  return {
    meta_data: {
      path_in_schema: ["id"],
      codec: "SNAPPY",
      total_compressed_size: 40,
      total_uncompressed_size: 60,
      data_page_offset: 4,
      statistics: { min: "a" },
      ...overrides,
    },
  };
}

function baseMetadata(overrides: Record<string, unknown> = {}) {
  return {
    num_rows: 2,
    row_groups: [{
      num_rows: 2,
      total_byte_size: 100,
      columns: [baseColumn()],
    }],
    key_value_metadata: [{ key: "geo" }],
    ...overrides,
  };
}

describe("Overture Parquet metadata validation", () => {
  it("accepts well-formed metadata and derives a safe descriptor", () => {
    const result = validateOvertureParquetMetadata(baseMetadata(), 200, LIMITS);
    expect(result.rowCount).toBe(2);
    expect(result.rowGroupCount).toBe(1);
    expect(result.isGeoParquet).toBe(true);
    expect(result.columnPaths).toEqual(["id"]);
    expect(result.rowGroups[0]?.columns[0]).toMatchObject({
      path: "id",
      codec: "SNAPPY",
      compressedBytes: 40,
      startOffset: 4,
      endOffset: 44,
      hasStatistics: true,
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("enforces required columns when requested", () => {
    expect(() => validateOvertureParquetMetadata(baseMetadata(), 200, {
      ...LIMITS,
      requiredColumns: ["id"],
    })).not.toThrow();
    expect(() => validateOvertureParquetMetadata(baseMetadata(), 200, {
      ...LIMITS,
      requiredColumns: ["geometry"],
    })).toThrow("required column");
  });

  it("rejects every unsafe metadata shape", () => {
    const cases: Array<[ReturnType<typeof baseMetadata>, number, string]> = [
      [baseMetadata({ num_rows: 500 }), 200, "row count exceeds"],
      [baseMetadata({
        row_groups: Array.from({ length: 65 }, () => ({ num_rows: 0, total_byte_size: 0, columns: [baseColumn()] })),
      }), 200, "row-group count exceeds"],
      [baseMetadata({ row_groups: [{ num_rows: 2, total_byte_size: 100, columns: [baseColumn({ codec: "BROTLI" })] }] }), 200, "unsupported codec"],
      [baseMetadata({ row_groups: [{ num_rows: 2, total_byte_size: 100, columns: [baseColumn({ total_compressed_size: 300 })] }] }), 200, "past the file"],
      [baseMetadata({ row_groups: [{ num_rows: 2, total_byte_size: 100, columns: [baseColumn({ data_page_offset: 0 })] }] }), 200, "leading magic"],
      [baseMetadata({ row_groups: [{ num_rows: 2, total_byte_size: 100, columns: [baseColumn({ total_uncompressed_size: OVERTURE_PARQUET_MAX_COLUMN_UNCOMPRESSED_BYTES + 1 })] }] }), 400 * 1024 * 1024, "oversized uncompressed"],
      [baseMetadata({ row_groups: [{ num_rows: 2, total_byte_size: 100, columns: [{}] }] }), 200, "no metadata"],
      [baseMetadata({ row_groups: [{ num_rows: 2, total_byte_size: 100, columns: [baseColumn({ path_in_schema: [] })] }] }), 200, "invalid schema path"],
      [baseMetadata({ row_groups: [{ num_rows: 2, total_byte_size: 100, columns: [] }] }), 200, "no columns"],
      [baseMetadata({ num_rows: 3 }), 200, "do not sum"],
      [baseMetadata({ row_groups: [{ num_rows: 2, total_byte_size: 100_000, columns: [baseColumn()] }] }), 200, "byte size exceeds"],
      [baseMetadata({ num_rows: BigInt(Number.MAX_SAFE_INTEGER) + 10n }), 200, "row count"],
      [baseMetadata(), 4, "too small"],
      [baseMetadata({ row_groups: undefined }), 200, "row groups are missing"],
    ];
    for (const [metadata, fileSize, message] of cases) {
      expect(() => validateOvertureParquetMetadata(metadata, fileSize, LIMITS)).toThrow(message);
    }
  });

  it("wires fzstd as the ZSTD decompressor and allowlists only bounded codecs", () => {
    expect(OVERTURE_PARQUET_SUPPORTED_CODECS.has("ZSTD")).toBe(true);
    expect(OVERTURE_PARQUET_SUPPORTED_CODECS.has("SNAPPY")).toBe(true);
    expect(OVERTURE_PARQUET_SUPPORTED_CODECS.has("UNCOMPRESSED")).toBe(true);
    expect(OVERTURE_PARQUET_SUPPORTED_CODECS.has("GZIP")).toBe(false);
    expect(typeof OVERTURE_PARQUET_DECOMPRESSORS.ZSTD).toBe("function");
  });
});

describe("Overture Parquet metadata reader over the capability range source", () => {
  const fixtureBytes = readFileSync(
    path.join(process.cwd(), "test", "lead-engine", "fixtures", "discovery", "synthetic-overture.parquet"),
  );

  function serve(buffer: Buffer) {
    return createTestOnlyOvertureRangeHttpTransport(async (request) => {
      const start = request.start;
      const end = request.endExclusive;
      const body = Buffer.from(buffer.subarray(start, Math.min(end, buffer.length)));
      return {
        status: 206,
        headers: {
          "content-type": "application/octet-stream",
          "content-encoding": "identity",
          "content-range": `bytes ${start}-${end - 1}/${buffer.length}`,
          "content-length": String(end - start),
          "etag": '"fixture-etag"',
        },
        body,
        connectedAddress: "203.0.113.10",
        destinationHost: new URL(request.asset.url).hostname,
        headerBytes: 200,
      };
    });
  }

  async function open(buffer: Buffer) {
    const live = syntheticLivePolicy();
    const source = await createCapabilityRangeSource({
      policy: live.policy,
      capability: live.capability,
      runId: "run-synthetic-overture",
      assessmentId: "scope-synthetic-overture",
      release: SYNTHETIC_OVERTURE_RELEASE_PIN,
      asset: SYNTHETIC_OVERTURE_ASSET,
      budget: syntheticBudget(),
      signal: new AbortController().signal,
      transport: serve(buffer),
      now: () => "2026-08-01T12:00:00.000Z",
    });
    return { source, cleanup: live.cleanup };
  }

  it("parses a real Parquet footer read exclusively through the injected source", async () => {
    const { source, cleanup } = await open(fixtureBytes);
    try {
      const metadata = await readOvertureParquetMetadata(source, {
        maxRows: 1_000,
        maxRowGroups: 64,
        maxColumnsPerRowGroup: 64,
      });
      expect(metadata.fileSize).toBe(fixtureBytes.length);
      expect(metadata.rowCount).toBeGreaterThan(0);
      expect(metadata.rowGroupCount).toBeGreaterThan(0);
      expect(metadata.columnPaths.length).toBeGreaterThan(0);
      for (const group of metadata.rowGroups) {
        for (const column of group.columns) {
          expect(column.endOffset).toBeLessThanOrEqual(metadata.fileSize);
          expect(OVERTURE_PARQUET_SUPPORTED_CODECS.has(column.codec)).toBe(true);
        }
      }
    } finally {
      cleanup();
    }
  });

  it("fails closed when the footer magic is corrupted", async () => {
    const corrupted = Buffer.from(fixtureBytes);
    corrupted.write("XXXX", corrupted.length - 4, "ascii");
    const { source, cleanup } = await open(corrupted);
    try {
      await expect(readOvertureParquetMetadata(source, {
        maxRows: 1_000,
        maxRowGroups: 64,
        maxColumnsPerRowGroup: 64,
      })).rejects.toMatchObject({ code: "parquet_metadata_invalid" });
    } finally {
      cleanup();
    }
  });

  it("enforces the row budget against the real footer", async () => {
    const { source, cleanup } = await open(fixtureBytes);
    try {
      await expect(readOvertureParquetMetadata(source, {
        maxRows: 1,
        maxRowGroups: 64,
        maxColumnsPerRowGroup: 64,
      })).rejects.toMatchObject({ code: "parquet_metadata_invalid" });
    } finally {
      cleanup();
    }
  });

  it("production reader reads only the requested columns through the injected source", async () => {
    const { source, cleanup } = await open(fixtureBytes);
    try {
      const reader = createHyparquetOvertureParquetReader();
      const footer = await reader.readMetadata({
        source,
        limits: { maxRows: 1_000, maxRowGroups: 64, maxColumnsPerRowGroup: 64 },
        signal: new AbortController().signal,
      });
      const requested = footer.metadata.columnPaths.slice(0, 1);
      const rows = await reader.readColumns({
        footer,
        source,
        columns: requested,
        rowStart: 0,
        rowEnd: Math.min(1, footer.metadata.rowCount),
        signal: new AbortController().signal,
      });
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(Object.keys(row)).toEqual(requested);
      }
    } finally {
      cleanup();
    }
  });
});

describe("Overture Parquet parser containment", () => {
  function files(directory: string): string[] {
    return readdirSync(directory).flatMap((entry) => {
      const target = path.join(directory, entry);
      return statSync(target).isDirectory() ? files(target) : [target];
    });
  }

  it("never reaches the network, a subprocess, DuckDB, or a URL-fetching parser helper", () => {
    const overtureSource = [
      ...files(path.join(process.cwd(), "src", "lead-engine", "providers", "overture")),
      path.join(process.cwd(), "src", "lead-engine", "providers", "adapters", "overture-places-live.ts"),
    ]
      .filter((file) => file.endsWith(".ts"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    // hyparquet also exports URL-fetching helpers; none may appear in production.
    expect(overtureSource).not.toMatch(/asyncBufferFromUrl|byteLengthFromUrl/);
    // Global fetch and raw http(s) clients are forbidden; the only permitted
    // network path is the injected, DNS/IP-pinned SafeFetcher (fetcher.fetch).
    expect(overtureSource).not.toMatch(/(?<![.\w])fetch\s*\(|https?\.(?:get|request)\s*\(/);
    expect(overtureSource).not.toMatch(/duckdb|httpfs|apache-arrow/i);
    expect(overtureSource).not.toMatch(/child_process|execSync|spawn\s*\(|node:child_process/);
    expect(overtureSource).not.toMatch(/python|pyarrow|\.py\b/i);
    // The Parquet parser is only ever fed the injected capability range source.
    expect(overtureSource).toMatch(/parquetMetadataAsync\(source\)/);
    expect(overtureSource).toMatch(/file: input\.source/);
  });
});
