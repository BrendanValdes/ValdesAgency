export const REASON_CODES = [
  "value_not_checked",
  "source_unavailable",
  "provider_failed",
  "evidence_stale",
  "evidence_conflict",
  "syntactic_check_passed",
  "source_confirmation_passed",
  "external_verification_passed",
  "business_name_is_not_person",
  "person_not_found",
  "policy_rejected",
  "human_review_required",
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];
