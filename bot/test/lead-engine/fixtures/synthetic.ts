import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createEvidence } from "../../../src/lead-engine/domain/evidence.js";
import { microUsd } from "../../../src/lead-engine/domain/money.js";
import type {
  Business,
  Contact,
  Evidence,
  LeadRun,
  RunStage,
  StageTask,
} from "../../../src/lead-engine/domain/types.js";
import {
  openLeadEngineDatabase,
  type SqliteDatabase,
} from "../../../src/lead-engine/db/database.js";
import { migrateDatabase } from "../../../src/lead-engine/db/migrate.js";

export const synthetic_fixture = true;
export const SYNTHETIC_TIMESTAMP = "2026-01-15T12:00:00.000Z";

export const syntheticContactValues = {
  email: "avery@example.test",
  phone: "+1 202-555-0100",
  domain: "clearwater.example",
} as const;

export const syntheticRun: LeadRun = {
  id: "run-synthetic-001",
  state: "not_checked",
  nicheId: "pool_service",
  budgetMicroUsd: microUsd(5_000_000),
  spentMicroUsd: microUsd(0),
  policyVersion: "phase1-test-v1",
  createdAt: SYNTHETIC_TIMESTAMP,
  updatedAt: SYNTHETIC_TIMESTAMP,
};

export const syntheticStage: RunStage = {
  id: "stage-synthetic-001",
  runId: syntheticRun.id,
  stageName: "foundation_test",
  state: "not_checked",
  startedAt: null,
  finishedAt: null,
  createdAt: SYNTHETIC_TIMESTAMP,
  updatedAt: SYNTHETIC_TIMESTAMP,
};

export const syntheticBusiness: Business = {
  id: "business-synthetic-001",
  canonicalName: "Clearwater Test Pools",
  state: "unknown",
  nicheId: "pool_service",
  createdAt: SYNTHETIC_TIMESTAMP,
  updatedAt: SYNTHETIC_TIMESTAMP,
};

export const syntheticTask: StageTask = {
  id: "task-synthetic-001",
  stageId: syntheticStage.id,
  businessId: syntheticBusiness.id,
  taskName: "foundation_round_trip",
  state: "not_checked",
  reasonCode: "value_not_checked",
  attempt: 0,
  createdAt: SYNTHETIC_TIMESTAMP,
  updatedAt: SYNTHETIC_TIMESTAMP,
};

export const syntheticContact: Contact = {
  id: "person-synthetic-001",
  businessId: syntheticBusiness.id,
  entityType: "person",
  personName: "Avery Example",
  title: "Test Owner",
  role: "owner",
  evidenceState: "found",
  verificationState: "not_checked",
  decisionState: "unknown",
  sourceClass: "synthetic_fixture",
  claimState: "observed",
  relationshipEvidenceId: null,
  createdAt: SYNTHETIC_TIMESTAMP,
  updatedAt: SYNTHETIC_TIMESTAMP,
};

export function makeSyntheticEvidence(
  overrides: Partial<Evidence> = {},
): Evidence {
  return createEvidence({
    id: "evidence-synthetic-001",
    entityType: "business",
    entityId: syntheticBusiness.id,
    fieldName: "canonical_name",
    claimedValue: syntheticBusiness.canonicalName,
    source: "synthetic_fixture",
    sourceClass: "synthetic_fixture",
    sourceUrl: "https://clearwater.example/source",
    observedAt: SYNTHETIC_TIMESTAMP,
    fetchedAt: SYNTHETIC_TIMESTAMP,
    confidenceBasisPoints: 8_000,
    extractionMethod: "synthetic_fixture",
    conflictStatus: "none",
    rawReferenceChecksum: null,
    policyVersion: "phase1-test-v1",
    createdAt: SYNTHETIC_TIMESTAMP,
    updatedAt: SYNTHETIC_TIMESTAMP,
    ...overrides,
  });
}

export interface TestDatabaseFixture {
  database: SqliteDatabase;
  dataRoot: string;
  databasePath: string;
  cleanup(): void;
}

export function createTestDatabase(): TestDatabaseFixture {
  const dataRoot = mkdtempSync(path.join(os.tmpdir(), "rocco-lead-engine-test-"));
  const databasePath = path.join(dataRoot, "phase1.sqlite");
  const repositoryRoot = path.resolve(process.cwd(), "..");
  const database = openLeadEngineDatabase({
    mode: "test",
    databasePath,
    repositoryRoot,
  });
  migrateDatabase(database);

  return {
    database,
    dataRoot,
    databasePath,
    cleanup() {
      if (database.open) database.close();
      rmSync(dataRoot, { recursive: true, force: true });
    },
  };
}
