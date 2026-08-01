import { describe, expect, it, vi } from "vitest";
import { OfflineProcessInterrupted } from "../../src/lead-engine/orchestration/reliability/errors.js";
import { runOfflineLeadAssessment } from "../../src/lead-engine/orchestration/offline-lead-pipeline.js";
import { POOL_SERVICE_ICP_MODEL_VERSION } from "../../src/lead-engine/qualification/pool-service-model.js";
import { createOfflinePipelineFixture } from "./helpers/offline-pipeline-fixture.js";

const qualification = { modelVersion: POOL_SERVICE_ICP_MODEL_VERSION } as const;

function count(
  fixture: ReturnType<typeof createOfflinePipelineFixture>,
  table: string,
): number {
  return (fixture.database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
}

describe("optional offline pool-service qualification stage", () => {
  it("remains disabled by default and executes locally only when explicitly requested", async () => {
    const disabled = createOfflinePipelineFixture();
    const enabled = createOfflinePipelineFixture();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const disabledResult = await runOfflineLeadAssessment(disabled.makeInput(), disabled.dependencies);
      expect(disabledResult.qualification).toBeNull();
      expect(count(disabled, "icp_qualification_evaluations")).toBe(0);
      expect(count(disabled, "icp_qualification_evidence_references")).toBe(0);

      const result = await runOfflineLeadAssessment(
        enabled.makeInput({ qualification }),
        enabled.dependencies,
      );
      expect(result.qualification).toMatchObject({
        modelVersion: POOL_SERVICE_ICP_MODEL_VERSION,
        niche: "pool_service",
        overallScore: expect.any(Number),
        confidence: { usedAsVerification: false },
      });
      expect(result.qualification?.componentScores).toHaveLength(7);
      expect(result.qualification?.evidenceReferences.length).toBeGreaterThan(0);
      expect(result.qualification?.verificationLimitations).toEqual(expect.arrayContaining([
        "confidence_is_recorded_but_not_treated_as_verification",
        "public_phone_observed_but_reachability_not_verified",
        "public_email_observed_but_deliverability_not_verified",
      ]));
      expect(count(enabled, "icp_qualification_evaluations")).toBe(1);
      expect(count(enabled, "icp_qualification_evidence_references")).toBeGreaterThan(0);
      const checkpoint = enabled.database.prepare(`
        SELECT status, attempt_number, references_json
        FROM offline_stage_checkpoints WHERE stage_id = 'qualification_scoring'
      `).get() as { status: string; attempt_number: number; references_json: string };
      expect(checkpoint).toMatchObject({
        status: "completed",
        attempt_number: 1,
      });
      expect(JSON.parse(checkpoint.references_json)).toEqual([
        expect.objectContaining({ table: "icp_qualification_evaluations" }),
      ]);
      expect(enabled.events).toEqual(expect.arrayContaining([
        expect.objectContaining({
          stage: "qualification_scoring",
          type: "started",
          details: expect.objectContaining({ localOnly: true, costMicroUsd: 0 }),
        }),
      ]));
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result.budget.consumed.costMicroUsd).toBe(0);
    } finally {
      fetchSpy.mockRestore();
      disabled.cleanup();
      enabled.cleanup();
    }
  });

  it("rejects unsupported models and same-key opt-in changes before scoring", async () => {
    const invalid = createOfflinePipelineFixture();
    const changed = createOfflinePipelineFixture();
    try {
      await expect(runOfflineLeadAssessment(
        invalid.makeInput({ qualification: { modelVersion: "pool_service_icp_unknown" } }),
        invalid.dependencies,
      )).rejects.toThrow("qualification model version does not match");
      expect(count(invalid, "lead_runs")).toBe(0);
      expect(count(invalid, "icp_qualification_evaluations")).toBe(0);

      await runOfflineLeadAssessment(changed.makeInput(), changed.dependencies);
      await expect(runOfflineLeadAssessment(
        changed.makeInput({ qualification }),
        changed.dependencies,
      )).rejects.toThrow("run key is already bound to different deterministic input");
      expect(count(changed, "icp_qualification_evaluations")).toBe(0);
    } finally {
      invalid.cleanup();
      changed.cleanup();
    }
  });

  it("honors cancellation after evidence persistence and before scoring", async () => {
    const controller = new AbortController();
    const fixture = createOfflinePipelineFixture({
      onEvent(event) {
        if (event.stage === "persistence" && event.type === "completed") {
          controller.abort("synthetic cancellation before qualification");
        }
      },
    });
    try {
      const result = await runOfflineLeadAssessment(
        fixture.makeInput({ qualification, signal: controller.signal }),
        fixture.dependencies,
      );
      expect(result.status).toBe("cancelled");
      expect(result.qualification).toBeNull();
      expect(count(fixture, "website_assessments")).toBe(1);
      expect(count(fixture, "icp_qualification_evaluations")).toBe(0);
      expect(fixture.events.some(({ stage }) => stage === "qualification_scoring")).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  it("resumes a completed qualification checkpoint without rescoring or duplicating history", async () => {
    let interrupted = false;
    const fixture = createOfflinePipelineFixture({
      afterStageCommitted(stage) {
        if (!interrupted && stage === "qualification_scoring") {
          interrupted = true;
          throw new OfflineProcessInterrupted(stage);
        }
      },
    });
    try {
      const input = fixture.makeInput({ qualification });
      await expect(runOfflineLeadAssessment(input, fixture.dependencies))
        .rejects.toBeInstanceOf(OfflineProcessInterrupted);
      const first = fixture.database.prepare(`
        SELECT id, evaluated_at, input_fingerprint FROM icp_qualification_evaluations
      `).get() as { id: string; evaluated_at: string; input_fingerprint: string };
      expect(count(fixture, "icp_qualification_evaluations")).toBe(1);
      expect(fixture.database.prepare(`
        SELECT status, attempt_number FROM offline_stage_checkpoints
        WHERE stage_id = 'qualification_scoring'
      `).get()).toEqual({ status: "completed", attempt_number: 1 });

      fixture.clock.advance(30_001);
      const result = await runOfflineLeadAssessment(input, fixture.dependencies);
      const after = fixture.database.prepare(`
        SELECT id, evaluated_at, input_fingerprint FROM icp_qualification_evaluations
      `).get();
      expect(result.qualification?.evaluationId).toBe(first.id);
      expect(after).toEqual(first);
      expect(count(fixture, "icp_qualification_evaluations")).toBe(1);
      expect(fixture.database.prepare(`
        SELECT attempt_number FROM offline_stage_checkpoints
        WHERE stage_id = 'qualification_scoring'
      `).get()).toEqual({ attempt_number: 1 });
    } finally {
      fixture.cleanup();
    }
  });

  it("keeps unresolved identity review as an explicit qualification outcome", async () => {
    const conflictingHtml = `<!-- synthetic-fixture: true -->
      <html><head><title>Unrelated Example Roofing</title></head>
      <body><h1>Roof repair</h1><a href="tel:+1-202-555-0199">Call</a></body></html>`;
    const fixture = createOfflinePipelineFixture({ html: conflictingHtml });
    try {
      const result = await runOfflineLeadAssessment(
        fixture.makeInput({ qualification }),
        fixture.dependencies,
      );
      expect(result.status).toBe("review_required");
      expect(result.qualification).toMatchObject({
        icpResult: "identity_review_required",
        identityReviewState: "required",
        reviewRequirements: { required: true },
      });
      expect(result.qualification?.reviewRequirements.reasons).toEqual(expect.arrayContaining([
        "business_identity_review_state",
        "website_identity_business_name",
      ]));
    } finally {
      fixture.cleanup();
    }
  });
});
