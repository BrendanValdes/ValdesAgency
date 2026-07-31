import { statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { openLeadEngineDatabase } from "../../src/lead-engine/db/database.js";
import { withTransaction } from "../../src/lead-engine/db/transaction.js";
import { createTestDatabase } from "./fixtures/synthetic.js";

const repositoryRoot = path.resolve(process.cwd(), "..");

describe("SQLite database safety", () => {
  it("enables WAL, foreign keys, a busy timeout, and restrictive permissions", () => {
    const fixture = createTestDatabase();
    try {
      expect(fixture.database.pragma("journal_mode", { simple: true })).toBe("wal");
      expect(fixture.database.pragma("foreign_keys", { simple: true })).toBe(1);
      expect(fixture.database.pragma("busy_timeout", { simple: true })).toBe(5_000);
      expect(statSync(fixture.databasePath).mode & 0o777).toBe(0o600);
      expect(statSync(fixture.dataRoot).mode & 0o777).toBe(0o700);
    } finally {
      fixture.cleanup();
    }
  });

  it("enforces foreign keys", () => {
    const fixture = createTestDatabase();
    try {
      expect(() =>
        fixture.database
          .prepare(`
            INSERT INTO run_stages
              (id, run_id, stage_name, state, created_at, updated_at)
            VALUES ('stage-orphan', 'run-missing', 'test', 'not_checked', 'now', 'now')
          `)
          .run(),
      ).toThrow();
    } finally {
      fixture.cleanup();
    }
  });

  it("rolls back failed transactions", () => {
    const fixture = createTestDatabase();
    try {
      expect(() =>
        withTransaction(fixture.database, () => {
          fixture.database.prepare(`
            INSERT INTO businesses
              (id, canonical_name, state, niche_id, created_at, updated_at)
            VALUES ('rollback-business', 'Rollback Test Pools', 'unknown', 'pool_service', 'now', 'now')
          `).run();
          throw new Error("synthetic rollback");
        }),
      ).toThrow("synthetic rollback");
      const count = fixture.database
        .prepare("SELECT count(*) AS count FROM businesses")
        .get() as { count: number };
      expect(count.count).toBe(0);
    } finally {
      fixture.cleanup();
    }
  });

  it("rejects production and test databases inside the repository", () => {
    expect(() =>
      openLeadEngineDatabase({
        mode: "production",
        dataRoot: path.join(repositoryRoot, "lead-engine-data"),
        repositoryRoot,
      }),
    ).toThrow("outside the repository");

    expect(() =>
      openLeadEngineDatabase({
        mode: "test",
        databasePath: path.join(repositoryRoot, "phase1.sqlite"),
        repositoryRoot,
      }),
    ).toThrow("inside the repository");
  });

  it("performs no network access while opening and migrating", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const fixture = createTestDatabase();
    try {
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fixture.cleanup();
      fetchSpy.mockRestore();
    }
  });
});
