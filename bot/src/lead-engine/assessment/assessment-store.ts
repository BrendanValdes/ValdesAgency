import { createHash } from "node:crypto";
import path from "node:path";
import { openLeadEngineDatabase, type SqliteDatabase } from "../db/database.js";
import { migrateDatabase } from "../db/migrate.js";
import { createSqliteRepositories } from "../db/sqlite-repositories.js";
import {
  createWebsiteAssessmentRepository,
  type WebsiteAssessmentRepository,
} from "../db/website-assessment-repository.js";
import { WEBSITE_ASSESSMENT_POLICY_VERSION } from "../validation/website-assessment.js";
import { LIVE_WEBSITE_ASSESSMENT_VERSION, type AssessmentSink } from "./live-website-assessment.js";
import type { EligibleCandidate } from "./candidate-gate.js";

/**
 * Repository wiring for a bounded website-assessment run.
 *
 * Lives inside the lead engine rather than in a script so production surfaces
 * (startup, features, services, cron, commands, scripts) never bind the SQLite
 * repositories directly — the Phase 3 containment boundary.
 */

export interface AssessmentStore {
  readonly sink: AssessmentSink;
  assessmentsPersisted(): number;
  close(): void;
}

export function assessmentIdFor(runId: string, candidate: EligibleCandidate): string {
  return `wa_${createHash("sha256").update(`${runId}:${candidate.candidateKey}`).digest("hex").slice(0, 32)}`;
}

function businessIdFor(candidateKey: string): string {
  return `biz_${createHash("sha256").update(candidateKey).digest("hex").slice(0, 32)}`;
}

export function createAssessmentStore(input: {
  databasePath: string;
  repositoryRoot: string;
  candidates: ReadonlyArray<EligibleCandidate>;
  now: () => Date;
}): AssessmentStore {
  const database: SqliteDatabase = openLeadEngineDatabase({
    mode: "test",
    databasePath: input.databasePath,
    repositoryRoot: input.repositoryRoot,
  });
  migrateDatabase(database);
  const repositories = createSqliteRepositories(database, { dataRoot: path.dirname(input.databasePath) });
  const websiteAssessments: WebsiteAssessmentRepository = createWebsiteAssessmentRepository(database);
  const byKey = new Map(input.candidates.map((candidate) => [candidate.candidateKey, candidate]));
  const createdBusinesses = new Set<string>();
  let persisted = 0;

  const ensureBusiness = (candidateKey: string): string => {
    const businessId = businessIdFor(candidateKey);
    if (createdBusinesses.has(businessId)) return businessId;
    const candidate = byKey.get(candidateKey);
    const timestamp = input.now().toISOString();
    repositories.businesses.create({
      id: businessId,
      canonicalName: candidate?.expectedBusinessName ?? candidateKey,
      state: "found",
      nicheId: "pool_service",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    createdBusinesses.add(businessId);
    return businessId;
  };

  return {
    sink: {
      hasAssessment: (assessmentId) => websiteAssessments.getAssessment(assessmentId) !== null,
      recordAssessment: (record) => {
        const businessId = ensureBusiness(record.candidateKey);
        websiteAssessments.createAssessment({
          id: record.assessmentId,
          businessId,
          sourceWebsiteUrl: record.sourceWebsiteUrl,
          canonicalHomepageUrl: record.canonicalHomepageUrl,
          status: record.status,
          startedAt: record.startedAt,
          assessedAt: record.assessedAt,
          freshUntil: new Date(Date.parse(record.assessedAt) + 86_400_000).toISOString(),
          crawlPolicyVersion: WEBSITE_ASSESSMENT_POLICY_VERSION,
          extractionPolicyVersion: LIVE_WEBSITE_ASSESSMENT_VERSION,
          browserStatus: "disabled",
          identityState: record.identityState,
          reviewRequired: record.reviewRequired,
          sourceClass: "public_business_website",
        });
        persisted += 1;
      },
    },
    assessmentsPersisted: () => persisted,
    close: () => database.close(),
  };
}
