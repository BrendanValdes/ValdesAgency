import { describe, expect, it } from "vitest";
import {
  assertOfflineRunTransition,
  OFFLINE_RUN_TRANSITIONS,
} from "../../src/lead-engine/orchestration/reliability/state-machine.js";
import { OFFLINE_RUN_STATES } from "../../src/lead-engine/orchestration/reliability/types.js";
import { createOfflineReliabilityFixture } from "./helpers/offline-reliability-fixture.js";

describe("offline orchestration state machine", () => {
  it("defines every allowed transition explicitly and rejects every other pair", () => {
    for (const from of OFFLINE_RUN_STATES) {
      for (const to of OFFLINE_RUN_STATES) {
        if (OFFLINE_RUN_TRANSITIONS[from].has(to)) {
          expect(() => assertOfflineRunTransition(from, to)).not.toThrow();
        } else {
          expect(() => assertOfflineRunTransition(from, to)).toThrow("Invalid offline run state transition");
        }
      }
    }
  });

  it("persists audited pending, retry, recovery, and completion transitions", () => {
    const fixture = createOfflineReliabilityFixture();
    try {
      const runId = fixture.createRun();
      fixture.repository.transitionRun({ runId, to: "running", reasonCode: "worker_started" });
      fixture.repository.transitionRun({
        runId,
        to: "waiting_retry",
        reasonCode: "provider_timeout",
        nextRetryAt: new Date(Date.parse(fixture.clock.now()) + 1_000).toISOString(),
      });
      fixture.clock.advance(1_000);
      fixture.repository.transitionRun({ runId, to: "recovering", reasonCode: "retry_recovery" });
      fixture.repository.transitionRun({ runId, to: "running", reasonCode: "retry_started" });
      fixture.database.prepare("UPDATE offline_orchestration_runs SET result_json = '{}' WHERE run_id = ?")
        .run(runId);
      fixture.repository.transitionRun({ runId, to: "completed", reasonCode: "pipeline_completed" });
      expect(fixture.repository.getRun(runId)).toMatchObject({
        execution_state: "completed",
        status: "completed",
        state_version: 5,
      });
      expect(fixture.database.prepare(`
        SELECT from_state, to_state, reason_code
        FROM offline_run_state_transitions WHERE run_id = ? ORDER BY state_version
      `).all(runId)).toEqual([
        { from_state: "pending", to_state: "running", reason_code: "worker_started" },
        { from_state: "running", to_state: "waiting_retry", reason_code: "provider_timeout" },
        { from_state: "waiting_retry", to_state: "recovering", reason_code: "retry_recovery" },
        { from_state: "recovering", to_state: "running", reason_code: "retry_started" },
        { from_state: "running", to_state: "completed", reason_code: "pipeline_completed" },
      ]);
    } finally {
      fixture.cleanup();
    }
  });

  it.each(["completed", "review_required", "cancelled", "failed_terminal", "manual_intervention"] as const)(
    "protects terminal %s runs from ordinary reactivation",
    (state) => {
      const fixture = createOfflineReliabilityFixture();
      try {
        const runId = fixture.createRun(`terminal-${state}`, state);
        expect(() => fixture.repository.transitionRun({
          runId,
          to: "running",
          reasonCode: "ordinary_restart_forbidden",
        })).toThrow("Invalid offline run state transition");
      } finally {
        fixture.cleanup();
      }
    },
  );

  it("keeps review and cancellation terminal and distinct from failure", () => {
    const fixture = createOfflineReliabilityFixture();
    try {
      const reviewRun = fixture.createRun("review-run");
      fixture.repository.transitionRun({ runId: reviewRun, to: "running", reasonCode: "start" });
      fixture.database.prepare("UPDATE offline_orchestration_runs SET result_json = '{}' WHERE run_id = ?")
        .run(reviewRun);
      fixture.repository.transitionRun({ runId: reviewRun, to: "review_required", reasonCode: "identity_review" });
      const cancelledRun = fixture.createRun("cancel-run");
      fixture.database.prepare("UPDATE offline_orchestration_runs SET result_json = '{}' WHERE run_id = ?")
        .run(cancelledRun);
      fixture.repository.transitionRun({ runId: cancelledRun, to: "cancelled", reasonCode: "operator_cancelled" });
      expect(fixture.repository.getRun(reviewRun)).toMatchObject({
        execution_state: "review_required",
        status: "review_required",
        terminal_reason_code: null,
      });
      expect(fixture.repository.getRun(cancelledRun)).toMatchObject({
        execution_state: "cancelled",
        status: "cancelled",
        terminal_reason_code: null,
      });
    } finally {
      fixture.cleanup();
    }
  });
});
