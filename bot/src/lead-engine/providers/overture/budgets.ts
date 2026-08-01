import { overtureFailure } from "./errors.js";

export interface OvertureBudgetLimits {
  readonly maxStacRequests: number;
  readonly maxAssetRequests: number;
  readonly maxDownloadedBytes: number;
  readonly maxProcessedBytes: number;
  readonly maxRowsRead: number;
  readonly maxCandidates: number;
  readonly maxAreaSquareKm: number;
  readonly maxRuntimeMs: number;
  readonly maxRetryAttempts: number;
  readonly maxCostMicroUsd: 0;
}

export interface OvertureBudgetUsage {
  readonly stacRequests: number;
  readonly assetRequests: number;
  readonly reservedDownloadedBytes: number;
  readonly downloadedBytes: number;
  readonly processedBytes: number;
  readonly rowsRead: number;
  readonly candidates: number;
  readonly retryAttempts: number;
  readonly costMicroUsd: 0;
}

export interface OvertureBudgetSnapshot {
  readonly allowed: OvertureBudgetLimits;
  readonly consumed: OvertureBudgetUsage;
  readonly remaining: OvertureBudgetLimits;
  readonly elapsedMs: number;
}

const OVERTURE_BUDGET_USAGE_KEYS = Object.freeze([
  "stacRequests",
  "assetRequests",
  "reservedDownloadedBytes",
  "downloadedBytes",
  "processedBytes",
  "rowsRead",
  "candidates",
  "retryAttempts",
  "costMicroUsd",
] as const);

export const OVERTURE_CANARY_HARD_LIMITS: OvertureBudgetLimits = Object.freeze({
  maxStacRequests: 4,
  maxAssetRequests: 8,
  maxDownloadedBytes: 32 * 1024 * 1024,
  maxProcessedBytes: 64 * 1024 * 1024,
  maxRowsRead: 100,
  maxCandidates: 25,
  maxAreaSquareKm: 25,
  maxRuntimeMs: 60_000,
  maxRetryAttempts: 2,
  maxCostMicroUsd: 0,
});

function boundedInteger(name: string, value: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new Error(`${name} must be a nonnegative integer no greater than ${maximum}`);
  }
  return value;
}

function validateLimits(limits: OvertureBudgetLimits): OvertureBudgetLimits {
  boundedInteger("STAC request budget", limits.maxStacRequests, 8);
  boundedInteger("asset request budget", limits.maxAssetRequests, 32);
  boundedInteger("download byte budget", limits.maxDownloadedBytes, 256 * 1024 * 1024);
  boundedInteger("processed byte budget", limits.maxProcessedBytes, 512 * 1024 * 1024);
  boundedInteger("row budget", limits.maxRowsRead, 10_000);
  boundedInteger("candidate budget", limits.maxCandidates, 1_000);
  boundedInteger("runtime budget", limits.maxRuntimeMs, 120_000);
  boundedInteger("retry budget", limits.maxRetryAttempts, 5);
  if (!Number.isFinite(limits.maxAreaSquareKm) || limits.maxAreaSquareKm <= 0 ||
    limits.maxAreaSquareKm > 100) {
    throw new Error("Geographic area budget must be greater than zero and no greater than 100 km²");
  }
  if (limits.maxCostMicroUsd !== 0) throw new Error("Overture monetary budget must remain zero");
  return Object.freeze({ ...limits });
}

function validateUsage(usage: OvertureBudgetUsage): OvertureBudgetUsage {
  const keys = Object.keys(usage).sort();
  if (keys.join("\u0000") !== [...OVERTURE_BUDGET_USAGE_KEYS].sort().join("\u0000")) {
    throw new Error("Persisted Overture budget usage has an invalid shape");
  }
  for (const name of OVERTURE_BUDGET_USAGE_KEYS) {
    const value = usage[name];
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`Persisted Overture budget usage ${name} is invalid`);
    }
  }
  if (usage.costMicroUsd !== 0) throw new Error("Persisted Overture cost must remain zero");
  if (usage.downloadedBytes > usage.reservedDownloadedBytes) {
    throw new Error("Downloaded bytes cannot exceed conservative byte reservations");
  }
  return Object.freeze({ ...usage });
}

function emptyUsage(): OvertureBudgetUsage {
  return {
    stacRequests: 0,
    assetRequests: 0,
    reservedDownloadedBytes: 0,
    downloadedBytes: 0,
    processedBytes: 0,
    rowsRead: 0,
    candidates: 0,
    retryAttempts: 0,
    costMicroUsd: 0,
  };
}

export class OvertureBudgetTracker {
  readonly #limits: OvertureBudgetLimits;
  readonly #startedAtMs: number;
  readonly #now: () => number;
  readonly #onChange: (snapshot: OvertureBudgetSnapshot) => void;
  #usage: OvertureBudgetUsage;

  constructor(input: {
    limits: OvertureBudgetLimits;
    initialUsage?: OvertureBudgetUsage;
    startedAtMs?: number;
    now?: () => number;
    onChange?: (snapshot: OvertureBudgetSnapshot) => void;
  }) {
    this.#limits = validateLimits(input.limits);
    this.#now = input.now ?? Date.now;
    this.#startedAtMs = input.startedAtMs ?? this.#now();
    this.#usage = validateUsage(input.initialUsage ?? emptyUsage());
    this.#onChange = input.onChange ?? (() => undefined);
    this.#assertWithinLimits();
  }

