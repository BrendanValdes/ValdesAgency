import { describe, expect, it } from "vitest";
import type { BusinessIdentityRecord } from "../../src/lead-engine/identity/hierarchy.js";
import { matchBusinessIdentity } from "../../src/lead-engine/identity/matcher.js";
import { runOfflineLeadAssessment } from "../../src/lead-engine/orchestration/offline-lead-pipeline.js";
import {
  observedIdentityEvidence,
  syntheticIdentity,
} from "./fixtures/identity/synthetic.js";
import { SYNTHETIC_TIMESTAMP } from "./fixtures/synthetic.js";
import { createOfflinePipelineFixture } from "./helpers/offline-pipeline-fixture.js";

const existingIdentity: BusinessIdentityRecord = syntheticIdentity({
  entityId: "business-existing-review-001",
  locationId: "location-existing-review-001",
  displayName: "Clearwater Example Pool Care",
  nameEvidence: observedIdentityEvidence(),
  address: {
    line1: "100 Example Way",
    city: "Testville",
    region: "AZ",
    postalCode: "85000",
    countryCode: "US",
    evidence: observedIdentityEvidence(),
  },
});

function persistExistingBusiness(
  fixture: ReturnType<typeof createOfflinePipelineFixture>,
): void {
  fixture.dependencies.repositories.businesses.create({
    id: existingIdentity.entityId,
    canonicalName: existingIdentity.displayName,
    state: "found",
    nicheId: "pool_service",
    createdAt: SYNTHETIC_TIMESTAMP,
    updatedAt: SYNTHETIC_TIMESTAMP,
  });
  fixture.dependencies.repositories.businesses.addLocation({
    id: existingIdentity.locationId,
    businessId: existingIdentity.entityId,
    line1: existingIdentity.address?.line1 ?? null,
    city: existingIdentity.address?.city ?? "Testville",
    region: existingIdentity.address?.region ?? "AZ",
    postalCode: existingIdentity.address?.postalCode ?? null,
    countryCode: existingIdentity.address?.countryCode ?? "US",
    evidenceState: "found",
    sourceClass: "synthetic_fixture",
    claimState: "observed",
    createdAt: SYNTHETIC_TIMESTAMP,
    updatedAt: SYNTHETIC_TIMESTAMP,
  });
}

describe("offline orchestration identity review containment", () => {
  it("routes exact-address ambiguity to review and assesses an isolated candidate", async () => {
    const fixture = createOfflinePipelineFixture({ existingIdentities: [existingIdentity] });
    try {
      persistExistingBusiness(fixture);
      const result = await runOfflineLeadAssessment(fixture.makeInput(), fixture.dependencies);
      expect(result.status).toBe("review_required");
      expect(result.businessCandidate).toMatchObject({
        resolution: "review_required",
        assessmentAttachment: "isolated_candidate",
      });
      expect(result.businessCandidate?.businessId).not.toBe(existingIdentity.entityId);
      expect(result.identityDecisions).toEqual([
        expect.objectContaining({
          action: "human_review",
          reason: "exact_address_review",
          reviewReason: "exact_address_is_not_identity_proof",
        }),
      ]);
      expect(result.review.reasons).toContain("exact_address_is_not_identity_proof");
      expect(result.websiteAssessment?.record.businessId).toBe(result.businessCandidate?.businessId);
      expect(fixture.database.prepare(`
        SELECT COUNT(*) AS count FROM website_assessments WHERE business_id = ?
      `).get(existingIdentity.entityId)).toEqual({ count: 0 });
      expect(fixture.database.prepare(`
        SELECT action, rule, review_reason FROM identity_decision_audits
      `).get()).toEqual({
        action: "human_review",
        rule: "exact_address_review",
        review_reason: "exact_address_is_not_identity_proof",
      });
      expect(fixture.database.prepare(`
        SELECT state, candidate_reason FROM identity_candidates
      `).get()).toEqual({
        state: "human_review",
        candidate_reason: "exact_address_review",
      });
    } finally {
      fixture.cleanup();
    }
  });

  it("persists conflicting website identity without attaching it to an existing business", async () => {
    const conflictingHtml = `<!-- synthetic-fixture: true -->
      <html><head><title>Unrelated Example Roofing</title></head>
      <body><h1>Roof repair</h1><a href="tel:+1-202-555-0199">Call</a></body></html>`;
    const fixture = createOfflinePipelineFixture({
      existingIdentities: [existingIdentity],
      html: conflictingHtml,
    });
    try {
      persistExistingBusiness(fixture);
      const result = await runOfflineLeadAssessment(fixture.makeInput(), fixture.dependencies);
      expect(result.status).toBe("review_required");
      expect(result.websiteAssessment?.record).toMatchObject({
        identityState: "conflicts",
        reviewRequired: true,
      });
      expect(result.review.reasons).toEqual(expect.arrayContaining([
        "exact_address_is_not_identity_proof",
        "website_identity_conflicts",
      ]));
      expect(fixture.database.prepare(`
        SELECT business_id, conflict_type, review_state, source_class, claim_state
        FROM website_identity_conflicts
      `).get()).toEqual({
        business_id: result.businessCandidate?.businessId,
        conflict_type: "business_name",
        review_state: "pending",
        source_class: "synthetic_fixture",
        claim_state: "conflicting",
      });
      expect(fixture.database.prepare(`
        SELECT COUNT(*) AS count FROM website_assessments WHERE business_id = ?
      `).get(existingIdentity.entityId)).toEqual({ count: 0 });
    } finally {
      fixture.cleanup();
    }
  });

  it("converts an invalid auto-merge with conflicts into auditable review", async () => {
    const fixture = createOfflinePipelineFixture({ existingIdentities: [existingIdentity] });
    try {
      persistExistingBusiness(fixture);
      const dependencies = {
        ...fixture.dependencies,
        identityMatcher: (
          left: BusinessIdentityRecord,
          right: BusinessIdentityRecord,
          options?: { currentAt?: string },
        ) => ({
          ...matchBusinessIdentity(left, right, options),
          action: "auto_merge" as const,
          reason: "stable_provider_identifier" as const,
          conflictingSignals: ["synthetic_invalid_conflict"],
          conflicts: ["synthetic_invalid_conflict"],
          reviewReason: null,
        }),
      };
      const result = await runOfflineLeadAssessment(fixture.makeInput(), dependencies);
      expect(result.status).toBe("review_required");
      expect(result.identityDecisions[0]).toMatchObject({
        action: "human_review",
        reason: "conflicting_identifiers",
        reviewReason: "invalid_auto_merge_with_conflicts",
        conflictingSignals: ["synthetic_invalid_conflict"],
      });
      expect(result.businessCandidate?.businessId).not.toBe(existingIdentity.entityId);
      expect(fixture.database.prepare(`
        SELECT action, review_reason FROM identity_decision_audits
      `).get()).toEqual({
        action: "human_review",
        review_reason: "invalid_auto_merge_with_conflicts",
      });
    } finally {
      fixture.cleanup();
    }
  });
});
