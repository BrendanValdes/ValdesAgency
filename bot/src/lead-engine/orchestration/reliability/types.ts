export const OFFLINE_DURABLE_STAGE_VERSIONS = {
  policy_validation: "policy-validation-1.0.0",
  run_initialization: "run-initialization-1.0.0",
  coverage_planning: "coverage-planning-1.0.0",
  query_generation: "query-generation-1.0.0",
  provider_discovery: "provider-discovery-1.0.0",
  result_normalization: "result-normalization-1.0.0",
  identity_resolution: "identity-resolution-1.0.0",
  website_eligibility: "website-eligibility-1.0.0",
  website_crawl: "website-crawl-1.0.0",
  extraction: "offline-extraction-1.0.0",
  assessment_persistence: "assessment-persistence-1.0.0",
  result_assembly: "result-assembly-1.0.0",
  finalization: "finalization-1.0.0",
} as const;

export type OfflineDurableStage = keyof typeof OFFLINE_DURABLE_STAGE_VERSIONS;

export const OFFLINE_RUN_STATES = [
  "pending",
  "running",
  "waiting_retry",
  "recovering",
  "review_required",
  "completed",
  "cancelled",
  "failed_terminal",
  "manual_intervention",
] as const;

export type OfflineRunState = (typeof OFFLINE_RUN_STATES)[number];

export const OFFLINE_TERMINAL_RUN_STATES: ReadonlySet<OfflineRunState> = new Set([
  "review_required",
  "completed",
  "cancelled",
  "failed_terminal",
  "manual_intervention",
]);

export type OfflineErrorClassification =
  | "transient"
  | "deterministic"
  | "policy"
  | "cancellation"
  | "budget"
  | "lease_lost"
  | "invariant"
  | "schema"
  | "manual_intervention";

export type OfflineTerminalOutcome =
  | "failed_terminal"
  | "manual_intervention"
  | "cancelled";

export interface OfflineRetryClassification {
  readonly classification: OfflineErrorClassification;
  readonly retryable: boolean;
  readonly safeErrorCode: string;
  readonly safeSummary: string;
  readonly retryCategory: "database_contention" | "provider_transient" | "fixture_fetch" | "lease_loss" | null;
  readonly maximumAttempts: number;
  readonly initialDelayMs: number;
  readonly maximumDelayMs: number;
  readonly multiplier: number;
  readonly terminalOutcome: OfflineTerminalOutcome;
  readonly operatorReason: string | null;
}

export interface OfflineRetryPolicy {
  readonly maximumAttempts: number;
  readonly initialDelayMs: number;
  readonly maximumDelayMs: number;
  readonly multiplier: number;
  readonly jitter: (input: {
    stage: OfflineDurableStage;
    attemptNumber: number;
    baseDelayMs: number;
  }) => number;
}

export interface OfflineCheckpointReference {
  readonly table: string;
  readonly column: string;
  readonly id: string;
}

export interface OfflineStageCheckpoint<T extends object = Record<string, unknown>> {
  readonly runId: string;
  readonly stageId: OfflineDurableStage;
  readonly status:
    | "pending"
    | "running"
    | "waiting_retry"
    | "completed"
    | "cancelled"
    | "failed_terminal"
    | "manual_intervention";
  readonly attemptNumber: number;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly inputFingerprint: string;
  readonly outputFingerprint: string | null;
  readonly output: T | null;
  readonly references: ReadonlyArray<OfflineCheckpointReference>;
  readonly errorClassification: OfflineErrorClassification | null;
  readonly errorCode: string | null;
  readonly safeErrorSummary: string | null;
  readonly retryEligible: boolean;
  readonly nextRetryAt: string | null;
  readonly workerId: string | null;
  readonly leaseTokenHash: string | null;
  readonly leaseGeneration: number | null;
  readonly budgetConsumed: Readonly<Record<string, number>>;
  readonly stageVersion: string;
  readonly orchestrationVersion: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface OfflineLease {
  readonly id: string;
  readonly runId: string;
  readonly scope: "run";
  readonly workerId: string;
  readonly tokenHash: string;
  readonly generation: number;
  readonly state: "active" | "released" | "superseded" | "cancelled";
  readonly acquiredAt: string;
  readonly heartbeatAt: string;
  readonly expiresAt: string;
  readonly releasedAt: string | null;
  readonly supersededAt: string | null;
  readonly supersededByLeaseId: string | null;
}

export interface OfflineLeaseCredentials {
  readonly leaseId: string;
  readonly token: string;
  readonly tokenHash: string;
  readonly generation: number;
  readonly workerId: string;
}

export type OfflineRecoveryDecisionKind =
  | "eligible_to_reclaim"
  | "eligible_to_retry"
  | "eligible_to_finalize"
  | "requires_reconciliation"
  | "requires_manual_intervention"
  | "leave_unchanged";

export interface OfflineRecoveryDecision {
  readonly runId: string;
  readonly decision: OfflineRecoveryDecisionKind;
  readonly reasonCode: string;
  readonly stageId: OfflineDurableStage | null;
  readonly details: Readonly<Record<string, unknown>>;
}

export interface OfflineReliabilityControl {
  readonly workerId: string;
  readonly leaseDurationMs: number;
  readonly leaseToken: () => string;
  readonly retryPolicy?: Partial<Omit<OfflineRetryPolicy, "jitter">> & {
    readonly jitter?: OfflineRetryPolicy["jitter"];
  };
  readonly hooks?: Readonly<{
    afterRunCreated?(): void;
    afterStageCommitted?(stage: OfflineDurableStage): void;
    afterResultPersisted?(): void;
  }>;
}
