import { describe, expect, it } from "vitest";
import {
  OfflineClassifiedFailure,
  OfflineRetryNotReadyError,
  OfflineRetryScheduledError,
  OfflineTransientFailure,
} from "../../src/lead-engine/orchestration/reliability/errors.js";
import {
  boundedRetryPolicy,
  classifyOfflineFailure,
  retryDelayMs,
} from "../../src/lead-engine/orchestration/reliability/retry-policy.js";
import { runOfflineLeadAssessment } from "../../src/lead-engine/orchestration/offline-lead-pipeline.js";
import { createOfflinePipelineFixture } from "./helpers/offline-pipeline-fixture.js";

describe("offline retry classification and durable scheduling", () => {
  it("emits stable non-retryable codes for deterministic preflight and input-hash failures", async () => {
    const fixture = createOfflinePipelineFixture();
    try {
      await expect(runOfflineLeadAssessment(
        fixture.makeInput({ budget: { maxProviderCalls: -1 } }),
        fixture.dependencies,
      )).rejects.toMatchObject({
        code: "invalid_budget_policy",
        classification: "policy",
        retryable: false,
      });
      expect(fixture.database.prepare("SELECT COUNT(*) AS count FROM offline_orchestration_runs").get())
        .toEqual({ count: 0 });
      await runOfflineLeadAssessment(fixture.makeInput(), fixture.dependencies);
      await expect(runOfflineLeadAssessment(
        fixture.makeInput({ budget: { maxProviderCalls: 9 } }),
        fixture.dependencies,
      )).rejects.toMatchObject({
        code: "input_hash_conflict",
        classification: "deterministic",
        retryable: false,
      });
    } finally {
      fixture.cleanup();
    }
  });

  it("classifies typed transient, policy, cancellation, budget, and SQLite failures without message matching", () => {
    const policy = boundedRetryPolicy();
    expect(classifyOfflineFailure(new OfflineClassifiedFailure({
      code: "fixture_transient",
      classification: "transient",
      retryable: true,
      safeSummary: "Fixture unavailable",
      retryCategory: "fixture_fetch",
    }), "website_crawl", policy)).toMatchObject({
      classification: "transient",
      retryable: true,
      safeErrorCode: "fixture_transient",
      maximumAttempts: 3,
    });
    for (const [classification, code] of [
      ["policy", "url_policy_denied"],
      ["cancellation", "pipeline_cancelled"],
      ["budget", "provider_call_budget_exhausted"],
      ["deterministic", "identity_conflict_requires_review"],
    ] as const) {
      expect(classifyOfflineFailure(new OfflineClassifiedFailure({
        code,
        classification,
        retryable: false,
        safeSummary: "Safe deterministic failure",
      }), "provider_discovery", policy)).toMatchObject({
        classification,
        retryable: false,
        safeErrorCode: code,
        maximumAttempts: 1,
      });
    }
    expect(classifyOfflineFailure({ code: "SQLITE_BUSY", message: "irrelevant" }, "provider_discovery", policy))
      .toMatchObject({ retryable: true, safeErrorCode: "sqlite_contention" });
    expect(classifyOfflineFailure({ code: "SQLITE_CONSTRAINT_CHECK", message: "irrelevant" }, "provider_discovery", policy))
      .toMatchObject({ retryable: false, safeErrorCode: "invalid_database_constraint" });
  });

  it("computes bounded exponential backoff with deterministic injected jitter", () => {
    const policy = boundedRetryPolicy({
      initialDelayMs: 1_000,
      maximumDelayMs: 3_000,
      multiplier: 2,
      jitter: ({ baseDelayMs }) => Math.floor(baseDelayMs * 0.1),
    });
    const classification = classifyOfflineFailure(new OfflineClassifiedFailure({
      code: "transient",
      classification: "transient",
      retryable: true,
      safeSummary: "Transient",
      retryCategory: "provider_transient",
    }), "provider_discovery", policy);
    expect([1, 2, 3, 4].map((attempt) =>
      retryDelayMs("provider_discovery", attempt, classification, policy)
    )).toEqual([1_100, 2_200, 3_300, 3_300]);
  });

  it("records the first attempt, persists retry times, rejects early execution, and never duplicates attempts", async () => {
    const fixture = createOfflinePipelineFixture({
      retryPolicy: { initialDelayMs: 1_000, maximumDelayMs: 10_000, multiplier: 2 },
    });
    const input = fixture.makeInput({ fixtureScenario: "timeout" });
    try {
      await expect(runOfflineLeadAssessment(input, fixture.dependencies))
        .rejects.toBeInstanceOf(OfflineRetryScheduledError);
      expect(fixture.database.prepare(`
        SELECT execution_state, next_retry_at FROM offline_orchestration_runs
      `).get()).toEqual({
        execution_state: "waiting_retry",
        next_retry_at: new Date(Date.parse(fixture.clock.now()) + 1_000).toISOString(),
      });
      expect(fixture.database.prepare(`
        SELECT attempt_number, status, retry_delay_ms, next_retry_at
        FROM offline_execution_attempts WHERE stage_id = 'provider_discovery'
      `).all()).toEqual([{
        attempt_number: 1,
        status: "failed_retryable",
        retry_delay_ms: 1_000,
        next_retry_at: new Date(Date.parse(fixture.clock.now()) + 1_000).toISOString(),
      }]);
      await expect(runOfflineLeadAssessment(input, fixture.dependencies))
        .rejects.toBeInstanceOf(OfflineRetryNotReadyError);
      expect(fixture.database.prepare(`
        SELECT COUNT(*) AS count FROM offline_execution_attempts WHERE stage_id = 'provider_discovery'
      `).get()).toEqual({ count: 1 });
      fixture.clock.advance(1_000);
      await expect(runOfflineLeadAssessment(input, fixture.dependencies))
        .rejects.toBeInstanceOf(OfflineRetryScheduledError);
      expect(fixture.database.prepare(`
        SELECT attempt_number, status, retry_delay_ms
        FROM offline_execution_attempts WHERE stage_id = 'provider_discovery' ORDER BY attempt_number
      `).all()).toEqual([
        { attempt_number: 1, status: "failed_retryable", retry_delay_ms: 1_000 },
        { attempt_number: 2, status: "failed_retryable", retry_delay_ms: 2_000 },
      ]);
    } finally {
      fixture.cleanup();
    }
  });

  it("transitions exhausted retries terminally and preserves cumulative retry budget usage", async () => {
    const fixture = createOfflinePipelineFixture({
      retryPolicy: { maximumAttempts: 3, initialDelayMs: 1_000, maximumDelayMs: 10_000, multiplier: 2 },
    });
    const input = fixture.makeInput({ fixtureScenario: "timeout" });
    try {
      await expect(runOfflineLeadAssessment(input, fixture.dependencies)).rejects.toBeInstanceOf(OfflineRetryScheduledError);
      fixture.clock.advance(1_000);
      await expect(runOfflineLeadAssessment(input, fixture.dependencies)).rejects.toBeInstanceOf(OfflineRetryScheduledError);
      fixture.clock.advance(2_000);
      await expect(runOfflineLeadAssessment(input, fixture.dependencies)).rejects.toThrow("transient failure");
      expect(fixture.database.prepare(`
        SELECT execution_state, terminal_reason_code, next_retry_at, usage_json
        FROM offline_orchestration_runs
      `).get()).toMatchObject({
        execution_state: "failed_terminal",
        terminal_reason_code: "provider_timeout_attempts_exhausted",
        next_retry_at: null,
      });
      const usage = JSON.parse((fixture.database.prepare(`
        SELECT usage_json FROM offline_orchestration_runs
      `).get() as { usage_json: string }).usage_json) as Record<string, number>;
      expect(usage).toMatchObject({ providerCalls: 3, retryAttempts: 2, costMicroUsd: 0 });
      expect(fixture.database.prepare(`
        SELECT attempt_number, status FROM offline_execution_attempts
        WHERE stage_id = 'provider_discovery' ORDER BY attempt_number
      `).all()).toEqual([
        { attempt_number: 1, status: "failed_retryable" },
        { attempt_number: 2, status: "failed_retryable" },
        { attempt_number: 3, status: "failed_terminal" },
      ]);
    } finally {
      fixture.cleanup();
    }
  });

  it("resumes a transient provider exception without duplicate semantic output or truth promotion", async () => {
    const fixture = createOfflinePipelineFixture({
      retryPolicy: { initialDelayMs: 1_000, maximumDelayMs: 10_000, multiplier: 2 },
    });
    const actualProvider = fixture.dependencies.providerRegistry.require("fixture");
    let shouldFail = true;
    const dependencies = {
      ...fixture.dependencies,
      providerRegistry: {
        require() {
          return {
            providerId: actualProvider.providerId,
            async discover(request: Parameters<typeof actualProvider.discover>[0]) {
              if (shouldFail) {
                shouldFail = false;
                throw new OfflineTransientFailure(
                  "injected_provider_unavailable",
                  "Injected provider operation was temporarily unavailable",
                  "provider_transient",
                );
              }
              return actualProvider.discover(request);
            },
          };
        },
      },
    };
    try {
      const input = fixture.makeInput();
      await expect(runOfflineLeadAssessment(input, dependencies))
        .rejects.toBeInstanceOf(OfflineRetryScheduledError);
      fixture.clock.advance(1_000);
      const result = await runOfflineLeadAssessment(input, dependencies);
      expect(result.status).toBe("completed");
      expect(result.budget.consumed).toMatchObject({
        providerCalls: 7,
        retryAttempts: 1,
        costMicroUsd: 0,
      });
      expect(fixture.database.prepare(`
        SELECT COUNT(*) AS count FROM discovery_observations WHERE validation_state = 'accepted'
      `).get()).toEqual({ count: 1 });
      expect(fixture.database.prepare(`
        SELECT state, COUNT(*) AS count FROM provider_calls GROUP BY state ORDER BY state
      `).all()).toEqual([
        { state: "accepted", count: 6 },
        { state: "failed", count: 1 },
      ]);
      expect(fixture.database.prepare(`
        SELECT COUNT(*) AS count FROM evidence
        WHERE verification_state = 'externally_verified'
           OR external_verification_state = 'current'
           OR claim_state = 'externally_verified'
      `).get()).toEqual({ count: 0 });
      expect(fixture.database.prepare(`
        SELECT COUNT(*) AS count FROM contacts
        WHERE verification_state <> 'not_checked' OR role <> 'unknown'
      `).get()).toEqual({ count: 0 });
    } finally {
      fixture.cleanup();
    }
  });

  it("resumes provider discovery from durable per-query progress after a partial attempt", async () => {
    const fixture = createOfflinePipelineFixture({
      retryPolicy: { initialDelayMs: 1_000, maximumDelayMs: 10_000, multiplier: 2 },
    });
    const actualProvider = fixture.dependencies.providerRegistry.require("fixture");
    let calls = 0;
    let injected = false;
    const dependencies = {
      ...fixture.dependencies,
      providerRegistry: {
        require() {
          return {
            providerId: actualProvider.providerId,
            async discover(request: Parameters<typeof actualProvider.discover>[0]) {
              calls += 1;
              if (!injected && calls === 4) {
                injected = true;
                throw new OfflineTransientFailure(
                  "injected_partial_provider_failure",
                  "Injected partial provider attempt failed transiently",
                  "provider_transient",
                );
              }
              return actualProvider.discover(request);
            },
          };
        },
      },
    };
    try {
      const input = fixture.makeInput();
      await expect(runOfflineLeadAssessment(input, dependencies))
        .rejects.toBeInstanceOf(OfflineRetryScheduledError);
      const progress = JSON.parse((fixture.database.prepare(`
        SELECT output_json FROM offline_stage_checkpoints WHERE stage_id = 'provider_discovery'
      `).get() as { output_json: string }).output_json) as { completedQueryIds: string[] };
      expect(progress.completedQueryIds).toHaveLength(3);
      fixture.clock.advance(1_000);
      const result = await runOfflineLeadAssessment(input, dependencies);
      expect(result.status).toBe("completed");
      expect(calls).toBe(7);
      expect(result.budget.consumed).toMatchObject({ providerCalls: 7, retryAttempts: 1 });
      expect(fixture.database.prepare("SELECT COUNT(*) AS count FROM discovery_observations").get())
        .toEqual({ count: 1 });
    } finally {
      fixture.cleanup();
    }
  });

  it("cancels a waiting retry idempotently without executing the pending provider operation", async () => {
    const fixture = createOfflinePipelineFixture({
      retryPolicy: { initialDelayMs: 10_000, maximumDelayMs: 10_000, multiplier: 2 },
    });
    const input = fixture.makeInput({ fixtureScenario: "timeout" });
    try {
      await expect(runOfflineLeadAssessment(input, fixture.dependencies)).rejects.toBeInstanceOf(OfflineRetryScheduledError);
      const beforeCalls = fixture.database.prepare("SELECT COUNT(*) AS count FROM provider_calls").get();
      const controller = new AbortController();
      controller.abort("cancel pending retry");
      const cancelled = await runOfflineLeadAssessment(
        { ...input, signal: controller.signal },
        fixture.dependencies,
      );
      expect(cancelled.status).toBe("cancelled");
      expect(fixture.database.prepare(`
        SELECT execution_state, next_retry_at FROM offline_orchestration_runs
      `).get()).toEqual({ execution_state: "cancelled", next_retry_at: null });
      expect(fixture.database.prepare(`
        SELECT status, retry_eligible, next_retry_at FROM offline_stage_checkpoints
        WHERE stage_id = 'provider_discovery'
      `).get()).toEqual({ status: "cancelled", retry_eligible: 0, next_retry_at: null });
      expect(fixture.database.prepare("SELECT COUNT(*) AS count FROM provider_calls").get()).toEqual(beforeCalls);
      expect(await runOfflineLeadAssessment(input, fixture.dependencies)).toEqual(cancelled);
    } finally {
      fixture.cleanup();
    }
  });
});
