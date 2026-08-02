import { describe, expect, it } from "vitest";
import {
  OvertureBudgetTracker,
  type OvertureBudgetUsage,
} from "../../src/lead-engine/providers/overture/budgets.js";
import {
  OvertureLineageRepository,
  overtureReleaseInputFingerprint,
} from "../../src/lead-engine/providers/overture/lineage-repository.js";
import type { OverturePlacesAdapterAudit } from "../../src/lead-engine/providers/adapters/overture-places-live.js";
import { createTestDatabase } from "./fixtures/synthetic.js";
import {
  SYNTHETIC_OVERTURE_BUDGET_LIMITS,
  SYNTHETIC_OVERTURE_RELEASE_PIN,
  syntheticBudget,
  syntheticQueryPlan,
} from "./fixtures/overture/synthetic-live.js";

describe("cumulative Overture live budgets", () => {
  it("stops before catalog, asset-request, and download byte limits are exceeded", () => {
    const catalog = syntheticBudget({ maxStacRequests: 1 });
    catalog.reserveRequest("stac", 10);
    expect(() => catalog.reserveRequest("stac", 10)).toThrow("request budget");

    const asset = syntheticBudget({ maxAssetRequests: 1 });
    asset.reserveRequest("asset", 10);
    expect(() => asset.reserveRequest("asset", 10)).toThrow("request budget");

    const bytes = syntheticBudget({ maxDownloadedBytes: 100 });
    const reserved = bytes.reserveRequest("asset", 40);
    // Actual bytes may never exceed the amount reserved for the request.
    expect(() => bytes.recordDownload(41, reserved)).toThrow("reservation");
    bytes.recordDownload(40, reserved);
    // A reconciled reservation cannot be reused.
    expect(() => bytes.recordDownload(1, reserved)).toThrow("reconciled");
    // The byte ceiling counts actual downloads plus any outstanding reservation.
    const big = bytes.reserveRequest("asset", 60);
    expect(() => bytes.reserveRequest("asset", 1)).toThrow("byte budget");
    bytes.recordDownload(60, big);
    // Once the full 100 bytes are spent, no further reservation fits.
    expect(() => bytes.reserveRequest("asset", 1)).toThrow("byte budget");
  });

  it("enforces processed-byte, row, candidate, geographic-area, and retry limits", () => {
    const processed = syntheticBudget({ maxProcessedBytes: 100, maxRowsRead: 2 });
    processed.recordProcessing({ bytes: 100, rows: 2 });
    expect(() => processed.recordProcessing({ bytes: 1, rows: 0 })).toThrow("processed-byte budget");

    const candidates = syntheticBudget({ maxCandidates: 1 });
    candidates.recordCandidates(1);
    expect(() => candidates.recordCandidates(1)).toThrow("candidate budget");

    const retries = syntheticBudget({ maxRetryAttempts: 1 });
    retries.recordRetryAttempt();
    expect(() => retries.recordRetryAttempt()).toThrow("retry budget");

    const area = syntheticBudget({ maxAreaSquareKm: 1 });
    expect(() => area.assertArea(1.01)).toThrow("geographic-area budget");
  });

  it("enforces runtime and resumes from cumulative persisted usage", () => {
    let now = 1_000;
    const tracker = new OvertureBudgetTracker({
      limits: { ...SYNTHETIC_OVERTURE_BUDGET_LIMITS, maxRuntimeMs: 1_000 },
      now: () => now,
      startedAtMs: now,
    });
    now += 999;
    tracker.assertActive();
    now += 1;
    expect(() => tracker.assertActive()).toThrow("runtime budget");

    const first = syntheticBudget();
    first.reserveRequest("stac", 100);
    first.recordDownload(25);
    first.recordRetryAttempt();
    const resumed = new OvertureBudgetTracker({
      limits: SYNTHETIC_OVERTURE_BUDGET_LIMITS,
      initialUsage: first.snapshot().consumed,
      now: () => 2_000,
      startedAtMs: 1_000,
    });
    expect(resumed.snapshot().consumed).toEqual(first.snapshot().consumed);
    expect(resumed.snapshot().remaining.maxStacRequests).toBe(
      SYNTHETIC_OVERTURE_BUDGET_LIMITS.maxStacRequests - 1,
    );
    expect(() => new OvertureBudgetTracker({
      limits: SYNTHETIC_OVERTURE_BUDGET_LIMITS,
      initialUsage: {
        ...first.snapshot().consumed,
        rowsRead: undefined,
      } as unknown as OvertureBudgetUsage,
    })).toThrow("invalid");
  });
});

