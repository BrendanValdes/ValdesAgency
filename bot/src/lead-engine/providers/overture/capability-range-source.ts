import {
  assertRuntimeLeadPolicy,
  requireProviderPolicy,
  type RuntimeLeadPolicy,
} from "../../config/lead-policy.js";
import {
  assertPublicWebCapability,
  type PublicWebCapability,
} from "../../config/network-capability.js";
import { stableHash } from "../../shared/stable.js";
import type { OvertureBudgetTracker, OvertureRequestReservation } from "./budgets.js";
import { overtureFailure, OverturePlacesError } from "./errors.js";
import {
  assertTrustedOvertureRangeHttpTransport,
  OVERTURE_RANGE_HEADER_OVERHEAD_BYTES,
  type OvertureRangeHttpResponse,
  type OvertureRangeHttpTransport,
} from "./range-http-transport.js";
import { validateOvertureAsset } from "./asset-validator.js";
import {
  OVERTURE_PLACES_PROVIDER_ID,
  type OvertureReleasePin,
  type ValidatedOvertureAsset,
} from "./types.js";

export const OVERTURE_RANGE_SOURCE_VERSION = "overture-capability-range-source-1.0.0";

export interface OvertureAssetIdentity {
  readonly releaseId: string;
  readonly assetId: string;
  readonly size: number;
  readonly strongEtag: string | null;
  readonly objectVersion: string | null;
  readonly lastModified: string | null;
  readonly fingerprint: string;
}

export interface OvertureRangeAuditEvent {
  readonly providerId: typeof OVERTURE_PLACES_PROVIDER_ID;
  readonly runId: string;
  readonly assessmentId: string;
  readonly operation: "discovery";
  readonly releaseId: string;
  readonly assetId: string;
  readonly sourceVersion: typeof OVERTURE_RANGE_SOURCE_VERSION;
  readonly destinationHost: string;
  readonly start: number;
  readonly endExclusive: number;
  readonly attempt: number;
  readonly network: boolean;
  readonly status: number | null;
  readonly bodyBytes: number;
  readonly headerBytes: number;
  readonly outcome: "success" | "cache_hit" | "failed";
  readonly errorCode: string | null;
  readonly at: string;
}

export interface CapabilityRangeSource {
  readonly byteLength: number;
  readonly identity: OvertureAssetIdentity;
  slice(start: number, end?: number): Promise<ArrayBuffer>;
  suffix(length: number): Promise<ArrayBuffer>;
  clearCache(): void;
  cacheSnapshot(): Readonly<{ entries: number; bytes: number }>;
}

interface CacheEntry {
  readonly start: number;
  readonly endExclusive: number;
  readonly identityFingerprint: string;
  readonly bytes: Buffer;
  lastUsed: number;
}

function headerValue(
  headers: OvertureRangeHttpResponse["headers"],
  name: string,
): string | null {
  const value = headers[name.toLocaleLowerCase("en-US")];
  return typeof value === "string" ? value : value?.[0] ?? null;
}

function boundedHeader(value: string | null, maximum: number): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maximum || /[^\x20-\x7e]/.test(trimmed)) {
    throw overtureFailure("asset_identity_invalid", "Overture asset identity header is malformed", {
      category: "schema_validation_failed",
    });
  }
  return trimmed;
}

function strongEtag(headers: OvertureRangeHttpResponse["headers"]): string | null {
  const value = boundedHeader(headerValue(headers, "etag"), 256);
  return value && !/^W\//i.test(value) && /^"[^"\r\n]+"$/.test(value) ? value : null;
}

function objectVersion(headers: OvertureRangeHttpResponse["headers"]): string | null {
  const value = boundedHeader(
    headerValue(headers, "x-amz-version-id") ?? headerValue(headers, "x-ms-version-id"),
    256,
  );
  return value && value.toLocaleLowerCase("en-US") !== "null" ? value : null;
}

function contentRange(value: string | null): { start: number; endExclusive: number; total: number } {
  const match = value?.match(/^bytes (0|[1-9]\d*)-(0|[1-9]\d*)\/(0|[1-9]\d*)$/);
  if (!match) {
    throw overtureFailure("content_range_invalid", "Overture range response has an invalid Content-Range", {
      category: "schema_validation_failed",
    });
  }
  const start = Number(match[1]);
  const inclusiveEnd = Number(match[2]);
  const total = Number(match[3]);
  if (![start, inclusiveEnd, total].every(Number.isSafeInteger) ||
    inclusiveEnd < start || total <= inclusiveEnd) {
    throw overtureFailure("content_range_invalid", "Overture Content-Range values are unsafe", {
      category: "schema_validation_failed",
    });
  }
  return { start, endExclusive: inclusiveEnd + 1, total };
}

