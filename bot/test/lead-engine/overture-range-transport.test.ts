import { describe, expect, it } from "vitest";
import { loadRuntimeLeadPolicy } from "../../src/lead-engine/config/lead-policy.js";
import type {
  DnsResolver,
  PinnedHttpTransport,
} from "../../src/lead-engine/crawl/types.js";
import { OverturePlacesError, overtureFailure } from "../../src/lead-engine/providers/overture/errors.js";
import { validateOvertureAsset } from "../../src/lead-engine/providers/overture/asset-validator.js";
import {
  assertTrustedOvertureRangeHttpTransport,
  createOfficialOvertureRangeHttpTransport,
  createTestOnlyOvertureRangeHttpTransport,
  OVERTURE_RANGE_HEADER_OVERHEAD_BYTES,
  type OvertureRangeHttpRequest,
  type OvertureRangeHttpResponse,
} from "../../src/lead-engine/providers/overture/range-http-transport.js";
import {
  createCapabilityRangeSource,
  type OvertureRangeAuditEvent,
} from "../../src/lead-engine/providers/overture/capability-range-source.js";
import {
  SYNTHETIC_OVERTURE_ASSET,
  SYNTHETIC_OVERTURE_RELEASE,
  SYNTHETIC_OVERTURE_RELEASE_PIN,
  syntheticBudget,
  syntheticLivePolicy,
} from "./fixtures/overture/synthetic-live.js";
import { OvertureBudgetTracker } from "../../src/lead-engine/providers/overture/budgets.js";

// A byte source with the leading (and trailing) Parquet magic and deterministic
// filler so exact-range reads can be asserted byte-for-byte.
function par1Buffer(total: number): Buffer {
  const buffer = Buffer.alloc(total);
  for (let index = 0; index < total; index += 1) buffer[index] = (index * 7 + 3) & 0xff;
  buffer.write("PAR1", 0, "ascii");
  if (total >= 8) buffer.write("PAR1", total - 4, "ascii");
  return buffer;
}

class SyntheticNetworkError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(`synthetic ${code}`);
    this.name = "SyntheticNetworkError";
    this.code = code;
  }
}

interface Fault {
  status?: number;
  headers?: Record<string, string>;
  dropHeaders?: ReadonlyArray<string>;
  body?: Buffer;
  contentRange?: string;
  contentLength?: string;
  etag?: string | null;
  versionId?: string | null;
  total?: number;
  throwCode?: string;
}

interface ServerOptions {
  total?: number;
  etag?: string | null;
  versionId?: string | null;
  lastModified?: string | null;
  headerBytes?: number;
  fault?: (callIndex: number, request: OvertureRangeHttpRequest) => Fault | undefined;
}

// In-memory range transport that serves exact byte ranges over the trusted
// test-only seam. No network, DNS, or sockets are involved.
function server(buffer: Buffer, options: ServerOptions = {}) {
  let calls = 0;
  const declaredTotal = options.total ?? buffer.length;
  const transport = createTestOnlyOvertureRangeHttpTransport(async (request) => {
    const index = calls;
    calls += 1;
    const fault = options.fault?.(index, request) ?? {};
    if (fault.throwCode) throw new SyntheticNetworkError(fault.throwCode);
    const start = request.start;
    const end = request.endExclusive;
    const body = fault.body ?? Buffer.from(buffer.subarray(start, Math.min(end, buffer.length)));
    const total = fault.total ?? declaredTotal;
    const headers: Record<string, string> = {
      "content-type": "application/octet-stream",
      "content-encoding": "identity",
      "content-range": fault.contentRange ?? `bytes ${start}-${end - 1}/${total}`,
      "content-length": fault.contentLength ?? String(end - start),
    };
    const etag = fault.etag !== undefined ? fault.etag : options.etag !== undefined ? options.etag : '"strong-v1"';
    if (etag) headers["etag"] = etag;
    const versionId = fault.versionId !== undefined ? fault.versionId : options.versionId ?? null;
    if (versionId) headers["x-amz-version-id"] = versionId;
    const lastModified = options.lastModified !== undefined ? options.lastModified : "Wed, 23 Jul 2026 00:00:00 GMT";
    if (lastModified) headers["last-modified"] = lastModified;
    Object.assign(headers, fault.headers ?? {});
    for (const name of fault.dropHeaders ?? []) delete headers[name];
    return {
      status: fault.status ?? 206,
      headers,
      body,
      connectedAddress: "203.0.113.10",
      destinationHost: new URL(request.asset.url).hostname,
      headerBytes: options.headerBytes ?? 220,
    } satisfies OvertureRangeHttpResponse;
  });
  return { transport, calls: () => calls };
}

