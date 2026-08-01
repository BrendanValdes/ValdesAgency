import { createHash } from "node:crypto";
import { isIP } from "node:net";
import {
  brotliDecompressSync,
  gunzipSync,
  inflateSync,
} from "node:zlib";
import { Agent, request as undiciRequest } from "undici";
import { assertPinnedConnection, isBlockedIpAddress, resolveSafeDestination, systemDnsResolver } from "../dns-safety.js";
import {
  DEFAULT_CRAWL_LIMITS,
  PERMITTED_CONTENT_TYPES,
  RESEARCH_CRAWLER_USER_AGENT,
  RETRYABLE_HTTP_STATUSES,
  retryDelayMs,
  validateCrawlLimits,
} from "../policies.js";
import type {
  CrawlLimits,
  DnsResolver,
  FetchErrorCode,
  FetchFailure,
  FetchRequest,
  FetchResult,
  PinnedHttpTransport,
  ResolvedDestination,
  SafeFetcher,
  TransportResponse,
} from "../types.js";
import { normalizeWebUrl, UrlSafetyError } from "../url-safety.js";

class TransportSizeError extends Error {
  readonly code = "compressed_size_exceeded" as const;
}

function headerValue(
  headers: TransportResponse["headers"],
  name: string,
): string | null {
  const value = headers[name.toLocaleLowerCase("en-US")];
  return typeof value === "string" ? value : value?.[0] ?? null;
}

async function readBoundedBody(
  body: AsyncIterable<Uint8Array>,
  maximumBytes: number,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const value of body) {
    const chunk = Buffer.from(value);
    length += chunk.length;
    if (length > maximumBytes) throw new TransportSizeError("Compressed response is too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, length);
}

const productionTransport: PinnedHttpTransport = {
  async request(input) {
    const selected = input.destination.selected;
    const dispatcher = new Agent({
      connect: {
        timeout: input.connectionTimeoutMs,
        lookup(_hostname, _options, callback) {
          callback(null, selected.address, selected.family);
        },
      },
    });
    try {
      const response = await undiciRequest(input.url, {
        method: "GET",
        headers: input.headers,
        dispatcher,
        maxRedirections: 0,
        signal: input.signal,
        headersTimeout: input.responseTimeoutMs,
        bodyTimeout: input.responseTimeoutMs,
      });
      const compressedBody = await readBoundedBody(response.body, input.maxCompressedBytes);
      return {
        status: response.statusCode,
        headers: response.headers,
        compressedBody,
        // The custom lookup above pins the connection to this validated address.
        connectedAddress: selected.address,
      };
    } finally {
      await dispatcher.close();
    }
  },
};

function contentType(headers: TransportResponse["headers"]): string {
  return (headerValue(headers, "content-type") ?? "")
    .split(";", 1)[0]
    ?.trim()
    .toLocaleLowerCase("en-US") ?? "";
}

function decompress(response: TransportResponse, maximumBytes: number): Buffer {
  const encoding = (headerValue(response.headers, "content-encoding") ?? "identity")
    .trim()
    .toLocaleLowerCase("en-US");
  let result: Buffer;
  try {
    if (encoding === "identity" || encoding === "") result = response.compressedBody;
    else if (encoding === "gzip" || encoding === "x-gzip") {
      result = gunzipSync(response.compressedBody, { maxOutputLength: maximumBytes });
    } else if (encoding === "deflate") {
      result = inflateSync(response.compressedBody, { maxOutputLength: maximumBytes });
    } else if (encoding === "br") {
      result = brotliDecompressSync(response.compressedBody, { maxOutputLength: maximumBytes });
    } else {
      throw new Error("Unsupported content encoding");
    }
  } catch (error) {
    if ((error as { code?: string }).code === "ERR_BUFFER_TOO_LARGE") {
      throw Object.assign(new Error("Decompressed response is too large"), {
        fetchCode: "decompressed_size_exceeded" as const,
      });
    }
    throw error;
  }
  if (result.length > maximumBytes) {
    throw Object.assign(new Error("Decompressed response is too large"), {
      fetchCode: "decompressed_size_exceeded" as const,
    });
  }
  return result;
}

function asFailure(input: {
  requestedUrl: string;
  finalUrl?: string | null;
  code: FetchErrorCode;
  retryable?: boolean;
  attempts: number;
  redirects: FetchFailure["redirectHistory"];
  now: () => string;
  status?: number | null;
}): FetchFailure {
  return {
    ok: false,
    requestedUrl: input.requestedUrl,
    finalUrl: input.finalUrl ?? null,
    errorCode: input.code,
    retryable: input.retryable ?? false,
    attempts: input.attempts,
    redirectHistory: input.redirects,
    fetchedAt: input.now(),
    httpStatus: input.status ?? null,
  };
}

function errorCode(error: unknown, signal?: AbortSignal): FetchErrorCode {
  if (signal?.aborted) return "cancelled";
  if (error instanceof TransportSizeError) return error.code;
  const explicit = (error as { fetchCode?: FetchErrorCode }).fetchCode;
  if (explicit) return explicit;
  const code = (error as { code?: string; cause?: { code?: string } }).code ??
    (error as { cause?: { code?: string } }).cause?.code ?? "";
  if (code === "UND_ERR_CONNECT_TIMEOUT") return "connection_timeout";
  if (code === "UND_ERR_HEADERS_TIMEOUT" || code === "UND_ERR_BODY_TIMEOUT") return "response_timeout";
  return "connection_failure";
}

function isRetryableError(code: FetchErrorCode): boolean {
  return ["connection_timeout", "response_timeout", "connection_failure"].includes(code);
}

async function cancellableDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (milliseconds <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    const cancel = () => {
      clearTimeout(timer);
      reject(Object.assign(new Error("Cancelled"), { name: "AbortError" }));
    };
    if (signal?.aborted) cancel();
    else signal?.addEventListener("abort", cancel, { once: true });
  });
}