function checkedRange(start: number, endExclusive: number, size?: number): void {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(endExclusive) ||
    start < 0 || endExclusive <= start || (size !== undefined && endExclusive > size)) {
    throw overtureFailure("range_invalid", "Overture parser requested an invalid byte range", {
      category: "policy_blocked",
    });
  }
}

function retryable(error: unknown): boolean {
  if (error instanceof OverturePlacesError) return error.retryable;
  const code = (error as { code?: string; cause?: { code?: string } }).code ??
    (error as { cause?: { code?: string } }).cause?.code ?? "";
  return [
    "UND_ERR_CONNECT_TIMEOUT",
    "UND_ERR_HEADERS_TIMEOUT",
    "UND_ERR_BODY_TIMEOUT",
    "ECONNRESET",
    "ECONNREFUSED",
    "EAI_AGAIN",
  ].includes(code);
}

function errorCode(error: unknown): string {
  if (error instanceof OverturePlacesError) return error.code;
  return (error as { code?: string }).code ?? "range_transport_failed";
}

class CapabilityRangeSourceImpl implements CapabilityRangeSource {
  readonly #runId: string;
  readonly #assessmentId: string;
  readonly #release: OvertureReleasePin;
  readonly #asset: ValidatedOvertureAsset;
  readonly #capability: PublicWebCapability;
  readonly #budget: OvertureBudgetTracker;
  readonly #signal: AbortSignal;
  readonly #transport: OvertureRangeHttpTransport;
  readonly #audit: { record(event: OvertureRangeAuditEvent): void };
  readonly #now: () => string;
  readonly #maxCacheEntries: number;
  readonly #maxCacheBytes: number;
  readonly #cache = new Map<string, CacheEntry>();
  #cacheBytes = 0;
  #clock = 0;
  byteLength = 0;
  identity!: OvertureAssetIdentity;

  constructor(input: {
    runId: string;
    assessmentId: string;
    release: OvertureReleasePin;
    asset: ValidatedOvertureAsset;
    capability: PublicWebCapability;
    budget: OvertureBudgetTracker;
    signal: AbortSignal;
    transport: OvertureRangeHttpTransport;
    audit: { record(event: OvertureRangeAuditEvent): void };
    now: () => string;
    maxCacheEntries: number;
    maxCacheBytes: number;
  }) {
    this.#runId = input.runId;
    this.#assessmentId = input.assessmentId;
    this.#release = input.release;
    this.#asset = input.asset;
    this.#capability = input.capability;
    this.#budget = input.budget;
    this.#signal = input.signal;
    this.#transport = input.transport;
    this.#audit = input.audit;
    this.#now = input.now;
    this.#maxCacheEntries = input.maxCacheEntries;
    this.#maxCacheBytes = input.maxCacheBytes;
  }

  async initialize(): Promise<void> {
    this.#budget.recordAssetInspection();
    const first = await this.#readNetworkRange(0, 4, null);
    if (first.response.body.toString("ascii") !== "PAR1") {
      throw overtureFailure("parquet_magic_invalid", "Overture asset has invalid leading Parquet magic", {
        category: "schema_validation_failed",
      });
    }
    const total = first.range.total;
    if (total < 12) {
      throw overtureFailure("parquet_metadata_invalid", "Overture Parquet asset is too short", {
        category: "schema_validation_failed",
      });
    }
    const etag = strongEtag(first.response.headers);
    const version = objectVersion(first.response.headers);
    const lastModified = boundedHeader(headerValue(first.response.headers, "last-modified"), 128);
    if (!etag && !version) {
      throw overtureFailure(
        "asset_identity_unavailable",
        "Overture asset lacks a strong ETag or object version",
        { category: "schema_validation_failed" },
      );
    }
    this.byteLength = total;
    this.identity = Object.freeze({
      releaseId: this.#release.releaseId,
      assetId: this.#asset.assetId,
      size: total,
      strongEtag: etag,
      objectVersion: version,
      lastModified,
      fingerprint: stableHash({
        releaseId: this.#release.releaseId,
        assetId: this.#asset.assetId,
        size: total,
        strongEtag: etag,
        objectVersion: version,
        lastModified,
      }),
    });
    this.#store(0, 4, first.response.body);
  }

