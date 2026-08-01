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
import { createTestDatabase, SYNTHETIC_TIMESTAMP, syntheticBusiness } from "./fixtures/synthetic.js";

function insertBusiness(database: ReturnType<typeof openLeadEngineDatabase>) {
  database.prepare(`INSERT INTO businesses
    (id, canonical_name, state, niche_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .run(syntheticBusiness.id, syntheticBusiness.canonicalName, syntheticBusiness.state,
      syntheticBusiness.nicheId, SYNTHETIC_TIMESTAMP, SYNTHETIC_TIMESTAMP);
}

function insertEvidence(database: ReturnType<typeof openLeadEngineDatabase>, overrides: Record<string, unknown> = {}) {
  const row = {
    id: "evidence-migration-005",
    source_class: "external_verification_provider",
    claim_state: "externally_verified",
    source_confirmation_state: "unassessed",
    external_verification_state: "current",
    human_review_state: "unreviewed",
    verification_dimension: "email_deliverability",
    verifier_id: "verifier-synthetic-001",
    verification_method: "email_deliverability_check",
    verification_result: "passed",
    verified_at: "2026-01-15T11:00:00.000Z",
    expires_at: "2026-02-15T11:00:00.000Z",
    normalized_value: "contact@example.test",
    evidence_reference: "provider-ref-synthetic-001",
    ...overrides,
  };
  database.prepare(`INSERT INTO evidence
    (id, entity_type, entity_id, field_name, claimed_value, source, source_url, observed_at, fetched_at,
     confidence_basis_points, extraction_method, conflict_status, raw_reference_checksum, policy_version,
     evidence_state, verification_state, decision_state, verification_method, verified_at, created_at, updated_at,
     source_class, claim_state, source_confirmation_state, external_verification_state, human_review_state,
     verification_dimension, verifier_id, verification_result, expires_at, normalized_value, evidence_reference)
    VALUES (@id, 'business', 'business-synthetic-001', 'email', 'contact@example.test', 'synthetic-verifier', NULL,
      '${SYNTHETIC_TIMESTAMP}', '${SYNTHETIC_TIMESTAMP}', 10000, 'provider', 'none', NULL, 'phase3c-test-v1',
      'found', 'externally_verified', 'accepted', @verification_method, @verified_at,
      '${SYNTHETIC_TIMESTAMP}', '${SYNTHETIC_TIMESTAMP}', @source_class, @claim_state,
      @source_confirmation_state, @external_verification_state, @human_review_state,
      @verification_dimension, @verifier_id, @verification_result, @expires_at, @normalized_value, @evidence_reference)`)
    .run(row);
}

describe("migration 005 provenance, verification, and identity enforcement", () => {
  it("applies the forward-only migration and creates auditable decision tables", () => {
    const fixture = createTestDatabase();
    try {
      expect(getMigrationHistory(fixture.database).map(({ version }) => version)).toEqual([1, 2, 3, 4, 5, 6]);
      const tables = fixture.database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>;
      expect(tables.map(({ name }) => name)).toEqual(expect.arrayContaining([
        "evidence_promotion_decisions",
        "identity_decision_audits",
      ]));
      const evidenceColumns = fixture.database.prepare("PRAGMA table_info(evidence)").all() as Array<{ name: string }>;
      expect(evidenceColumns.map(({ name }) => name)).toEqual(expect.arrayContaining([
        "source_class",
        "claim_state",
        "source_confirmation_state",
        "external_verification_state",
        "verification_dimension",
        "verifier_id",
        "verification_result",
        "expires_at",
        "normalized_value",
        "evidence_reference",
      ]));
    } finally {
      fixture.cleanup();
    }
  });

  it("upgrades a migration-004 database without rewriting migrations 001 through 004", () => {
    const dataRoot = mkdtempSync(path.join(os.tmpdir(), "rocco-phase3c-upgrade-"));
    const migrationRoot = mkdtempSync(path.join(os.tmpdir(), "rocco-phase3c-migrations-"));
    const databasePath = path.join(dataRoot, "upgrade.sqlite");
    const repositoryRoot = path.resolve(process.cwd(), "..");
    const database = openLeadEngineDatabase({ mode: "test", databasePath, repositoryRoot });
    try {
      for (let version = 1; version <= 4; version += 1) {
        const name = [
          "001_core_runs_businesses.sql",
          "002_evidence_tasks_provider_calls.sql",
          "003_discovery_identity.sql",
          "004_website_assessment.sql",
        ][version - 1] as string;
        copyFileSync(path.join(DEFAULT_MIGRATIONS_DIRECTORY, name), path.join(migrationRoot, name));
      }
      migrateDatabase(database, { migrationsDirectory: migrationRoot });
      database.prepare(`INSERT INTO evidence
        (id, entity_type, entity_id, field_name, claimed_value, source, source_url, observed_at, fetched_at,
         confidence_basis_points, extraction_method, conflict_status, raw_reference_checksum, policy_version,
         evidence_state, verification_state, decision_state, verification_method, verified_at, created_at, updated_at)
        VALUES ('legacy-evidence', 'business', 'legacy-business', 'name', 'Legacy claim', 'legacy', NULL, ?, ?,
          9000, 'manual', 'none', NULL, 'legacy-v1', 'found', 'externally_verified', 'accepted', 'manual', ?, ?, ?)`)
        .run(SYNTHETIC_TIMESTAMP, SYNTHETIC_TIMESTAMP, SYNTHETIC_TIMESTAMP, SYNTHETIC_TIMESTAMP, SYNTHETIC_TIMESTAMP);
      copyFileSync(
        path.join(DEFAULT_MIGRATIONS_DIRECTORY, "005_provenance_verification_identity.sql"),
        path.join(migrationRoot, "005_provenance_verification_identity.sql"),
      );
      migrateDatabase(database, { migrationsDirectory: migrationRoot });
      expect(getMigrationHistory(database).map(({ version }) => version)).toEqual([1, 2, 3, 4, 5]);
      expect(database.prepare(`SELECT source_class, claim_state, external_verification_state, verification_state
        FROM evidence WHERE id = 'legacy-evidence'`).get()).toEqual({
        source_class: "legacy_unclassified",
        claim_state: "unknown",
        external_verification_state: "unassessed",
        verification_state: "not_checked",
      });
    } finally {
      if (database.open) database.close();
      rmSync(dataRoot, { recursive: true, force: true });
      rmSync(migrationRoot, { recursive: true, force: true });
    }
  });

  it("rejects missing or unsupported source classes", () => {
    const fixture = createTestDatabase();
    try {
      expect(() => insertEvidence(fixture.database, { source_class: null })).toThrow();
      expect(() => insertEvidence(fixture.database, { id: "invalid-source", source_class: "other" })).toThrow();
    } finally {
      fixture.cleanup();
    }
  });

  it("rejects incomplete, historical, and expired externally verified rows", () => {
    const fixture = createTestDatabase();
    try {
      expect(() => insertEvidence(fixture.database, { verifier_id: null })).toThrow();
      expect(() => insertEvidence(fixture.database, { id: "historical-external", source_class: "historical_manual_artifact" })).toThrow();
      expect(() => insertEvidence(fixture.database, {
        id: "expired-external",
        expires_at: "2026-01-15T11:30:00.000Z",
      })).toThrow();
      expect(() => insertEvidence(fixture.database, {
        id: "wrong-verification-dimension",
        verification_method: "email_syntax_validation",
      })).toThrow();
    } finally {
      fixture.cleanup();
    }
  });

  it("allows a missing person name but rejects placeholders and business-name fallbacks", () => {
    const fixture = createTestDatabase();
    try {
      insertBusiness(fixture.database);
      const insert = fixture.database.prepare(`INSERT INTO contacts
        (id, business_id, entity_type, person_name, title, role, evidence_state, verification_state,
         decision_state, created_at, updated_at, source_class, claim_state, relationship_evidence_id)
        VALUES (?, ?, 'person', ?, NULL, 'unknown', 'not_checked', 'not_checked', 'unknown', ?, ?,
          'synthetic_fixture', 'unknown', NULL)`);
      expect(() => insert.run("person-missing", syntheticBusiness.id, null, SYNTHETIC_TIMESTAMP, SYNTHETIC_TIMESTAMP)).not.toThrow();
      for (const name of ["unknown", "n/a", "n a", "owner", syntheticBusiness.canonicalName, "hello@example.test", "2025550100"]) {
        expect(() => insert.run(`person-${name}`, syntheticBusiness.id, name, SYNTHETIC_TIMESTAMP, SYNTHETIC_TIMESTAMP)).toThrow();
      }
    } finally {
      fixture.cleanup();
    }
  });

  it("persists structured identity decision audit evidence", () => {
    const fixture = createTestDatabase();
    try {
      fixture.database.prepare(`INSERT INTO identity_decision_audits
        (id, left_entity_id, right_entity_id, action, rule, confidence_basis_points,
         supporting_signals_json, conflicting_signals_json, verification_dimensions_json,
         review_reason, policy_version, decided_at)
        VALUES ('decision-audit-synthetic', 'business-a', 'business-b', 'human_review', 'conflicting_identifiers',
          10000, '["verified_domain:shared.example"]', '["trusted_provider_identifier_conflict:overture"]',
          '["business_canonical_domain"]', 'strong_identifier_conflict', 'identity-2.0.0', ?)`)
        .run(SYNTHETIC_TIMESTAMP);
      expect(fixture.database.prepare(`SELECT action, rule, confidence_basis_points, review_reason
        FROM identity_decision_audits WHERE id = 'decision-audit-synthetic'`).get()).toEqual({
        action: "human_review",
        rule: "conflicting_identifiers",
        confidence_basis_points: 10000,
        review_reason: "strong_identifier_conflict",
      });
    } finally {
      fixture.cleanup();
    }
  });
});
