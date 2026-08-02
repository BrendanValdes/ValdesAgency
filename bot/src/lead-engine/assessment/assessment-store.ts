import { createHash } from "node:crypto";
import path from "node:path";
import type { PageKind } from "../crawl/types.js";
import { openLeadEngineDatabase, type SqliteDatabase } from "../db/database.js";
import { migrateDatabase } from "../db/migrate.js";
import { createSqliteRepositories } from "../db/sqlite-repositories.js";
import {
  createWebsiteAssessmentRepository,
  type WebsiteAssessmentRepository,
  type WebsitePageRecord,
} from "../db/website-assessment-repository.js";
import { WEBSITE_ASSESSMENT_POLICY_VERSION } from "../validation/website-assessment.js";
import {
  LIVE_WEBSITE_ASSESSMENT_VERSION,
  type AssessmentSink,
  type PageEvidence,
} from "./live-website-assessment.js";
import type { EligibleCandidate } from "./candidate-gate.js";

/**
 * Repository wiring for a bounded website-assessment run.
 *
 * Lives inside the lead engine rather than in a script so production surfaces
 * (startup, features, services, cron, commands, scripts) never bind the SQLite
 * repositories directly — the Phase 3 containment boundary.
 *
 * Persists the full evidence chain so downstream qualification reads live
 * observations rather than anything re-derived in memory. Contacts, people, and
 * structured values are all stored public-unverified; nothing here promotes or
 * verifies a value.
 */

export interface AssessmentEvidenceCounts {
  readonly pages: number;
  readonly contacts: number;
  readonly people: number;
  readonly services: number;
  readonly conversions: number;
  readonly structured: number;
  readonly conflicts: number;
}

export interface AssessmentStore {
  readonly sink: AssessmentSink;
  /** The run's own database, so the qualification and ranking stage can read
   *  the evidence this store just persisted. Never leaves the run. */
  readonly database: SqliteDatabase;
  assessmentsPersisted(): number;
  evidenceCounts(): AssessmentEvidenceCounts;
  businessIdFor(candidateKey: string): string;
  assessmentBusinessIds(): ReadonlyArray<{ assessmentId: string; businessId: string; reviewRequired: boolean }>;
  close(): void;
}

export function assessmentIdFor(runId: string, candidate: EligibleCandidate): string {
  return `wa_${createHash("sha256").update(`${runId}:${candidate.candidateKey}`).digest("hex").slice(0, 32)}`;
}

function businessIdForKey(candidateKey: string): string {
  return `biz_${createHash("sha256").update(candidateKey).digest("hex").slice(0, 32)}`;
}

const PAGE_KINDS: ReadonlyArray<string> = [
  "homepage", "contact", "about", "team", "services", "booking", "sitemap_discovered", "other",
];

