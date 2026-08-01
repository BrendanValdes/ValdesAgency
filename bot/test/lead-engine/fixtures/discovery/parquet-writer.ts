const STOP = 0;
const I32 = 5;
const I64 = 6;
const BINARY = 8;
const LIST = 9;
const STRUCT = 12;

class CompactWriter {
  readonly bytes: number[] = [];

  byte(value: number): void {
    this.bytes.push(value & 0xff);
  }

  varint(value: number): void {
    let remaining = value;
    while (remaining >= 0x80) {
      this.byte((remaining % 0x80) | 0x80);
      remaining = Math.floor(remaining / 0x80);
    }
    this.byte(remaining);
  }

  signed(value: number): void {
    this.varint(value >= 0 ? value * 2 : -value * 2 - 1);
  }

  field(id: number, previousId: number, type: number): number {
    const delta = id - previousId;
    if (delta > 0 && delta <= 15) this.byte((delta << 4) | type);
    else {
      this.byte(type);
      this.signed(id);
    }
    return id;
  }

  string(value: string): void {
    const bytes = Buffer.from(value, "utf8");
    this.varint(bytes.length);
    this.bytes.push(...bytes);
  }

  list(size: number, type: number): void {
    if (size < 15) this.byte((size << 4) | type);
    else {
      this.byte(0xf0 | type);
      this.varint(size);
    }
  }

  stop(): void {
    this.byte(STOP);
  }

  buffer(): Buffer {
    return Buffer.from(this.bytes);
  }
}

function dataPageHeader(valueCount: number, payloadLength: number): Buffer {
  const writer = new CompactWriter();
  let previous = 0;
  previous = writer.field(1, previous, I32); writer.signed(0);
  previous = writer.field(2, previous, I32); writer.signed(payloadLength);
  previous = writer.field(3, previous, I32); writer.signed(payloadLength);
  previous = writer.field(5, previous, STRUCT);
  let nested = 0;
  nested = writer.field(1, nested, I32); writer.signed(valueCount);
  nested = writer.field(2, nested, I32); writer.signed(0);
  nested = writer.field(3, nested, I32); writer.signed(3);
  nested = writer.field(4, nested, I32); writer.signed(3);
  writer.stop();
  writer.stop();
  return writer.buffer();
}

function fileMetadata(valueCount: number, chunkSize: number): Buffer {
  const writer = new CompactWriter();
  let previous = 0;
  previous = writer.field(1, previous, I32); writer.signed(1);
  previous = writer.field(2, previous, LIST); writer.list(2, STRUCT);
  let schema = 0;
  schema = writer.field(4, schema, BINARY); writer.string("schema");
  schema = writer.field(5, schema, I32); writer.signed(1);
  writer.stop();
  schema = 0;
  schema = writer.field(1, schema, I32); writer.signed(6);
  schema = writer.field(3, schema, I32); writer.signed(0);
  schema = writer.field(4, schema, BINARY); writer.string("payload");
  writer.stop();
  previous = writer.field(3, previous, I64); writer.signed(valueCount);
  previous = writer.field(4, previous, LIST); writer.list(1, STRUCT);
  let rowGroup = 0;
  rowGroup = writer.field(1, rowGroup, LIST); writer.list(1, STRUCT);
  let columnChunk = 0;
  columnChunk = writer.field(2, columnChunk, I64); writer.signed(4);
  columnChunk = writer.field(3, columnChunk, STRUCT);
  let metadata = 0;
  metadata = writer.field(1, metadata, I32); writer.signed(6);
  metadata = writer.field(2, metadata, LIST); writer.list(2, I32); writer.signed(0); writer.signed(3);
  metadata = writer.field(3, metadata, LIST); writer.list(1, BINARY); writer.string("payload");
  metadata = writer.field(4, metadata, I32); writer.signed(0);
  metadata = writer.field(5, metadata, I64); writer.signed(valueCount);
  metadata = writer.field(6, metadata, I64); writer.signed(chunkSize);
  metadata = writer.field(7, metadata, I64); writer.signed(chunkSize);
  metadata = writer.field(9, metadata, I64); writer.signed(4);
  writer.stop();
  writer.stop();
  rowGroup = writer.field(2, rowGroup, I64); writer.signed(chunkSize);
  rowGroup = writer.field(3, rowGroup, I64); writer.signed(valueCount);
  rowGroup = writer.field(6, rowGroup, I64); writer.signed(chunkSize);
  writer.stop();
  previous = writer.field(6, previous, BINARY); writer.string("rocco-phase2-synthetic-parquet");
  writer.stop();
  return writer.buffer();
}

export function encodeSyntheticOvertureParquet(
  places: ReadonlyArray<unknown>,
  releaseId: string,
): Buffer {
  const values = places.map((place) => Buffer.from(JSON.stringify({
    synthetic_fixture: true,
    release_id: releaseId,
    place,
  }), "utf8"));
  const payloadParts: Buffer[] = [];
  for (const value of values) {
    const length = Buffer.alloc(4);
    length.writeUInt32LE(value.length);
    payloadParts.push(length, value);
  }
  const payload = Buffer.concat(payloadParts);
  const pageHeader = dataPageHeader(values.length, payload.length);
  const metadata = fileMetadata(values.length, pageHeader.length + payload.length);
  const footerLength = Buffer.alloc(4);
  footerLength.writeUInt32LE(metadata.length);
  return Buffer.concat([
    Buffer.from("PAR1", "ascii"),
    pageHeader,
    payload,
    metadata,
    footerLength,
    Buffer.from("PAR1", "ascii"),
  ]);
}
