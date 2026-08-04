import {
  NetworkPolicyAuthorizer,
  reservePublicWebRequest,
  type PublicWebCapability,
} from "../../config/network-capability.js";
import type { RuntimeLeadPolicy } from "../../config/lead-policy.js";
import type { BoundingArea } from "../../geography/types.js";
import { createRequestQuota, type RequestQuota } from "./quota.js";
import {
  GOOGLE_PLACES_FIELD_MASK,
  GOOGLE_PLACES_HOST,
  GOOGLE_PLACES_MAX_PAGE_SIZE,
  GOOGLE_PLACES_PROVIDER_ID,
  GOOGLE_PLACES_TEXT_SEARCH_URL,
  type GooglePlaceObservation,
  type GoogleTextSearchPage,
} from "./types.js";

/**
 * Bounded Google Places Text Search session.
 *
 * Everything that can bite is a rail rather than a convention:
 *
 *   - the field mask is fixed, so the response cannot carry a Google phone,
 *     address, category, rating, or business status;
 *   - every request is authorized against a policy capability and reserves its
 *     bytes before it is issued;
 *   - the quota runner enforces both the per-minute spacing and the run cap;
 *   - retries are bounded, counted, and only attempted for transport-level or
 *     retryable-status failures;
 *   - the API key is read from the environment by the caller and never logged,
 *     never persisted, and never included in an error message.
 *
 * The session leases capabilities in slices so a long run stays inside the
 * policy's capability TTL without ever exceeding the provider's total budget:
 * each renewal draws from the same authorizer, which decrements the one shared
 * provider budget.
 */

export class GooglePlacesTransportError extends Error {
  readonly code: string;
  readonly status: number | null;

  constructor(code: string, status: number | null = null) {
    super(`Google Places Text Search failed: ${code}`);
    this.name = "GooglePlacesTransportError";
    this.code = code;
    this.status = status;
  }
}

export interface GoogleTextSearchRequest {
  readonly textQuery: string;
  readonly rectangle: BoundingArea;
  readonly pageToken?: string | null;
  readonly signal?: AbortSignal;
}

export interface GooglePlacesUsage {
  readonly requests: number;
  readonly retries: number;
  readonly downloadedBytes: number;
  readonly remainingRequests: number;
  readonly failures: Readonly<Record<string, number>>;
}

export interface GooglePlacesSession {
  searchText(request: GoogleTextSearchRequest): Promise<GoogleTextSearchPage>;
  usage(): GooglePlacesUsage;
  hasRequestBudget(): boolean;
}

