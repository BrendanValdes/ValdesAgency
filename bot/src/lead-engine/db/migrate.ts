import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { SqliteDatabase } from "./database.js";
import { withTransaction } from "./transaction.js";

export interface Migration {
  version: number;
  name: string;
  checksum: string;
  sql: string;
}

export interface AppliedMigration {
  version: number;
  name: string;
  checksum: string;
  appliedAt: string;
}

const adjacentMigrationsDirectory = fileURLToPath(
  new URL("../migrations", import.meta.url),
);
const sourceMigrationsDirectory = fileURLToPath(
  new URL("../../../src/lead-engine/migrations", import.meta.url),
);

export const DEFAULT_MIGRATIONS_DIRECTORY = existsSync(adjacentMigrationsDirectory)
  ? adjacentMigrationsDirectory
  : sourceMigrationsDirectory;

function migrationChecksum(sql: string): string {
  return createHash("sha256").update(sql, "utf8").digest("hex");
}

export function loadMigrations(
  migrationsDirectory = DEFAULT_MIGRATIONS_DIRECTORY,
): Migration[] {
  const migrations = readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => {
      const match = name.match(/^(\d{3})_([a-z0-9_]+)\.sql$/);
      if (!match) {
        throw new Error("Migration filenames must use NNN_lowercase_name.sql");
      }
      const sql = readFileSync(path.join(migrationsDirectory, name), "utf8");
      return {
        version: Number(match[1]),
        name,
        checksum: migrationChecksum(sql),
        sql,
      };
    })
    .sort((left, right) => left.version - right.version);

  for (let index = 0; index < migrations.length; index += 1) {
    const expectedVersion = index + 1;
    if (migrations[index]?.version !== expectedVersion) {
      throw new Error("Migrations must be contiguous and forward-only from version 1");
    }
  }
  return migrations;
}

function ensureMigrationHistory(database: SqliteDatabase): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS migration_history (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT
  `);
}

export function getMigrationHistory(database: SqliteDatabase): AppliedMigration[] {
  ensureMigrationHistory(database);
  const rows = database
    .prepare(
      "SELECT version, name, checksum, applied_at AS appliedAt FROM migration_history ORDER BY version",
    )
    .all() as AppliedMigration[];
  return rows;
}

export function migrateDatabase(
  database: SqliteDatabase,
  options: { migrationsDirectory?: string; now?: () => string } = {},
): AppliedMigration[] {
  const migrations = loadMigrations(options.migrationsDirectory);
  const now = options.now ?? (() => new Date().toISOString());
  ensureMigrationHistory(database);

  const applied = getMigrationHistory(database);
  for (const history of applied) {
    const migration = migrations.find((candidate) => candidate.version === history.version);
    if (!migration || migration.name !== history.name || migration.checksum !== history.checksum) {
      throw new Error("Applied migration history does not match immutable migration files");
    }
  }

  const appliedVersions = new Set(applied.map((migration) => migration.version));
  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) continue;

    const disableForeignKeys = migration.version === 11;
    if (disableForeignKeys) database.exec("PRAGMA foreign_keys = OFF");

    try {
      withTransaction(database, () => {
        database.exec(migration.sql);

        if (disableForeignKeys) {
          const violations = database.prepare("PRAGMA foreign_key_check").all();
          if (violations.length > 0) {
            throw new Error("Migration 011 produced foreign-key violations");
          }
        }

        database
          .prepare(
            "INSERT INTO migration_history (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)",
          )
          .run(migration.version, migration.name, migration.checksum, now());
      });
    } finally {
      if (disableForeignKeys) database.exec("PRAGMA foreign_keys = ON");
    }
  }

  return getMigrationHistory(database);
}
