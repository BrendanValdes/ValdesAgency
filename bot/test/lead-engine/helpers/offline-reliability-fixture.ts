import { microUsd } from "../../../src/lead-engine/domain/money.js";
import { OfflineReliabilityRepository } from "../../../src/lead-engine/orchestration/reliability/repository.js";
import type { OfflineRunState } from "../../../src/lead-engine/orchestration/reliability/types.js";
import { OFFLINE_ORCHESTRATION_VERSION } from "../../../src/lead-engine/orchestration/types.js";
import { stableHash, stableId } from "../../../src/lead-engine/shared/stable.js";
import { createTestDatabase, SYNTHETIC_TIMESTAMP } from "../fixtures/synthetic.js";

const ZERO_USAGE = {
  providerCalls: 0,
  websiteRequests: 0,
  pages: 0,
  compressedBytes: 0,
  decompressedBytes: 0,
  elapsedCrawlMs: 0,
  retryAttempts: 0,
  costMicroUsd: 0,
} as const;

export function createOfflineReliabilityFixture() {
  const fixture = createTestDatabase();
  let nowMs = Date.parse(SYNTHETIC_TIMESTAMP);
  let sequence = 0;
  const clock = {
    now: () => new Date(nowMs).toISOString(),
    advance(ms: number) {
      nowMs += ms;
      return this.now();
    },
  };
  const repository = new OfflineReliabilityRepository({
    database: fixture.database,
    clock,
    ids: { id: stableId, hash: stableHash },
  });

  const createRun = (
    runId = `run-reliability-${++sequence}`,
    state: OfflineRunState = "pending",
  ) => {
    const terminal = [
      "review_required", "completed", "cancelled", "failed_terminal", "manual_intervention",
    ].includes(state);
    const legacyStatus = state === "completed" ? "completed"
      : state === "review_required" ? "review_required"
      : state === "cancelled" ? "cancelled"
      : state === "failed_terminal" || state === "manual_intervention" ? "failed"
      : "running";
    fixture.database.prepare(`
      INSERT INTO lead_runs
        (id, state, niche_id, budget_micro_usd, spent_micro_usd, policy_version, created_at, updated_at)
      VALUES (?, 'running', 'pool_service', ?, ?, '1.0.0', ?, ?)
    `).run(runId, microUsd(0), microUsd(0), clock.now(), clock.now());
    fixture.database.prepare(`
      INSERT INTO offline_orchestration_runs
        (run_id, run_key, input_hash, execution_mode, status, niche_id, provider_id,
         fixture_id, fixture_url, policy_version, orchestration_version, extraction_version,
         budget_json, usage_json, review_required, assessment_attachment, denial_reason,
         result_json, started_at, completed_at, updated_at, execution_state, next_retry_at,
         terminal_reason_code, safe_error_summary, recovery_generation, state_version,
         last_transition_reason, last_transition_at)
      VALUES (?, ?, ?, 'offline_synthetic', ?, 'pool_service', 'fixture', 'fixture-id',
        'https://clearwater.example/', '1.0.0', ?, 'website-extraction-1.0.0',
        '{}', ?, 0, 'not_assessed', NULL, ?, ?, ?, ?, ?, NULL, ?, ?, 0, 0,
        'fixture_seeded', ?)
    `).run(
      runId,
      `key-${runId}`,
      stableHash({ runId }),
      legacyStatus,
      OFFLINE_ORCHESTRATION_VERSION,
      JSON.stringify(ZERO_USAGE),
      terminal && legacyStatus !== "failed" ? JSON.stringify({ status: legacyStatus }) : null,
      clock.now(),
      terminal ? clock.now() : null,
      clock.now(),
      state,
      state === "failed_terminal" || state === "manual_intervention" ? "fixture_terminal" : null,
      state === "failed_terminal" || state === "manual_intervention" ? "Fixture terminal state" : null,
      clock.now(),
    );
    return runId;
  };

  return {
    ...fixture,
    clock,
    repository,
    createRun,
    lease(workerId: string, runId: string, durationMs = 5_000) {
      return repository.acquireLease({
        runId,
        workerId,
        token: `${workerId}-token-${++sequence}`,
        durationMs,
      });
    },
  };
}