export interface GooglePlacesSessionOptions {
  readonly policy: RuntimeLeadPolicy;
  readonly apiKey: string;
  readonly runId: string;
  readonly scopeId: string;
  readonly maxRequests: number;
  /** 6000 ms honours the 10-requests-per-minute limit. */
  readonly minimumIntervalMs: number;
  readonly maxBytesPerRequest: number;
  readonly maxRequestDurationMs: number;
  readonly capabilityTtlMs: number;
  /** Requests drawn per capability lease. Bounded by the run budget. */
  readonly requestsPerLease: number;
  readonly maxRetriesPerRequest: number;
  readonly now?: () => number;
  readonly quota?: RequestQuota;
  readonly fetchImpl?: typeof fetch;
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parse exactly the three permitted fields. Any other key Google might return is
 * ignored here rather than carried forward, so an upstream field-mask mistake
 * cannot leak a Google fact into the pipeline.
 */
export function parseTextSearchPayload(
  payload: unknown,
  downloadedBytes: number,
): GoogleTextSearchPage {
  if (!isRecord(payload)) throw new GooglePlacesTransportError("response_not_an_object");
  if (isRecord(payload.error)) {
    const status = typeof payload.error.code === "number" ? payload.error.code : null;
    throw new GooglePlacesTransportError("api_error_response", status);
  }
  const rawPlaces = Array.isArray(payload.places) ? payload.places : [];
  const places: GooglePlaceObservation[] = [];
  for (const entry of rawPlaces) {
    if (!isRecord(entry)) continue;
    const placeId = typeof entry.id === "string" ? entry.id.trim() : "";
    if (!placeId) continue;
    const websiteUri = typeof entry.websiteUri === "string" && entry.websiteUri.trim()
      ? entry.websiteUri.trim() : null;
    const displayName = isRecord(entry.displayName) && typeof entry.displayName.text === "string"
      && entry.displayName.text.trim() ? entry.displayName.text.trim() : null;
    places.push(Object.freeze({ placeId, websiteUri, displayName }));
  }
  const nextPageToken = typeof payload.nextPageToken === "string" && payload.nextPageToken.trim()
    ? payload.nextPageToken.trim() : null;
  return Object.freeze({
    places: Object.freeze(places),
    nextPageToken,
    downloadedBytes,
  });
}

export function createGooglePlacesSession(
  options: GooglePlacesSessionOptions,
): GooglePlacesSession {
  if (!options.apiKey.trim()) throw new Error("Google Places session requires an API key");
  if (!Number.isSafeInteger(options.requestsPerLease) || options.requestsPerLease < 1) {
    throw new Error("Google Places lease size must be a positive integer");
  }
  if (!Number.isSafeInteger(options.maxRetriesPerRequest) ||
    options.maxRetriesPerRequest < 0 || options.maxRetriesPerRequest > 3) {
    throw new Error("Google Places retry ceiling must be between 0 and 3");
  }
  const now = options.now ?? Date.now;
  const doFetch = options.fetchImpl ?? fetch;
  const authorizer = new NetworkPolicyAuthorizer(options.policy, { now });
  const quota = options.quota ?? createRequestQuota({
    maxRequests: options.maxRequests,
    minimumIntervalMs: options.minimumIntervalMs,
    now,
  });

  let leaseIndex = 0;
  let leasedRequestsRemaining = 0;
  let capability: PublicWebCapability | null = null;
  let capabilityExpiresAtMs = 0;
  let issuedRequests = 0;
  let retries = 0;
  let downloadedBytes = 0;
  const failures: Record<string, number> = {};

  const binding = () => ({
    providerId: GOOGLE_PLACES_PROVIDER_ID,
    runId: options.runId,
    assessmentId: `${options.scopeId}-${leaseIndex}`,
    operation: "discovery" as const,
  });

  /**
   * Issue or renew the capability. A lease is renewed when its requests are
   * spent or when it is within one request-duration of expiry, so a request is
   * never started against a capability that could expire mid-flight.
   */
  const ensureCapability = (): PublicWebCapability => {
    const expiringSoon = now() + options.maxRequestDurationMs >= capabilityExpiresAtMs;
    if (capability !== null && leasedRequestsRemaining > 0 && !expiringSoon) return capability;
    const remaining = quota.remaining();
    if (remaining <= 0) throw new GooglePlacesTransportError("request_budget_exhausted");
    if (capability !== null) authorizer.revoke(capability);
    leaseIndex += 1;
    const leaseSize = Math.min(options.requestsPerLease, remaining);
    const issued = authorizer.issuePublicWebCapability({
      providerId: GOOGLE_PLACES_PROVIDER_ID,
      runId: options.runId,
      assessmentId: `${options.scopeId}-${leaseIndex}`,
      operation: "discovery",
      maxRequests: leaseSize,
      maxBytes: leaseSize * options.maxBytesPerRequest,
      maxBytesPerRequest: options.maxBytesPerRequest,
      maxRequestDurationMs: options.maxRequestDurationMs,
      costBudgetMicroUsd: 0,
      ttlMs: options.capabilityTtlMs,
    });
    capability = issued;
    capabilityExpiresAtMs = Date.parse(issued.expiresAt);
    leasedRequestsRemaining = leaseSize;
    return issued;
  };

  const recordFailure = (code: string): void => {
    failures[code] = (failures[code] ?? 0) + 1;
  };

  async function attempt(request: GoogleTextSearchRequest): Promise<GoogleTextSearchPage> {
    const active = ensureCapability();
    // Reserve capability budget before the request leaves the process, so a
    // response that never arrives still costs what it actually cost.
    reservePublicWebRequest(active, binding(), { bytes: options.maxBytesPerRequest });
    leasedRequestsRemaining -= 1;
    await quota.acquire(request.signal);
    issuedRequests += 1;

    const body: Record<string, unknown> = {
      textQuery: request.textQuery,
      pageSize: GOOGLE_PLACES_MAX_PAGE_SIZE,
      // A REQUEST parameter, not a field-mask entry: it widens which businesses
      // the endpoint will return, not which facts come back about them. Pool
      // contractors are frequently pure service-area businesses with no
      // storefront address, so excluding them would drop a large part of the
      // actual ICP. The response still carries only the three masked fields.
      includePureServiceAreaBusinesses: true,
      locationRestriction: {
        rectangle: {
          low: { latitude: request.rectangle.south, longitude: request.rectangle.west },
          high: { latitude: request.rectangle.north, longitude: request.rectangle.east },
        },
      },
    };
    if (request.pageToken) body.pageToken = request.pageToken;

    const timeout = AbortSignal.timeout(options.maxRequestDurationMs);
    const signal = request.signal
      ? AbortSignal.any([timeout, request.signal])
      : timeout;

    let response: Response;
    try {
      response = await doFetch(GOOGLE_PLACES_TEXT_SEARCH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": options.apiKey,
          "X-Goog-FieldMask": GOOGLE_PLACES_FIELD_MASK,
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch {
      // The message is discarded on purpose: a transport error can echo the URL
      // and headers, and the headers hold the API key.
      throw new GooglePlacesTransportError("transport_failed");
    }

    const url = new URL(response.url || GOOGLE_PLACES_TEXT_SEARCH_URL);
    if (url.hostname !== GOOGLE_PLACES_HOST || url.protocol !== "https:") {
      throw new GooglePlacesTransportError("unexpected_response_origin", response.status);
    }
    const declared = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > options.maxBytesPerRequest) {
      throw new GooglePlacesTransportError("response_too_large", response.status);
    }
    const text = await response.text();
    const bytes = Buffer.byteLength(text, "utf8");
    downloadedBytes += bytes;
    if (bytes > options.maxBytesPerRequest) {
      throw new GooglePlacesTransportError("response_too_large", response.status);
    }
    if (!response.ok) {
      throw new GooglePlacesTransportError(
        RETRYABLE_STATUS.has(response.status) ? "retryable_status" : "rejected_status",
        response.status,
      );
    }
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new GooglePlacesTransportError("response_not_json", response.status);
    }
    return parseTextSearchPayload(payload, bytes);
  }

  return {
    hasRequestBudget: () => quota.hasRemaining(),
    usage: () => Object.freeze({
      requests: issuedRequests,
      retries,
      downloadedBytes,
      remainingRequests: quota.remaining(),
      failures: Object.freeze({ ...failures }),
    }),
    async searchText(request) {
      let lastError: unknown = null;
      for (let attemptIndex = 0; attemptIndex <= options.maxRetriesPerRequest; attemptIndex += 1) {
        if (attemptIndex > 0) retries += 1;
        try {
          return await attempt(request);
        } catch (error) {
          lastError = error;
          const code = error instanceof GooglePlacesTransportError ? error.code : "unknown_error";
          recordFailure(code);
          const retryable = error instanceof GooglePlacesTransportError &&
            (error.code === "transport_failed" || error.code === "retryable_status");
          if (!retryable || !quota.hasRemaining()) break;
        }
      }
      throw lastError instanceof Error
        ? lastError
        : new GooglePlacesTransportError("unknown_error");
    },
  };
}
