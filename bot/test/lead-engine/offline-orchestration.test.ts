import { describe, expect, it, vi } from "vitest";
import { runOfflineLeadAssessment } from "../../src/lead-engine/orchestration/offline-lead-pipeline.js";
import { createOfflinePipelineFixture } from "./helpers/offline-pipeline-fixture.js";

function countRows(
  fixture: ReturnType<typeof createOfflinePipelineFixture>,
  table: string,
): number {
  return (fixture.database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
}

describe("deterministic offline lead assessment orchestration", () => {
  it("connects policy, coverage, fixture discovery, identity, website extraction, and persistence", async () => {
    const fixture = createOfflinePipelineFixture();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const result = await runOfflineLeadAssessment(fixture.makeInput(), fixture.dependencies);
      expect(result.status).toBe("completed");
      expect(result.run).toMatchObject({
        executionMode: "offline_synthetic",
        nicheId: "pool_service",
        providerId: "fixture",
        policyVersion: "1.0.0",
      });
      expect(result.coverage?.cells).toHaveLength(1);
      expect(result.queries).toHaveLength(6);
      expect(result.discoveryEvidence).toHaveLength(1);
      expect(result.businessCandidate).toMatchObject({
        canonicalName: "Clearwater Example Pool Care",
        resolution: "new_candidate",
        assessmentAttachment: "new_candidate",
      });
      expect(result.websiteAssessment?.record).toMatchObject({
        status: "complete",
        sourceClass: "synthetic_fixture",
        reviewRequired: false,
      });
      expect(result.phoneCandidates).not.toHaveLength(0);
      expect(result.emailCandidates).not.toHaveLength(0);
      expect(result.personCandidates).toEqual(expect.arrayContaining([
        expect.objectContaining({
          displayedName: "Avery Example",
          candidateStatus: "unverified_evidence_candidate",
          claimState: "public_unverified_candidate",
        }),
      ]));
      expect(result.serviceEvidence.some(({ state }) => state === "positive")).toBe(true);
      expect(result.conversionSignals.some(({ feature, status }) =>
        feature === "click_to_call" && status === "present"
      )).toBe(true);
      expect(result.verificationStates).toEqual({
        contacts: "not_checked",
        people: "not_checked",
        ownerRelationship: "not_checked",
        decisionAuthority: "not_checked",
      });
      expect(result.budget.consumed).toMatchObject({
        providerCalls: 6,
        costMicroUsd: 0,
      });
      expect(fetchSpy).not.toHaveBeenCalled();

      expect(countRows(fixture, "lead_runs")).toBe(1);
      expect(countRows(fixture, "coverage_manifests")).toBe(1);
      expect(countRows(fixture, "discovery_queries")).toBe(6);
      expect(countRows(fixture, "discovery_observations")).toBe(1);
      expect(countRows(fixture, "businesses")).toBe(1);
      expect(countRows(fixture, "website_assessments")).toBe(1);
      expect(countRows(fixture, "website_contact_observations")).toBeGreaterThan(1);
      expect(countRows(fixture, "person_evidence_candidates")).toBeGreaterThan(0);
      expect(countRows(fixture, "evidence")).toBeGreaterThan(10);
      expect(fixture.database.prepare(`
        SELECT COUNT(*) AS count FROM evidence
        WHERE verification_state = 'externally_verified'
           OR external_verification_state = 'current'
           OR claim_state = 'externally_verified'
      `).get()).toEqual({ count: 0 });
      expect(fixture.database.prepare(`
        SELECT COUNT(*) AS count FROM contacts
        WHERE verification_state <> 'not_checked'
           OR claim_state <> 'public_unverified_candidate'
           OR role <> 'unknown'
      `).get()).toEqual({ count: 0 });
      expect(fixture.database.prepare(`
        SELECT COUNT(*) AS count FROM website_contact_observations
        WHERE candidate_status <> 'public_unverified'
           OR claim_state <> 'public_unverified_candidate'
      `).get()).toEqual({ count: 0 });
      expect(fixture.database.prepare(`
        SELECT status, execution_mode, review_required, result_json
        FROM offline_orchestration_runs
      `).get()).toMatchObject({
        status: "completed",
        execution_mode: "offline_synthetic",
        review_required: 0,
      });
    } finally {
      fetchSpy.mockRestore();
      fixture.cleanup();
    }
  });

  it("returns the persisted result and creates no semantic duplicates on repeat", async () => {
    const fixture = createOfflinePipelineFixture();
    try {
      const input = fixture.makeInput();
      const first = await runOfflineLeadAssessment(input, fixture.dependencies);
      const tables = [
        "lead_runs",
        "provider_calls",
        "discovery_observations",
        "businesses",
        "contacts",
        "evidence",
        "website_assessments",
        "website_pages",
        "website_contact_observations",
        "person_evidence_candidates",
      ];
      const before = Object.fromEntries(tables.map((table) => [table, countRows(fixture, table)]));
      const second = await runOfflineLeadAssessment(input, fixture.dependencies);
      const after = Object.fromEntries(tables.map((table) => [table, countRows(fixture, table)]));
      expect(second).toEqual(first);
      expect(after).toEqual(before);
    } finally {
      fixture.cleanup();
    }
  });

  it("produces stable semantic output with the same input, clock, IDs, and fixtures", async () => {
    const left = createOfflinePipelineFixture();
    const right = createOfflinePipelineFixture();
    try {
      const leftResult = await runOfflineLeadAssessment(left.makeInput(), left.dependencies);
      const rightResult = await runOfflineLeadAssessment(right.makeInput(), right.dependencies);
      expect(rightResult).toEqual(leftResult);
    } finally {
      left.cleanup();
      right.cleanup();
    }
  });

  it("audits a denied synthetic external-verification promotion without changing truth", async () => {
    const fixture = createOfflinePipelineFixture();
    try {
      const result = await runOfflineLeadAssessment(fixture.makeInput(), fixture.dependencies);
      const businessId = result.businessCandidate?.businessId as string;
      const phoneEvidence = fixture.database.prepare(`
        SELECT id FROM evidence WHERE entity_type = 'business' AND entity_id = ? AND field_name = 'phone'
      `).get(businessId) as { id: string };
      const decision = fixture.dependencies.repositories.evidence.promote(phoneEvidence.id, {
        decisionId: "promotion-offline-denied-001",
        targetClaimState: "externally_verified",
        verification: null,
        humanReview: null,
        resolutionReference: null,
        requestedAt: result.run.completedAt,
      });
      expect(decision.allowed).toBe(false);
      expect(decision.denialReasons).toEqual(expect.arrayContaining([
        "synthetic_production_verification_forbidden",
        "confidence_is_not_verification",
      ]));
      expect(fixture.dependencies.repositories.evidence.getById(phoneEvidence.id)).toMatchObject({
        claimState: "public_unverified_candidate",
        verificationState: "not_checked",
        externalVerificationState: "unassessed",
      });
      expect(fixture.dependencies.repositories.evidence.listPromotionDecisions(phoneEvidence.id))
        .toEqual([expect.objectContaining({ allowed: false })]);
    } finally {
      fixture.cleanup();
    }
  });

  it("rejects invalid policy, niche, provider, and fixture mapping before persistent work", async () => {
    const fixture = createOfflinePipelineFixture();
    try {
      await expect(runOfflineLeadAssessment(
        fixture.makeInput(),
        { ...fixture.dependencies, policy: {} as typeof fixture.dependencies.policy },
      )).rejects.toThrow("runtime_policy_untrusted");
      await expect(runOfflineLeadAssessment(
        fixture.makeInput({ nicheId: "septic_pumping_repair" }),
        { ...fixture.dependencies, niche: fixture.dependencies.policy.niches.septic_pumping_repair },
      )).rejects.toThrow("Unsupported or disabled niche");
      await expect(runOfflineLeadAssessment(
        fixture.makeInput({ providerId: "overture_local" }),
        fixture.dependencies,
      )).rejects.toThrow("not permitted for synthetic offline discovery");
      await expect(runOfflineLeadAssessment(
        fixture.makeInput({ fixtureWebsite: { url: "https://unmapped.example/" } }),
        fixture.dependencies,
      )).rejects.toThrow("no explicit synthetic fetcher mapping");
      expect(countRows(fixture, "lead_runs")).toBe(0);
      expect(countRows(fixture, "offline_orchestration_runs")).toBe(0);
    } finally {
      fixture.cleanup();
    }
  });

  it("marks an extraction failure as failed and creates no verification", async () => {
    const fixture = createOfflinePipelineFixture();
    try {
      const failure = new Error("synthetic extraction failure");
      const dependencies = {
        ...fixture.dependencies,
        extractors: {
          ...fixture.dependencies.extractors,
          extractHtml: () => { throw failure; },
        },
      };
      await expect(runOfflineLeadAssessment(fixture.makeInput(), dependencies)).rejects.toThrow(failure);
      expect(fixture.database.prepare("SELECT state FROM lead_runs").get()).toEqual({ state: "failed" });
      expect(fixture.database.prepare("SELECT status, result_json FROM offline_orchestration_runs").get())
        .toEqual({ status: "failed", result_json: null });
      expect(countRows(fixture, "evidence_promotion_decisions")).toBe(0);
      expect(countRows(fixture, "website_assessments")).toBe(0);
    } finally {
      fixture.cleanup();
    }
  });

  it("persists malformed provider rejection lineage and never creates a business", async () => {
    const fixture = createOfflinePipelineFixture();
    try {
      await expect(runOfflineLeadAssessment(
        fixture.makeInput({ fixtureScenario: "malformed" }),
        fixture.dependencies,
      )).rejects.toThrow("did not produce the requested website identity");
      expect(fixture.database.prepare(`
        SELECT validation_state, error_category, normalized_result_json, source_class, claim_state
        FROM discovery_observations
      `).get()).toEqual({
        validation_state: "rejected",
        error_category: "schema_validation_failed",
        normalized_result_json: null,
        source_class: "synthetic_fixture",
        claim_state: "observed",
      });
      expect(countRows(fixture, "businesses")).toBe(0);
      expect(fixture.database.prepare("SELECT status FROM offline_orchestration_runs").get())
        .toEqual({ status: "failed" });
    } finally {
      fixture.cleanup();
    }
  });

  it("does not falsely complete after a persistence failure", async () => {
    const fixture = createOfflinePipelineFixture();
    try {
      fixture.dependencies.repositories.evidence.create = () => {
        throw new Error("synthetic persistence failure");
      };
      await expect(runOfflineLeadAssessment(fixture.makeInput(), fixture.dependencies))
        .rejects.toThrow("synthetic persistence failure");
      expect(fixture.database.prepare("SELECT state FROM lead_runs").get()).toEqual({ state: "failed" });
      expect(fixture.database.prepare("SELECT status FROM offline_orchestration_runs").get())
        .toEqual({ status: "failed" });
      expect(countRows(fixture, "website_assessments")).toBe(0);
    } finally {
      fixture.cleanup();
    }
  });
});
