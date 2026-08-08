import type {
  ClaimState,
  ExternalVerificationState,
  HumanReviewState,
  ProvenanceSourceClass,
  VerificationDimension,
  VerificationMethod,
  VerificationResult,
} from "../domain/provenance.js";
import type { EvidenceState, LeadState, VerificationState } from "../domain/states.js";

export const ICP_QUALIFICATION_RESULTS = [
  "qualified",
  "qualified_with_review",
  "insufficient_evidence",
  "disqualified",
  "identity_review_required",
  "stale_evidence",
  "not_evaluated",
] as const;

export type IcpQualificationResult = (typeof ICP_QUALIFICATION_RESULTS)[number];

export const ICP_PRIORITY_TIERS = [
  "high_priority",
  "qualified",
  "moderate",
  "low",
] as const;

export type IcpPriorityTier = (typeof ICP_PRIORITY_TIERS)[number];

export const ICP_SCORE_COMPONENTS = [
  "niche_service_fit",
  "business_legitimacy",
  "opportunity_signals",
  "contactability",
  "decision_maker_evidence",
  "outreach_readiness",
  "evidence_quality_freshness",
] as const;

export type IcpScoreComponent = (typeof ICP_SCORE_COMPONENTS)[number];

export type SupportedQualificationNiche = "pool_service" | "foundation_waterproofing";

export type QualificationFactState =
  | "positive"
  | "negative"
  | "missing"
  | "stale"
  | "conflicting"
  | "not_applicable";

export type QualificationFreshness = "current" | "stale" | "unknown";

export type QualificationSourceTable =
  | "businesses"
  | "business_locations"
  | "coverage_cells"
  | "website_assessments"
  | "website_pages"
  | "structured_data_observations"
  | "service_evidence"
  | "conversion_feature_observations"
  | "website_contact_observations"
  | "person_evidence_candidates"
  | "contacts"
  | "evidence"
  | "identity_decision_audits"
  | "website_identity_conflicts";

export interface QualificationEvidenceReference {
  readonly sourceTable: QualificationSourceTable;
  readonly sourceId: string;
  readonly sourceClass: ProvenanceSourceClass | null;
  readonly claimState: ClaimState | null;
  readonly evidenceState: EvidenceState | null;
  readonly verificationState: VerificationState | null;
  readonly verificationDimension: VerificationDimension | null;
  readonly externalVerificationState: ExternalVerificationState | null;
  readonly verificationMethod: VerificationMethod | null;
  readonly verificationResult: VerificationResult | null;
  readonly humanReviewState: HumanReviewState | null;
  readonly observedAt: string | null;
  readonly freshUntil: string | null;
  readonly confidenceBasisPoints: number | null;
  readonly freshness: QualificationFreshness;
}

export interface QualificationFact<TValue extends string = string> {
  readonly value: TValue;
  readonly state: QualificationFactState;
  readonly references: ReadonlyArray<QualificationEvidenceReference>;
}

