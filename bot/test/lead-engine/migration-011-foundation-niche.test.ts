import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MIGRATIONS_DIRECTORY,
  loadMigrations,
  migrateDatabase,
} from "../../src/lead-engine/db/migrate.js";
import { createTestDatabase } from "./fixtures/synthetic.js";

describe("migration 011 foundation-waterproofing niche", () => {
  it("allows pool and foundation enabled together while keeping pool default", () => {
    const fixture = createTestDatabase();
    try {
      const insert = fixture.database.prepare(`
        INSERT INTO niche_configuration_versions
          (id, niche_id, configuration_version, configuration_hash, enabled, is_default, created_at)
        VALUES (?, ?, '1.0.0', ?, 1, ?, '2026-08-08T00:00:00.000Z')
      `);
      insert.run("niche-pool-v1", "pool_service", "a".repeat(64), 1);
      insert.run("niche-foundation-v1", "foundation_waterproofing", "b".repeat(64), 0);
      expect(fixture.database.prepare(`
        SELECT niche_id, enabled, is_default
        FROM niche_configuration_versions ORDER BY niche_id
      `).all()).toEqual([
        { niche_id: "foundation_waterproofing", enabled: 1, is_default: 0 },
        { niche_id: "pool_service", enabled: 1, is_default: 1 },
      ]);
      expect(() => insert.run(
        "niche-septic-v1", "septic_pumping_repair", "c".repeat(64), 0,
      )).toThrow();
    } finally {
      fixture.cleanup();
    }
  });

  it("migrates an existing pool evaluation without deleting data or breaking foreign keys", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "rocco-migration-011-"));
    const legacyMigrations = path.join(root, "migrations");
    const databasePath = path.join(root, "legacy.sqlite");
    const database = new Database(databasePath);
    try {
      mkdirSync(legacyMigrations);
      for (const migration of loadMigrations().filter((entry) => entry.version <= 10)) {
        copyFileSync(
          path.join(DEFAULT_MIGRATIONS_DIRECTORY, migration.name),
          path.join(legacyMigrations, migration.name),
        );
      }
      migrateDatabase(database, { migrationsDirectory: legacyMigrations });
      database.prepare(`
        INSERT INTO businesses (id, canonical_name, state, niche_id, created_at, updated_at)
        VALUES ('pool-business', 'Preserved Pool Service', 'found', 'pool_service', ?, ?)
      `).run("2026-08-07T00:00:00.000Z", "2026-08-07T00:00:00.000Z");
      database.prepare(`
        INSERT INTO icp_qualification_evaluations (
          id, run_id, business_id, assessment_id, model_version, niche_id, input_fingerprint,
          evaluated_at, fresh_until, icp_result, total_score, score_tier,
          hard_disqualifiers_json, component_scores_json, positive_signals_json,
          negative_signals_json, missing_information_json, evidence_references_json,
          freshness_warnings_json, verification_limitations_json, identity_review_state,
          review_required, review_reasons_json, confidence_json, evidence_quality_json,
          final_explanation, result_json, supersedes_evaluation_id, created_at
        ) VALUES (
          'pool-evaluation', NULL, 'pool-business', NULL, 'pool_service_icp_v1',
          'pool_service', ?, ?, ?, 'qualified', 65, 'qualified',
          '[]', '[]', '[]', '[]', '[]', '[]', '[]', '[]', 'clear', 0, '[]', '{}', '{}',
          'Preserved pool evaluation.', '{}', NULL, ?
        )
      `).run(
        "a".repeat(64),
        "2026-08-07T00:00:00.000Z",
        "2026-09-07T00:00:00.000Z",
        "2026-08-07T00:00:00.000Z",
      );

      migrateDatabase(database);

      expect(database.prepare("SELECT canonical_name, niche_id FROM businesses WHERE id = 'pool-business'").get())
        .toEqual({ canonical_name: "Preserved Pool Service", niche_id: "pool_service" });
      expect(database.prepare("SELECT model_version, niche_id FROM icp_qualification_evaluations WHERE id = 'pool-evaluation'").get())
        .toEqual({ model_version: "pool_service_icp_v1", niche_id: "pool_service" });
      expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      database.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
