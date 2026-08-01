import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openLeadEngineDatabase } from "../../src/lead-engine/db/database.js";
import {
  DEFAULT_MIGRATIONS_DIRECTORY,
  getMigrationHistory,
  migrateDatabase,
} from "../../src/lead-engine/db/migrate.js";
import { runOfflineLeadAssessment } from "../../src/lead-engine/orchestration/offline-lead-pipeline.js";
import { POOL_SERVICE_ICP_MODEL_VERSION } from "../../src/lead-engine/qualification/pool-service-model.js";
import { createQualificationRepository } from "../../src/lead-engine/qualification/repository.js";
import { createOfflinePipelineFixture } from "./helpers/offline-pipeline-fixture.js";
import { SYNTHETIC_TIMESTAMP } from "./fixtures/synthetic.js";

const migrationNames = [
  "001_core_runs_businesses.sql",
  "002_evidence_tasks_provider_calls.sql",
  "003_discovery_identity.sql",
  "004_website_assessment.sql",
  "005_provenance_verification_identity.sql",
  "006_offline_orchestration.sql",
  "007_offline_reliability.sql",
  "008_icp_qualification_scoring.sql",
] as const;

describe("migration 008 ICP qualification scoring", () => {
  it("creates constrained qualification persistence and the new durable stage on a fresh database", () => {
    const fixture = createOfflinePipelineFixture();
    try {
      expect(getMigrationHistory(fixture.database).map(({ version }) => version))
        .toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      const tables = fixture.database.prepare(`
        SELECT name FROM sqlite_master
        WHERE type = 'table' AND name LIKE 'icp_qualification_%' ORDER BY name
      `).all() as Array<{ name: string }>;
      expect(tables.map(({ name }) => name)).toEqual([
        "icp_qualification_evaluations",
        "icp_qualification_evidence_references",
      ]);
      const checkpointSql = (fixture.database.prepare(`
        SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'offline_stage_checkpoints'
      `).get() as { sql: string }).sql;
      expect(checkpointSql).toContain("qualification_scoring");
    } finally {
      fixture.cleanup();
    }
  });

  it("upgrades a migration-007 database without changing earlier migration checksums", () => {
    const dataRoot = mkdtempSync(path.join(os.tmpdir(), "rocco-phase4a-upgrade-"));
    const migrationRoot = mkdtempSync(path.join(os.tmpdir(), "rocco-phase4a-migrations-"));
    const database = openLeadEngineDatabase({
      mode: "test",
      databasePath: path.join(dataRoot, "upgrade.sqlite"),
      repositoryRoot: path.resolve(process.cwd(), ".."),
    });
    try {
      for (const name of migrationNames.slice(0, 7)) {
        copyFileSync(path.join(DEFAULT_MIGRATIONS_DIRECTORY, name), path.join(migrationRoot, name));
      }
      migrateDatabase(database, { migrationsDirectory: migrationRoot, now: () => SYNTHETIC_TIMESTAMP });
      const phase3 = getMigrationHistory(database);
      copyFileSync(
        path.join(DEFAULT_MIGRATIONS_DIRECTORY, migrationNames[7]),
        path.join(migrationRoot, migrationNames[7]),
      );
      migrateDatabase(database, { migrationsDirectory: migrationRoot, now: () => SYNTHETIC_TIMESTAMP });
      const upgraded = getMigrationHistory(database);
      expect(upgraded.map(({ version }) => version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(upgraded.slice(0, 7).map(({ checksum }) => checksum))
        .toEqual(phase3.map(({ checksum }) => checksum));
      const stageSql = (database.prepare(`
        SELECT sql FROM sqlite_master WHERE name = 'offline_stage_checkpoints'
      `).get() as { sql: string }).sql;
      expect(stageSql).toContain("qualification_scoring");
    } finally {
      if (database.open) database.close();
      rmSync(dataRoot, { recursive: true, force: true });
      rmSync(migrationRoot, { recursive: true, force: true });
    }
  });

  it("persists idempotently, retains history, and creates a new row for a new model version", async () => {
    const fixture = createOfflinePipelineFixture();
    try {
      const result = await runOfflineLeadAssessment(fixture.makeInput({
        qualification: { modelVersion: POOL_SERVICE_ICP_MODEL_VERSION },
      }), fixture.dependencies);
      const first = result.qualification;
      expect(first).not.toBeNull();
      const repository = createQualificationRepository(fixture.database);
      expect(repository.save(first as NonNullable<typeof first>, result.websiteAssessment?.record.id)).toEqual(first);
      expect(repository.listForBusiness(first?.businessId ?? "")).toHaveLength(1);
      const next = {
        ...(first as NonNullable<typeof first>),
        evaluationId: "icp-qualification-model-v-next",
        modelVersion: "pool_service_icp_v1_1",
        inputFingerprint: "b".repeat(64),
        evaluatedAt: "2026-01-15T12:00:01.000Z",
        supersedesEvaluationId: first?.evaluationId ?? null,
      };
      const persisted = repository.save(next, result.websiteAssessment?.record.id);
      expect(persisted.modelVersion).toBe("pool_service_icp_v1_1");
      expect(persisted.supersedesEvaluationId).toBe(first?.evaluationId);
      expect(repository.listForBusiness(first?.businessId ?? "").map(({ evaluationId }) => evaluationId))
        .toEqual([first?.evaluationId, next.evaluationId]);
      expect(repository.getById(first?.evaluationId ?? "")).toEqual(first);
      expect(repository.getLatestForBusiness(first?.businessId ?? "")?.evaluationId).toBe(next.evaluationId);
      expect(repository.isStale(first?.evaluationId ?? "", "2026-02-16T12:00:00.000Z")).toBe(true);
    } finally {
      fixture.cleanup();
    }
  });

  it("persists auditable evidence references and rejects invalid score/result/review combinations", async () => {
    const fixture = createOfflinePipelineFixture();
    try {
      const result = await runOfflineLeadAssessment(fixture.makeInput({
        qualification: { modelVersion: POOL_SERVICE_ICP_MODEL_VERSION },
      }), fixture.dependencies);
      const evaluationId = result.qualification?.evaluationId as string;
      const referenceCount = (fixture.database.prepare(`
        SELECT COUNT(*) AS count FROM icp_qualification_evidence_references
        WHERE evaluation_id = ?
      `).get(evaluationId) as { count: number }).count;
      expect(referenceCount).toBe(result.qualification?.evidenceReferences.length);
      const rows = fixture.database.prepare(`
        SELECT source_table, source_id, rule_ids_json
        FROM icp_qualification_evidence_references WHERE evaluation_id = ? ORDER BY ordinal
      `).all(evaluationId) as Array<{ source_table: string; source_id: string; rule_ids_json: string }>;
      expect(rows.every((row) => row.source_table && row.source_id && JSON.parse(row.rule_ids_json).length > 0)).toBe(true);

      expect(() => fixture.database.prepare(`
        UPDATE icp_qualification_evaluations SET total_score = 101 WHERE id = ?
      `).run(evaluationId)).toThrow();
      expect(() => fixture.database.prepare(`
        UPDATE icp_qualification_evaluations SET score_tier = 'high_priority' WHERE id = ?
      `).run(evaluationId)).toThrow();
      expect(() => fixture.database.prepare(`
        UPDATE icp_qualification_evaluations
        SET icp_result = 'qualified', review_required = 0, review_reasons_json = '[]'
        WHERE id = ?
      `).run(evaluationId)).toThrow();
      expect(() => fixture.database.prepare(`
        UPDATE icp_qualification_evaluations SET icp_result = 'disqualified' WHERE id = ?
      `).run(evaluationId)).toThrow();
      expect(() => fixture.database.prepare(`
        UPDATE icp_qualification_evaluations
        SET icp_result = 'identity_review_required', identity_review_state = 'clear',
            review_required = 0, review_reasons_json = '[]'
        WHERE id = ?
      `).run(evaluationId)).toThrow();
    } finally {
      fixture.cleanup();
    }
  });
});
