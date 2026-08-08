import type {
  IcpQualificationResult,
  PoolServiceQualificationResult,
  SupportedQualificationNiche,
} from "../qualification/types.js";

export const QUEUE_DISPOSITIONS = [
  "callable",
  "review_required",
  "insufficient_evidence",
  "stale",
  "disqualified",
  "suppressed",
  "duplicate_excluded",
  "not_eligible",
] as const;

export type QueueDisposition = (typeof QUEUE_DISPOSITIONS)[number];
export type QueueFreshnessState = "fresh" | "aging" | "stale" | "expired" | "missing_timestamp";
export type QueuePriorityBand = "top" | "high" | "standard" | "low";
export type QueueContactRoute = "phone" | "email" | "form";

export type QueueScope =
  | Readonly<{ kind: "coverage_keys"; coverageKeys: ReadonlyArray<string> }>
  | Readonly<{ kind: "geography"; countryCode: string; subdivisionCodes?: ReadonlyArray<string> }>;

export interface CallingQueueConstraints {
  readonly queueVersion: "calling_queue_v1";
  readonly rankingModelVersion: "pool_service_ranking_v1";
  readonly niche: SupportedQualificationNiche;
  readonly scope: QueueScope;
  readonly maximumCallable: number;
  readonly maximumReview: number;
  readonly minimumQualificationScore: number;
  readonly minimumPriorityScore: number;
  readonly acceptedQualificationResults: ReadonlyArray<IcpQualificationResult>;
  readonly qualificationModelVersion: string;
  readonly freshnessPolicyVersion: "pool_service_queue_freshness_v1";
  readonly includedContactRoutes: ReadonlyArray<QueueContactRoute>;
  readonly contactPolicy: "require_route" | "allow_research_first";
  readonly generatedAt: string;
}

export interface QueueCandidate {
  readonly businessId: string;
  readonly canonicalBusinessId: string;
  readonly businessState: string;
  readonly businessUpdatedAt: string;
  readonly assessment: Readonly<{
    id: string;
    status: "complete" | "partial" | "blocked" | "failed" | "stale";
    assessedAt: string;
    freshUntil: string;
    reviewRequired: boolean;
    identityState: "agrees" | "conflicts" | "ambiguous" | "unavailable";
  }> | null;
  readonly qualification: PoolServiceQualificationResult;
  readonly coverageKeys: ReadonlyArray<string>;
  readonly geographies: ReadonlyArray<Readonly<{ countryCode: string; subdivisionCode: string | null }>>;
  readonly identityReviewReasons: ReadonlyArray<string>;
  readonly duplicateOfEvaluationId: string | null;
}

export interface QueueScoreComponent {
  readonly component: "qualification_strength" | "opportunity_urgency" | "contact_readiness" |
    "identity_safety" | "freshness" | "market_fit" | "evidence_quality";
  readonly points: number;
  readonly maximumPoints: number;
  readonly ruleIds: ReadonlyArray<string>;
  readonly evidenceReferences: ReadonlyArray<Readonly<{
    sourceTable: "icp_qualification_evaluations";
    sourceId: string;
  }>>;
  readonly missingReason: string | null;
  readonly explanation: string;
}

export interface QueueReason {
  readonly code: string;
  readonly detail: string;
}

export interface RankedQueueEntry {
  readonly entryId: string;
  readonly sourceBusinessId: string;
  readonly canonicalBusinessId: string;
  readonly evaluationId: string;
  readonly position: number | null;
  readonly disposition: QueueDisposition;
  readonly priorityScore: number;
  readonly priorityBand: QueuePriorityBand;
  readonly qualificationScore: number;
  readonly qualificationResult: IcpQualificationResult;
  readonly evaluatedAt: string;
  readonly assessmentAt: string | null;
  readonly contactReadinessScore: number;
  readonly contactRouteSummary: Readonly<{
    candidateRoutes: ReadonlyArray<QueueContactRoute>;
    verifiedRoutes: ReadonlyArray<Extract<QueueContactRoute, "phone" | "email">>;
  }>;
  readonly freshnessState: QueueFreshnessState;
  readonly identityState: "clear" | "review_required" | "safe_duplicate" | "duplicate_excluded";
  readonly components: ReadonlyArray<QueueScoreComponent>;
  readonly evidenceReferences: ReadonlyArray<Readonly<{
    sourceTable: "icp_qualification_evaluations";
    sourceId: string;
    ruleIds: ReadonlyArray<string>;
  }>>;
  readonly verificationLimitations: ReadonlyArray<string>;
  readonly reasons: ReadonlyArray<QueueReason>;
  readonly explanation: string;
}

export interface CallingQueueSnapshot {
  readonly snapshotId: string;
  readonly queueVersion: "calling_queue_v1";
  readonly rankingModelVersion: "pool_service_ranking_v1";
  readonly freshnessPolicyVersion: "pool_service_queue_freshness_v1";
  readonly generatedAt: string;
  readonly scope: QueueScope;
  readonly constraints: CallingQueueConstraints;
  readonly totalCandidatesConsidered: number;
  readonly requestFingerprint: string;
  readonly sourceFingerprint: string;
  readonly entries: ReadonlyArray<RankedQueueEntry>;
  readonly callableEntries: ReadonlyArray<RankedQueueEntry>;
  readonly reviewEntries: ReadonlyArray<RankedQueueEntry>;
  readonly staleEntries: ReadonlyArray<RankedQueueEntry>;
  readonly insufficientEvidenceEntries: ReadonlyArray<RankedQueueEntry>;
  readonly counts: Readonly<Record<QueueDisposition, number>>;
  readonly warnings: ReadonlyArray<string>;
  readonly reused: boolean;
}

export type CallingQueueGenerationResult =
  | Readonly<{ state: "completed"; snapshot: CallingQueueSnapshot }>
  | Readonly<{ state: "cancelled"; snapshotId: string | null; attemptNumber: number | null }>;

export type QueueGenerationEvent = Readonly<{
  type: "candidate_ranked" | "entry_persisting" | "snapshot_completed";
  evaluationId?: string;
}>;
