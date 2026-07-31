import BetterSqlite3 from "better-sqlite3";
import { chmodSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertExternalDataRoot, isPathInside } from "../config/loader.js";

export type SqliteDatabase = BetterSqlite3.Database;

export type OpenDatabaseOptions =
  | {
      mode: "production";
      dataRoot: string;
      repositoryRoot: string;
      filename?: string;
      busyTimeoutMs?: number;
    }
  | {
      mode: "test";
      databasePath: string;
      repositoryRoot: string;
      busyTimeoutMs?: number;
    };

function assertBusyTimeout(value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > 60_000) {
    throw new Error("SQLite busy timeout must be an integer between 1 and 60000 ms");
  }
}

function resolveDatabasePath(options: OpenDatabaseOptions): string {
  const repositoryRoot = path.resolve(options.repositoryRoot);
  if (options.mode === "production") {
    const dataRoot = assertExternalDataRoot(options.dataRoot, repositoryRoot);
    const filename = options.filename ?? "rocco-lead-engine.sqlite";
    if (path.basename(filename) !== filename || !/^[a-z0-9._-]+\.sqlite$/i.test(filename)) {
      throw new Error("SQLite filename must be a simple .sqlite filename");
    }
    mkdirSync(dataRoot, { recursive: true, mode: 0o700 });
    chmodSync(dataRoot, 0o700);
    return path.join(dataRoot, filename);
  }

  if (!path.isAbsolute(options.databasePath)) {
    throw new Error("Test database path must be absolute");
  }
  const databasePath = path.resolve(options.databasePath);
  if (isPathInside(repositoryRoot, databasePath)) {
    throw new Error("SQLite databases cannot be created inside the repository");
  }
  const temporaryRoot = path.resolve(os.tmpdir());
  if (!isPathInside(temporaryRoot, databasePath)) {
    throw new Error("Test SQLite databases must be created under the OS temp directory");
  }
  const parent = path.dirname(databasePath);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  chmodSync(parent, 0o700);
  return databasePath;
}

export function openLeadEngineDatabase(options: OpenDatabaseOptions): SqliteDatabase {
  const busyTimeoutMs = options.busyTimeoutMs ?? 5_000;
  assertBusyTimeout(busyTimeoutMs);
  const databasePath = resolveDatabasePath(options);
  const database = new BetterSqlite3(databasePath, { timeout: busyTimeoutMs });

  try {
    database.pragma("journal_mode = WAL");
    database.pragma("foreign_keys = ON");
    database.pragma(`busy_timeout = ${busyTimeoutMs}`);
    database.pragma("synchronous = NORMAL");
    chmodSync(databasePath, 0o600);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}
