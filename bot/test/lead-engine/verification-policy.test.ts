import { describe, expect, it } from "vitest";
import { evaluateEvidencePromotion } from "../../src/lead-engine/domain/verification-policy.js";
import type { Evidence } from "../../src/lead-engine/domain/types.js";
import { makeSyntheticEvidence } from "./fixtures/synthetic.js";

const requestedAt = "2026-01-15T12:00:00.000Z";
const verification = {
  dimension: "email_deliverability" as const,
  verifierId: "verifier-synthetic-explicit",
  method: "email_deliverability_check" as const,
  result: "passed" as const,
  verifiedAt: "2026-01-15T11:00:00.000Z",
  expiresAt: "2026-02-15T11:00:00.000Z",
  normalizedValue: "contact@example.test",
  evidenceReference: "provider-ref-synthetic-001",
};

function evidence(overrides: Partial<Evidence> = {}): Evidence {
  return makeSyntheticEvidence({
    fieldName: "email",
    claimedValue: "contact@example.test",
    sourceClass: "external_verification_provider",
    claimState: "observed",
    ...overrides,
  });
}

function promote(subject: Evidence, overrides: Record<string, unknown> = {}) {
  return evaluateEvidencePromotion({
    evidence: subject,
    targetClaimState: "externally_verified",
    verification,
    humanReview: null,
    resolutionReference: null,
    requestedAt,
    ...overrides,
  });
}

describe("fail-closed evidence promotion policy", () => {
  it("allows a compatible, complete, fresh external-verifier transition", () => {
    const result = promote(evidence());
    expect(result).toMatchObject({ allowed: true, denialReasons: [] });
    expect(result.nextEvidence).toMatchObject({
      claimState: "externally_verified",
      externalVerificationState: "current",
      verificationDimension: "email_deliverability",
      verifierId: verification.verifierId,
    });
  });

  it.each([
    ["synthetic_fixture", "synthetic_production_verification_forbidden"],
    ["historical_manual_artifact", "historical_external_verification_forbidden"],
    ["public_business_website", "source_cannot_directly_externally_verify"],
    ["human_review", "human_review_is_not_external_verification"],
  ] as const)("denies %s from directly creating an externally verified claim", (sourceClass, reason) => {
    const result = promote(evidence({ sourceClass }));
    expect(result.allowed).toBe(false);
    expect(result.denialReasons).toContain(reason);
    expect(result.nextEvidence).toBeNull();
  });

  it.each([
    ["verifierId", "verifier_identity_missing"],
    ["method", "verification_method_missing"],
    ["dimension", "verification_dimension_missing"],
    ["verifiedAt", "verification_timestamp_missing"],
    ["normalizedValue", "normalized_value_missing"],
    ["expiresAt", "freshness_expiry_missing"],
    ["evidenceReference", "supporting_evidence_missing"],
    ["result", "verification_result_missing"],
  ] as const)("returns a structured denial when %s is missing", (field, reason) => {
    const result = promote(evidence(), {
      verification: { ...verification, [field]: null },
    });
    expect(result.allowed).toBe(false);
    expect(result.denialReasons).toContain(reason);
  });

  it("rejects a verifier method that does not prove the requested dimension", () => {
    const result = promote(evidence(), {
      verification: { ...verification, method: "email_syntax_validation" },
    });
    expect(result.denialReasons).toContain("verification_method_dimension_mismatch");
  });

  it("rejects expired verification as a current verified claim", () => {
    const result = promote(evidence(), {
      verification: { ...verification, expiresAt: "2026-01-15T11:30:00.000Z" },
    });
    expect(result.denialReasons).toContain("verification_expired");
  });

  it("represents an elapsed prior verification as expired while retaining its audit metadata", () => {
    const current = promote(evidence()).nextEvidence as Evidence;
    const result = evaluateEvidencePromotion({
      evidence: current,
      targetClaimState: "stale",
      verification: null,
      humanReview: null,
      resolutionReference: null,
      requestedAt: "2026-03-01T12:00:00.000Z",
    });
    expect(result.nextEvidence).toMatchObject({
      claimState: "stale",
      externalVerificationState: "expired",
      verificationState: "not_checked",
      verifierId: verification.verifierId,
      verificationMethod: verification.method,
      verificationResult: "passed",
      verifiedAt: verification.verifiedAt,
      expiresAt: verification.expiresAt,
      evidenceReference: verification.evidenceReference,
    });
  });

  it.each([
    ["rejected", "rejected_evidence_unresolved"],
    ["conflicting", "conflicting_evidence_unresolved"],
  ] as const)("requires an explicit resolving event before promoting %s evidence", (claimState, reason) => {
    const result = promote(evidence({
      claimState,
      evidenceState: claimState === "conflicting" ? "conflicting" : "found",
      conflictStatus: claimState === "conflicting" ? "confirmed" : "none",
    }));
    expect(result.denialReasons).toContain(reason);
  });

  it("rejects confidence-only promotion", () => {
    const result = promote(evidence({
      sourceClass: "local_public_dataset",
      confidenceBasisPoints: 10_000,
    }), { verification: null });
    expect(result.denialReasons).toContain("confidence_is_not_verification");
  });

  it("records human confirmation distinctly from external verification", () => {
    const result = evaluateEvidencePromotion({
      evidence: evidence({ sourceClass: "human_review" }),
      targetClaimState: "human_confirmed",
      verification: null,
      humanReview: {
        dimension: "person_owner_relationship",
        reviewerId: "reviewer-synthetic-001",
        reviewedAt: requestedAt,
        normalizedValue: "avery example:owner",
        evidenceReference: "review-ref-synthetic-001",
        decision: "accepted",
      },
      resolutionReference: null,
      requestedAt,
    });
    expect(result.allowed).toBe(true);
    expect(result.nextEvidence).toMatchObject({
      claimState: "human_confirmed",
      externalVerificationState: "unassessed",
      humanReviewState: "accepted",
      verificationDimension: "person_owner_relationship",
      normalizedValue: "avery example:owner",
    });
  });

  it("rejects a human review dated after its requested transition", () => {
    const result = evaluateEvidencePromotion({
      evidence: evidence({ sourceClass: "human_review" }),
      targetClaimState: "human_confirmed",
      verification: null,
      humanReview: {
        dimension: "person_owner_relationship",
        reviewerId: "reviewer-synthetic-001",
        reviewedAt: "2026-01-15T13:00:00.000Z",
        normalizedValue: "avery example:owner",
        evidenceReference: "review-ref-synthetic-001",
        decision: "accepted",
      },
      resolutionReference: null,
      requestedAt,
    });
    expect(result.denialReasons).toContain("human_review_timestamp_invalid");
  });
});