describe("Overture release/query lineage persistence", () => {
  it("pins immutable release/query/license metadata and accumulates usage monotonically", () => {
    const fixture = createTestDatabase();
    const now = "2026-08-01T12:00:00.000Z";
    try {
      fixture.database.prepare(`
        INSERT INTO lead_runs
          (id, state, niche_id, budget_micro_usd, spent_micro_usd,
           policy_version, created_at, updated_at)
        VALUES ('run-synthetic-overture', 'running', 'pool_service', 0, 0, '1.0.0', ?, ?)
      `).run(now, now);
      const repository = new OvertureLineageRepository(fixture.database, { now: () => now });
      const budget = syntheticBudget();
      const plan = syntheticQueryPlan();
      const first = repository.pinRelease({
        runId: "run-synthetic-overture",
        release: SYNTHETIC_OVERTURE_RELEASE_PIN,
        plan,
        budget: budget.snapshot(),
      });
      const second = repository.pinRelease({
        runId: "run-synthetic-overture",
        release: SYNTHETIC_OVERTURE_RELEASE_PIN,
        plan,
        budget: budget.snapshot(),
      });
      expect(second.inputFingerprint).toBe(first.inputFingerprint);
      expect(second.release).toMatchObject({
        releaseId: "2026-07-23.0",
        license: "CDLA-Permissive-2.0",
      });
      expect(second.plan).toEqual(plan);

      fixture.database.prepare(`
        INSERT INTO lead_runs
          (id, state, niche_id, budget_micro_usd, spent_micro_usd,
           policy_version, created_at, updated_at)
        VALUES ('run-synthetic-overture-repeat', 'running', 'pool_service', 0, 0, '1.0.0', ?, ?)
      `).run(now, now);
      const repeatedInput = repository.pinRelease({
        runId: "run-synthetic-overture-repeat",
        release: SYNTHETIC_OVERTURE_RELEASE_PIN,
        plan,
        budget: budget.snapshot(),
      });
      expect(repeatedInput.inputFingerprint).toBe(first.inputFingerprint);

      budget.reserveRequest("stac", 100);
      budget.recordDownload(50);
      const updated = repository.updateBudgetUsage(
        "run-synthetic-overture",
        budget.snapshot().consumed,
      );
      expect(updated.budgetUsage.downloadedBytes).toBe(50);
      expect(() => fixture.database.prepare(`
        UPDATE overture_release_pins
        SET budget_usage_json = json_set(budget_usage_json, '$.downloadedBytes', 0)
        WHERE run_id = 'run-synthetic-overture'
      `).run()).toThrow("cannot decrease");
      expect(() => repository.updateBudgetUsage(
        "run-synthetic-overture",
        first.budgetUsage,
      )).toThrow("cannot decrease");

      expect(() => repository.pinRelease({
        runId: "run-synthetic-overture",
        release: { ...SYNTHETIC_OVERTURE_RELEASE_PIN, releaseId: "2026-07-30.0" },
        plan: syntheticQueryPlan("2026-07-30.0"),
        budget: budget.snapshot(),
      })).toThrow("conflicts");
    } finally {
      fixture.cleanup();
    }
  });

  it("persists idempotent aggregate provider-call audits without raw lead fields", () => {
    const fixture = createTestDatabase();
    const now = "2026-08-01T12:00:00.000Z";
    try {
      fixture.database.prepare(`
        INSERT INTO lead_runs
          (id, state, niche_id, budget_micro_usd, spent_micro_usd,
           policy_version, created_at, updated_at)
        VALUES ('run-synthetic-overture', 'running', 'pool_service', 0, 0, '1.0.0', ?, ?)
      `).run(now, now);
      fixture.database.prepare(`
        INSERT INTO provider_calls
          (id, run_id, task_id, provider, operation, state,
           estimated_cost_micro_usd, actual_cost_micro_usd, cache_hit,
           error_reason_code, started_at, finished_at)
        VALUES ('provider-call-synthetic', 'run-synthetic-overture', NULL,
          'overture_places_live', 'discovery', 'accepted', 0, 0, 0, NULL, ?, ?)
      `).run(now, now);
      const repository = new OvertureLineageRepository(fixture.database, { now: () => now });
      const budget = syntheticBudget();
      budget.reserveRequest("asset", 1_024);
      budget.recordDownload(512);
      budget.recordProcessing({ bytes: 256, rows: 1 });
      budget.recordCandidates(1);
      const plan = syntheticQueryPlan();
      repository.pinRelease({
        runId: "run-synthetic-overture",
        release: SYNTHETIC_OVERTURE_RELEASE_PIN,
        plan,
        budget: budget.snapshot(),
      });
      const audit: OverturePlacesAdapterAudit = {
        providerId: "overture_places_live",
        adapterVersion: "overture-places-live-1.0.0",
        releaseId: SYNTHETIC_OVERTURE_RELEASE_PIN.releaseId,
        schemaVersion: SYNTHETIC_OVERTURE_RELEASE_PIN.schemaVersion,
        taxonomyMappingVersion: "overture_pool_service_taxonomy_v1",
        coverageKey: plan.coverageKey,
        queryFingerprint: plan.fingerprint,
        assetIds: SYNTHETIC_OVERTURE_RELEASE_PIN.assets.map((asset) => asset.assetId),
        acceptedCount: 1,
        rejectedCount: 0,
        reviewCount: 0,
        duplicateCount: 0,
        status: "complete",
        failureCode: null,
        budget: budget.snapshot(),
      };
      const input = {
        providerCallId: "provider-call-synthetic",
        runId: "run-synthetic-overture",
        queryId: "query-synthetic-overture",
        audit,
      };
      repository.recordProviderCall(input);
      repository.recordProviderCall(input);
      expect(() => repository.recordProviderCall({
        ...input,
        audit: { ...audit, acceptedCount: 2 },
      })).toThrow("not idempotent");

      const serialized = JSON.stringify(fixture.database.prepare(
        "SELECT * FROM overture_provider_call_lineage",
      ).all());
      expect(serialized).not.toMatch(/Synthetic Pool Service|155501|@synthetic|Test Way/);
    } finally {
      fixture.cleanup();
    }
  });

  it("changes the provider input fingerprint when release or query changes", () => {
    const original = overtureReleaseInputFingerprint({
      release: SYNTHETIC_OVERTURE_RELEASE_PIN,
      plan: syntheticQueryPlan(),
    });
    const changed = overtureReleaseInputFingerprint({
      release: { ...SYNTHETIC_OVERTURE_RELEASE_PIN, releaseId: "2026-07-30.0" },
      plan: syntheticQueryPlan("2026-07-30.0"),
    });
    expect(changed).not.toBe(original);
  });
});
