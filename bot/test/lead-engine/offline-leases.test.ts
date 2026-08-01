import { describe, expect, it } from "vitest";
import {
  OfflineLeaseLostError,
  OfflineLeaseUnavailableError,
} from "../../src/lead-engine/orchestration/reliability/errors.js";
import { OFFLINE_DURABLE_STAGE_VERSIONS } from "../../src/lead-engine/orchestration/reliability/types.js";
import { OFFLINE_ORCHESTRATION_VERSION } from "../../src/lead-engine/orchestration/types.js";
import { stableHash } from "../../src/lead-engine/shared/stable.js";
import { runOfflineLeadAssessment } from "../../src/lead-engine/orchestration/offline-lead-pipeline.js";
import { createOfflinePipelineFixture } from "./helpers/offline-pipeline-fixture.js";
import { createOfflineReliabilityFixture } from "./helpers/offline-reliability-fixture.js";

const usage = {
  providerCalls: 0,
  websiteRequests: 0,
  pages: 0,
  compressedBytes: 0,
  decompressedBytes: 0,
  elapsedCrawlMs: 0,
  retryAttempts: 0,
  costMicroUsd: 0,
};

describe("offline worker leases and fencing", () => {
  it("prevents two pipeline workers from processing the same run concurrently", async () => {
    const fixture = createOfflinePipelineFixture({ workerId: "worker-a" });
    const actualProvider = fixture.dependencies.providerRegistry.require("fixture");
    let enteredResolve: (() => void) | undefined;
    let releaseResolve: (() => void) | undefined;
    const entered = new Promise<void>((resolve) => { enteredResolve = resolve; });
    const release = new Promise<void>((resolve) => { releaseResolve = resolve; });
    const dependencies = {
      ...fixture.dependencies,
      providerRegistry: {
        require() {
          return {
            providerId: actualProvider.providerId,
            async discover(request: Parameters<typeof actualProvider.discover>[0]) {
              enteredResolve?.();
              await release;
              return actualProvider.discover(request);
            },
          };
        },
      },
    };
    try {
      const input = fixture.makeInput();
      const first = runOfflineLeadAssessment(input, dependencies);
      await entered;
      await expect(runOfflineLeadAssessment(input, {
        ...dependencies,
        reliability: {
          ...dependencies.reliability,
          workerId: "worker-b",
          leaseToken: () => "worker-b-competing-token",
        },
      })).rejects.toBeInstanceOf(OfflineLeaseUnavailableError);
      releaseResolve?.();
      expect((await first).status).toBe("completed");
      expect(fixture.database.prepare("SELECT COUNT(*) AS count FROM offline_orchestration_runs").get())
        .toEqual({ count: 1 });
    } finally {
      releaseResolve?.();
      fixture.cleanup();
    }
  });

  it("acquires atomically, denies a competitor, heartbeats, and releases", () => {
    const fixture = createOfflineReliabilityFixture();
    try {
      const runId = fixture.createRun();
      const first = fixture.lease("worker-a", runId);
      expect(first).toMatchObject({ workerId: "worker-a", generation: 1 });
      expect(() => fixture.lease("worker-b", runId)).toThrow(OfflineLeaseUnavailableError);
      const before = fixture.repository.getActiveLease(runId);
      fixture.clock.advance(1_000);
      const heartbeat = fixture.repository.heartbeatLease(runId, first, 10_000);
      expect(Date.parse(heartbeat.expiresAt)).toBeGreaterThan(Date.parse(before?.expiresAt as string));
      fixture.repository.releaseLease(runId, first);
      expect(fixture.repository.getActiveLease(runId)).toBeNull();
      const second = fixture.lease("worker-b", runId);
      expect(second.generation).toBe(2);
      expect(fixture.database.prepare(`
        SELECT action FROM offline_recovery_events WHERE run_id = ? ORDER BY created_at, id
      `).all(runId)).toEqual(expect.arrayContaining([
        { action: "lease_acquired" },
        { action: "lease_heartbeat" },
        { action: "lease_released" },
      ]));
    } finally {
      fixture.cleanup();
    }
  });

  it("reclaims an expired lease with a new generation and fences the old worker", () => {
    const fixture = createOfflineReliabilityFixture();
    try {
      const runId = fixture.createRun();
      const stale = fixture.lease("worker-stale", runId, 2_000);
      fixture.clock.advance(2_001);
      const current = fixture.lease("worker-current", runId, 5_000);
      expect(current.generation).toBe(stale.generation + 1);
      expect(fixture.database.prepare(`
        SELECT state, superseded_by_lease_id FROM offline_worker_leases WHERE id = ?
      `).get(stale.leaseId)).toEqual({
        state: "superseded",
        superseded_by_lease_id: current.leaseId,
      });
      expect(() => fixture.repository.assertCurrentLease(runId, stale)).toThrow(OfflineLeaseLostError);
      expect(() => fixture.repository.heartbeatLease(runId, stale, 5_000)).toThrow(OfflineLeaseLostError);
      expect(() => fixture.repository.releaseLease(runId, stale)).toThrow(OfflineLeaseLostError);
      expect(fixture.database.prepare(`
        SELECT action, prior_lease_id, lease_id, generation
        FROM offline_recovery_events WHERE run_id = ? AND action = 'lease_reclaimed'
      `).get(runId)).toEqual({
        action: "lease_reclaimed",
        prior_lease_id: stale.leaseId,
        lease_id: current.leaseId,
        generation: current.generation,
      });
    } finally {
      fixture.cleanup();
    }
  });

  it("rejects a stale worker stage commit after lease reclamation", () => {
    const fixture = createOfflineReliabilityFixture();
    try {
      const runId = fixture.createRun();
      const stale = fixture.lease("worker-stale", runId, 2_000);
      fixture.repository.transitionRun({ runId, to: "running", reasonCode: "start" });
      fixture.repository.beginStage({
        runId,
        stage: "coverage_planning",
        inputFingerprint: stableHash({ runId, stage: "coverage_planning" }),
        stageVersion: OFFLINE_DURABLE_STAGE_VERSIONS.coverage_planning,
        orchestrationVersion: OFFLINE_ORCHESTRATION_VERSION,
        lease: stale,
        budgetConsumed: usage,
      });
      fixture.clock.advance(2_001);
      fixture.lease("worker-current", runId, 5_000);
      expect(() => fixture.repository.completeStage({
        runId,
        stage: "coverage_planning",
        lease: stale,
        output: { manifestId: "stale-output" },
        outputFingerprint: stableHash({ manifestId: "stale-output" }),
        references: [],
        budgetConsumed: usage,
        budgetDelta: usage,
      })).toThrow(OfflineLeaseLostError);
      expect(fixture.repository.getCheckpoint(runId, "coverage_planning")).toMatchObject({
        status: "running",
        attemptNumber: 1,
      });
    } finally {
      fixture.cleanup();
    }
  });

  it("cancellation invalidates the current lease and prevents any later acquisition", () => {
    const fixture = createOfflineReliabilityFixture();
    try {
      const runId = fixture.createRun();
      const lease = fixture.lease("worker-a", runId);
      fixture.repository.transitionRun({ runId, to: "running", reasonCode: "start" });
      fixture.database.prepare("UPDATE offline_orchestration_runs SET result_json = '{}' WHERE run_id = ?")
        .run(runId);
      fixture.repository.cancelLease(runId, lease);
      fixture.repository.transitionRun({ runId, to: "cancelled", reasonCode: "operator_cancelled" });
      expect(() => fixture.repository.assertCurrentLease(runId, lease)).toThrow(OfflineLeaseLostError);
      expect(() => fixture.lease("worker-b", runId)).toThrow("Terminal offline runs cannot acquire");
      expect(fixture.repository.getRun(runId)).toMatchObject({ execution_state: "cancelled" });
    } finally {
      fixture.cleanup();
    }
  });
});
