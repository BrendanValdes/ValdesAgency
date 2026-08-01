import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openLeadEngineDatabase } from "../../src/lead-engine/db/database.js";
import { DEFAULT_MIGRATIONS_DIRECTORY, getMigrationHistory, loadMigrations, migrateDatabase } from "../../src/lead-engine/db/migrate.js";
import { createRankingFixture } from "./helpers/ranking-fixture.js";

describe("migration 009 internal calling queue", () => {
  it("creates all constrained queue tables on a fresh database", () => {
    const fixture = createRankingFixture();
    try {
      expect(getMigrationHistory(fixture.database).map((item) => item.version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      const tables = fixture.database.prepare(`
        SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'lead_queue_%' ORDER BY name
      `).all() as Array<{ name: string }>;
      expect(tables.map((item) => item.name)).toEqual([
        "lead_queue_entries",
        "lead_queue_entry_reasons",
        "lead_queue_evidence_references",
        "lead_queue_generation_attempts",
        "lead_queue_snapshots",
      ]);
    } finally {
      fixture.cleanup();
    }
  });

  it("upgrades from migration 008 without changing its history", () => {
    const dataRoot = mkdtempSync(path.join(os.tmpdir(), "rocco-phase4b-upgrade-"));
    const migrationRoot = mkdtempSync(path.join(os.tmpdir(), "rocco-phase4b-migrations-"));
    const database = openLeadEngineDatabase({ mode: "test", databasePath: path.join(dataRoot, "upgrade.sqlite"), repositoryRoot: path.resolve(process.cwd(), "..") });
    try {
      for (let version = 1; version <= 8; version += 1) {
        const name = loadMigrations()
          .find((item) => item.version === version)!.name;
        copyFileSync(path.join(DEFAULT_MIGRATIONS_DIRECTORY, name), path.join(migrationRoot, name));
      }
      migrateDatabase(database, { migrationsDirectory: migrationRoot, now: () => "2026-01-20T12:00:00.000Z" });
      const before = getMigrationHistory(database);
      copyFileSync(path.join(DEFAULT_MIGRATIONS_DIRECTORY, "009_internal_calling_queue.sql"), path.join(migrationRoot, "009_internal_calling_queue.sql"));
      migrateDatabase(database, { migrationsDirectory: migrationRoot, now: () => "2026-01-20T12:00:00.000Z" });
      const after = getMigrationHistory(database);
      expect(after.map((item) => item.version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expect(after.slice(0, 8).map((item) => item.checksum)).toEqual(before.map((item) => item.checksum));
    } finally {
      if (database.open) database.close();
      rmSync(dataRoot, { recursive: true, force: true });
      rmSync(migrationRoot, { recursive: true, force: true });
    }
  });
});
