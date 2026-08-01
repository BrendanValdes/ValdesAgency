// Narrow offline reader for the synthetic Phase 2 fixture profile: one required,
// uncompressed PLAIN BYTE_ARRAY column named `payload`, containing JSON rows.
// The container, page header, and footer are standard Parquet/Thrift Compact.

const PARQUET_MAGIC = Buffer.from("PAR1", "ascii");

const COMPACT = {
  stop: 0,
  booleanTrue: 1,
  booleanFalse: 2,
  byte: 3,
  i16: 4,
  i32: 5,
  i64: 6,
  double: 7,
  binary: 8,
  list: 9,
  set: 10,
  map: 11,
  struct: 12,
} as const;

class CompactReader {
  offset = 0;
  readonly #bytes: Buffer;
  readonly #limit: number;

  constructor(bytes: Buffer, offset: number, limit: number) {
    this.#bytes = bytes;
    this.offset = offset;
    this.#limit = limit;
  }

  byte(): number {
    if (this.offset >= this.#limit) throw new Error("Malformed Parquet compact metadata");
    return this.#bytes[this.offset++] as number;
  }

  varint(): number {
    let value = 0;
    let shift = 0;
    while (shift <= 49) {
      const next = this.byte();
      value += (next & 0x7f) * 2 ** shift;
      if ((next & 0x80) === 0) return value;
      shift += 7;
    }
    throw new Error("Parquet compact integer exceeds the supported fixture range");
  }

  signed(): number {
    const value = this.varint();
    return value % 2 === 0 ? value / 2 : -(value + 1) / 2;
  }

  field(previousId: number): { type: number; id: number } {
    const header = this.byte();
    const type = header & 0x0f;
    if (type === COMPACT.stop) return { type, id: previousId };
    const delta = header >>> 4;
    return { type, id: delta === 0 ? this.signed() : previousId + delta };
  }

  skip(type: number): void {
    if (type === COMPACT.booleanTrue || type === COMPACT.booleanFalse) return;
    if (type === COMPACT.byte) {
      this.byte();
      return;
    }
    if (type === COMPACT.i16 || type === COMPACT.i32 || type === COMPACT.i64) {
      this.varint();
      return;
    }
    if (type === COMPACT.double) {
      this.offset += 8;
      return;
    }
    if (type === COMPACT.binary) {
      this.offset += this.varint();
      return;
    }
    if (type === COMPACT.list || type === COMPACT.set) {
      const header = this.byte();
      const itemType = header & 0x0f;
      const compactSize = header >>> 4;
      const size = compactSize === 15 ? this.varint() : compactSize;
      for (let index = 0; index < size; index += 1) this.skip(itemType);
      return;
    }
    if (type === COMPACT.map) {
      const size = this.varint();
      if (size === 0) return;
      const types = this.byte();
      for (let index = 0; index < size; index += 1) {
        this.skip(types >>> 4);
        this.skip(types & 0x0f);
      }
      return;
    }
    if (type === COMPACT.struct) {
      this.skipStruct();
      return;
    }
    throw new Error("Unsupported Parquet compact field type");
  }

  skipStruct(): void {
    let previousId = 0;
    while (true) {
      const field = this.field(previousId);
      if (field.type === COMPACT.stop) return;
      previousId = field.id;
      this.skip(field.type);
    }
  }
}

function readDataPageHeader(reader: CompactReader): number {
  let previousId = 0;
  let valueCount: number | null = null;
  while (true) {
    const field = reader.field(previousId);
    if (field.type === COMPACT.stop) break;
    previousId = field.id;
    if (field.id === 1 && field.type === COMPACT.i32) valueCount = reader.signed();
    else reader.skip(field.type);
  }
  if (valueCount === null || valueCount < 0) throw new Error("Parquet data page is missing its value count");
  return valueCount;
}

function readPageHeader(reader: CompactReader): {
  type: number;
  compressedSize: number;
  uncompressedSize: number;
  valueCount: number;
} {
  let previousId = 0;
  let type: number | null = null;
  let compressedSize: number | null = null;
  let uncompressedSize: number | null = null;
  let valueCount: number | null = null;
  while (true) {
    const field = reader.field(previousId);
    if (field.type === COMPACT.stop) break;
    previousId = field.id;
    if (field.id === 1 && field.type === COMPACT.i32) type = reader.signed();
    else if (field.id === 2 && field.type === COMPACT.i32) uncompressedSize = reader.signed();
    else if (field.id === 3 && field.type === COMPACT.i32) compressedSize = reader.signed();
    else if (field.id === 5 && field.type === COMPACT.struct) valueCount = readDataPageHeader(reader);
    else reader.skip(field.type);
  }
  if (type !== 0 || compressedSize === null || uncompressedSize === null || valueCount === null) {
    throw new Error("Synthetic Parquet fixture requires one uncompressed DATA_PAGE");
  }
  if (compressedSize !== uncompressedSize || compressedSize < 0) {
    throw new Error("Synthetic Parquet fixture must use uncompressed pages");
  }
  return { type, compressedSize, uncompressedSize, valueCount };
}

export function readJsonRowsFromParquet(bytes: Buffer): unknown[] {
  if (
    bytes.length < 12 ||
    !bytes.subarray(0, 4).equals(PARQUET_MAGIC) ||
    !bytes.subarray(-4).equals(PARQUET_MAGIC)
  ) {
    throw new Error("Malformed Parquet magic bytes");
  }
  const footerLength = bytes.readUInt32LE(bytes.length - 8);
  const footerStart = bytes.length - 8 - footerLength;
  if (footerLength === 0 || footerStart <= 4) throw new Error("Malformed Parquet footer length");

  const reader = new CompactReader(bytes, 4, footerStart);
  const page = readPageHeader(reader);
  const payloadEnd = reader.offset + page.compressedSize;
  if (payloadEnd > footerStart) throw new Error("Parquet data page exceeds the declared footer boundary");
  const rows: unknown[] = [];
  let cursor = reader.offset;
  for (let index = 0; index < page.valueCount; index += 1) {
    if (cursor + 4 > payloadEnd) throw new Error("Malformed Parquet PLAIN byte-array length");
    const length = bytes.readUInt32LE(cursor);
    cursor += 4;
    if (cursor + length > payloadEnd) throw new Error("Malformed Parquet PLAIN byte-array value");
    rows.push(JSON.parse(bytes.toString("utf8", cursor, cursor + length)));
    cursor += length;
  }
  if (cursor !== payloadEnd) throw new Error("Unexpected bytes in synthetic Parquet data page");
  return rows;
}