interface OpenOptions {
  budget?: OvertureBudgetTracker;
  controller?: AbortController;
  maxCacheEntries?: number;
  maxCacheBytes?: number;
  asset?: typeof SYNTHETIC_OVERTURE_ASSET;
}

async function openSource(
  live: ReturnType<typeof syntheticLivePolicy>,
  transport: ReturnType<typeof server>["transport"],
  options: OpenOptions = {},
) {
  const controller = options.controller ?? new AbortController();
  const budget = options.budget ?? syntheticBudget();
  const events: OvertureRangeAuditEvent[] = [];
  const source = await createCapabilityRangeSource({
    policy: live.policy,
    capability: live.capability,
    runId: "run-synthetic-overture",
    assessmentId: "scope-synthetic-overture",
    release: SYNTHETIC_OVERTURE_RELEASE_PIN,
    asset: options.asset ?? SYNTHETIC_OVERTURE_ASSET,
    budget,
    signal: controller.signal,
    transport,
    audit: { record: (event) => events.push(event) },
    now: () => "2026-08-01T12:00:00.000Z",
    maxCacheEntries: options.maxCacheEntries,
    maxCacheBytes: options.maxCacheBytes,
  });
  return { source, controller, budget, events };
}

async function withLive<T>(fn: (live: ReturnType<typeof syntheticLivePolicy>) => Promise<T>): Promise<T> {
  const live = syntheticLivePolicy();
  try {
    return await fn(live);
  } finally {
    live.cleanup();
  }
}

const publicResolver: DnsResolver = {
  resolve: async () => [{ address: "8.8.8.8", family: 4 }],
};

describe("Overture range error model", () => {
  it("classifies deterministic range failures as non-retryable by default", () => {
    const oversized = overtureFailure("range_oversized", "too large", { category: "budget_blocked" });
    expect(oversized).toBeInstanceOf(OverturePlacesError);
    expect(oversized.code).toBe("range_oversized");
    expect(oversized.category).toBe("budget_blocked");
    expect(oversized.retryable).toBe(false);

    for (const code of [
      "range_invalid",
      "range_headers_oversized",
      "range_compressed",
      "range_multipart_rejected",
      "content_range_invalid",
      "content_range_mismatch",
      "range_length_mismatch",
      "asset_identity_changed",
      "parquet_magic_invalid",
      "parquet_metadata_invalid",
    ] as const) {
      expect(overtureFailure(code, code, { category: "schema_validation_failed" }).retryable).toBe(false);
    }
  });

  it("keeps range_status_invalid retryable only when explicitly marked", () => {
    expect(overtureFailure("range_status_invalid", "5xx", {
      category: "schema_validation_failed",
      retryable: true,
    }).retryable).toBe(true);
    expect(overtureFailure("range_status_invalid", "2xx", {
      category: "schema_validation_failed",
    }).retryable).toBe(false);
  });
});

