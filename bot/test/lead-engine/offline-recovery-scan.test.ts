import { describe, expect, it } from "vitest";
import { scanOfflineRunRecovery } from "../../src/lead-engine/orchestration/reliability/recovery-service.js";
import { OFFLINE_DURABLE_STAGE_VERSIONS } from "../../src/lead-engine/orchestration/reliability/types.js";
import { OFFLINE_ORCHESTRATION_VERSION } from "../../src/lead-engine/orchestration/types.js";
import { stableHash } from "../../src/lead-engine/shared/stable.js";
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

describe("abandoned offline run recovery scan", () => {
  it("detects expired leases, orphaned running runs, due retries, and future retries", () => {
    const fixture = createOfflineReliabilityFixture();
    try {
      const expired = fixture.createRun("expired-run");
      fixture.lease("expired-worker", expired, 1_000);
      fixture.repository.transitionRun({ runId: expired, to: "running", reasonCode: "start" });

      const orphaned = fixture.createRun("orphaned-run");
      fixture.repository.transitionRun({ runId: orphaned, to: "running", reasonCode: "start" });

      const due = fixture.createRun("due-run");
      fixture.repository.transitionRun({ runId: due, to: "running", reasonCode: "start" });
      fixture.repository.transitionRun({
        runId: due,
        to: "waiting_retry",
        reasonCode: "transient",
        nextRetryAt: new Date(Date.parse(fixture.clock.now()) + 500).toISOString(),
      });

      const future = fixture.createRun("future-run");
      fixture.repository.transitionRun({ runId: future, to: "running", reasonCode: "start" });
      fixture.repository.transitionRun({
        runId: future,
        to: "waiting_retry",
        reasonCode: "transient",
        nextRetryAt: new Date(Date.parse(fixture.clock.now()) + 10_000).toISOString(),
      });

      fixture.clock.advance(1_001);
      const decisions = Object.fromEntries(scanOfflineRunRecovery(fixture.database, fixture.clock.now())
        .map((decision) => [decision.runId, decision]));
      expect(decisions[expired]).toMatchObject({
        decision: "eligible_to_reclaim",
        reasonCode: "worker_lease_expired",
      });
      expect(decisions[orphaned]).toMatchObject({
        decision: "eligible_to_reclaim",
        reasonCode: "active_run_without_lease",
      });
      expect(decisions[due]).toMatchObject({ decision: "eligible_to_retry", reasonCode: "retry_due" });
      expect(decisions[future]).toMatchObject({ decision: "leave_unchanged", reasonCode: "retry_not_due" });
    } finally {
      fixture.cleanup();
    }
  });

  it("detects persisted results awaiting finalization and terminal runs with active leases", () => {
    const fixture = createOfflineReliabilityFixture();
    try {
      const finalizable = fixture.createRun("finalizable-run");
      fixture.repository.transitionRun({ runId: finalizable, to: "running", reasonCode: "start" });
      fixture.database.prepare("UPDATE offline_orchestration_runs SET result_json = '{}' WHERE run_id = ?")
        .run(finalizable);

      const terminalWithLease = fixture.createRun("terminal-lease-run");
      fixture.lease("worker", terminalWithLease);
      fixture.database.prepare("UPDATE offline_orchestration_runs SET result_json = '{}' WHERE run_id = ?")
        .run(terminalWithLease);
      fixture.repository.transitionRun({
        runId: terminalWithLease,
        to: "cancelled",
        reasonCode: "cancel_without_lease_cleanup",
      });

      const decisions = Object.fromEntries(scanOfflineRunRecovery(fixture.database, fixture.clock.now())
        .map((decision) => [decision.runId, decision]));
      expect(decisions[finalizable]).toMatchObject({
        decision: "eligible_to_finalize",
        reasonCode: "result_persisted_before_terminal_state",
      });
      expect(decisions[terminalWithLease]).toMatchObject({
        decision: "requires_reconciliation",
        reasonCode: "terminal_run_has_active_lease",
      });
    } finally {
      fixture.cleanup();
    }
  });

  it("routes missing references and incompatible checkpoint versions to manual intervention", () => {
    const fixture = createOfflineReliabilityFixture();
    const completeCheckpoint = (input: {
      runId: string;
      version: string;
      references: Array<{ table: string; column: string; id: string }>;
    }) => {
      const lease = fixture.lease(`worker-${input.runId}`, input.runId);
      fixture.repository.transitionRun({ runId: input.runId, to: "running", reasonCode: "start" });
      fixture.repository.beginStage({
        runId: input.runId,
        stage: "coverage_planning",
        inputFingerprint: stableHash({ runId: input.runId }),
        stageVersion: input.version,
        orchestrationVersion: OFFLINE_ORCHESTRATION_VERSION,
        lease,
        budgetConsumed: usage,
      });
      fixture.repository.completeStage({
        runId: input.runId,
        stage: "coverage_planning",
        lease,
        output: { manifestId: "fixture" },
        outputFingerprint: stableHash({ manifestId: "fixture" }),
        references: input.references,
        budgetConsumed: usage,
        budgetDelta: usage,
      });
      fixture.repository.releaseLease(input.runId, lease);
    };
    try {
      const missing = fixture.createRun("missing-reference-run");
      completeCheckpoint({
        runId: missing,
        version: OFFLINE_DURABLE_STAGE_VERSIONS.coverage_planning,
        references: [{ table: "coverage_manifests", column: "id", id: "missing-manifest" }],
      });
      const incompatible = fixture.createRun("incompatible-version-run");
      completeCheckpoint({
        runId: incompatible,
        version: "coverage-planning-0.0.1",
        references: [],
      });

      const decisions = Object.fromEntries(scanOfflineRunRecovery(fixture.database, fixture.clock.now())
        .map((decision) => [decision.runId, decision]));
      expect(decisions[missing]).toMatchObject({
        decision: "requires_manual_intervention",
        reasonCode: "checkpoint_reference_missing",
        stageId: "coverage_planning",
      });
      expect(decisions[incompatible]).toMatchObject({
        decision: "requires_manual_intervention",
        reasonCode: "incompatible_stage_version",
        stageId: "coverage_planning",
      });
    } finally {
      fixture.cleanup();
    }
  });
});
