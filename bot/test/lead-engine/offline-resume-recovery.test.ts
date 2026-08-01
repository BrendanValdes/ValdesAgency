import { describe, expect, it } from "vitest";
import {
  OfflineManualInterventionError,
  OfflineProcessInterrupted,
} from "../../src/lead-engine/orchestration/reliability/errors.js";
import type { OfflineDurableStage } from "../../src/lead-engine/orchestration/reliability/types.js";
import { runOfflineLeadAssessment } from "../../src/lead-engine/orchestration/offline-lead-pipeline.js";
import { createOfflinePipelineFixture } from "./helpers/offline-pipeline-fixture.js";

const semanticTables = [
  "lead_runs",
  "coverage_manifests",
  "coverage_cells",
  "discovery_queries",
  "discovery_observations",
  "businesses",
  "business_identifiers",
  "business_locations",
  "contacts",
  "evidence",
  "website_assessments",
  "website_fetches",
  "website_pages",
  "website_contact_observations",
  "person_evidence_candidates",
] as const;

function rowCounts(fixture: ReturnType<typeof createOfflinePipelineFixture>) {
  return Object.fromEntries(semanticTables.map((table) => [
    table,
    (fixture.database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count,
  ]));
}

describe("checkpoint-based offline crash recovery", () => {
  it("resumes after run creation without creating a duplicate run", async () => {
    let interrupted = false;
    const fixture = createOfflinePipelineFixture({
      afterRunCreated() {
        if (!interrupted) {
          interrupted = true;
          throw new OfflineProcessInterrupted("run_initialization");
        }
      },
    });
    try {
      const input = fixture.makeInput();
      await expect(runOfflineLeadAssessment(input, fixture.dependencies))
        .rejects.toBeInstanceOf(OfflineProcessInterrupted);
      expect(fixture.database.prepare(`
        SELECT execution_state FROM offline_orchestration_runs
      `).get()).toEqual({ execution_state: "pending" });
      expect(fixture.database.prepare("SELECT COUNT(*) AS count FROM lead_runs").get()).toEqual({ count: 1 });
      const result = await runOfflineLeadAssessment(input, fixture.dependencies);
      expect(result.status).toBe("completed");
      expect(fixture.database.prepare("SELECT COUNT(*) AS count FROM lead_runs").get()).toEqual({ count: 1 });
    } finally {
      fixture.cleanup();
    }
  });

  it.each([
    "coverage_planning",
    "query_generation",
    "result_normalization",
    "identity_resolution",
    "website_crawl",
    "assessment_persistence",
    "result_assembly",
    "finalization",
  ] as const)("recovers an abrupt interruption after %s", async (stage) => {
    let interrupted = false;
    const fixture = createOfflinePipelineFixture({
      afterStageCommitted(completedStage) {
        if (!interrupted && completedStage === stage) {
          interrupted = true;
          throw new OfflineProcessInterrupted(stage);
        }
      },
    });
    try {
      const input = fixture.makeInput({
        budget: stage === "website_crawl" ? {
          maxWebsiteRequests: 100,
          maxPages: 20,
          maxCompressedBytes: 5_000_000,
          maxDecompressedBytes: 10_000_000,
          maxElapsedCrawlMs: 120_000,
        } : undefined,
      });
      await expect(runOfflineLeadAssessment(input, fixture.dependencies))
        .rejects.toBeInstanceOf(OfflineProcessInterrupted);
      const checkpoint = fixture.database.prepare(`
        SELECT status, attempt_number, output_fingerprint
        FROM offline_stage_checkpoints WHERE stage_id = ?
      `).get(stage) as { status: string; attempt_number: number; output_fingerprint: string | null };
      expect(checkpoint).toMatchObject({ status: "completed", attempt_number: 1 });
      expect(checkpoint.output_fingerprint).toMatch(/^[a-f0-9]{64}$/);
      const before = rowCounts(fixture);
      fixture.clock.advance(30_001);
      const result = await runOfflineLeadAssessment(input, fixture.dependencies);
      expect(result.status).toBe("completed");
      expect(fixture.database.prepare(`
        SELECT execution_state, result_json FROM offline_orchestration_runs
      `).get()).toMatchObject({ execution_state: "completed" });
      expect(fixture.database.prepare(`
        SELECT attempt_number FROM offline_stage_checkpoints WHERE stage_id = ?
      `).get(stage)).toEqual({ attempt_number: 1 });
      const after = rowCounts(fixture);
      for (const table of semanticTables) {
        if (before[table] > 0) expect(after[table]).toBe(before[table]);
      }
      expect(fixture.database.prepare(`
        SELECT COUNT(*) AS count FROM evidence
        WHERE verification_state = 'externally_verified'
           OR external_verification_state = 'current'
           OR claim_state = 'externally_verified'
      `).get()).toEqual({ count: 0 });
      expect(result.budget.consumed.costMicroUsd).toBe(0);
    } finally {
      fixture.cleanup();
    }
  });

  it("replays an interrupted website crawl safely and charges only operations that actually began", async () => {
    let interrupted = false;
    const fixture = createOfflinePipelineFixture({
      onFetch(url) {
        if (!interrupted && new URL(url).pathname === "/") {
          interrupted = true;
          throw new OfflineProcessInterrupted("website_crawl");
        }
      },
    });
    try {
      const input = fixture.makeInput();
      await expect(runOfflineLeadAssessment(input, fixture.dependencies))
        .rejects.toBeInstanceOf(OfflineProcessInterrupted);
      const usageAfterCrash = JSON.parse((fixture.database.prepare(`
        SELECT usage_json FROM offline_orchestration_runs
      `).get() as { usage_json: string }).usage_json) as Record<string, number>;
      expect(usageAfterCrash.websiteRequests).toBeGreaterThan(0);
      expect(fixture.database.prepare("SELECT COUNT(*) AS count FROM website_assessments").get())
        .toEqual({ count: 0 });
      fixture.clock.advance(30_001);
      const result = await runOfflineLeadAssessment(input, fixture.dependencies);
      expect(result.status).toBe("completed");
      expect(result.budget.consumed.websiteRequests).toBeGreaterThan(usageAfterCrash.websiteRequests);
      expect(result.budget.consumed.retryAttempts).toBe(1);
      expect(fixture.database.prepare("SELECT COUNT(*) AS count FROM website_assessments").get())
        .toEqual({ count: 1 });
      expect(fixture.database.prepare(`
        SELECT attempt_number, status FROM offline_execution_attempts
        WHERE stage_id = 'website_crawl' ORDER BY attempt_number
      `).all()).toEqual([
        { attempt_number: 1, status: "interrupted" },
        { attempt_number: 2, status: "completed" },
      ]);
      const persistedDeltas = (fixture.database.prepare(`
        SELECT budget_delta_json FROM offline_execution_attempts
      `).all() as Array<{ budget_delta_json: string }>).map(({ budget_delta_json }) =>
        JSON.parse(budget_delta_json) as Record<string, number>
      );
      for (const [name, consumed] of Object.entries(result.budget.consumed)) {
        expect(persistedDeltas.reduce((total, delta) => total + (delta[name] ?? 0), 0))
          .toBe(consumed);
      }
    } finally {
      fixture.cleanup();
    }
  });

  it("keeps raw page bodies out of every durable checkpoint", async () => {
    const fixture = createOfflinePipelineFixture();
    try {
      await runOfflineLeadAssessment(fixture.makeInput(), fixture.dependencies);
      const rows = fixture.database.prepare(`
        SELECT stage_id, output_json FROM offline_stage_checkpoints
        WHERE output_json IS NOT NULL ORDER BY stage_id
      `).all() as Array<{ stage_id: string; output_json: string }>;
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.output_json).not.toMatch(/<!doctype|<html\b|<body\b|<script\b/i);
      }
      const crawl = JSON.parse(rows.find(({ stage_id }) => stage_id === "website_crawl")?.output_json ?? "{}") as {
        crawl?: { pages?: Array<{ html: unknown; fetch: { ok: boolean; body?: string } | null }> };
      };
      expect(crawl.crawl?.pages?.every(({ html, fetch }) =>
        html === null && (!fetch?.ok || fetch.body === "")
      )).toBe(true);
      const extraction = JSON.parse(rows.find(({ stage_id }) => stage_id === "extraction")?.output_json ?? "{}") as {
        successfulPages?: Array<{
          crawlPage: { html: unknown; fetch: { ok: boolean; body?: string } | null };
          html: { visibleText: string };
        }>;
      };
      expect(extraction.successfulPages?.every((page) =>
        page.crawlPage.html === null &&
        (!page.crawlPage.fetch?.ok || page.crawlPage.fetch.body === "") &&
        page.html.visibleText === ""
      )).toBe(true);
    } finally {
      fixture.cleanup();
    }
  });

  it("returns the stored result after completion without reacquiring a lease", async () => {
    const fixture = createOfflinePipelineFixture();
    try {
      const input = fixture.makeInput();
      const first = await runOfflineLeadAssessment(input, fixture.dependencies);
      const leaseCount = fixture.database.prepare("SELECT COUNT(*) AS count FROM offline_worker_leases").get();
      const second = await runOfflineLeadAssessment(input, {
        ...fixture.dependencies,
        reliability: {
          ...fixture.dependencies.reliability,
          leaseToken: () => { throw new Error("terminal result must not acquire a lease"); },
        },
      });
      expect(second).toEqual(first);
      expect(fixture.database.prepare("SELECT COUNT(*) AS count FROM offline_worker_leases").get())
        .toEqual(leaseCount);
    } finally {
      fixture.cleanup();
    }
  });

  it.each([
    ["checkpoint_reference_missing", (fixture: ReturnType<typeof createOfflinePipelineFixture>) => {
      fixture.database.prepare("DELETE FROM coverage_manifests").run();
    }],
    ["incompatible_stage_version", (fixture: ReturnType<typeof createOfflinePipelineFixture>) => {
      fixture.database.prepare(`
        UPDATE offline_stage_checkpoints SET stage_version = 'coverage-planning-incompatible'
        WHERE stage_id = 'coverage_planning'
      `).run();
    }],
  ] as const)("routes unsafe checkpoint reconciliation to manual intervention: %s", async (reason, corrupt) => {
    let interrupted = false;
    const fixture = createOfflinePipelineFixture({
      afterStageCommitted(stage) {
        if (!interrupted && stage === "coverage_planning") {
          interrupted = true;
          throw new OfflineProcessInterrupted(stage);
        }
      },
    });
    try {
      const input = fixture.makeInput();
      await expect(runOfflineLeadAssessment(input, fixture.dependencies))
        .rejects.toBeInstanceOf(OfflineProcessInterrupted);
      corrupt(fixture);
      fixture.clock.advance(30_001);
      await expect(runOfflineLeadAssessment(input, fixture.dependencies))
        .rejects.toBeInstanceOf(OfflineManualInterventionError);
      expect(fixture.database.prepare(`
        SELECT execution_state, terminal_reason_code FROM offline_orchestration_runs
      `).get()).toEqual({ execution_state: "manual_intervention", terminal_reason_code: reason });
      expect(fixture.database.prepare(`
        SELECT reason_code FROM offline_manual_interventions
      `).get()).toEqual({ reason_code: reason });
    } finally {
      fixture.cleanup();
    }
  });
});
