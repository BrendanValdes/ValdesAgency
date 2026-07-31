import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { microUsd } from "../../src/lead-engine/domain/money.js";
import type { EvidenceState } from "../../src/lead-engine/domain/states.js";
import { createSqliteRepositories } from "../../src/lead-engine/db/sqlite-repositories.js";
import {
  SYNTHETIC_TIMESTAMP,
  createTestDatabase,
  makeSyntheticEvidence,
  syntheticBusiness,
  syntheticContact,
  syntheticRun,
  syntheticStage,
  syntheticTask,
} from "./fixtures/synthetic.js";

describe("SQLite repository implementations", () => {
  it("supports create, read, and update behavior for every repository boundary", () => {
    const fixture = createTestDatabase();
    const repositories = createSqliteRepositories(fixture.database, {
      dataRoot: fixture.dataRoot,
    });
    try {
      expect(repositories.runs.create(syntheticRun)).toEqual(syntheticRun);
      expect(
        repositories.runs.updateState(
          syntheticRun.id,
          "running",
          microUsd(100),
          SYNTHETIC_TIMESTAMP,
        ).state,
      ).toBe("running");

      expect(repositories.businesses.create(syntheticBusiness)).toEqual(syntheticBusiness);
      expect(
        repositories.businesses.updateState(
          syntheticBusiness.id,
          "found",
          SYNTHETIC_TIMESTAMP,
        ).state,
      ).toBe("found");
      repositories.businesses.addIdentifier({
        id: "identifier-synthetic-001",
        businessId: syntheticBusiness.id,
        scheme: "synthetic_fixture_id",
        value: "fixture-business-001",
        source: "synthetic_fixture",
        evidenceState: "found",
        createdAt: SYNTHETIC_TIMESTAMP,
      });
      repositories.businesses.addLocation({
        id: "location-synthetic-001",
        businessId: syntheticBusiness.id,
        line1: null,
        city: "Example City",
        region: "EX",
        postalCode: null,
        countryCode: "US",
        evidenceState: "not_checked",
        createdAt: SYNTHETIC_TIMESTAMP,
        updatedAt: SYNTHETIC_TIMESTAMP,
      });
      expect(repositories.businesses.listIdentifiers(syntheticBusiness.id)).toHaveLength(1);
      expect(repositories.businesses.listLocations(syntheticBusiness.id)).toHaveLength(1);

      expect(repositories.stagesAndTasks.createStage(syntheticStage)).toEqual(syntheticStage);
      expect(repositories.stagesAndTasks.createTask(syntheticTask)).toEqual(syntheticTask);
      expect(
        repositories.stagesAndTasks.updateTaskState(
          syntheticTask.id,
          "failed",
          SYNTHETIC_TIMESTAMP,
          "provider_failed",
        ).state,
      ).toBe("failed");
      expect(
        repositories.stagesAndTasks.updateStageState(
          syntheticStage.id,
          "human_review",
          SYNTHETIC_TIMESTAMP,
        ).state,
      ).toBe("human_review");

      expect(repositories.contacts.create(syntheticContact)).toEqual(syntheticContact);
      const acceptedContact = repositories.contacts.updateStates(syntheticContact.id, {
        evidenceState: "found",
        verificationState: "source_confirmed",
        decisionState: "accepted",
        updatedAt: SYNTHETIC_TIMESTAMP,
      });
      expect(acceptedContact.entityType).toBe("person");
      expect(acceptedContact.verificationState).toBe("source_confirmed");

      const evidence = makeSyntheticEvidence();
      expect(repositories.evidence.create(evidence)).toEqual(evidence);
      expect(
        repositories.evidence.updateStates(evidence.id, {
          evidenceState: "found",
          verificationState: "source_confirmed",
          decisionState: "accepted",
          conflictStatus: "none",
          verificationMethod: null,
          verifiedAt: null,
          updatedAt: SYNTHETIC_TIMESTAMP,
        }).verificationState,
      ).toBe("source_confirmed");

      const conflictingEvidence = makeSyntheticEvidence({
        id: "evidence-synthetic-002",
        claimedValue: "Conflicting synthetic business name",
      });
      repositories.evidence.create(conflictingEvidence);
      repositories.evidence.addConflict({
        id: "conflict-synthetic-001",
        evidenceId: evidence.id,
        conflictingEvidenceId: conflictingEvidence.id,
        status: "confirmed",
        reasonCode: "evidence_conflict",
        createdAt: SYNTHETIC_TIMESTAMP,
        resolvedAt: null,
      });
      expect(repositories.evidence.getById(evidence.id)?.evidenceState).toBe("conflicting");

      const providerCall = repositories.providerCalls.create({
        id: "provider-call-synthetic-001",
        runId: syntheticRun.id,
        taskId: syntheticTask.id,
        provider: "synthetic_disabled_provider",
        operation: "record_only",
        state: "not_checked",
        estimatedCostMicroUsd: microUsd(0),
        actualCostMicroUsd: microUsd(0),
        cacheHit: false,
        errorReasonCode: null,
        startedAt: SYNTHETIC_TIMESTAMP,
        finishedAt: null,
      });
      expect(providerCall.state).toBe("not_checked");
      expect(
        repositories.providerCalls.updateResult(providerCall.id, {
          state: "failed",
          actualCostMicroUsd: microUsd(0),
          errorReasonCode: "provider_failed",
          finishedAt: SYNTHETIC_TIMESTAMP,
        }).state,
      ).toBe("failed");

      const artifact = repositories.artifacts.create({
        id: "artifact-synthetic-001",
        runId: syntheticRun.id,
        evidenceId: evidence.id,
        kind: "evidence_blob",
        externalPath: path.join(fixture.dataRoot, "evidence", "fixture-ref"),
        checksum: "a".repeat(64),
        createdAt: SYNTHETIC_TIMESTAMP,
      });
      expect(artifact.externalPath.startsWith(fixture.dataRoot)).toBe(true);
      expect(repositories.artifacts.listByRun(syntheticRun.id)).toHaveLength(1);
    } finally {
      fixture.cleanup();
    }
  });

  it("round-trips unknown, unavailable, failed, stale, and conflicting evidence states", () => {
    const fixture = createTestDatabase();
    const repositories = createSqliteRepositories(fixture.database, {
      dataRoot: fixture.dataRoot,
    });
    const states: EvidenceState[] = [
      "unknown",
      "unavailable",
      "failed",
      "stale",
      "conflicting",
    ];
    try {
      for (const [index, state] of states.entries()) {
        const evidence = makeSyntheticEvidence({
          id: `evidence-state-${index}`,
          evidenceState: state,
          conflictStatus: state === "conflicting" ? "confirmed" : "none",
        });
        repositories.evidence.create(evidence);
        expect(repositories.evidence.getById(evidence.id)?.evidenceState).toBe(state);
      }
    } finally {
      fixture.cleanup();
    }
  });

  it("keeps business and person identities separate at repository and database layers", () => {
    const fixture = createTestDatabase();
    const repositories = createSqliteRepositories(fixture.database, {
      dataRoot: fixture.dataRoot,
    });
    try {
      repositories.businesses.create(syntheticBusiness);
      expect(() =>
        repositories.contacts.create({
          ...syntheticContact,
          id: "person-invalid-repository",
          personName: syntheticBusiness.canonicalName,
          verificationState: "source_confirmed",
          decisionState: "accepted",
        }),
      ).toThrow("confirmed-person policy");

      expect(() =>
        fixture.database.prepare(`
          INSERT INTO contacts
            (id, business_id, entity_type, person_name, title, role, evidence_state,
             verification_state, decision_state, created_at, updated_at)
          VALUES (?, ?, 'person', ?, NULL, 'owner', 'found', 'source_confirmed',
                  'accepted', ?, ?)
        `).run(
          "person-invalid-database",
          syntheticBusiness.id,
          syntheticBusiness.canonicalName,
          SYNTHETIC_TIMESTAMP,
          SYNTHETIC_TIMESTAMP,
        ),
      ).toThrow("person policy");
    } finally {
      fixture.cleanup();
    }
  });

  it("rolls back repository unit-of-work operations together", () => {
    const fixture = createTestDatabase();
    const repositories = createSqliteRepositories(fixture.database, {
      dataRoot: fixture.dataRoot,
    });
    try {
      expect(() =>
        repositories.transaction((unitOfWork) => {
          unitOfWork.runs.create(syntheticRun);
          unitOfWork.businesses.create(syntheticBusiness);
          throw new Error("synthetic unit-of-work failure");
        }),
      ).toThrow("synthetic unit-of-work failure");
      expect(repositories.runs.getById(syntheticRun.id)).toBeNull();
      expect(repositories.businesses.getById(syntheticBusiness.id)).toBeNull();
    } finally {
      fixture.cleanup();
    }
  });
});

