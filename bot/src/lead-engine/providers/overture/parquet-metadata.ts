import { parquetMetadataAsync } from "hyparquet";
import { decompress as zstdDecompress } from "fzstd";
import { overtureFailure } from "./errors.js";
import type { CapabilityRangeSource } from "./capability-range-source.js";

/**
 * Secure Parquet metadata gate for the Phase 5A Overture reader.
 *
 * The footer is parsed with hyparquet reading exclusively through the injected
 * {@link CapabilityRangeSource}. hyparquet is dependency-free and performs no
 * network access of its own; only its pure metadata entry point is imported,
 * never any of its remote URL-fetching buffer helpers. Every offset, size, and
 * count is validated against the known file size before any broad read can be
 * planned, so malformed metadata fails closed at the boundary.
 */

// hyparquet decodes UNCOMPRESSED and SNAPPY natively. ZSTD data pages — used by
// the real Overture Places assets — are decoded with fzstd during the read
// stage. Every other codec is rejected so the reader never hands bytes to a
// decompressor it cannot bound.
export const OVERTURE_PARQUET_DECOMPRESSORS = Object.freeze({
  ZSTD: (input: Uint8Array, _outputLength: number): Uint8Array => zstdDecompress(input),
});

export const OVERTURE_PARQUET_SUPPORTED_CODECS: ReadonlySet<string> = new Set([
  "UNCOMPRESSED",
  "SNAPPY",
  "ZSTD",
]);

// A single column chunk may never claim to expand beyond this bound. Guards the
// row-group reader against decompression-bomb metadata before any page is read.
export const OVERTURE_PARQUET_MAX_COLUMN_UNCOMPRESSED_BYTES = 256 * 1024 * 1024;

export interface OvertureParquetColumnDescriptor {
  readonly path: string;
  readonly codec: string;
  readonly compressedBytes: number;
  readonly uncompressedBytes: number;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly hasStatistics: boolean;
}

export interface OvertureParquetRowGroupDescriptor {
  readonly index: number;
  readonly rowCount: number;
  readonly byteSize: number;
  readonly columns: ReadonlyArray<OvertureParquetColumnDescriptor>;
}

export interface OvertureParquetMetadata {
  readonly fileSize: number;
  readonly rowCount: number;
  readonly rowGroupCount: number;
  readonly isGeoParquet: boolean;
  readonly columnPaths: ReadonlyArray<string>;
  readonly rowGroups: ReadonlyArray<OvertureParquetRowGroupDescriptor>;
}

export interface OvertureParquetMetadataLimits {
  readonly maxRows: number;
  readonly maxRowGroups: number;
  readonly maxColumnsPerRowGroup: number;
  readonly requiredColumns?: ReadonlyArray<string>;
}

// Minimal structural view of the hyparquet metadata this gate reads. Kept local
// so the validator can be exercised with hand-crafted objects that exactly match
// the fields consumed here.
interface RawColumnMetaData {
  readonly path_in_schema?: ReadonlyArray<string>;
  readonly codec?: string;
  readonly total_compressed_size?: bigint | number;
  readonly total_uncompressed_size?: bigint | number;
  readonly data_page_offset?: bigint | number;
  readonly dictionary_page_offset?: bigint | number;
  readonly statistics?: unknown;
}
interface RawColumnChunk {
  readonly meta_data?: RawColumnMetaData;
}
interface RawRowGroup {
  readonly columns?: ReadonlyArray<RawColumnChunk>;
  readonly num_rows?: bigint | number;
  readonly total_byte_size?: bigint | number;
}
interface RawParquetMetadata {
  readonly num_rows?: bigint | number;
  readonly row_groups?: ReadonlyArray<RawRowGroup>;
  readonly key_value_metadata?: ReadonlyArray<{ readonly key?: string }>;
}

function invalid(detail: string): never {
  throw overtureFailure("parquet_metadata_invalid", `Overture Parquet metadata is unsafe: ${detail}`, {
    category: "schema_validation_failed",
  });
}

function boundedCount(value: bigint | number | undefined, detail: string): number {
  const asNumber = typeof value === "bigint"
    ? (value >= 0n && value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : Number.NaN)
    : value;
  if (typeof asNumber !== "number" || !Number.isSafeInteger(asNumber) || asNumber < 0) {
    invalid(`${detail} is not a bounded nonnegative integer`);
  }
  return asNumber;
}

function validateLimits(limits: OvertureParquetMetadataLimits): void {
  for (const [name, value] of [
    ["maxRows", limits.maxRows],
    ["maxRowGroups", limits.maxRowGroups],
    ["maxColumnsPerRowGroup", limits.maxColumnsPerRowGroup],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`Overture Parquet metadata limit ${name} must be a positive integer`);
    }
  }
}

/**
 * Validate a parsed Parquet metadata object against the known file size and the
 * Phase 5A safety limits. Pure and side-effect free so every rejection path is
 * unit-testable without crafting Parquet bytes.
 */
