import { describe, expect, it } from "vitest";
import { runOfflineLeadAssessment } from "../../src/lead-engine/orchestration/offline-lead-pipeline.js";
import type { OfflinePipelineEvent } from "../../src/lead-engine/orchestration/types.js";
import { createOfflinePipelineFixture } from "./helpers/offline-pipeline-fixture.js";

function persistedStates(fixture: ReturnType<typeof createOfflinePipelineFixture>) {
  return {
    offline: fixture.database.prepare("SELECT status FROM offline_orchestration_runs").get(),
    run: fixture.database.prepare("SELECT state FROM lead_runs").get(),
    stage: fixture.database.prepare("SELECT state FROM run_stages").get(),
  };
}

function cancellationAt(
  controller: AbortController,
  stage: OfflinePipelineEvent["stage"],
  type: OfflinePipelineEvent["type"],
) {
  return (event: OfflinePipelineEvent) => {
    if (event.stage === stage && event.type === type) {
      controller.abort(`synthetic cancellation at ${stage}:${type}`);
    }
  };
}

describe("offline orchestration cancellation propagation", () => {
  it("returns a clear non-persisted cancellation when already aborted", async () => {
    const controller = new AbortController();
    controller.abort("synthetic cancellation before run");
    const fixture = createOfflinePipelineFixture();
    try {
      const result = await runOfflineLeadAssessment(
        fixture.makeInput({ signal: controller.signal }),
        fixture.dependencies,
      );
      expect(result.status).toBe("cancelled");
      expect(result.rejectionReasons).toContain(
        "cancelled_before_run:synthetic cancellation before run",
      );
      expect(fixture.database.prepare("SELECT COUNT(*) AS count FROM lead_runs").get())
        .toEqual({ count: 0 });
      expect(fixture.database.prepare("SELECT COUNT(*) AS count FROM offline_orchestration_runs").get())
        .toEqual({ count: 0 });
    } finally {
      fixture.cleanup();
    }
  });

  it("stops before discovery and issues no provider call", async () => {
    const controller = new AbortController();
    const fixture = createOfflinePipelineFixture({
      onEvent: cancellationAt(controller, "coverage", "completed"),
    });
    try {
      const result = await runOfflineLeadAssessment(
        fixture.makeInput({ signal: controller.signal }),
        fixture.dependencies,
      );
      expect(result.status).toBe("cancelled");
      expect(result.rejectionReasons[0]).toContain("cancelled_during_coverage");
      expect(fixture.database.prepare("SELECT COUNT(*) AS count FROM provider_calls").get())
        .toEqual({ count: 0 });
      expect(persistedStates(fixture)).toEqual({
        offline: { status: "cancelled" },
        run: { state: "failed" },
        stage: { state: "failed" },
      });
    } finally {
      fixture.cleanup();
    }
  });

  it("preserves discovery observations when cancelled between discovery and identity", async () => {
    const controller = new AbortController();
    const fixture = createOfflinePipelineFixture({
      onEvent: cancellationAt(controller, "discovery", "completed"),
    });
    try {
      const result = await runOfflineLeadAssessment(
        fixture.makeInput({ signal: controller.signal }),
        fixture.dependencies,
      );
      expect(result.status).toBe("cancelled");
      expect(result.discoveryEvidence).toHaveLength(1);
      expect(result.businessCandidate).toBeNull();
      expect(fixture.database.prepare("SELECT COUNT(*) AS count FROM discovery_observations").get())
        .toEqual({ count: 1 });
      expect(fixture.database.prepare("SELECT COUNT(*) AS count FROM businesses").get())
        .toEqual({ count: 0 });
      expect(persistedStates(fixture).offline).toEqual({ status: "cancelled" });
    } finally {
      fixture.cleanup();
    }
  });

  it("stops before crawl while preserving the truthful business candidate", async () => {
    const controller = new AbortController();
    const fixture = createOfflinePipelineFixture({
      onEvent: cancellationAt(controller, "identity", "completed"),
    });
    try {
      const result = await runOfflineLeadAssessment(
        fixture.makeInput({ signal: controller.signal }),
        fixture.dependencies,
      );
      expect(result.status).toBe("cancelled");
      expect(result.businessCandidate).not.toBeNull();
      expect(result.websiteAssessment).toBeNull();
      expect(fixture.database.prepare("SELECT COUNT(*) AS count FROM businesses").get())
        .toEqual({ count: 1 });
      expect(fixture.database.prepare("SELECT COUNT(*) AS count FROM website_assessments").get())
        .toEqual({ count: 0 });
    } finally {
      fixture.cleanup();
    }
  });

  it("propagates cancellation through the crawler signal", async () => {
    const controller = new AbortController();
    const fixture = createOfflinePipelineFixture({
      onFetch(url) {
        if (new URL(url).pathname === "/") {
          controller.abort("synthetic cancellation during crawl");
        }
      },
    });
    try {
      const result = await runOfflineLeadAssessment(
        fixture.makeInput({ signal: controller.signal }),
        fixture.dependencies,
      );
      expect(result.status).toBe("cancelled");
      expect(result.rejectionReasons[0]).toContain("cancelled_during_website_assessment");
      expect(result.websiteAssessment).toBeNull();
      expect(result.budget.consumed.websiteRequests).toBeGreaterThan(0);
      expect(fixture.database.prepare("SELECT COUNT(*) AS count FROM website_assessments").get())
        .toEqual({ count: 0 });
      expect(persistedStates(fixture).offline).toEqual({ status: "cancelled" });
    } finally {
      fixture.cleanup();
    }
  });

  it("cancels before final completion without rolling back truthful persisted evidence", async () => {
    const controller = new AbortController();
    const fixture = createOfflinePipelineFixture({
      onEvent: cancellationAt(controller, "finalization", "started"),
    });
    try {
      const result = await runOfflineLeadAssessment(
        fixture.makeInput({ signal: controller.signal }),
        fixture.dependencies,
      );
      expect(result.status).toBe("cancelled");
      expect(result.websiteAssessment).not.toBeNull();
      expect(fixture.database.prepare("SELECT COUNT(*) AS count FROM website_assessments").get())
        .toEqual({ count: 1 });
      expect((fixture.database.prepare("SELECT COUNT(*) AS count FROM evidence").get() as { count: number }).count)
        .toBeGreaterThan(0);
      expect(fixture.database.prepare(`
        SELECT COUNT(*) AS count FROM evidence
        WHERE verification_state = 'externally_verified' OR claim_state = 'externally_verified'
      `).get()).toEqual({ count: 0 });
      expect(persistedStates(fixture)).toEqual({
        offline: { status: "cancelled" },
        run: { state: "failed" },
        stage: { state: "failed" },
      });
    } finally {
      fixture.cleanup();
    }
  });
});