function pageKindOf(kind: PageKind): WebsitePageRecord["pageKind"] {
  return (PAGE_KINDS.includes(kind) ? kind : "other") as WebsitePageRecord["pageKind"];
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
  // Pages are extracted before the parent assessment row exists, so buffer them
  // and flush once the foreign-key target is written.
  const pendingPages = new Map<string, PageEvidence[]>();
  const assessmentToBusiness = new Map<string, string>();
  const assessmentRows: Array<{ assessmentId: string; businessId: string; reviewRequired: boolean }> = [];
  const pendingConflicts = new Map<string, { candidateKey: string; observedNameCount: number }>();
  let persisted = 0;
  const counts = {
    pages: 0, contacts: 0, people: 0, services: 0, conversions: 0, structured: 0, conflicts: 0,
  };

  const ensureBusiness = (candidateKey: string): string => {
    const businessId = businessIdForKey(candidateKey);
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

  const rowId = (kind: string, scope: string, key: string): string =>
    `${kind}_${createHash("sha256").update(`${scope}:${key}`).digest("hex").slice(0, 32)}`;

  function writePageEvidence(evidence: PageEvidence, businessId: string): void {
    const pageId = rowId("wp", evidence.assessmentId, evidence.pageUrl);
    websiteAssessments.addPage({
      id: pageId,
      assessmentId: evidence.assessmentId,
      fetchId: null,
      pageUrl: evidence.pageUrl,
      pageKind: pageKindOf(evidence.pageKind),
      inspectionStatus: "successful",
      title: evidence.title,
      metaDescription: evidence.metaDescription,
      language: evidence.language,
      viewport: evidence.viewport,
      contentChecksum: evidence.contentChecksum,
      observedAt: evidence.observedAt,
      fetchedAt: evidence.fetchedAt,
    });
    counts.pages += 1;

    for (const contact of evidence.contacts) {
      websiteAssessments.addContactObservation({
        id: rowId("wco", pageId, `${contact.kind}:${contact.displayedValue}`),
        assessmentId: evidence.assessmentId, pageId, evidenceId: null,
        contactKind: contact.kind, displayedValue: contact.displayedValue,
        candidateStatus: "public_unverified", extractionMethod: "html_link",
        selectorOrPath: null, observedAt: evidence.observedAt, fetchedAt: evidence.fetchedAt,
        contentChecksum: evidence.contentChecksum,
        extractionPolicyVersion: LIVE_WEBSITE_ASSESSMENT_VERSION,
        sourceClass: contact.sourceClass, claimState: "public_unverified_candidate",
      });
      counts.contacts += 1;
    }
    for (const person of evidence.people) {
      websiteAssessments.addPersonCandidate({
        id: rowId("pec", pageId, person.displayedName),
        assessmentId: evidence.assessmentId, businessId, pageId, evidenceId: null,
        displayedName: person.displayedName, displayedTitle: person.displayedTitle,
        candidateStatus: "unverified_evidence_candidate", ambiguityState: person.ambiguityState,
        extractionMethod: "json_ld", observedAt: evidence.observedAt,
        sourceClass: person.sourceClass, claimState: "public_unverified_candidate",
      });
      counts.people += 1;
    }
    for (const [index, service] of evidence.services.entries()) {
      websiteAssessments.addServiceEvidence({
        id: rowId("sev", pageId, `${index}:${service.term ?? service.basis}`),
        assessmentId: evidence.assessmentId, pageId, evidenceId: null,
        evidenceState: service.state, term: service.term, basis: service.basis,
        observedAt: evidence.observedAt,
        extractionPolicyVersion: LIVE_WEBSITE_ASSESSMENT_VERSION,
        sourceClass: service.sourceClass, claimState: service.claimState,
      });
      counts.services += 1;
    }
    for (const conversion of evidence.conversions) {
      websiteAssessments.addConversionObservation({
        id: rowId("cfo", pageId, conversion.feature),
        assessmentId: evidence.assessmentId, pageId, evidenceId: null,
        feature: conversion.feature, status: conversion.status,
        observedAt: evidence.observedAt,
        freshUntil: new Date(Date.parse(evidence.observedAt) + 86_400_000).toISOString(),
        policyVersion: WEBSITE_ASSESSMENT_POLICY_VERSION,
        sourceClass: conversion.sourceClass, claimState: conversion.claimState,
      });
      counts.conversions += 1;
    }
    for (const [index, item] of evidence.structuredData.entries()) {
      websiteAssessments.addStructuredDataObservation({
        id: rowId("sdo", pageId, `${index}:${item.fieldName}`),
        pageId, evidenceId: null, schemaType: item.schemaType,
        structuredDataPath: item.path, fieldName: item.fieldName,
        claimedValue: item.claimedValue, confidence: item.confidence,
        observedAt: evidence.observedAt, fetchedAt: evidence.fetchedAt,
        contentChecksum: evidence.contentChecksum,
        extractionPolicyVersion: LIVE_WEBSITE_ASSESSMENT_VERSION,
        sourceClass: "public_business_website", claimState: "observed",
      });
      counts.structured += 1;
    }
  }

  return {
    database,
    sink: {
      hasAssessment: (assessmentId) => websiteAssessments.getAssessment(assessmentId) !== null,
      recordPageEvidence: (evidence) => {
        const queued = pendingPages.get(evidence.assessmentId) ?? [];
        queued.push(evidence);
        pendingPages.set(evidence.assessmentId, queued);
      },
      recordIdentityConflict: (conflict) => {
        // Recorded before the parent assessment row exists, so buffer and flush
        // once the foreign-key target is written.
        pendingConflicts.set(conflict.assessmentId, {
          candidateKey: conflict.candidateKey, observedNameCount: conflict.observedNameCount,
        });
      },
      recordAssessment: (record) => {
        const businessId = ensureBusiness(record.candidateKey);
        assessmentToBusiness.set(record.assessmentId, businessId);
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
        assessmentRows.push({
          assessmentId: record.assessmentId, businessId, reviewRequired: record.reviewRequired,
        });
        for (const evidence of pendingPages.get(record.assessmentId) ?? []) {
          writePageEvidence(evidence, businessId);
        }
        pendingPages.delete(record.assessmentId);

        const conflict = pendingConflicts.get(record.assessmentId);
        if (conflict) {
          websiteAssessments.addIdentityConflict({
            id: rowId("wic", record.assessmentId, "business_name"),
            assessmentId: record.assessmentId,
            businessId,
            pageId: null,
            evidenceId: null,
            conflictType: "business_name",
            // Aggregate only: how many names were observed, never the names.
            expectedValue: null,
            observedValue: String(conflict.observedNameCount),
            reviewState: "pending",
            observedAt: record.assessedAt,
            resolvedAt: null,
            sourceClass: "public_business_website",
            claimState: "conflicting",
          });
          counts.conflicts += 1;
          pendingConflicts.delete(record.assessmentId);
        }
      },
    },
    assessmentsPersisted: () => persisted,
    evidenceCounts: () => Object.freeze({ ...counts }),
    businessIdFor: businessIdForKey,
    assessmentBusinessIds: () => Object.freeze([...assessmentRows]),
    close: () => database.close(),
  };
}