  async slice(start: number, end = this.byteLength): Promise<ArrayBuffer> {
    checkedRange(start, end, this.byteLength);
    this.#assertActive();
    const cached = this.#cached(start, end);
    if (cached) {
      this.#recordAudit({
        destinationHost: new URL(this.#asset.url).hostname,
        start,
        endExclusive: end,
        attempt: 0,
        network: false,
        status: null,
        bodyBytes: 0,
        headerBytes: 0,
        outcome: "cache_hit",
        errorCode: null,
      });
      return cached;
    }
    const result = await this.#readNetworkRange(start, end, this.identity);
    this.#store(start, end, result.response.body);
    return this.#copy(result.response.body);
  }

  async suffix(length: number): Promise<ArrayBuffer> {
    if (!Number.isSafeInteger(length) || length < 1 || length > this.byteLength) {
      throw overtureFailure("range_invalid", "Overture suffix range is invalid", {
        category: "policy_blocked",
      });
    }
    return this.slice(this.byteLength - length, this.byteLength);
  }

  clearCache(): void {
    for (const entry of this.#cache.values()) entry.bytes.fill(0);
    this.#cache.clear();
    this.#cacheBytes = 0;
  }

  cacheSnapshot(): Readonly<{ entries: number; bytes: number }> {
    return Object.freeze({ entries: this.#cache.size, bytes: this.#cacheBytes });
  }

  #assertActive(): void {
    if (this.#signal.aborted) {
      throw overtureFailure("cancelled", "Overture range source was cancelled", {
        category: "cancelled",
      });
    }
    assertPublicWebCapability(this.#capability, {
      providerId: OVERTURE_PLACES_PROVIDER_ID,
      runId: this.#runId,
      assessmentId: this.#assessmentId,
      operation: "discovery",
    });
    this.#budget.assertActive();
  }

  async #readNetworkRange(
    start: number,
    endExclusive: number,
    expectedIdentity: OvertureAssetIdentity | null,
  ): Promise<{ response: OvertureRangeHttpResponse; range: ReturnType<typeof contentRange> }> {
    checkedRange(start, endExclusive, expectedIdentity?.size);
    let attempt = 0;
    while (true) {
      attempt += 1;
      this.#assertActive();
      const reservation = this.#budget.reserveRequest(
        "asset",
        endExclusive - start + OVERTURE_RANGE_HEADER_OVERHEAD_BYTES,
      );
      let response: OvertureRangeHttpResponse | null = null;
      let reservationReconciled = false;
      try {
        response = await this.#transport.get({
          asset: this.#asset,
          releaseId: this.#release.releaseId,
          start,
          endExclusive,
          expectedStrongEtag: expectedIdentity?.strongEtag,
          signal: this.#signal,
        });
        this.#budget.recordDownload(response.body.length + response.headerBytes, reservation);
        reservationReconciled = true;
        const range = this.#validateResponse(response, start, endExclusive, expectedIdentity);
        this.#recordAudit({
          destinationHost: response.destinationHost,
          start,
          endExclusive,
          attempt,
          network: true,
          status: response.status,
          bodyBytes: response.body.length,
          headerBytes: response.headerBytes,
          outcome: "success",
          errorCode: null,
        });
        return { response, range };
      } catch (error) {
        if (!reservationReconciled) this.#reconcileFailedReservation(reservation, response);
        this.#recordAudit({
          destinationHost: response?.destinationHost ?? new URL(this.#asset.url).hostname,
          start,
          endExclusive,
          attempt,
          network: true,
          status: response?.status ?? null,
          bodyBytes: response?.body.length ?? 0,
          headerBytes: response?.headerBytes ?? 0,
          outcome: "failed",
          errorCode: errorCode(error),
        });
        if (!retryable(error)) throw error;
        this.#budget.recordRetryAttempt();
      }
    }
  }

  #reconcileFailedReservation(
    reservation: OvertureRequestReservation,
    response: OvertureRangeHttpResponse | null,
  ): void {
    if (response) {
      this.#budget.recordDownload(
        Math.min(reservation.maximumBytes, response.body.length + response.headerBytes),
        reservation,
      );
      return;
    }
    // Once a request reaches the transport boundary, conservatively charge the
    // complete reservation when no trustworthy response length is available.
    this.#budget.recordDownload(reservation.maximumBytes, reservation);
  }

  #validateResponse(
    response: OvertureRangeHttpResponse,
    start: number,
    endExclusive: number,
    expectedIdentity: OvertureAssetIdentity | null,
  ): ReturnType<typeof contentRange> {
    if (response.status !== 206) {
      throw overtureFailure("range_status_invalid", "Overture range request did not return 206", {
        category: "schema_validation_failed",
        retryable: response.status === 429 || response.status >= 500,
      });
    }
    const encoding = (headerValue(response.headers, "content-encoding") ?? "identity")
      .trim().toLocaleLowerCase("en-US");
    if (encoding !== "identity" && encoding !== "") {
      throw overtureFailure("range_compressed", "Overture range response used transfer compression", {
        category: "schema_validation_failed",
      });
    }
    if (headerValue(response.headers, "transfer-encoding")) {
      throw overtureFailure("range_transfer_invalid", "Overture range response used unsupported transfer semantics", {
        category: "schema_validation_failed",
      });
    }
    const mediaType = (headerValue(response.headers, "content-type") ?? "")
      .split(";", 1)[0]?.trim().toLocaleLowerCase("en-US");
    if (mediaType === "multipart/byteranges") {
      throw overtureFailure("range_multipart_rejected", "Multipart Overture ranges are forbidden", {
        category: "schema_validation_failed",
      });
    }
    const parsedRange = contentRange(headerValue(response.headers, "content-range"));
    if (parsedRange.start !== start || parsedRange.endExclusive !== endExclusive) {
      throw overtureFailure("content_range_mismatch", "Overture response range differs from the request", {
        category: "schema_validation_failed",
      });
    }
    const expectedLength = endExclusive - start;
    const declaredLength = Number(headerValue(response.headers, "content-length"));
    if (!Number.isSafeInteger(declaredLength) || declaredLength !== expectedLength ||
      response.body.length !== expectedLength) {
      throw overtureFailure("range_length_mismatch", "Overture response length differs from the exact range", {
        category: "schema_validation_failed",
      });
    }
    if (expectedIdentity) {
      const current = {
        size: parsedRange.total,
        strongEtag: strongEtag(response.headers),
        objectVersion: objectVersion(response.headers),
        lastModified: boundedHeader(headerValue(response.headers, "last-modified"), 128),
      };
      if (current.size !== expectedIdentity.size ||
        current.strongEtag !== expectedIdentity.strongEtag ||
        current.objectVersion !== expectedIdentity.objectVersion ||
        current.lastModified !== expectedIdentity.lastModified) {
        this.clearCache();
        throw overtureFailure("asset_identity_changed", "Overture asset identity changed during ranged reads", {
          category: "schema_validation_failed",
        });
      }
    }
    return parsedRange;
  }

  #key(start: number, endExclusive: number): string {
    return `${this.identity.fingerprint}:${start}:${endExclusive}`;
  }

  #cached(start: number, endExclusive: number): ArrayBuffer | null {
    const exact = this.#cache.get(this.#key(start, endExclusive));
    const entry = exact ?? [...this.#cache.values()]
      .filter((candidate) => candidate.identityFingerprint === this.identity.fingerprint &&
        candidate.start <= start && candidate.endExclusive >= endExclusive)
      .sort((left, right) =>
        (left.endExclusive - left.start) - (right.endExclusive - right.start) ||
        left.start - right.start
      )[0];
    if (!entry) return null;
    entry.lastUsed = ++this.#clock;
    const offsetStart = start - entry.start;
    const offsetEnd = endExclusive - entry.start;
    return this.#copy(entry.bytes.subarray(offsetStart, offsetEnd));
  }

  #store(start: number, endExclusive: number, value: Buffer): void {
    if (!this.identity) return;
    const bytes = Buffer.from(value);
    if (bytes.length > this.#maxCacheBytes) {
      throw overtureFailure("range_cache_capacity_exceeded", "Overture range exceeds the bounded cache", {
        category: "budget_blocked",
      });
    }
    const key = this.#key(start, endExclusive);
    const existing = this.#cache.get(key);
    if (existing) {
      this.#cacheBytes -= existing.bytes.length;
      existing.bytes.fill(0);
      this.#cache.delete(key);
    }
    while (this.#cache.size >= this.#maxCacheEntries ||
      this.#cacheBytes + bytes.length > this.#maxCacheBytes) {
      const oldest = [...this.#cache.entries()].sort((left, right) =>
        left[1].lastUsed - right[1].lastUsed || left[0].localeCompare(right[0])
      )[0];
      if (!oldest) break;
      oldest[1].bytes.fill(0);
      this.#cacheBytes -= oldest[1].bytes.length;
      this.#cache.delete(oldest[0]);
    }
    this.#cache.set(key, {
      start,
      endExclusive,
      identityFingerprint: this.identity.fingerprint,
      bytes,
      lastUsed: ++this.#clock,
    });
    this.#cacheBytes += bytes.length;
  }

  #copy(value: Uint8Array): ArrayBuffer {
    const copy = Uint8Array.from(value);
    return copy.buffer;
  }

  #recordAudit(input: Omit<OvertureRangeAuditEvent,
    "providerId" | "runId" | "assessmentId" | "operation" | "releaseId" |
    "assetId" | "sourceVersion" | "at">): void {
    this.#audit.record(Object.freeze({
      providerId: OVERTURE_PLACES_PROVIDER_ID,
      runId: this.#runId,
      assessmentId: this.#assessmentId,
      operation: "discovery",
      releaseId: this.#release.releaseId,
      assetId: this.#asset.assetId,
      sourceVersion: OVERTURE_RANGE_SOURCE_VERSION,
      ...input,
      at: this.#now(),
    }));
  }
}