export interface PoolServiceQualificationInput {
  readonly evaluatedAt: string;
  readonly runId: string | null;
  readonly business: Readonly<{
    id: string;
    canonicalName: string;
    nicheId: string;
    state: LeadState;
    updatedAt: string;
    reference: QualificationEvidenceReference;
  }>;
  readonly assessment: Readonly<{
    id: string;
    sourceWebsiteUrl: string;
    canonicalHomepageUrl: string | null;
    status: "complete" | "partial" | "blocked" | "failed" | "stale";
    identityState: "agrees" | "conflicts" | "ambiguous" | "unavailable";
    reviewRequired: boolean;
    assessedAt: string;
    freshUntil: string;
    sourceClass: ProvenanceSourceClass;
    reference: QualificationEvidenceReference;
  }> | null;
  readonly geography: Readonly<{
    locations: ReadonlyArray<QualificationFact>;
    selectedMarkets: ReadonlyArray<QualificationFact>;
  }>;
  readonly services: ReadonlyArray<Readonly<{
    state: "positive" | "negative" | "ambiguous" | "unavailable";
    term: string | null;
    basis: "heading" | "service_description" | "json_ld_service" | "navigation" | "provider_category" | "not_available";
    fact: QualificationFact;
  }>>;
  readonly operations: ReadonlyArray<Readonly<{
    kind: string;
    status: "positive" | "negative" | "ambiguous" | "blocked" | "unavailable";
    detail: string;
    fact: QualificationFact;
  }>>;
  readonly conversions: ReadonlyArray<Readonly<{
    feature: string;
    status: "present" | "absent_after_successful_inspection" | "ambiguous" | "blocked" | "unavailable" | "not_checked" | "stale";
    fact: QualificationFact;
  }>>;
  readonly contacts: ReadonlyArray<Readonly<{
    kind: "phone" | "email" | "address";
    displayedValue: string;
    fact: QualificationFact;
  }>>;
  readonly people: ReadonlyArray<Readonly<{
    id: string;
    displayedName: string;
    displayedTitle: string | null;
    ambiguityState: "none" | "ambiguous" | "conflicting";
    fact: QualificationFact;
  }>>;
  readonly verifications: ReadonlyArray<Readonly<{
    entityType: "business" | "person";
    entityId: string;
    fieldName: string;
    claimedValue: string | null;
    sourceClass: ProvenanceSourceClass;
    claimState: ClaimState;
    evidenceState: EvidenceState;
    verificationState: VerificationState;
    decisionState: "unknown" | "rejected" | "human_review" | "accepted";
    conflictStatus: "none" | "potential" | "confirmed" | "resolved";
    externalVerificationState: ExternalVerificationState;
    humanReviewState: HumanReviewState;
    verificationDimension: VerificationDimension | null;
    verifierId: string | null;
    verificationMethod: VerificationMethod | null;
    verificationResult: VerificationResult | null;
    verifiedAt: string | null;
    expiresAt: string | null;
    normalizedValue: string | null;
    evidenceReference: string | null;
    humanReviewerId: string | null;
    humanReviewedAt: string | null;
    fact: QualificationFact;
  }>>;
  readonly identityReview: Readonly<{
    state: "clear" | "required" | "resolved" | "unavailable";
    reasons: ReadonlyArray<string>;
    references: ReadonlyArray<QualificationEvidenceReference>;
  }>;
  readonly structuredBusinessData: ReadonlyArray<QualificationFact>;
}

export interface QualificationRuleOutcome {
  readonly component: IcpScoreComponent;
  readonly ruleId: string;
  readonly state: QualificationFactState;
  readonly points: number;
  readonly maximumPoints: number;
  readonly evidenceReferences: ReadonlyArray<QualificationEvidenceReference>;
  readonly explanation: string;
  readonly missingFlag: string | null;
  readonly conflictFlag: string | null;
}

export interface QualificationComponentScore {
  readonly component: IcpScoreComponent;
  readonly points: number;
  readonly maximumPoints: number;
  readonly outcomes: ReadonlyArray<QualificationRuleOutcome>;
}

export interface QualificationHardDisqualifier {
  readonly ruleId: string;
  readonly reason: string;
  readonly evidenceReferences: ReadonlyArray<QualificationEvidenceReference>;
}

export interface QualificationSignal {
  readonly ruleId: string;
  readonly component: IcpScoreComponent | "hard_gate";
  readonly explanation: string;
  readonly evidenceReferences: ReadonlyArray<QualificationEvidenceReference>;
}

export interface PoolServiceQualificationResult {
  readonly evaluationId: string;
  readonly supersedesEvaluationId: string | null;
  readonly modelVersion: string;
  readonly niche: SupportedQualificationNiche;
  readonly businessId: string;
  readonly runId: string | null;
  readonly evaluatedAt: string;
  readonly freshUntil: string;
  readonly inputFingerprint: string;
  readonly icpResult: IcpQualificationResult;
  readonly overallScore: number;
  readonly priorityTier: IcpPriorityTier;
  readonly componentScores: ReadonlyArray<QualificationComponentScore>;
  readonly hardDisqualifiers: ReadonlyArray<QualificationHardDisqualifier>;
  readonly positiveSignals: ReadonlyArray<QualificationSignal>;
  readonly negativeSignals: ReadonlyArray<QualificationSignal>;
  readonly missingInformationFlags: ReadonlyArray<string>;
  readonly evidenceReferences: ReadonlyArray<QualificationEvidenceReference>;
  readonly freshnessWarnings: ReadonlyArray<string>;
  readonly verificationLimitations: ReadonlyArray<string>;
  readonly identityReviewState: PoolServiceQualificationInput["identityReview"]["state"];
  readonly reviewRequirements: Readonly<{
    required: boolean;
    reasons: ReadonlyArray<string>;
  }>;
  readonly confidence: Readonly<{
    observedMinimumBasisPoints: number | null;
    observedMaximumBasisPoints: number | null;
    usedAsVerification: false;
  }>;
  readonly evidenceQuality: Readonly<{
    currentReferences: number;
    staleReferences: number;
    unknownFreshnessReferences: number;
    conflictingReferences: number;
    sourceClasses: ReadonlyArray<ProvenanceSourceClass>;
  }>;
  readonly finalExplanation: string;
}
