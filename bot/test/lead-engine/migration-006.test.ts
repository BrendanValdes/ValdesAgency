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
import { createTestDatabase, SYNTHETIC_TIMESTAMP } from "./fixtures/synthetic.js";

const migrationNames = [
  "001_core_runs_businesses.sql",
  "002_evidence_tasks_provider_calls.sql",
  "003_discovery_identity.sql",
  "004_website_assessment.sql",
  "005_provenance_verification_identity.sql",
  "006_offline_orchestration.sql",
] as const;

describe("migration 006 offline orchestration metadata", () => {
  it("creates truthful run and event state on a fresh temporary database", () => {
    const fixture = createTestDatabase();
    try {
      expect(getMigrationHistory(fixture.database).map(({ version }) => version))
        .toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      const tables = fixture.database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all() as Array<{ name: string }>;
      expect(tables.map(({ name }) => name)).toEqual(expect.arrayContaining([
        "offline_orchestration_runs",
        "offline_orchestration_events",
      ]));
    } finally {
      fixture.cleanup();
    }
  });

  it("upgrades a migration-005 database without changing earlier checksums", () => {
    const dataRoot = mkdtempSync(path.join(os.tmpdir(), "rocco-phase3d1-upgrade-"));
    const migrationRoot = mkdtempSync(path.join(os.tmpdir(), "rocco-phase3d1-migrations-"));
    const database = openLeadEngineDatabase({
      mode: "test",
      databasePath: path.join(dataRoot, "upgrade.sqlite"),
      repositoryRoot: path.resolve(process.cwd(), ".."),
    });
    try {
      for (const name of migrationNames.slice(0, 5)) {
        copyFileSync(
          path.join(DEFAULT_MIGRATIONS_DIRECTORY, name),
          path.join(migrationRoot, name),
        );
      }
      migrateDatabase(database, {
        migrationsDirectory: migrationRoot,
        now: () => SYNTHETIC_TIMESTAMP,
      });
      const phase3cHistory = getMigrationHistory(database);
      copyFileSync(
        path.join(DEFAULT_MIGRATIONS_DIRECTORY, migrationNames[5]),
        path.join(migrationRoot, migrationNames[5]),
      );
      migrateDatabase(database, {
        migrationsDirectory: migrationRoot,
        now: () => SYNTHETIC_TIMESTAMP,
      });
      const upgraded = getMigrationHistory(database);
      expect(upgraded.map(({ version }) => version)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(upgraded.slice(0, 5).map(({ checksum }) => checksum))
        .toEqual(phase3cHistory.map(({ checksum }) => checksum));
    } finally {
      if (database.open) database.close();
      rmSync(dataRoot, { recursive: true, force: true });
      rmSync(migrationRoot, { recursive: true, force: true });
    }
  });

  it("rejects invalid execution, status, and JSON states", () => {
    const fixture = createTestDatabase();
    try {
      fixture.database.prepare(`
        INSERT INTO lead_runs
          (id, state, niche_id, budget_micro_usd, spent_micro_usd, policy_version, created_at, updated_at)
        VALUES ('run-migration-006', 'running', 'pool_service', 0, 0, '1.0.0', ?, ?)
      `).run(SYNTHETIC_TIMESTAMP, SYNTHETIC_TIMESTAMP);
      const insert = fixture.database.prepare(`
        INSERT INTO offline_orchestration_runs
          (run_id, run_key, input_hash, execution_mode, status, niche_id, provider_id,
           fixture_id, fixture_url, policy_version, orchestration_version, extraction_version,
           budget_json, usage_json, started_at, updated_at)
        VALUES ('run-migration-006', 'run-key', ?, ?, ?, 'pool_service', 'fixture',
          'fixture-id', 'https://fixture.example/', '1.0.0', 'offline-orchestration-1.0.0',
          'website-extraction-1.0.0', ?, '{}', ?, ?)
      `);
      expect(() => insert.run(
        "a".repeat(64),
        "public_web",
        "running",
        "{}",
        SYNTHETIC_TIMESTAMP,
        SYNTHETIC_TIMESTAMP,
      )).toThrow();
      expect(() => insert.run(
        "a".repeat(64),
        "offline_synthetic",
        "cancelled",
        "not-json",
        SYNTHETIC_TIMESTAMP,
        SYNTHETIC_TIMESTAMP,
      )).toThrow();
    } finally {
      fixture.cleanup();
    }
  });
});