interface InternalFetcherOptions {
  limits: CrawlLimits;
  resolver: DnsResolver;
  transport: PinnedHttpTransport;
  now: () => string;
  random: () => number;
  allowTestOrigin: URL | null;
}

class BoundedDirectHttpFetcher implements SafeFetcher {
  readonly #options: InternalFetcherOptions;

  constructor(options: InternalFetcherOptions) {
    this.#options = options;
  }

  async #destination(url: URL): Promise<ResolvedDestination> {
    const hostname = url.hostname.startsWith("[") && url.hostname.endsWith("]")
      ? url.hostname.slice(1, -1)
      : url.hostname;
    if (this.#options.allowTestOrigin) {
      if (url.origin !== this.#options.allowTestOrigin.origin) {
        throw Object.assign(new Error("Test transport is restricted to one local origin"), {
          fetchCode: "destination_blocked" as const,
        });
      }
      return {
        hostname,
        addresses: [{ address: hostname, family: isIP(hostname) as 4 | 6 }],
        selected: { address: hostname, family: isIP(hostname) as 4 | 6 },
      };
    }
    try {
      return await resolveSafeDestination(hostname, this.#options.resolver);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      throw Object.assign(new Error("Destination DNS policy rejected the request"), {
        fetchCode: (/blocked|malformed/i.test(message) ? "destination_blocked" : "dns_failure") as FetchErrorCode,
      });
    }
  }

  async fetch(request: FetchRequest): Promise<FetchResult> {
    const requestedInput = request.url;
    const allowedPorts = this.#options.allowTestOrigin
      ? new Set([Number(this.#options.allowTestOrigin.port)])
      : undefined;
    let requestedUrl: string;
    try {
      requestedUrl = normalizeWebUrl(requestedInput, { allowedPorts });
    } catch (error) {
      const code = error instanceof UrlSafetyError ? error.code : "invalid_url";
      return asFailure({ requestedUrl: requestedInput, code, attempts: 0, redirects: [], now: this.#options.now });
    }

    let lastFailure: FetchFailure | null = null;
    for (let attempt = 1; attempt <= this.#options.limits.maxRetries; attempt += 1) {
      const redirects: Array<{ fromUrl: string; toUrl: string; status: number }> = [];
      const visited = new Set<string>();
      let current = requestedUrl;
      let retryAfter: string | null = null;
      try {
        while (true) {
          if (request.signal?.aborted) {
            return asFailure({ requestedUrl, finalUrl: current, code: "cancelled", attempts: attempt, redirects, now: this.#options.now });
          }
          if (visited.has(current)) {
            return asFailure({ requestedUrl, finalUrl: current, code: "redirect_loop", attempts: attempt, redirects, now: this.#options.now });
          }
          visited.add(current);
          const currentUrl = new URL(current);
          const destination = await this.#destination(currentUrl);
          const headers: Record<string, string> = {
            "user-agent": RESEARCH_CRAWLER_USER_AGENT,
            accept: "text/html,application/xhtml+xml,text/plain,application/xml,text/xml,application/json;q=0.8,*/*;q=0.1",
            "accept-encoding": "gzip, deflate, br",
            connection: "close",
          };
          if (request.ifNoneMatch) headers["if-none-match"] = request.ifNoneMatch;
          if (request.ifModifiedSince) headers["if-modified-since"] = request.ifModifiedSince;
          const response = await this.#options.transport.request({
            url: currentUrl,
            destination,
            headers,
            signal: request.signal,
            connectionTimeoutMs: this.#options.limits.connectionTimeoutMs,
            responseTimeoutMs: this.#options.limits.responseTimeoutMs,
            maxCompressedBytes: this.#options.limits.maxCompressedBytes,
          });
          if (!this.#options.allowTestOrigin) {
            try {
              assertPinnedConnection(destination, response.connectedAddress);
            } catch {
              return asFailure({ requestedUrl, finalUrl: current, code: "dns_rebinding", attempts: attempt, redirects, now: this.#options.now, status: response.status });
            }
          }

          if ([301, 302, 303, 307, 308].includes(response.status)) {
            const location = headerValue(response.headers, "location");
            if (!location) {
              return asFailure({ requestedUrl, finalUrl: current, code: "redirect_invalid", attempts: attempt, redirects, now: this.#options.now, status: response.status });
            }
            if (redirects.length >= this.#options.limits.maxRedirects) {
              return asFailure({ requestedUrl, finalUrl: current, code: "redirect_limit", attempts: attempt, redirects, now: this.#options.now, status: response.status });
            }
            let next: string;
            try {
              const redirectTarget = new URL(location, current);
              if (this.#options.allowTestOrigin && redirectTarget.origin !== this.#options.allowTestOrigin.origin) {
                return asFailure({ requestedUrl, finalUrl: current, code: "destination_blocked", attempts: attempt, redirects, now: this.#options.now, status: response.status });
              }
              next = normalizeWebUrl(redirectTarget, { allowedPorts });
            } catch {
              return asFailure({ requestedUrl, finalUrl: current, code: "redirect_invalid", attempts: attempt, redirects, now: this.#options.now, status: response.status });
            }
            redirects.push({ fromUrl: current, toUrl: next, status: response.status });
            current = next;
            continue;
          }

          if (response.status === 401 || response.status === 403 || response.status === 407) {
            return asFailure({ requestedUrl, finalUrl: current, code: "authentication_required", attempts: attempt, redirects, now: this.#options.now, status: response.status });
          }
          if (RETRYABLE_HTTP_STATUSES.has(response.status)) {
            retryAfter = headerValue(response.headers, "retry-after");
            lastFailure = asFailure({
              requestedUrl,
              finalUrl: current,
              code: response.status === 429 ? "rate_limited" : "server_failure",
              retryable: true,
              attempts: attempt,
              redirects,
              now: this.#options.now,
              status: response.status,
            });
            break;
          }

          const mediaType = contentType(response.headers);
          if (!PERMITTED_CONTENT_TYPES.has(mediaType)) {
            return asFailure({ requestedUrl, finalUrl: current, code: "unsupported_content_type", attempts: attempt, redirects, now: this.#options.now, status: response.status });
          }
          const decompressed = decompress(response, this.#options.limits.maxDecompressedBytes);
          const fetchedAt = this.#options.now();
          return {
            ok: true,
            requestedUrl,
            finalUrl: current,
            status: response.status,
            contentType: mediaType,
            body: decompressed.toString("utf8"),
            compressedBytes: response.compressedBody.length,
            decompressedBytes: decompressed.length,
            contentChecksum: createHash("sha256").update(decompressed).digest("hex"),
            etag: headerValue(response.headers, "etag"),
            lastModified: headerValue(response.headers, "last-modified"),
            redirectHistory: redirects,
            fetchedAt,
            attempts: attempt,
          };
        }
      } catch (error) {
        const code = errorCode(error, request.signal);
        lastFailure = asFailure({
          requestedUrl,
          finalUrl: current,
          code,
          retryable: isRetryableError(code),
          attempts: attempt,
          redirects,
          now: this.#options.now,
        });
      }
      if (!lastFailure.retryable || attempt >= this.#options.limits.maxRetries) return lastFailure;
      try {
        await cancellableDelay(retryDelayMs(attempt, retryAfter, Date.now(), this.#options.random), request.signal);
      } catch {
        return asFailure({ requestedUrl, code: "cancelled", attempts: attempt, redirects: lastFailure.redirectHistory, now: this.#options.now });
      }
    }
    return lastFailure ?? asFailure({ requestedUrl, code: "connection_failure", attempts: 0, redirects: [], now: this.#options.now });
  }
}

export function createDirectHttpFetcher(
  options: {
    limits?: CrawlLimits;
    resolver?: DnsResolver;
    now?: () => string;
    random?: () => number;
  } = {},
): SafeFetcher {
  return new BoundedDirectHttpFetcher({
    limits: validateCrawlLimits(options.limits ?? DEFAULT_CRAWL_LIMITS),
    resolver: options.resolver ?? systemDnsResolver,
    transport: productionTransport,
    now: options.now ?? (() => new Date().toISOString()),
    random: options.random ?? Math.random,
    allowTestOrigin: null,
  });
}

/**
 * Explicit test boundary for a single loopback origin. It cannot be enabled by
 * LeadEngineConfig (whose networkMode remains the literal `disabled`) and it
 * refuses to construct outside NODE_ENV=test. Production URL/DNS policy is
 * never relaxed by createDirectHttpFetcher.
 */
export function createTestOnlyDirectHttpFetcher(options: {
  allowedOrigin: string;
  limits?: CrawlLimits;
  now?: () => string;
  random?: () => number;
}): SafeFetcher {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("The local-server transport is available only under NODE_ENV=test");
  }
  const origin = new URL(options.allowedOrigin);
  const hostname = origin.hostname.startsWith("[") && origin.hostname.endsWith("]") ? origin.hostname.slice(1, -1) : origin.hostname;
  if (origin.protocol !== "http:" || isIP(hostname) === 0 || !isBlockedIpAddress(hostname) || !origin.port) {
    throw new Error("Test transport requires an explicit loopback HTTP origin and port");
  }
  return new BoundedDirectHttpFetcher({
    limits: validateCrawlLimits(options.limits ?? DEFAULT_CRAWL_LIMITS),
    resolver: systemDnsResolver,
    transport: productionTransport,
    now: options.now ?? (() => new Date().toISOString()),
    random: options.random ?? (() => 0.5),
    allowTestOrigin: origin,
  });
}
