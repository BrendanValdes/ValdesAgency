import type { OfflineDurableStage, OfflineErrorClassification, OfflineTerminalOutcome } from "./types.js";

export class OfflineClassifiedFailure extends Error {
  readonly code: string;
  readonly classification: OfflineErrorClassification;
  readonly retryable: boolean;
  readonly safeSummary: string;
  readonly terminalOutcome: OfflineTerminalOutcome;
  readonly retryCategory: "database_contention" | "provider_transient" | "fixture_fetch" | "lease_loss" | null;

  constructor(input: {
    code: string;
    classification: OfflineErrorClassification;
    retryable: boolean;
    safeSummary: string;
    terminalOutcome?: OfflineTerminalOutcome;
    retryCategory?: OfflineClassifiedFailure["retryCategory"];
    cause?: unknown;
  }) {
    super(input.safeSummary, { cause: input.cause });
    this.name = "OfflineClassifiedFailure";
    this.code = input.code;
    this.classification = input.classification;
    this.retryable = input.retryable;
    this.safeSummary = input.safeSummary;
    this.terminalOutcome = input.terminalOutcome ?? "failed_terminal";
    this.retryCategory = input.retryCategory ?? null;
  }
}

export class OfflineTransientFailure extends OfflineClassifiedFailure {
  constructor(
    code: string,
    safeSummary: string,
    retryCategory: Exclude<OfflineClassifiedFailure["retryCategory"], null>,
    cause?: unknown,
  ) {
    super({
      code,
      classification: retryCategory === "lease_loss" ? "lease_lost" : "transient",
      retryable: true,
      safeSummary,
      retryCategory,
      cause,
    });
    this.name = "OfflineTransientFailure";
  }
}

export class OfflineProcessInterrupted extends Error {
  readonly stage: OfflineDurableStage | "run_initialization";

  constructor(stage: OfflineProcessInterrupted["stage"]) {
    super(`Synthetic process interruption after ${stage}`);
    this.name = "OfflineProcessInterrupted";
    this.stage = stage;
  }
}

export class OfflineLeaseUnavailableError extends Error {
  readonly runId: string;
  readonly expiresAt: string;

  constructor(runId: string, expiresAt: string) {
    super(`Offline run ${runId} is controlled by an unexpired worker lease until ${expiresAt}`);
    this.name = "OfflineLeaseUnavailableError";
    this.runId = runId;
    this.expiresAt = expiresAt;
  }
}

export class OfflineLeaseLostError extends OfflineTransientFailure {
  constructor(runId: string) {
    super("lease_lost", `Worker lease for offline run ${runId} is no longer current`, "lease_loss");
    this.name = "OfflineLeaseLostError";
  }
}

export class OfflineRetryNotReadyError extends Error {
  readonly runId: string;
  readonly nextRetryAt: string;

  constructor(runId: string, nextRetryAt: string) {
    super(`Offline run ${runId} is not retryable before ${nextRetryAt}`);
    this.name = "OfflineRetryNotReadyError";
    this.runId = runId;
    this.nextRetryAt = nextRetryAt;
  }
}

export class OfflineRetryScheduledError extends Error {
  readonly runId: string;
  readonly stage: OfflineDurableStage;
  readonly attemptNumber: number;
  readonly nextRetryAt: string;
  readonly safeErrorCode: string;

  constructor(input: {
    runId: string;
    stage: OfflineDurableStage;
    attemptNumber: number;
    nextRetryAt: string;
    safeErrorCode: string;
  }) {
    super(`Offline retry scheduled for ${input.stage} at ${input.nextRetryAt}`);
    this.name = "OfflineRetryScheduledError";
    this.runId = input.runId;
    this.stage = input.stage;
    this.attemptNumber = input.attemptNumber;
    this.nextRetryAt = input.nextRetryAt;
    this.safeErrorCode = input.safeErrorCode;
  }
}

export class OfflineManualInterventionError extends Error {
  readonly runId: string;
  readonly stage: OfflineDurableStage | null;
  readonly reasonCode: string;

  constructor(runId: string, stage: OfflineDurableStage | null, reasonCode: string, summary: string) {
    super(summary);
    this.name = "OfflineManualInterventionError";
    this.runId = runId;
    this.stage = stage;
    this.reasonCode = reasonCode;
  }
}