export function validateOvertureParquetMetadata(
  metadata: RawParquetMetadata,
  fileSize: number,
  limits: OvertureParquetMetadataLimits,
): OvertureParquetMetadata {
  validateLimits(limits);
  if (!Number.isSafeInteger(fileSize) || fileSize < 12) invalid("file size is too small to hold a footer");

  const rowCount = boundedCount(metadata.num_rows, "file row count");
  if (rowCount > limits.maxRows) invalid("file row count exceeds the configured maximum");

  const rowGroups = metadata.row_groups;
  if (!Array.isArray(rowGroups)) invalid("row groups are missing");
  if (rowGroups.length > limits.maxRowGroups) invalid("row-group count exceeds the configured maximum");

  const columnPaths = new Set<string>();
  let rowGroupRowTotal = 0;
  const descriptors: OvertureParquetRowGroupDescriptor[] = rowGroups.map((rowGroup, index) => {
    const groupRows = boundedCount(rowGroup.num_rows, `row group ${index} row count`);
    const byteSize = boundedCount(rowGroup.total_byte_size, `row group ${index} byte size`);
    if (byteSize > fileSize) invalid(`row group ${index} byte size exceeds the file`);
    rowGroupRowTotal += groupRows;

    const columns = rowGroup.columns;
    if (!Array.isArray(columns) || columns.length === 0) invalid(`row group ${index} has no columns`);
    if (columns.length > limits.maxColumnsPerRowGroup) {
      invalid(`row group ${index} column count exceeds the configured maximum`);
    }

    const columnDescriptors: OvertureParquetColumnDescriptor[] = columns.map((column, columnIndex) => {
      const meta = column.meta_data;
      if (!meta) invalid(`row group ${index} column ${columnIndex} has no metadata`);
      const pathParts = meta.path_in_schema;
      if (!Array.isArray(pathParts) || pathParts.length === 0 ||
        pathParts.some((part) => typeof part !== "string" || part.length === 0)) {
        invalid(`row group ${index} column ${columnIndex} has an invalid schema path`);
      }
      const path = pathParts.join(".");
      const codec = meta.codec;
      if (typeof codec !== "string" || !OVERTURE_PARQUET_SUPPORTED_CODECS.has(codec)) {
        invalid(`row group ${index} column ${path} uses unsupported codec`);
      }
      const compressedBytes = boundedCount(meta.total_compressed_size, `column ${path} compressed size`);
      const uncompressedBytes = boundedCount(meta.total_uncompressed_size, `column ${path} uncompressed size`);
      if (uncompressedBytes > OVERTURE_PARQUET_MAX_COLUMN_UNCOMPRESSED_BYTES) {
        invalid(`column ${path} declares an oversized uncompressed size`);
      }
      const dataPageOffset = boundedCount(meta.data_page_offset, `column ${path} data page offset`);
      const startOffset = meta.dictionary_page_offset === undefined
        ? dataPageOffset
        : Math.min(dataPageOffset, boundedCount(meta.dictionary_page_offset, `column ${path} dictionary offset`));
      if (startOffset < 4) invalid(`column ${path} starts inside the leading magic bytes`);
      const endOffset = startOffset + compressedBytes;
      if (endOffset > fileSize || endOffset < startOffset) invalid(`column ${path} extends past the file`);

      columnPaths.add(path);
      return Object.freeze({
        path,
        codec,
        compressedBytes,
        uncompressedBytes,
        startOffset,
        endOffset,
        hasStatistics: meta.statistics !== undefined && meta.statistics !== null,
      });
    });

    return Object.freeze({
      index,
      rowCount: groupRows,
      byteSize,
      columns: Object.freeze(columnDescriptors),
    });
  });

  if (rowGroups.length > 0 && rowGroupRowTotal !== rowCount) {
    invalid("row-group row counts do not sum to the file row count");
  }

  for (const required of limits.requiredColumns ?? []) {
    if (!columnPaths.has(required)) invalid(`required column ${required} is absent`);
  }

  const isGeoParquet = Array.isArray(metadata.key_value_metadata) &&
    metadata.key_value_metadata.some((entry) => entry?.key === "geo");

  return Object.freeze({
    fileSize,
    rowCount,
    rowGroupCount: rowGroups.length,
    isGeoParquet,
    columnPaths: Object.freeze([...columnPaths].sort()),
    rowGroups: Object.freeze(descriptors),
  });
}

/**
 * Parse and validate the Parquet footer for an Overture asset, reading only
 * through the capability-controlled range source. Fails closed on any malformed
 * or unsupported metadata before a row-group read can be planned.
 */
export async function readOvertureParquetMetadata(
  source: CapabilityRangeSource,
  limits: OvertureParquetMetadataLimits,
): Promise<OvertureParquetMetadata> {
  validateLimits(limits);
  let raw: Awaited<ReturnType<typeof parquetMetadataAsync>>;
  try {
    // hyparquet reads the footer via source.slice only — no URL, no network.
    raw = await parquetMetadataAsync(source);
  } catch {
    // Never echo the underlying parser message; it could reflect raw footer bytes.
    invalid("footer could not be parsed");
  }
  return validateOvertureParquetMetadata(raw, source.byteLength, limits);
}
