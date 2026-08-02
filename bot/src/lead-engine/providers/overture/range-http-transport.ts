import {
  assertPublicWebCapability,
  reservePublicWebRequest,
  type PublicWebCapability,
  type PublicWebCapabilityBinding,
} from "../../config/network-capability.js";
import {
  assertPinnedConnection,
  resolveSafeDestination,
  systemDnsResolver,
} from "../../crawl/dns-safety.js";
import { createProductionPinnedHttpTransport } from "../../crawl/fetchers/direct-http.js";
import type {
  DnsResolver,
  PinnedHttpTransport,
  TransportResponse,
} from "../../crawl/types.js";
import { overtureFailure } from "./errors.js";
import { validateOvertureAsset } from "./asset-validator.js";
import {
  OVERTURE_PLACES_PROVIDER_ID,
  type ValidatedOvertureAsset,
} from "./types.js";

export const OVERTURE_RANGE_HEADER_OVERHEAD_BYTES = 16 * 1024;

export interface OvertureRangeHttpRequest {
  readonly asset: ValidatedOvertureAsset;
  readonly releaseId: string;
  readonly start: number;
  readonly endExclusive: number;
  readonly expectedStrongEtag?: string | null;
  readonly signal: AbortSignal;
}

export interface OvertureRangeHttpResponse {
  readonly status: number;
  readonly headers: TransportResponse["headers"];
  readonly body: Buffer;
  readonly connectedAddress: string;
  readonly destinationHost: string;
  readonly headerBytes: number;
}

export interface OvertureRangeHttpTransport {
  get(request: OvertureRangeHttpRequest): Promise<OvertureRangeHttpResponse>;
}

const trustedTransports = new WeakSet<object>();

function trusted<T extends OvertureRangeHttpTransport>(transport: T): T {
  trustedTransports.add(transport);
  return transport;
}

export function assertTrustedOvertureRangeHttpTransport(
  transport: unknown,
): asserts transport is OvertureRangeHttpTransport {
  if (!transport || typeof transport !== "object" || !trustedTransports.has(transport)) {
    throw overtureFailure("range_transport_untrusted", "Overture range transport is not trusted", {
      category: "authorization_failed",
    });
  }
}

function checkedRange(start: number, endExclusive: number): { start: number; endExclusive: number } {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(endExclusive) ||
    start < 0 || endExclusive <= start) {
    throw overtureFailure("range_invalid", "Overture byte range is invalid", {
      category: "policy_blocked",
    });
  }
  return { start, endExclusive };
}

function headerBytes(headers: TransportResponse["headers"]): number {
  let total = 2;
  for (const [name, raw] of Object.entries(headers)) {
    const values = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
    for (const value of values) {
      total += Buffer.byteLength(name) + 2 + Buffer.byteLength(value) + 2;
      if (total > OVERTURE_RANGE_HEADER_OVERHEAD_BYTES) {
        throw overtureFailure("range_headers_oversized", "Overture response headers exceed the fixed limit", {
          category: "schema_validation_failed",
        });
      }
    }
  }
  return total;
}

export function createOfficialOvertureRangeHttpTransport(input: {
  capability: PublicWebCapability;
  runId: string;
  assessmentId: string;
  maximumBodyBytesPerRequest: number;
  maximumDurationMs: number;
  resolver?: DnsResolver;
  pinnedTransport?: PinnedHttpTransport;
}): OvertureRangeHttpTransport {
  if (!Number.isSafeInteger(input.maximumBodyBytesPerRequest) ||
    input.maximumBodyBytesPerRequest < 1 ||
    input.maximumBodyBytesPerRequest > 32 * 1024 * 1024) {
    throw new Error("Overture range body limit must be between one byte and 32 MiB");
  }
  if (!Number.isSafeInteger(input.maximumDurationMs) || input.maximumDurationMs < 1 ||
    input.maximumDurationMs > 60_000) {
    throw new Error("Overture range duration must be between one millisecond and 60 seconds");
  }
  const binding: PublicWebCapabilityBinding = {
    providerId: OVERTURE_PLACES_PROVIDER_ID,
    runId: input.runId,
    assessmentId: input.assessmentId,
    operation: "discovery",
  };
  const capabilityLimits = {
    maxBytesPerRequest: input.maximumBodyBytesPerRequest + OVERTURE_RANGE_HEADER_OVERHEAD_BYTES,
    maxRequestDurationMs: input.maximumDurationMs,
  };
  assertPublicWebCapability(input.capability, binding, capabilityLimits);
  const resolver = input.resolver ?? systemDnsResolver;
  const pinnedTransport = input.pinnedTransport ?? createProductionPinnedHttpTransport();

  return trusted({
    async get(request) {
      assertPublicWebCapability(input.capability, binding, capabilityLimits);
      const asset = validateOvertureAsset(request.asset);
      if (asset.releaseId !== request.releaseId || asset.assetId !== request.asset.assetId ||
        asset.url !== request.asset.url) {
        throw overtureFailure("release_changed", "Overture range request changed its pinned asset", {
          category: "authorization_failed",
        });
      }
      const range = checkedRange(request.start, request.endExclusive);
      const expectedBodyBytes = range.endExclusive - range.start;
      if (expectedBodyBytes > input.maximumBodyBytesPerRequest) {
        throw overtureFailure("range_oversized", "Overture byte range exceeds its per-request limit", {
          category: "budget_blocked",
        });
      }
      if (request.signal.aborted) {
        throw overtureFailure("cancelled", "Overture range request was cancelled", {
          category: "cancelled",
        });
      }
      const url = new URL(asset.url);
      if (url.protocol !== "https:") {
        throw overtureFailure("asset_invalid", "Overture range requests require HTTPS", {
          category: "authorization_failed",
        });
      }
      reservePublicWebRequest(input.capability, binding, {
        bytes: expectedBodyBytes + OVERTURE_RANGE_HEADER_OVERHEAD_BYTES,
      });
      const destination = await resolveSafeDestination(url.hostname, resolver, {
        timeoutMs: input.maximumDurationMs,
        signal: request.signal,
      });
      assertPublicWebCapability(input.capability, binding, capabilityLimits);
      const headers: Record<string, string> = {
        accept: "application/vnd.apache.parquet,application/x-parquet,application/octet-stream;q=0.1",
        "accept-encoding": "identity",
        connection: "close",
        range: `bytes=${range.start}-${range.endExclusive - 1}`,
        "user-agent": "ValdesAgency-Overture-Range/1.0",
      };
      if (request.expectedStrongEtag) headers["if-match"] = request.expectedStrongEtag;
      const response = await pinnedTransport.request({
        url,
        destination,
        headers,
        signal: request.signal,
        connectionTimeoutMs: input.maximumDurationMs,
        responseTimeoutMs: input.maximumDurationMs,
        maxCompressedBytes: expectedBodyBytes + 1,
      });
      assertPinnedConnection(destination, response.connectedAddress);
      return {
        status: response.status,
        headers: response.headers,
        body: response.compressedBody,
        connectedAddress: response.connectedAddress,
        destinationHost: url.hostname,
        headerBytes: headerBytes(response.headers),
      };
    },
  });
}

export function createTestOnlyOvertureRangeHttpTransport(
  handler: OvertureRangeHttpTransport["get"],
): OvertureRangeHttpTransport {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Synthetic Overture range transport is available only under NODE_ENV=test");
  }
  return trusted({ get: handler });
}