describe("official Overture range HTTP transport", () => {
  it("rejects out-of-bounds body and duration limits at construction", () => {
    withLiveSync((live) => {
      expect(() => createOfficialOvertureRangeHttpTransport({
        capability: live.capability,
        runId: "run-synthetic-overture",
        assessmentId: "scope-synthetic-overture",
        maximumBodyBytesPerRequest: 0,
        maximumDurationMs: 1_000,
      })).toThrow("32 MiB");
      expect(() => createOfficialOvertureRangeHttpTransport({
        capability: live.capability,
        runId: "run-synthetic-overture",
        assessmentId: "scope-synthetic-overture",
        maximumBodyBytesPerRequest: 33 * 1024 * 1024,
        maximumDurationMs: 1_000,
      })).toThrow("32 MiB");
      expect(() => createOfficialOvertureRangeHttpTransport({
        capability: live.capability,
        runId: "run-synthetic-overture",
        assessmentId: "scope-synthetic-overture",
        maximumBodyBytesPerRequest: 1_024,
        maximumDurationMs: 61_000,
      })).toThrow("60 seconds");
    });
  });

  it("binds the capability to the exact run and rejects mismatches", () => {
    withLiveSync((live) => {
      expect(() => createOfficialOvertureRangeHttpTransport({
        capability: live.capability,
        runId: "run-different",
        assessmentId: "scope-synthetic-overture",
        maximumBodyBytesPerRequest: 65_536,
        maximumDurationMs: 30_000,
      })).toThrow("capability_run_mismatch");
    });
  });

  it("only trusts transports it constructs", () => {
    withLiveSync((live) => {
      const transport = createOfficialOvertureRangeHttpTransport({
        capability: live.capability,
        runId: "run-synthetic-overture",
        assessmentId: "scope-synthetic-overture",
        maximumBodyBytesPerRequest: 65_536,
        maximumDurationMs: 30_000,
        resolver: publicResolver,
      });
      expect(() => assertTrustedOvertureRangeHttpTransport(transport)).not.toThrow();
      expect(() => assertTrustedOvertureRangeHttpTransport({ get: async () => undefined }))
        .toThrow("not trusted");
    });
  });

  it("enforces range shape and cancellation before any network reservation", async () => {
    await withLive(async (live) => {
      const transport = createOfficialOvertureRangeHttpTransport({
        capability: live.capability,
        runId: "run-synthetic-overture",
        assessmentId: "scope-synthetic-overture",
        maximumBodyBytesPerRequest: 1_000,
        maximumDurationMs: 30_000,
        resolver: publicResolver,
        pinnedTransport: { request: async () => { throw new Error("network must not run"); } },
      });
      const controller = new AbortController();
      await expect(transport.get({
        asset: SYNTHETIC_OVERTURE_ASSET,
        releaseId: SYNTHETIC_OVERTURE_ASSET.releaseId,
        start: 0,
        endExclusive: 5_000,
        signal: controller.signal,
      })).rejects.toMatchObject({ code: "range_oversized" });
      await expect(transport.get({
        asset: SYNTHETIC_OVERTURE_ASSET,
        releaseId: SYNTHETIC_OVERTURE_ASSET.releaseId,
        start: 5,
        endExclusive: 5,
        signal: controller.signal,
      })).rejects.toMatchObject({ code: "range_invalid" });
      await expect(transport.get({
        asset: SYNTHETIC_OVERTURE_ASSET,
        releaseId: "2026-07-30.0",
        start: 0,
        endExclusive: 4,
        signal: controller.signal,
      })).rejects.toMatchObject({ code: "release_changed" });
      controller.abort();
      await expect(transport.get({
        asset: SYNTHETIC_OVERTURE_ASSET,
        releaseId: SYNTHETIC_OVERTURE_ASSET.releaseId,
        start: 0,
        endExclusive: 4,
        signal: controller.signal,
      })).rejects.toMatchObject({ code: "cancelled" });
    });
  });

  it("issues a single internally generated identity-encoded range request", async () => {
    await withLive(async (live) => {
      const seen: Array<Record<string, string>> = [];
      const pinnedTransport: PinnedHttpTransport = {
        request: async (input) => {
          seen.push({ ...input.headers });
          return {
            status: 206,
            headers: {
              "content-range": "bytes 0-3/2048",
              "content-length": "4",
              "content-encoding": "identity",
              "etag": '"strong-v1"',
            },
            compressedBody: Buffer.from("PAR1"),
            connectedAddress: "8.8.8.8",
          };
        },
      };
      const transport = createOfficialOvertureRangeHttpTransport({
        capability: live.capability,
        runId: "run-synthetic-overture",
        assessmentId: "scope-synthetic-overture",
        maximumBodyBytesPerRequest: 65_536,
        maximumDurationMs: 30_000,
        resolver: publicResolver,
        pinnedTransport,
      });
      const response = await transport.get({
        asset: SYNTHETIC_OVERTURE_ASSET,
        releaseId: SYNTHETIC_OVERTURE_ASSET.releaseId,
        start: 0,
        endExclusive: 4,
        signal: new AbortController().signal,
      });
      expect(response.status).toBe(206);
      expect(response.body.toString("ascii")).toBe("PAR1");
      expect(response.headerBytes).toBeGreaterThan(0);
      expect(seen).toHaveLength(1);
      expect(seen[0]?.range).toBe("bytes=0-3");
      expect(seen[0]?.["accept-encoding"]).toBe("identity");
    });
  });

  it("rejects responses whose headers exceed the fixed overhead", async () => {
    await withLive(async (live) => {
      const pinnedTransport: PinnedHttpTransport = {
        request: async () => ({
          status: 206,
          headers: { "x-oversized": "a".repeat(OVERTURE_RANGE_HEADER_OVERHEAD_BYTES + 10) },
          compressedBody: Buffer.from("PAR1"),
          connectedAddress: "8.8.8.8",
        }),
      };
      const transport = createOfficialOvertureRangeHttpTransport({
        capability: live.capability,
        runId: "run-synthetic-overture",
        assessmentId: "scope-synthetic-overture",
        maximumBodyBytesPerRequest: 65_536,
        maximumDurationMs: 30_000,
        resolver: publicResolver,
        pinnedTransport,
      });
      await expect(transport.get({
        asset: SYNTHETIC_OVERTURE_ASSET,
        releaseId: SYNTHETIC_OVERTURE_ASSET.releaseId,
        start: 0,
        endExclusive: 4,
        signal: new AbortController().signal,
      })).rejects.toMatchObject({ code: "range_headers_oversized" });
    });
  });
});

