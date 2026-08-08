/**
 * Request quota runner for Google Places Text Search.
 *
 * Two independent rails, both fail-closed:
 *
 *   1. a whole-run request ceiling — the runner refuses the request that would
 *      exceed it rather than issuing it and reporting afterwards;
 *   2. a minimum spacing between requests, which is how the 10-requests-per-
 *      minute rate limit is honoured. Spacing is measured from the moment a slot
 *      is granted, so a slow response never lets the next request jump the gap.
 *
 * Retries consume slots exactly like first attempts. A retry is a real request
 * to a real endpoint, so hiding it from the counter would make the reported
 * usage a fiction.
 */

export class RequestQuotaExhaustedError extends Error {
  readonly code = "google_places_request_budget_exhausted" as const;

  constructor(limit: number) {
    super(`Google Places request quota of ${limit} was exhausted`);
    this.name = "RequestQuotaExhaustedError";
  }
}

export interface RequestQuota {
  /** Wait for the next permitted slot and consume it. */
  acquire(signal?: AbortSignal): Promise<void>;
  /** True when at least one slot remains. */
  hasRemaining(): boolean;
  used(): number;
  remaining(): number;
}

export interface RequestQuotaOptions {
  readonly maxRequests: number;
  /** Minimum milliseconds between successive slots. 6000 = 10 per minute. */
  readonly minimumIntervalMs: number;
  readonly now?: () => number;
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new Error("Google Places quota wait was cancelled"));
    };
    if (signal?.aborted) {
      clearTimeout(timer);
      reject(new Error("Google Places quota wait was cancelled"));
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function createRequestQuota(options: RequestQuotaOptions): RequestQuota {
  if (!Number.isSafeInteger(options.maxRequests) || options.maxRequests < 1) {
    throw new Error("Request quota maximum must be a positive integer");
  }
  if (!Number.isSafeInteger(options.minimumIntervalMs) || options.minimumIntervalMs < 0) {
    throw new Error("Request quota interval must be a nonnegative integer");
  }
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  let consumed = 0;
  let nextAllowedAt = 0;

  return {
    hasRemaining: () => consumed < options.maxRequests,
    used: () => consumed,
    remaining: () => Math.max(0, options.maxRequests - consumed),
    async acquire(signal) {
      if (consumed >= options.maxRequests) throw new RequestQuotaExhaustedError(options.maxRequests);
      const waitMs = nextAllowedAt - now();
      if (waitMs > 0) await sleep(waitMs, signal);
      // Re-checked after the wait: a concurrent caller may have taken the last
      // slot while this one was sleeping.
      if (consumed >= options.maxRequests) throw new RequestQuotaExhaustedError(options.maxRequests);
      consumed += 1;
      nextAllowedAt = now() + options.minimumIntervalMs;
    },
  };
}