  #blocked(reason: string): never {
    throw overtureFailure("budget_exhausted", reason, { category: "budget_blocked" });
  }

  #assertRuntime(): void {
    if (this.#now() - this.#startedAtMs >= this.#limits.maxRuntimeMs) {
      this.#blocked("Overture runtime budget is exhausted");
    }
  }

  #assertWithinLimits(): void {
    const usage = this.#usage;
    if (usage.stacRequests > this.#limits.maxStacRequests ||
      usage.assetRequests > this.#limits.maxAssetRequests ||
      usage.reservedDownloadedBytes > this.#limits.maxDownloadedBytes ||
      usage.processedBytes > this.#limits.maxProcessedBytes ||
      usage.rowsRead > this.#limits.maxRowsRead ||
      usage.candidates > this.#limits.maxCandidates ||
      usage.retryAttempts > this.#limits.maxRetryAttempts) {
      this.#blocked("Persisted Overture usage already exceeds the configured budget");
    }
  }

  #changed(): void {
    this.#assertWithinLimits();
    this.#onChange(this.snapshot());
  }

  reserveRequest(kind: "stac" | "asset", maximumBytes: number): void {
    this.#assertRuntime();
    boundedInteger("request byte reservation", maximumBytes, this.#limits.maxDownloadedBytes);
    const requestKey = kind === "stac" ? "stacRequests" : "assetRequests";
    const maximum = kind === "stac" ? this.#limits.maxStacRequests : this.#limits.maxAssetRequests;
    if (this.#usage[requestKey] >= maximum) this.#blocked(`${kind} request budget is exhausted`);
    if (this.#usage.reservedDownloadedBytes + maximumBytes > this.#limits.maxDownloadedBytes) {
      this.#blocked("Overture download byte budget is exhausted");
    }
    this.#usage = {
      ...this.#usage,
      [requestKey]: this.#usage[requestKey] + 1,
      reservedDownloadedBytes: this.#usage.reservedDownloadedBytes + maximumBytes,
    };
    this.#changed();
  }

  recordDownload(actualBytes: number): void {
    boundedInteger("downloaded bytes", actualBytes, this.#limits.maxDownloadedBytes);
    if (this.#usage.downloadedBytes + actualBytes > this.#usage.reservedDownloadedBytes) {
      this.#blocked("Actual Overture bytes exceed their request reservations");
    }
    this.#usage = { ...this.#usage, downloadedBytes: this.#usage.downloadedBytes + actualBytes };
    this.#changed();
  }

  recordProcessing(input: { bytes: number; rows: number }): void {
    this.#assertRuntime();
    boundedInteger("processed bytes", input.bytes, this.#limits.maxProcessedBytes);
    boundedInteger("rows read", input.rows, this.#limits.maxRowsRead);
    if (this.#usage.processedBytes + input.bytes > this.#limits.maxProcessedBytes) {
      this.#blocked("Overture processed-byte budget is exhausted");
    }
    if (this.#usage.rowsRead + input.rows > this.#limits.maxRowsRead) {
      this.#blocked("Overture row budget is exhausted");
    }
    this.#usage = {
      ...this.#usage,
      processedBytes: this.#usage.processedBytes + input.bytes,
      rowsRead: this.#usage.rowsRead + input.rows,
    };
    this.#changed();
  }

  recordCandidates(count: number): void {
    boundedInteger("candidate count", count, this.#limits.maxCandidates);
    if (this.#usage.candidates + count > this.#limits.maxCandidates) {
      this.#blocked("Overture candidate budget is exhausted");
    }
    this.#usage = { ...this.#usage, candidates: this.#usage.candidates + count };
    this.#changed();
  }

  recordRetryAttempt(): void {
    this.#assertRuntime();
    if (this.#usage.retryAttempts >= this.#limits.maxRetryAttempts) {
      this.#blocked("Overture retry budget is exhausted");
    }
    this.#usage = { ...this.#usage, retryAttempts: this.#usage.retryAttempts + 1 };
    this.#changed();
  }

  assertArea(areaSquareKm: number): void {
    if (!Number.isFinite(areaSquareKm) || areaSquareKm <= 0 ||
      areaSquareKm > this.#limits.maxAreaSquareKm) {
      this.#blocked("Overture geographic-area budget is exhausted");
    }
  }

  assertActive(): void {
    this.#assertRuntime();
    this.#assertWithinLimits();
  }

  snapshot(): OvertureBudgetSnapshot {
    const elapsedMs = Math.max(0, this.#now() - this.#startedAtMs);
    return {
      allowed: this.#limits,
      consumed: { ...this.#usage },
      remaining: {
        maxStacRequests: Math.max(0, this.#limits.maxStacRequests - this.#usage.stacRequests),
        maxAssetRequests: Math.max(0, this.#limits.maxAssetRequests - this.#usage.assetRequests),
        maxDownloadedBytes: Math.max(0, this.#limits.maxDownloadedBytes - this.#usage.reservedDownloadedBytes),
        maxProcessedBytes: Math.max(0, this.#limits.maxProcessedBytes - this.#usage.processedBytes),
        maxRowsRead: Math.max(0, this.#limits.maxRowsRead - this.#usage.rowsRead),
        maxCandidates: Math.max(0, this.#limits.maxCandidates - this.#usage.candidates),
        maxAreaSquareKm: this.#limits.maxAreaSquareKm,
        maxRuntimeMs: Math.max(0, this.#limits.maxRuntimeMs - elapsedMs),
        maxRetryAttempts: Math.max(0, this.#limits.maxRetryAttempts - this.#usage.retryAttempts),
        maxCostMicroUsd: 0,
      },
      elapsedMs,
    };
  }
}
