import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MIGRATIONS_DIRECTORY,
  getMigrationHistory,
  loadMigrations,
  migrateDatabase,
} from "../../src/lead-engine/db/migrate.js";
import { createTestDatabase } from "./fixtures/synthetic.js";

const expectedTables = [
  "artifact_references",
  "business_aliases",
  "business_group_locations",
  "business_groups",
  "business_identifiers",
  "business_locations",
  "businesses",
  "contacts",
  "conversion_feature_observations",
  "coverage_cells",
  "coverage_manifests",
  "crawl_cache_entries",
  "crawl_failures",
  "discovery_observations",
  "discovery_queries",
  "evidence",
  "evidence_conflicts",
  "evidence_promotion_decisions",
  "icp_qualification_evaluations",
  "icp_qualification_evidence_references",
  "identity_candidates",
  "identity_conflicts",
  "identity_decision_audits",
  "identity_matches",
  "lead_runs",
  "merge_decisions",
  "migration_history",
  "niche_configuration_versions",
  "offline_execution_attempts",
  "offline_manual_interventions",
  "offline_orchestration_events",
  "offline_orchestration_runs",
  "offline_recovery_events",
  "offline_run_state_transitions",
  "offline_stage_checkpoints",
  "offline_worker_leases",
  "person_evidence_candidates",
  "provider_calls",
  "provider_result_identifiers",
  "robots_decisions",
  "run_stages",
  "service_evidence",
  "stage_tasks",
  "structured_data_observations",
  "website_assessments",
  "website_contact_observations",
  "website_fetches",
  "website_identity_conflicts",
  "website_links",
  "website_pages",
];

describe("forward-only migrations", () => {
  it("creates the complete Phase 1 through Phase 3D2 foundation on a fresh database", () => {
    const fixture = createTestDatabase();
    try {
      const tables = fixture.database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all() as Array<{ name: string }>;
      expect(tables.map(({ name }) => name)).toEqual(expectedTables);
    } finally {
      fixture.cleanup();
    }
  });

  it("re-runs safely and preserves ordered migration history", () => {
    const fixture = createTestDatabase();
    try {
      const before = getMigrationHistory(fixture.database);
      const after = migrateDatabase(fixture.database);
      expect(after).toEqual(before);
      expect(after.map(({ version }) => version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(after.map(({ name }) => name)).toEqual([
        "001_core_runs_businesses.sql",
        "002_evidence_tasks_provider_calls.sql",
        "003_discovery_identity.sql",
        "004_website_assessment.sql",
        "005_provenance_verification_identity.sql",
        "006_offline_orchestration.sql",
        "007_offline_reliability.sql",
        "008_icp_qualification_scoring.sql",
      ]);
      expect(after.every(({ checksum }) => /^[a-f0-9]{64}$/.test(checksum))).toBe(true);
    } finally {
      fixture.cleanup();
    }
  });

  it("rejects gaps and detects changes to already-applied migrations", () => {
    const gapRoot = mkdtempSync(path.join(os.tmpdir(), "rocco-migration-gap-"));
    writeFileSync(path.join(gapRoot, "002_gap.sql"), "SELECT 1;\n", "utf8");
    expect(() => loadMigrations(gapRoot)).toThrow("contiguous");
    rmSync(gapRoot, { recursive: true, force: true });

    const fixture = createTestDatabase();
    const changedRoot = mkdtempSync(path.join(os.tmpdir(), "rocco-migration-changed-"));
    try {
      copyFileSync(
        path.join(DEFAULT_MIGRATIONS_DIRECTORY, "001_core_runs_businesses.sql"),
        path.join(changedRoot, "001_core_runs_businesses.sql"),
      );
      copyFileSync(
        path.join(DEFAULT_MIGRATIONS_DIRECTORY, "002_evidence_tasks_provider_calls.sql"),
        path.join(changedRoot, "002_evidence_tasks_provider_calls.sql"),
      );
      copyFileSync(
        path.join(DEFAULT_MIGRATIONS_DIRECTORY, "003_discovery_identity.sql"),
        path.join(changedRoot, "003_discovery_identity.sql"),
      );
      copyFileSync(
        path.join(DEFAULT_MIGRATIONS_DIRECTORY, "004_website_assessment.sql"),
        path.join(changedRoot, "004_website_assessment.sql"),
      );
      copyFileSync(
        path.join(DEFAULT_MIGRATIONS_DIRECTORY, "005_provenance_verification_identity.sql"),
        path.join(changedRoot, "005_provenance_verification_identity.sql"),
      );
      writeFileSync(
        path.join(changedRoot, "002_evidence_tasks_provider_calls.sql"),
        "SELECT 2;\n",
        "utf8",
      );
      expect(() =>
        migrateDatabase(fixture.database, { migrationsDirectory: changedRoot }),
      ).toThrow("does not match");
    } finally {
      fixture.cleanup();
      rmSync(changedRoot, { recursive: true, force: true });
    }
  });
});
