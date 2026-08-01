import { OfflineClassifiedFailure } from "./errors.js";
import type { OfflineDurableStage, OfflineRetryClassification, OfflineRetryPolicy } from "./types.js";

const DEFAULT_POLICY: OfflineRetryPolicy = {
  maximumAttempts: 3,
  initialDelayMs: 1_000,
  maximumDelayMs: 30_000,
  multiplier: 2,
  jitter: () => 0,
};

export function boundedRetryPolicy(
  overrides: Partial<Omit<OfflineRetryPolicy, "jitter">> & { jitter?: OfflineRetryPolicy["jitter"] } = {},
): OfflineRetryPolicy {
  const policy = { ...DEFAULT_POLICY, ...overrides };
  if (!Number.isInteger(policy.maximumAttempts) || policy.maximumAttempts < 1 || policy.maximumAttempts > 10) {
    throw new Error("Offline retry maximum attempts must be between 1 and 10");
  }
  if (!Number.isInteger(policy.initialDelayMs) || policy.initialDelayMs < 0 || policy.initialDelayMs > 3_600_000) {
    throw new Error("Offline retry initial delay must be between 0 and 3600000 ms");
  }
  if (!Number.isInteger(policy.maximumDelayMs) || policy.maximumDelayMs < policy.initialDelayMs || policy.maximumDelayMs > 86_400_000) {
    throw new Error("Offline retry maximum delay must be bounded and no smaller than the initial delay");
  }
  if (!Number.isFinite(policy.multiplier) || policy.multiplier < 1 || policy.multiplier > 10) {
    throw new Error("Offline retry multiplier must be between 1 and 10");
  }
  return policy;
}

function sqliteCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

export function classifyOfflineFailure(
  error: unknown,
  stage: OfflineDurableStage,
  policy: OfflineRetryPolicy,
): OfflineRetryClassification {
  if (error instanceof OfflineClassifiedFailure) {
    return {
      classification: error.classification,
      retryable: error.retryable,
      safeErrorCode: error.code,
      safeSummary: error.safeSummary,
      retryCategory: error.retryCategory,
      maximumAttempts: error.retryable ? policy.maximumAttempts : 1,
      initialDelayMs: policy.initialDelayMs,
      maximumDelayMs: policy.maximumDelayMs,
      multiplier: policy.multiplier,
      terminalOutcome: error.terminalOutcome,
      operatorReason: error.terminalOutcome === "manual_intervention" ? error.code : null,
    };
  }

  const code = sqliteCode(error);
  if (code === "SQLITE_BUSY" || code === "SQLITE_LOCKED") {
    return {
      classification: "transient", retryable: true, safeErrorCode: "sqlite_contention",
      safeSummary: "Temporary SQLite contention prevented the stage from committing",
      retryCategory: "database_contention", maximumAttempts: policy.maximumAttempts,
      initialDelayMs: policy.initialDelayMs, maximumDelayMs: policy.maximumDelayMs,
      multiplier: policy.multiplier, terminalOutcome: "failed_terminal", operatorReason: null,
    };
  }
  if (code?.startsWith("SQLITE_CONSTRAINT")) {
    return {
      classification: "deterministic", retryable: false, safeErrorCode: "invalid_database_constraint",
      safeSummary: "A deterministic database constraint rejected the stage output", retryCategory: null,
      maximumAttempts: 1, initialDelayMs: 0, maximumDelayMs: 0, multiplier: 1,
      terminalOutcome: "failed_terminal", operatorReason: null,
    };
  }
  if (stage === "extraction") {
    return {
      classification: "deterministic", retryable: false, safeErrorCode: "extraction_validation_failed",
      safeSummary: "Deterministic extraction validation failed", retryCategory: null,
      maximumAttempts: 1, initialDelayMs: 0, maximumDelayMs: 0, multiplier: 1,
      terminalOutcome: "failed_terminal", operatorReason: null,
    };
  }
  return {
    classification: "invariant", retryable: false, safeErrorCode: "offline_stage_invariant_failed",
    safeSummary: "An offline orchestration invariant failed", retryCategory: null,
    maximumAttempts: 1, initialDelayMs: 0, maximumDelayMs: 0, multiplier: 1,
    terminalOutcome: "manual_intervention", operatorReason: "offline_stage_invariant_failed",
  };
}

export function retryDelayMs(
  stage: OfflineDurableStage,
  attemptNumber: number,
  classification: OfflineRetryClassification,
  policy: OfflineRetryPolicy,
): number {
  const exponent = Math.max(0, Math.min(30, attemptNumber - 1));
  const unbounded = classification.initialDelayMs * Math.pow(classification.multiplier, exponent);
  const base = Math.min(classification.maximumDelayMs, Number.isFinite(unbounded) ? unbounded : classification.maximumDelayMs);
  const requestedJitter = policy.jitter({ stage, attemptNumber, baseDelayMs: base });
  const maximumJitter = Math.floor(base * 0.2);
  const jitter = Number.isFinite(requestedJitter)
    ? Math.max(-maximumJitter, Math.min(maximumJitter, Math.trunc(requestedJitter)))
    : 0;
  return Math.max(0, Math.min(86_400_000, Math.trunc(base + jitter)));
}
