import { describe, expect, it } from "vitest";
import { createEvidence } from "../../src/lead-engine/domain/evidence.js";
import {
  CLAIM_STATES,
  EXTERNAL_VERIFICATION_STATES,
  HUMAN_REVIEW_STATES,
  PROVENANCE_SOURCE_CLASSES,
  SOURCE_CONFIRMATION_STATES,
  VERIFICATION_DIMENSIONS,
} from "../../src/lead-engine/domain/provenance.js";
import { SYNTHETIC_TIMESTAMP, syntheticBusiness } from "./fixtures/synthetic.js";

function evidenceInput(sourceClass: unknown) {
  return {
    id: "evidence-provenance-synthetic",
    entityType: "business" as const,
    entityId: syntheticBusiness.id,
    fieldName: "canonical_name",
    claimedValue: syntheticBusiness.canonicalName,
    source: "synthetic-test-source",
    sourceClass,
    sourceUrl: "https://clearwater.example/source",
    observedAt: SYNTHETIC_TIMESTAMP,
    fetchedAt: SYNTHETIC_TIMESTAMP,
    confidenceBasisPoints: 10_000,
    extractionMethod: "synthetic_fixture",
    conflictStatus: "none" as const,
    rawReferenceChecksum: null,
    policyVersion: "phase3c-test-v1",
    createdAt: SYNTHETIC_TIMESTAMP,
    updatedAt: SYNTHETIC_TIMESTAMP,
  };
}

describe("central provenance and claim-state vocabulary", () => {
  it("defines every required source class plus a fail-closed legacy class", () => {
    expect(PROVENANCE_SOURCE_CLASSES).toEqual([
      "synthetic_fixture",
      "local_public_dataset",
      "public_business_website",
      "historical_manual_artifact",
      "external_verification_provider",
      "human_review",
      "legacy_unclassified",
    ]);
  });

  it("keeps claims, source confirmation, external verification, and human review separate", () => {
    expect(CLAIM_STATES).toEqual([
      "unknown",
      "observed",
      "source_confirmed",
      "public_unverified_candidate",
      "externally_verified",
      "human_confirmed",
      "rejected",
      "stale",
      "conflicting",
    ]);
    expect(SOURCE_CONFIRMATION_STATES).toEqual(["unassessed", "confirmed", "contradicted"]);
    expect(EXTERNAL_VERIFICATION_STATES).toEqual(["unassessed", "current", "failed", "expired"]);
    expect(HUMAN_REVIEW_STATES).toEqual(["unreviewed", "reviewed", "accepted", "rejected"]);
    expect(VERIFICATION_DIMENSIONS).toEqual(expect.arrayContaining([
      "phone_reachability",
      "phone_business_association",
      "phone_person_ownership",
      "email_mx",
      "email_deliverability",
      "person_current_employment",
      "person_owner_relationship",
      "person_decision_authority",
      "business_canonical_domain",
      "business_legal_identity",
    ]));
  });

  it.each(PROVENANCE_SOURCE_CLASSES)("round-trips the explicit %s source class", (sourceClass) => {
    expect(createEvidence(evidenceInput(sourceClass))).toMatchObject({
      sourceClass,
      claimState: "observed",
      sourceConfirmationState: "unassessed",
      externalVerificationState: "unassessed",
      humanReviewState: "unreviewed",
    });
  });

  it("rejects missing and unsupported source classes instead of inferring provenance", () => {
    expect(() => createEvidence(evidenceInput(undefined) as never)).toThrow("source class");
    expect(() => createEvidence(evidenceInput("other") as never)).toThrow("source class");
  });

  it("keeps confidence independent from verification", () => {
    const evidence = createEvidence(evidenceInput("local_public_dataset"));
    expect(evidence.confidenceBasisPoints).toBe(10_000);
    expect(evidence.claimState).toBe("observed");
    expect(evidence.externalVerificationState).toBe("unassessed");
  });
});
