import { describe, expect, it } from "vitest";
import { createTestDatabase } from "./fixtures/synthetic.js";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

describe("migration 003 discovery and identity state", () => {
  it("persists pool service as the only enabled/default niche configuration", () => {
    const fixture = createTestDatabase();
    try {
      const insert = fixture.database.prepare(`
        INSERT INTO niche_configuration_versions
          (id, niche_id, configuration_version, configuration_hash, enabled, is_default, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      insert.run("niche-pool-v1", "pool_service", "1.0.0", HASH_A, 1, 1, "2026-01-15T12:00:00.000Z");
      insert.run("niche-septic-v1", "septic_pumping_repair", "1.0.0", HASH_B, 0, 0, "2026-01-15T12:00:00.000Z");
      expect(() =>
        insert.run("niche-septic-enabled", "septic_pumping_repair", "2.0.0", "c".repeat(64), 1, 0, "2026-01-15T12:00:00.000Z"),
      ).toThrow();
      const enabled = fixture.database.prepare("SELECT niche_id FROM niche_configuration_versions WHERE enabled = 1").all();
      expect(enabled).toEqual([{ niche_id: "pool_service" }]);
    } finally {
      fixture.cleanup();
    }
  });

  it("enforces one default and canonical provider-result uniqueness", () => {
    const fixture = createTestDatabase();
    try {
      fixture.database.prepare(`
        INSERT INTO niche_configuration_versions
          (id, niche_id, configuration_version, configuration_hash, enabled, is_default, created_at)
        VALUES ('niche-pool-v1', 'pool_service', '1.0.0', ?, 1, 1, '2026-01-15T12:00:00.000Z')
      `).run(HASH_A);
      expect(() =>
        fixture.database.prepare(`
          INSERT INTO niche_configuration_versions
            (id, niche_id, configuration_version, configuration_hash, enabled, is_default, created_at)
          VALUES ('niche-pool-v2', 'pool_service', '2.0.0', ?, 1, 1, '2026-01-15T12:00:00.000Z')
        `).run(HASH_B),
      ).toThrow();
      const tableSql = fixture.database
        .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'provider_result_identifiers'")
        .get() as { sql: string };
      expect(tableSql.sql).toContain("PRIMARY KEY (provider_id, provider_result_id)");
    } finally {
      fixture.cleanup();
    }
  });
});
