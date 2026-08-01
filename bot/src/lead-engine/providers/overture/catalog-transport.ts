import { createHash } from "node:crypto";
import type { PublicWebCapability } from "../../config/network-capability.js";
import { createDirectHttpFetcher } from "../../crawl/fetchers/direct-http.js";
import { DEFAULT_CRAWL_LIMITS } from "../../crawl/policies.js";
import type { DnsResolver } from "../../crawl/types.js";
import { overtureFailure } from "./errors.js";
import { validateOvertureCatalogUrl } from "./asset-validator.js";

export interface OvertureCatalogResponse {
  readonly url: string;
  readonly body: string;
  readonly bytes: number;
  readonly checksum: string;
}

export interface OvertureCatalogTransport {
  get(input: {
    url: string;
    releaseId?: string;
    maximumBytes: number;
    signal: AbortSignal;
  }): Promise<OvertureCatalogResponse>;
}

const trustedTransports = new WeakSet<object>();

function trusted<T extends OvertureCatalogTransport>(transport: T): T {
  trustedTransports.add(transport);
  return transport;
}

export function assertTrustedOvertureCatalogTransport(
  transport: unknown,
): asserts transport is OvertureCatalogTransport {
  if (!transport || typeof transport !== "object" || !trustedTransports.has(transport)) {
    throw overtureFailure("catalog_transport_failed", "Overture catalog transport is not trusted", {
      category: "authorization_failed",
    });
  }
}

export function createOfficialOvertureCatalogTransport(input: {
  capability: PublicWebCapability;
  providerId: string;
  runId: string;
  assessmentId: string;
  maximumBytes: number;
  maximumDurationMs: number;
  resolver?: DnsResolver;
  now?: () => string;
}): OvertureCatalogTransport {
  if (!Number.isSafeInteger(input.maximumBytes) || input.maximumBytes < 1 ||
    input.maximumBytes > 2 * 1024 * 1024) {
    throw new Error("Overture catalog response limit must be between one byte and 2 MiB");
  }
  if (!Number.isSafeInteger(input.maximumDurationMs) || input.maximumDurationMs < 1 ||
    input.maximumDurationMs > 30_000) {
    throw new Error("Overture catalog request duration must be between one millisecond and 30 seconds");
  }
  const fetcher = createDirectHttpFetcher({
    capability: input.capability,
    providerId: input.providerId,
    runId: input.runId,
    assessmentId: input.assessmentId,
    operation: "discovery",
    resolver: input.resolver,
    now: input.now,
    limits: {
      ...DEFAULT_CRAWL_LIMITS,
      maxPages: 1,
      maxSitemapFiles: 0,
      maxSitemapUrls: 0,
      maxRedirects: 0,
      maxRetries: 1,
      maxCompressedBytes: input.maximumBytes,
      maxDecompressedBytes: input.maximumBytes,
      connectionTimeoutMs: input.maximumDurationMs,
      responseTimeoutMs: input.maximumDurationMs,
      crawlDurationMs: input.maximumDurationMs,
    },
  });
  return trusted({
    async get(request) {
      const url = validateOvertureCatalogUrl(request.url, request.releaseId);
      if (request.maximumBytes > input.maximumBytes) {
        throw overtureFailure("catalog_oversized", "Catalog request exceeds its configured response limit", {
          category: "budget_blocked",
        });
      }
      const response = await fetcher.fetch({ url, signal: request.signal });
      if (!response.ok) {
        const retryable = response.retryable && [
          "connection_timeout",
          "response_timeout",
          "connection_failure",
          "rate_limited",
          "server_failure",
        ].includes(response.errorCode);
        throw overtureFailure(
          response.errorCode === "cancelled" ? "cancelled" : "catalog_transport_failed",
          `Official Overture catalog request failed: ${response.errorCode}`,
          {
            category: response.errorCode === "cancelled" ? "cancelled" :
              response.errorCode === "rate_limited" ? "rate_limited" : "unavailable",
            retryable,
          },
        );
      }
      if (response.status !== 200 || response.finalUrl !== url ||
        response.contentType !== "application/json") {
        throw overtureFailure("catalog_transport_failed", "Official Overture catalog response was not an unredirected JSON success", {
          category: "schema_validation_failed",
        });
      }
      const bytes = Buffer.byteLength(response.body, "utf8");
      if (bytes > request.maximumBytes) {
        throw overtureFailure("catalog_oversized", "Official Overture catalog response is too large", {
          category: "budget_blocked",
        });
      }
      return {
        url,
        body: response.body,
        bytes,
        checksum: createHash("sha256").update(response.body).digest("hex"),
      };
    },
  });
}

export function createTestOnlyOvertureCatalogTransport(
  handler: OvertureCatalogTransport["get"],
): OvertureCatalogTransport {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Synthetic Overture catalog transport is available only under NODE_ENV=test");
  }
  return trusted({ get: handler });
}