export async function createCapabilityRangeSource(input: {
  policy: RuntimeLeadPolicy;
  capability: PublicWebCapability;
  runId: string;
  assessmentId: string;
  release: OvertureReleasePin;
  asset: ValidatedOvertureAsset;
  budget: OvertureBudgetTracker;
  signal: AbortSignal;
  transport: OvertureRangeHttpTransport;
  audit?: { record(event: OvertureRangeAuditEvent): void };
  now?: () => string;
  maxCacheEntries?: number;
  maxCacheBytes?: number;
}): Promise<CapabilityRangeSource> {
  assertRuntimeLeadPolicy(input.policy);
  const provider = requireProviderPolicy(input.policy, OVERTURE_PLACES_PROVIDER_ID);
  if (!provider.enabled || provider.sourceClass !== "local_public_dataset" ||
    !provider.requiresNetwork || provider.access !== "official_overture_https_only" ||
    !provider.pinnedReleaseRequired || provider.canIncurCost ||
    !provider.operations.includes("discovery")) {
    throw overtureFailure("query_invalid", "Policy does not authorize Overture range reads", {
      category: "policy_blocked",
    });
  }
  assertPublicWebCapability(input.capability, {
    providerId: OVERTURE_PLACES_PROVIDER_ID,
    runId: input.runId,
    assessmentId: input.assessmentId,
    operation: "discovery",
  });
  assertTrustedOvertureRangeHttpTransport(input.transport);
  const asset = validateOvertureAsset(input.asset);
  const pinned = input.release.assets.find((candidate) => candidate.assetId === asset.assetId);
  if (input.release.releaseId !== asset.releaseId || !pinned ||
    pinned.url !== asset.url || pinned.releaseId !== asset.releaseId) {
    throw overtureFailure("release_changed", "Range source asset is outside the immutable release pin", {
      category: "authorization_failed",
    });
  }
  const maxCacheEntries = input.maxCacheEntries ?? 64;
  const maxCacheBytes = input.maxCacheBytes ?? 32 * 1024 * 1024;
  if (!Number.isSafeInteger(maxCacheEntries) || maxCacheEntries < 1 || maxCacheEntries > 256 ||
    !Number.isSafeInteger(maxCacheBytes) || maxCacheBytes < 4 || maxCacheBytes > 32 * 1024 * 1024) {
    throw new Error("Overture range cache limits are invalid");
  }
  const source = new CapabilityRangeSourceImpl({
    runId: input.runId,
    assessmentId: input.assessmentId,
    release: input.release,
    asset,
    capability: input.capability,
    budget: input.budget,
    signal: input.signal,
    transport: input.transport,
    audit: input.audit ?? { record: () => undefined },
    now: input.now ?? (() => new Date().toISOString()),
    maxCacheEntries,
    maxCacheBytes,
  });
  await source.initialize();
  return source;
}
