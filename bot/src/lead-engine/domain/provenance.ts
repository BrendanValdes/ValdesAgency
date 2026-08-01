export const PROVENANCE_POLICY_VERSION = "provenance-1.0.0";

export const PROVENANCE_SOURCE_CLASSES = [
  "synthetic_fixture",
  "local_public_dataset",
  "public_business_website",
  "historical_manual_artifact",
  "external_verification_provider",
  "human_review",
  "legacy_unclassified",
] as const;

export type ProvenanceSourceClass = (typeof PROVENANCE_SOURCE_CLASSES)[number];

export const CLAIM_STATES = [
  "unknown",
  "observed",
  "source_confirmed",
  "public_unverified_candidate",
  "externally_verified",
  "human_confirmed",
  "rejected",
  "stale",
  "conflicting",
] as const;

export type ClaimState = (typeof CLAIM_STATES)[number];

export const SOURCE_CONFIRMATION_STATES = [
  "unassessed",
  "confirmed",
  "contradicted",
] as const;

export type SourceConfirmationState = (typeof SOURCE_CONFIRMATION_STATES)[number];

export const EXTERNAL_VERIFICATION_STATES = [
  "unassessed",
  "current",
  "failed",
  "expired",
] as const;

export type ExternalVerificationState = (typeof EXTERNAL_VERIFICATION_STATES)[number];

export const HUMAN_REVIEW_STATES = [
  "unreviewed",
  "reviewed",
  "accepted",
  "rejected",
] as const;

export type HumanReviewState = (typeof HUMAN_REVIEW_STATES)[number];

export const VERIFICATION_DIMENSIONS = [
  "phone_syntax",
  "phone_reachability",
  "phone_line_type",
  "phone_business_association",
  "phone_person_ownership",
  "email_syntax",
  "email_domain",
  "email_mx",
  "email_deliverability",
  "email_person_association",
  "email_business_association",
  "person_name_observed",
  "person_role_observed",
  "person_current_employment",
  "person_owner_relationship",
  "person_decision_authority",
  "business_provider_identity",
  "business_canonical_domain",
  "business_operational_status",
  "business_address_association",
  "business_phone_association",
  "business_legal_identity",
] as const;

export type VerificationDimension = (typeof VERIFICATION_DIMENSIONS)[number];

export const VERIFICATION_METHOD_DIMENSIONS = {
  phone_syntax_normalization: "phone_syntax",
  phone_reachability_check: "phone_reachability",
  phone_line_type_lookup: "phone_line_type",
  phone_business_association_check: "phone_business_association",
  phone_person_ownership_check: "phone_person_ownership",
  email_syntax_validation: "email_syntax",
  email_domain_validation: "email_domain",
  email_mx_lookup: "email_mx",
  email_deliverability_check: "email_deliverability",
  email_person_association_check: "email_person_association",
  email_business_association_check: "email_business_association",
  person_name_observation_review: "person_name_observed",
  person_role_observation_review: "person_role_observed",
  employment_verification: "person_current_employment",
  owner_relationship_verification: "person_owner_relationship",
  decision_authority_verification: "person_decision_authority",
  provider_business_identity_match: "business_provider_identity",
  canonical_domain_verification: "business_canonical_domain",
  business_operational_verification: "business_operational_status",
  address_association_verification: "business_address_association",
  business_phone_association_verification: "business_phone_association",
  legal_entity_verification: "business_legal_identity",
} as const satisfies Readonly<Record<string, VerificationDimension>>;

export type VerificationMethod = keyof typeof VERIFICATION_METHOD_DIMENSIONS;
export type VerificationResult = "passed" | "failed" | "inconclusive";

export function isProvenanceSourceClass(value: unknown): value is ProvenanceSourceClass {
  return typeof value === "string" && PROVENANCE_SOURCE_CLASSES.includes(value as ProvenanceSourceClass);
}

export function isClaimState(value: unknown): value is ClaimState {
  return typeof value === "string" && CLAIM_STATES.includes(value as ClaimState);
}

export function methodSupportsDimension(
  method: string,
  dimension: VerificationDimension,
): method is VerificationMethod {
  return VERIFICATION_METHOD_DIMENSIONS[method as VerificationMethod] === dimension;
}

export function provenanceForFetcherSource(
  sourceClass: "synthetic_fixture" | "test_loopback" | "public_web",
): ProvenanceSourceClass {
  return sourceClass === "public_web" ? "public_business_website" : "synthetic_fixture";
}

export interface CurrentVerificationEvidence {
  sourceClass: ProvenanceSourceClass;
  claimState: ClaimState;
  externalVerificationState: ExternalVerificationState;
  verificationDimension: VerificationDimension | null;
  verifierId: string | null;
  verificationMethod: VerificationMethod | null;
  verificationResult: VerificationResult | null;
  verifiedAt: string | null;
  expiresAt: string | null;
  normalizedValue: string | null;
  evidenceReference: string | null;
}

export function isCurrentExternalVerification(
  evidence: CurrentVerificationEvidence,
  dimension: VerificationDimension,
  currentAt: string,
): boolean {
  if (
    evidence.sourceClass !== "external_verification_provider" ||
    evidence.claimState !== "externally_verified" ||
    evidence.externalVerificationState !== "current" ||
    evidence.verificationDimension !== dimension ||
    !evidence.verifierId ||
    !evidence.verificationMethod ||
    evidence.verificationResult !== "passed" ||
    !methodSupportsDimension(evidence.verificationMethod, dimension) ||
    !evidence.verifiedAt ||
    !evidence.expiresAt ||
    !evidence.normalizedValue ||
    !evidence.evidenceReference
  ) {
    return false;
  }
  const verifiedAt = Date.parse(evidence.verifiedAt);
  const expiresAt = Date.parse(evidence.expiresAt);
  const now = Date.parse(currentAt);
  return Number.isFinite(verifiedAt) && Number.isFinite(expiresAt) && Number.isFinite(now) &&
    verifiedAt <= now && expiresAt > now && expiresAt > verifiedAt;
}
