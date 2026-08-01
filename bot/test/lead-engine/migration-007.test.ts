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
import { createOfflineReliabilityFixture } from "./helpers/offline-reliability-fixture.js";
import { createTestDatabase, SYNTHETIC_TIMESTAMP } from "./fixtures/synthetic.js";

const migrations = [
  "001_core_runs_businesses.sql",
  "002_evidence_tasks_provider_calls.sql",
  "003_discovery_identity.sql",
  "004_website_assessment.sql",
  "005_provenance_verification_identity.sql",
  "006_offline_orchestration.sql",
  "007_offline_reliability.sql",
] as const;

describe("migration 007 offline reliability", () => {
  it("creates the reliability schema on a fresh temporary database", () => {
    const fixture = createTestDatabase();
    try {
      expect(getMigrationHistory(fixture.database).map(({ version }) => version))
        .toEqual([1, 2, 3, 4, 5, 6, 7]);
      const tables = fixture.database.prepare(`
        SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'offline_%'
        ORDER BY name
      `).all() as Array<{ name: string }>;
      expect(tables.map(({ name }) => name)).toEqual([
        "offline_execution_attempts",
        "offline_manual_interventions",
        "offline_orchestration_events",
        "offline_orchestration_runs",
        "offline_recovery_events",
        "offline_run_state_transitions",
        "offline_stage_checkpoints",
        "offline_worker_leases",
      ]);
    } finally {
      fixture.cleanup();
    }
  });

  it("upgrades a migration-006 database without changing earlier checksums", () => {
    const dataRoot = mkdtempSync(path.join(os.tmpdir(), "rocco-phase3d2-upgrade-"));
    const migrationRoot = mkdtempSync(path.join(os.tmpdir(), "rocco-phase3d2-migrations-"));
    const database = openLeadEngineDatabase({
      mode: "test",
      databasePath: path.join(dataRoot, "upgrade.sqlite"),
      repositoryRoot: path.resolve(process.cwd(), ".."),
    });
    try {
      for (const name of migrations.slice(0, 6)) {
        copyFileSync(path.join(DEFAULT_MIGRATIONS_DIRECTORY, name), path.join(migrationRoot, name));
      }
      migrateDatabase(database, { migrationsDirectory: migrationRoot, now: () => SYNTHETIC_TIMESTAMP });
      const phase3d1 = getMigrationHistory(database);
      copyFileSync(
        path.join(DEFAULT_MIGRATIONS_DIRECTORY, migrations[6]),
        path.join(migrationRoot, migrations[6]),
      );
      migrateDatabase(database, { migrationsDirectory: migrationRoot, now: () => SYNTHETIC_TIMESTAMP });
      const upgraded = getMigrationHistory(database);
      expect(upgraded.map(({ version }) => version)).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(upgraded.slice(0, 6).map(({ checksum }) => checksum))
        .toEqual(phase3d1.map(({ checksum }) => checksum));
    } finally {
      if (database.open) database.close();
      rmSync(dataRoot, { recursive: true, force: true });
      rmSync(migrationRoot, { recursive: true, force: true });
    }
  });

  it("rejects terminal reactivation, missing retry schedules, and incomplete terminal reasons", () => {
    const fixture = createOfflineReliabilityFixture();
    try {
      const completed = fixture.createRun("run-terminal-guard", "completed");
      expect(() => fixture.database.prepare(`
        UPDATE offline_orchestration_runs
        SET execution_state = 'running', status = 'running', completed_at = NULL,
            state_version = state_version + 1, last_transition_reason = 'invalid_reactivation',
            last_transition_at = ?
        WHERE run_id = ?
      `).run(fixture.clock.now(), completed)).toThrow("invalid offline run state transition");

      const pending = fixture.createRun("run-retry-guard");
      fixture.repository.transitionRun({ runId: pending, to: "running", reasonCode: "start" });
      expect(() => fixture.database.prepare(`
        UPDATE offline_orchestration_runs
        SET execution_state = 'waiting_retry', status = 'running', next_retry_at = NULL,
            state_version = state_version + 1, last_transition_reason = 'invalid_retry',
            last_transition_at = ?
        WHERE run_id = ?
      `).run(fixture.clock.now(), pending)).toThrow("waiting retry");
      expect(() => fixture.database.prepare(`
        UPDATE offline_orchestration_runs
        SET execution_state = 'failed_terminal', status = 'failed', completed_at = ?,
            terminal_reason_code = NULL, safe_error_summary = NULL,
            state_version = state_version + 1, last_transition_reason = 'invalid_terminal',
            last_transition_at = ?
        WHERE run_id = ?
      `).run(fixture.clock.now(), fixture.clock.now(), pending)).toThrow("terminal offline run metadata");
    } finally {
      fixture.cleanup();
    }
  });
});