describe("capability range source", () => {
  it("discovers file size and identity from the leading magic read", async () => {
    await withLive(async (live) => {
      const { source, events } = await openSource(live, server(par1Buffer(2048)).transport);
      expect(source.byteLength).toBe(2048);
      expect(source.identity.size).toBe(2048);
      expect(source.identity.strongEtag).toBe('"strong-v1"');
      expect(source.identity.releaseId).toBe(SYNTHETIC_OVERTURE_RELEASE);
      expect(source.identity.fingerprint).toMatch(/^[a-f0-9]+$/);
      expect(events.some((event) => event.outcome === "success" && event.network)).toBe(true);
    });
  });

  it("returns exact slices and suffixes and exposes an async-buffer shape", async () => {
    await withLive(async (live) => {
      const buffer = par1Buffer(2048);
      const { source } = await openSource(live, server(buffer).transport);
      expect(typeof source.byteLength).toBe("number");
      expect(typeof source.slice).toBe("function");
      expect(typeof source.suffix).toBe("function");
      const slice = Buffer.from(await source.slice(16, 48));
      expect(slice.equals(buffer.subarray(16, 48))).toBe(true);
      const suffix = Buffer.from(await source.suffix(32));
      expect(suffix.equals(buffer.subarray(2048 - 32, 2048))).toBe(true);
    });
  });

  it("serves exact and superset cache hits without additional network reads", async () => {
    await withLive(async (live) => {
      const buffer = par1Buffer(2048);
      const backend = server(buffer);
      const { source, events } = await openSource(live, backend.transport);
      await source.slice(0, 64);
      const callsAfterNetwork = backend.calls();
      const exact = Buffer.from(await source.slice(0, 64));
      const subset = Buffer.from(await source.slice(16, 48));
      expect(exact.equals(buffer.subarray(0, 64))).toBe(true);
      expect(subset.equals(buffer.subarray(16, 48))).toBe(true);
      expect(backend.calls()).toBe(callsAfterNetwork);
      expect(events.filter((event) => event.outcome === "cache_hit")).toHaveLength(2);
      expect(source.cacheSnapshot().entries).toBeGreaterThan(0);
    });
  });

  it("rejects invalid Parquet magic and truncated metadata", async () => {
    await withLive(async (live) => {
      await expect(openSource(live, server(par1Buffer(2048), {
        fault: (index) => index === 0 ? { body: Buffer.from("XXXX") } : undefined,
      }).transport)).rejects.toMatchObject({ code: "parquet_magic_invalid" });
    });
    await withLive(async (live) => {
      await expect(openSource(live, server(par1Buffer(8), { total: 8 }).transport))
        .rejects.toMatchObject({ code: "parquet_metadata_invalid" });
    });
  });

  it("requires a strong ETag or object version for identity", async () => {
    await withLive(async (live) => {
      await expect(openSource(live, server(par1Buffer(2048), { etag: null }).transport))
        .rejects.toMatchObject({ code: "asset_identity_unavailable" });
    });
  });

  it("accepts an object version when no strong ETag is present", async () => {
    await withLive(async (live) => {
      const { source } = await openSource(live, server(par1Buffer(2048), {
        etag: null,
        versionId: "objv-1",
      }).transport);
      expect(source.identity.strongEtag).toBeNull();
      expect(source.identity.objectVersion).toBe("objv-1");
    });
  });

  it("rejects out-of-bounds slices and suffixes", async () => {
    await withLive(async (live) => {
      const { source } = await openSource(live, server(par1Buffer(2048)).transport);
      await expect(source.slice(0, 2049)).rejects.toMatchObject({ code: "range_invalid" });
      await expect(source.suffix(2049)).rejects.toMatchObject({ code: "range_invalid" });
      await expect(source.suffix(0)).rejects.toMatchObject({ code: "range_invalid" });
    });
  });

  it("rejects non-206, compressed, chunked, and multipart range responses", async () => {
    const cases: Array<[Fault, string]> = [
      [{ status: 200 }, "range_status_invalid"],
      [{ headers: { "content-encoding": "gzip" } }, "range_compressed"],
      [{ headers: { "transfer-encoding": "chunked" } }, "range_transfer_invalid"],
      [{ headers: { "content-type": "multipart/byteranges; boundary=x" } }, "range_multipart_rejected"],
    ];
    for (const [fault, code] of cases) {
      await withLive(async (live) => {
        await expect(openSource(live, server(par1Buffer(2048), {
          fault: (index) => index === 0 ? fault : undefined,
        }).transport)).rejects.toMatchObject({ code });
      });
    }
  });

  it("rejects malformed, mismatched, and wrong-length Content-Range responses", async () => {
    const cases: Array<[Fault, string]> = [
      [{ contentRange: "bytes bogus" }, "content_range_invalid"],
      [{ contentRange: "bytes 1-3/2048" }, "content_range_mismatch"],
      [{ contentLength: "9" }, "range_length_mismatch"],
      [{ body: Buffer.from("PAR1EXTRA") }, "range_length_mismatch"],
    ];
    for (const [fault, code] of cases) {
      await withLive(async (live) => {
        await expect(openSource(live, server(par1Buffer(2048), {
          fault: (index) => index === 0 ? fault : undefined,
        }).transport)).rejects.toMatchObject({ code });
      });
    }
  });

  it("fails closed and clears the cache when asset identity changes mid-run", async () => {
    await withLive(async (live) => {
      const { source } = await openSource(live, server(par1Buffer(2048), {
        fault: (index) => index >= 1 ? { etag: '"strong-v2"' } : undefined,
      }).transport);
      await expect(source.slice(8, 24)).rejects.toMatchObject({ code: "asset_identity_changed" });
      expect(source.cacheSnapshot().entries).toBe(0);
    });
  });

  it("retries transient network errors and 5xx responses with retry accounting", async () => {
    await withLive(async (live) => {
      const { source, budget } = await openSource(live, server(par1Buffer(2048), {
        fault: (index) => index === 1 ? { throwCode: "ECONNRESET" } : undefined,
      }).transport);
      const bytes = Buffer.from(await source.slice(8, 24));
      expect(bytes.equals(par1Buffer(2048).subarray(8, 24))).toBe(true);
      expect(budget.snapshot().consumed.retryAttempts).toBe(1);
    });
    await withLive(async (live) => {
      const { source, budget } = await openSource(live, server(par1Buffer(2048), {
        fault: (index) => index === 1 ? { status: 500 } : undefined,
      }).transport);
      await source.slice(8, 24);
      expect(budget.snapshot().consumed.retryAttempts).toBe(1);
    });
  });

  it("stops before the download byte and asset-request budgets are exceeded", async () => {
    await withLive(async (live) => {
      // The magic read fits, but a larger follow-up reservation would push the
      // reserved-plus-actual total past the cumulative download ceiling.
      const { source } = await openSource(live, server(par1Buffer(2048)).transport, {
        budget: syntheticBudget({ maxDownloadedBytes: 17_000 }),
      });
      await expect(source.slice(0, 512)).rejects.toMatchObject({ code: "budget_exhausted" });
    });
    await withLive(async (live) => {
      const { source } = await openSource(live, server(par1Buffer(2048)).transport, {
        budget: syntheticBudget({ maxAssetRequests: 1 }),
      });
      await expect(source.slice(8, 24)).rejects.toMatchObject({ code: "budget_exhausted" });
    });
  });

  it("reconciles reserved bytes with the actual response length", async () => {
    await withLive(async (live) => {
      const { source, budget } = await openSource(live, server(par1Buffer(2048)).transport);
      await source.slice(0, 512);
      const consumed = budget.snapshot().consumed;
      expect(consumed.downloadedBytes).toBeLessThanOrEqual(consumed.reservedDownloadedBytes);
      expect(consumed.downloadedBytes).toBeGreaterThan(0);
    });
  });

  it("bounds the range cache and clears it on demand", async () => {
    await withLive(async (live) => {
      const { source } = await openSource(live, server(par1Buffer(2048)).transport, {
        maxCacheBytes: 8,
      });
      await expect(source.slice(0, 64)).rejects.toMatchObject({ code: "range_cache_capacity_exceeded" });
    });
    await withLive(async (live) => {
      const { source } = await openSource(live, server(par1Buffer(2048)).transport);
      await source.slice(0, 64);
      expect(source.cacheSnapshot().entries).toBeGreaterThan(0);
      source.clearCache();
      expect(source.cacheSnapshot()).toEqual({ entries: 0, bytes: 0 });
    });
  });

  it("honors cancellation raised after construction", async () => {
    await withLive(async (live) => {
      const controller = new AbortController();
      const { source } = await openSource(live, server(par1Buffer(2048)).transport, { controller });
      controller.abort();
      await expect(source.slice(8, 24)).rejects.toMatchObject({ code: "cancelled" });
    });
  });

  it("refuses assets outside the immutable release pin", async () => {
    await withLive(async (live) => {
      const foreignAsset = validateOvertureAsset({
        url: `https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/release/${SYNTHETIC_OVERTURE_RELEASE}/theme=places/type=place/part-foreign.parquet`,
        releaseId: SYNTHETIC_OVERTURE_RELEASE,
        theme: "places",
        featureType: "place",
        mediaType: "application/vnd.apache.parquet",
      });
      await expect(openSource(live, server(par1Buffer(2048)).transport, { asset: foreignAsset }))
        .rejects.toMatchObject({ code: "release_changed" });
    });
  });

  it("refuses to read when the executable policy does not authorize the provider", async () => {
    await withLive(async (live) => {
      await expect(createCapabilityRangeSource({
        policy: loadRuntimeLeadPolicy(),
        capability: live.capability,
        runId: "run-synthetic-overture",
        assessmentId: "scope-synthetic-overture",
        release: SYNTHETIC_OVERTURE_RELEASE_PIN,
        asset: SYNTHETIC_OVERTURE_ASSET,
        budget: syntheticBudget(),
        signal: new AbortController().signal,
        transport: server(par1Buffer(2048)).transport,
      })).rejects.toMatchObject({ code: "query_invalid" });
    });
  });
});

// Small synchronous wrapper so construction-only assertions can share the
// temporary-policy lifecycle without an async boundary.
function withLiveSync(fn: (live: ReturnType<typeof syntheticLivePolicy>) => void): void {
  const live = syntheticLivePolicy();
  try {
    fn(live);
  } finally {
    live.cleanup();
  }
}