describe("lead artifact containment", () => {
  it("allows the clearly marked synthetic fixture path", async () => {
    const botRoot = process.cwd();
    const repositoryRoot = path.resolve(botRoot, "..");
    const fixturePath = path.join(
      botRoot,
      "test",
      "lead-engine",
      "fixtures",
      "synthetic.ts",
    );
    expect(fixturePath).toMatch(/\/fixtures\/synthetic\.ts$/);
    expect(readFileSync(fixturePath, "utf8")).toContain(
      "synthetic_fixture = true",
    );

    const originalArgv = process.argv;
    const originalExitCode = process.exitCode;
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.doMock("node:child_process", () => ({
      execFileSync: vi.fn(() => repositoryRoot),
    }));
    try {
      process.argv = [process.execPath, "check-lead-artifacts.mjs", "--check", fixturePath];
      process.exitCode = undefined;
      await import("../../scripts/check-lead-artifacts.mjs?fixture-check");
      expect(process.exitCode ?? 0).toBe(0);
    } finally {
      process.argv = originalArgv;
      process.exitCode = originalExitCode;
      log.mockRestore();
      vi.doUnmock("node:child_process");
    }
  });

  it("continues to reject prohibited lead-like artifacts", async () => {
    const botRoot = process.cwd();
    const repositoryRoot = path.resolve(botRoot, "..");
    const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "rocco-guard-test-"));
    const prohibitedPath = path.join(temporaryRoot, "prohibited-leads.json");
    const prohibitedRecord = Object.fromEntries([
      [["business", "name"].join("_"), "Synthetic Guard Target"],
      [["web", "site"].join(""), "synthetic://material-contact"],
    ]);
    writeFileSync(
      prohibitedPath,
      JSON.stringify(prohibitedRecord),
      "utf8",
    );
    const originalArgv = process.argv;
    const originalExitCode = process.exitCode;
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.doMock("node:child_process", () => ({
      execFileSync: vi.fn(() => repositoryRoot),
    }));
    try {
      process.argv = [
        process.execPath,
        "check-lead-artifacts.mjs",
        "--check",
        prohibitedPath,
      ];
      process.exitCode = undefined;
      await import("../../scripts/check-lead-artifacts.mjs?prohibited-check");
      expect(process.exitCode).toBe(1);
      expect(error.mock.calls.flat().join(" ")).toContain("lead-like JSON records");
    } finally {
      process.argv = originalArgv;
      process.exitCode = originalExitCode;
      error.mockRestore();
      vi.doUnmock("node:child_process");
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });
});
