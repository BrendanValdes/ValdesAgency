import { assertEvidenceSemantics } from "./evidence.js";
import {
  methodSupportsDimension,
  PROVENANCE_POLICY_VERSION,
  type ClaimState,
  type VerificationDimension,
  type VerificationMethod,
  type VerificationResult,
} from "./provenance.js";
import type { Evidence } from "./types.js";

export const PROMOTION_DENIAL_REASONS = [
  "claim_transition_not_permitted",
  "synthetic_production_verification_forbidden",
  "historical_external_verification_forbidden",
  "source_cannot_directly_externally_verify",
  "human_review_is_not_external_verification",
  "legacy_source_unclassified",
  "verifier_identity_missing",
  "verification_method_missing",
  "verification_dimension_missing",
  "verification_timestamp_missing",
  "normalized_value_missing",
  "freshness_expiry_missing",
  "supporting_evidence_missing",
  "verification_result_missing",
  "verification_result_not_passed",
  "verification_method_dimension_mismatch",
  "verification_expired",
  "verification_timestamp_invalid",
  "rejected_evidence_unresolved",
  "conflicting_evidence_unresolved",
  "confidence_is_not_verification",
  "human_reviewer_missing",
  "human_review_timestamp_missing",
  "human_review_timestamp_invalid",
  "human_review_decision_not_accepted",
  "human_review_dimension_missing",
  "human_review_normalized_value_missing",
] as const;

export type PromotionDenialReason = (typeof PROMOTION_DENIAL_REASONS)[number];

export interface VerificationPromotionEvidence {
  dimension: VerificationDimension | null;
  verifierId: string | null;
  method: VerificationMethod | null;
  result: VerificationResult | null;
  verifiedAt: string | null;
  expiresAt: string | null;
  normalizedValue: string | null;
  evidenceReference: string | null;
}

export interface HumanReviewPromotionEvidence {
  dimension: VerificationDimension | null;
  reviewerId: string | null;
  reviewedAt: string | null;
  normalizedValue: string | null;
  evidenceReference: string | null;
  decision: "reviewed" | "accepted" | "rejected";
}

export interface EvidencePromotionRequest {
  evidence: Evidence;
  targetClaimState: ClaimState;
  verification: VerificationPromotionEvidence | null;
  humanReview: HumanReviewPromotionEvidence | null;
  resolutionReference: string | null;
  requestedAt: string;
}

export interface EvidencePromotionDecision {
  allowed: boolean;
  targetClaimState: ClaimState;
  denialReasons: ReadonlyArray<PromotionDenialReason>;
  policyVersion: string;
  nextEvidence: Evidence | null;
}

function addReason(
  reasons: PromotionDenialReason[],
  reason: PromotionDenialReason,
): void {
  if (!reasons.includes(reason)) reasons.push(reason);
}

function unresolvedReasons(
  evidence: Evidence,
  resolutionReference: string | null,
  reasons: PromotionDenialReason[],
): void {
  if (resolutionReference?.trim()) return;
  if (evidence.claimState === "rejected" || evidence.decisionState === "rejected") {
    addReason(reasons, "rejected_evidence_unresolved");
  }
  if (evidence.claimState === "conflicting" || evidence.conflictStatus === "confirmed") {
    addReason(reasons, "conflicting_evidence_unresolved");
  }
}

function externalVerificationReasons(
  request: EvidencePromotionRequest,
  reasons: PromotionDenialReason[],
): void {
  const { evidence, verification } = request;
  if (evidence.sourceClass === "synthetic_fixture") {
    addReason(reasons, "synthetic_production_verification_forbidden");
  } else if (evidence.sourceClass === "historical_manual_artifact") {
    addReason(reasons, "historical_external_verification_forbidden");
  } else if (evidence.sourceClass === "public_business_website" || evidence.sourceClass === "local_public_dataset") {
    addReason(reasons, "source_cannot_directly_externally_verify");
  } else if (evidence.sourceClass === "human_review") {
    addReason(reasons, "human_review_is_not_external_verification");
  } else if (evidence.sourceClass === "legacy_unclassified") {
    addReason(reasons, "legacy_source_unclassified");
  }

  if (!verification) {
    if (evidence.confidenceBasisPoints > 0) addReason(reasons, "confidence_is_not_verification");
    addReason(reasons, "verifier_identity_missing");
    addReason(reasons, "verification_method_missing");
    addReason(reasons, "verification_dimension_missing");
    addReason(reasons, "verification_timestamp_missing");
    addReason(reasons, "normalized_value_missing");
    addReason(reasons, "freshness_expiry_missing");
    addReason(reasons, "supporting_evidence_missing");
    addReason(reasons, "verification_result_missing");
    return;
  }
  if (!verification.verifierId?.trim()) addReason(reasons, "verifier_identity_missing");
  if (!verification.method) addReason(reasons, "verification_method_missing");
  if (!verification.dimension) addReason(reasons, "verification_dimension_missing");
  if (!verification.verifiedAt) addReason(reasons, "verification_timestamp_missing");
  if (!verification.normalizedValue?.trim()) addReason(reasons, "normalized_value_missing");
  if (!verification.expiresAt) addReason(reasons, "freshness_expiry_missing");
  if (!verification.evidenceReference?.trim()) addReason(reasons, "supporting_evidence_missing");
  if (!verification.result) addReason(reasons, "verification_result_missing");
  else if (verification.result !== "passed") addReason(reasons, "verification_result_not_passed");
  if (
    verification.method &&
    verification.dimension &&
    !methodSupportsDimension(verification.method, verification.dimension)
  ) {
    addReason(reasons, "verification_method_dimension_mismatch");
  }
  if (verification.verifiedAt && verification.expiresAt) {
    const verifiedAt = Date.parse(verification.verifiedAt);
    const expiresAt = Date.parse(verification.expiresAt);
    const requestedAt = Date.parse(request.requestedAt);
    if (!Number.isFinite(verifiedAt) || !Number.isFinite(expiresAt) || !Number.isFinite(requestedAt)) {
      addReason(reasons, "verification_timestamp_invalid");
    } else if (verifiedAt > requestedAt || expiresAt <= verifiedAt || expiresAt <= requestedAt) {
      addReason(reasons, "verification_expired");
    }
  }
}

function humanReviewReasons(
  request: EvidencePromotionRequest,
  reasons: PromotionDenialReason[],
): void {
  if (request.evidence.sourceClass !== "human_review") {
    addReason(reasons, "claim_transition_not_permitted");
  }
  if (!request.humanReview?.reviewerId?.trim()) addReason(reasons, "human_reviewer_missing");
  if (!request.humanReview?.reviewedAt) addReason(reasons, "human_review_timestamp_missing");
  if (!request.humanReview?.dimension) addReason(reasons, "human_review_dimension_missing");
  if (!request.humanReview?.normalizedValue?.trim()) addReason(reasons, "human_review_normalized_value_missing");
  if (!request.humanReview?.evidenceReference?.trim()) addReason(reasons, "supporting_evidence_missing");
  if (request.humanReview?.decision !== "accepted") addReason(reasons, "human_review_decision_not_accepted");
  if (request.humanReview?.reviewedAt) {
    const reviewedAt = Date.parse(request.humanReview.reviewedAt);
    const requestedAt = Date.parse(request.requestedAt);
    if (!Number.isFinite(reviewedAt) || !Number.isFinite(requestedAt) || reviewedAt > requestedAt) {
      addReason(reasons, "human_review_timestamp_invalid");
    }
  }
}

export function evaluateEvidencePromotion(
  request: EvidencePromotionRequest,
): EvidencePromotionDecision {
  const reasons: PromotionDenialReason[] = [];
  unresolvedReasons(request.evidence, request.resolutionReference, reasons);

  if (request.targetClaimState === "externally_verified") {
    externalVerificationReasons(request, reasons);
  } else if (request.targetClaimState === "human_confirmed") {
    humanReviewReasons(request, reasons);
  } else if (request.targetClaimState === "source_confirmed") {
    if (!["local_public_dataset", "public_business_website", "external_verification_provider"].includes(request.evidence.sourceClass)) {
      addReason(reasons, "claim_transition_not_permitted");
    }
  } else if (!["unknown", "observed", "public_unverified_candidate", "rejected", "stale", "conflicting"].includes(request.targetClaimState)) {
    addReason(reasons, "claim_transition_not_permitted");
  }

  if (reasons.length > 0) {
    return {
      allowed: false,
      targetClaimState: request.targetClaimState,
      denialReasons: reasons,
      policyVersion: PROVENANCE_POLICY_VERSION,
      nextEvidence: null,
    };
  }

  const verification = request.targetClaimState === "externally_verified" ? request.verification : null;
  const humanReview = request.targetClaimState === "human_confirmed" ? request.humanReview : null;
  const retainExpiredVerification = request.targetClaimState === "stale" &&
    request.evidence.externalVerificationState === "current";
  const nextEvidence: Evidence = {
    ...request.evidence,
    claimState: request.targetClaimState,
    sourceConfirmationState: request.targetClaimState === "source_confirmed" ? "confirmed" : request.evidence.sourceConfirmationState,
    externalVerificationState: request.targetClaimState === "externally_verified"
      ? "current"
      : retainExpiredVerification
        ? "expired"
        : "unassessed",
    humanReviewState: request.targetClaimState === "human_confirmed" ? "accepted" : request.evidence.humanReviewState,
    verificationState: request.targetClaimState === "externally_verified"
      ? "externally_verified"
      : request.targetClaimState === "source_confirmed"
        ? "source_confirmed"
        : "not_checked",
    decisionState: ["externally_verified", "human_confirmed", "source_confirmed"].includes(request.targetClaimState)
      ? "accepted"
      : request.evidence.decisionState,
    verificationDimension: verification?.dimension ?? humanReview?.dimension ??
      (retainExpiredVerification ? request.evidence.verificationDimension : null),
    verifierId: verification?.verifierId?.trim() ||
      (retainExpiredVerification ? request.evidence.verifierId : null),
    verificationMethod: verification?.method ??
      (retainExpiredVerification ? request.evidence.verificationMethod : null),
    verificationResult: verification?.result ??
      (retainExpiredVerification ? request.evidence.verificationResult : null),
    verifiedAt: verification?.verifiedAt ??
      (retainExpiredVerification ? request.evidence.verifiedAt : null),
    expiresAt: verification?.expiresAt ??
      (retainExpiredVerification ? request.evidence.expiresAt : null),
    normalizedValue: verification?.normalizedValue?.trim() || humanReview?.normalizedValue?.trim() ||
      (retainExpiredVerification ? request.evidence.normalizedValue : null),
    evidenceReference: verification?.evidenceReference?.trim() || humanReview?.evidenceReference?.trim() ||
      (retainExpiredVerification ? request.evidence.evidenceReference : null),
    humanReviewerId: humanReview?.reviewerId?.trim() || null,
    humanReviewedAt: humanReview?.reviewedAt ?? null,
    updatedAt: request.requestedAt,
  };
  assertEvidenceSemantics(nextEvidence);
  return {
    allowed: true,
    targetClaimState: request.targetClaimState,
    denialReasons: [],
    policyVersion: PROVENANCE_POLICY_VERSION,
    nextEvidence,
  };
}
