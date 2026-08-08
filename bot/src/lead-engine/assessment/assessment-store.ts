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
import { SERVICE_LANGUAGE_RULESET_VERSION } from "../qualification/service-language.js";
import { DISCOVERY_COVERAGE_SCHEME } from "../geography/coverage-keys.js";
import { createEvidence } from "../domain/evidence.js";
import { stableHash, stableId } from "../shared/stable.js";
import { withTransaction } from "../db/transaction.js";
import type { CoverageManifest } from "../geography/types.js";
import {
  LIVE_WEBSITE_ASSESSMENT_VERSION,
  type AssessmentSink,
  type PageEvidence,
} from "./live-website-assessment.js";
import type { OperationalEvidence } from "../validation/business-operational.js";
import type { NicheId } from "../domain/types.js";
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
  readonly serviceLanguageHits: number;
  readonly operational: number;
  /** Service-evidence rows whose basis is the discovery provider's category. */
  readonly providerCategories: number;
  /** Provider-observed business locations persisted for this batch. */
  readonly locations: number;
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

/**
 * Persist the coverage manifest a batch actually planned.
 *
 * Selected-market geography is a coverage-cell fact in this model, and the
 * qualifier can only cite a coverage cell that exists as a row. Writing the real
 * planner output — the same cells discovery traversed, with the country and
 * subdivision the planner assigned them — is what lets
 * `hard.outside_selected_geography` compare a business location against the
 * market this batch was actually scoped to.
 *
 * Idempotent: every statement is INSERT OR IGNORE against a deterministic key,
 * so a resumed batch re-plans the same manifest and writes nothing new.
 */
export function persistCoverageManifest(
  database: SqliteDatabase,
  coverage: CoverageManifest,
  createdAt: string,
): void {
  const configurationHash = stableHash({
    nicheId: coverage.nicheId,
    configurationVersion: coverage.configurationVersion,
  });
  const configurationId = stableId("niche_configuration", {
    nicheId: coverage.nicheId,
    configurationVersion: coverage.configurationVersion,
  });
  withTransaction(database, () => {
    database.prepare(`
      INSERT OR IGNORE INTO niche_configuration_versions
        (id, niche_id, configuration_version, configuration_hash, enabled, is_default, created_at)
      VALUES (?, ?, ?, ?, 1, 0, ?)
    `).run(configurationId, coverage.nicheId, coverage.configurationVersion, configurationHash, createdAt);
    database.prepare(`
      INSERT OR IGNORE INTO coverage_manifests
        (id, niche_configuration_id, query_version, strategy, result_cap, maximum_depth, minimum_span, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      coverage.manifestId, configurationId, coverage.queryVersion, coverage.strategy,
      coverage.resultCap, coverage.maxDepth, coverage.minimumSpan, createdAt,
    );
    // Parents before children, so the self-referencing key is always satisfiable.
    for (const cell of [...coverage.cells].sort((left, right) => left.depth - right.depth)) {
      database.prepare(`
        INSERT OR IGNORE INTO coverage_cells
          (coverage_key, manifest_id, parent_coverage_key, geography_level, label, country_code,
           subdivision_code, west, south, east, north, depth, state, stop_reason, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        cell.coverageKey, coverage.manifestId, cell.parentCoverageKey, cell.level, cell.label,
        cell.countryCode, cell.subdivisionCode,
        cell.bounds.west, cell.bounds.south, cell.bounds.east, cell.bounds.north,
        cell.depth, cell.status, cell.stopReason, createdAt,
      );
    }
  });
}

export function createAssessmentStore(input: {
  databasePath: string;
  repositoryRoot: string;
  candidates: ReadonlyArray<EligibleCandidate>;
  now: () => Date;
  /**
   * Coverage manifest this batch planned, when the caller traversed cells. Pure
   * scope lineage: it records the market that was searched, never a business
   * claim, and no score rule reads a coverage cell.
   */
  coverage?: CoverageManifest | null;
  /** Niche persisted on every business; omitted callers retain pool behavior. */
  nicheId?: NicheId;
  /**
   * Durable external data root. When supplied the store opens the database
   * through the existing production mode, which requires an absolute path
   * outside the repository and enforces 0700 on the directory and 0600 on the
   * database. Omitted, the store keeps the throwaway temp-directory behaviour.
   */
  dataRoot?: string | null;
}): AssessmentStore {
  const nicheId: NicheId = input.nicheId ?? "pool_service";
  if (input.nicheId && input.coverage && input.nicheId !== input.coverage.nicheId) {
    throw new Error("Assessment niche must match coverage niche");
  }
  const database: SqliteDatabase = input.dataRoot
    ? openLeadEngineDatabase({
        mode: "production",
        dataRoot: input.dataRoot,
        repositoryRoot: input.repositoryRoot,
        filename: path.basename(input.databasePath),
      })
    : openLeadEngineDatabase({
        mode: "test",
        databasePath: input.databasePath,
        repositoryRoot: input.repositoryRoot,
      });
  migrateDatabase(database);
  if (input.coverage) {
    persistCoverageManifest(database, input.coverage, input.now().toISOString());
  }
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
  const pendingOperational = new Map<string, {
    observations: ReadonlyArray<OperationalEvidence>; sourceUrl: string; observedAt: string;
  }>();
  let persisted = 0;
  /** Service-evidence row ids already written in this process, for idempotence. */
  const persistedServiceEvidenceIds = new Set<string>();
  const counts = {
    pages: 0, contacts: 0, people: 0, services: 0, conversions: 0, structured: 0,
    conflicts: 0, serviceLanguageHits: 0, operational: 0, providerCategories: 0,
    locations: 0,
  };

  const ensureBusiness = (candidateKey: string): string => {
    const businessId = businessIdForKey(candidateKey);
    if (createdBusinesses.has(businessId)) return businessId;
    const candidate = byKey.get(candidateKey);
    const timestamp = input.now().toISOString();
    // Resume safety: a retained database from an interrupted run may already hold
    // this business. The id is a pure function of the candidate key, so the
    // existing row is the same business — recreating it would violate the primary
    // key, and skipping the whole candidate would lose its remaining evidence.
    if (repositories.businesses.getById(businessId) === null) {
      repositories.businesses.create({
        id: businessId,
        canonicalName: candidate?.expectedBusinessName ?? candidateKey,
        state: "found",
        nicheId,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
    createdBusinesses.add(businessId);
    // Scope lineage: the coverage cell discovery actually found this candidate
    // in, recorded as a business identifier through the existing repository.
    //
    // This is what lets the ranker's coverage-key scope check match. Without it
    // candidate.coverageKeys is empty for every eligible lead and the ranker
    // classifies it outside_queue_scope before contact-route evaluation.
    //
    // No qualification rule reads business_identifiers and the table is not a
    // citable qualification source, so this cannot move a score, a result state,
    // or a hard disqualifier. Provenance stays honest: the cell came from the
    // discovery dataset, not from the website.
    const coverageIdentifierId = candidate?.discoveredCoverageKey
      ? rowId("bid", businessId, `coverage:${candidate.discoveredCoverageKey}`)
      : null;
    // business_identifiers enforces UNIQUE (scheme, value) globally, so a resumed
    // run must not re-insert the coverage identifier it already wrote.
    if (candidate?.discoveredCoverageKey && coverageIdentifierId !== null &&
      !repositories.businesses.listIdentifiers(businessId)
        .some((identifier) => identifier.id === coverageIdentifierId)) {
      repositories.businesses.addIdentifier({
        id: coverageIdentifierId,
        businessId,
        scheme: DISCOVERY_COVERAGE_SCHEME,
        // business_identifiers enforces UNIQUE (scheme, value) globally, so the
        // business id disambiguates two candidates found in the same cell.
        value: `${candidate.discoveredCoverageKey}|${businessId}`,
        source: "live_batch_discovery",
        sourceClass: "local_public_dataset",
        claimState: "observed",
        evidenceState: "found",
        createdAt: timestamp,
      });
    }
    // The provider's own postal location, persisted through the existing
    // business_locations model.
    //
    // Provenance stays honest: the source class is the discovery envelope's own,
    // and the claim stays `observed` — we observed the provider stating this
    // address, which is not a verification and not a website claim. Nothing is
    // written when the provider supplied no usable locality/region/country, so a
    // business with no stated location is scored as location-missing rather than
    // silently placed inside the searched market.
    const providerLocation = candidate?.providerLocation ?? null;
    if (providerLocation) {
      const locationId = rowId("loc", businessId, [
        providerLocation.countryCode, providerLocation.region, providerLocation.city,
        providerLocation.postalCode ?? "", providerLocation.line1 ?? "",
      ].join("|"));
      // Deterministic id plus this existence check: a repeated or resumed batch
      // cannot write the same location twice.
      if (!repositories.businesses.listLocations(businessId).some((row) => row.id === locationId)) {
        repositories.businesses.addLocation({
          id: locationId,
          businessId,
          line1: providerLocation.line1,
          city: providerLocation.city,
          region: providerLocation.region,
          postalCode: providerLocation.postalCode,
          countryCode: providerLocation.countryCode,
          evidenceState: "found",
          sourceClass: candidate?.providerSourceClass ?? "local_public_dataset",
          claimState: "observed",
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        counts.locations += 1;
      }
    }
    return businessId;
  };

  const rowId = (kind: string, scope: string, key: string): string =>
    `${kind}_${createHash("sha256").update(`${scope}:${key}`).digest("hex").slice(0, 32)}`;

  /**
   * Persist directly observed successful operational facts as internal crawl
   * evidence, using the field names the qualifier already reads.
   *
   * Nothing here is a verification: the claim stays `observed`, the source class
   * stays the same public-website class every other row in the run carries, and
   * no dimension, verifier, method, result, or expiry is set. So
   * isCurrentExternalVerification and humanConfirmation both stay unsatisfied and
   * no independent source class is introduced.
   */
  function writeOperationalEvidence(input: {
    assessmentId: string;
    businessId: string;
    observations: ReadonlyArray<OperationalEvidence>;
    sourceUrl: string;
    observedAt: string;
  }): void {
    for (const observation of input.observations) {
      const fieldName = `operational:${observation.kind}`;
      const id = rowId("ev", input.assessmentId, fieldName);
      // Deterministic id plus the repository's primary-key uniqueness: a resumed
      // or repeated batch cannot duplicate the fact or multiply its points.
      if (repositories.evidence.getById(id) !== null) continue;
      repositories.evidence.create(createEvidence({
        id,
        entityType: "business",
        entityId: input.businessId,
        fieldName,
        claimedValue: observation.detail,
        source: "live_website_assessment",
        sourceClass: observation.sourceClass,
        sourceUrl: input.sourceUrl,
        observedAt: input.observedAt,
        fetchedAt: input.observedAt,
        confidenceBasisPoints: 8_000,
        extractionMethod: "website_operational_assessment",
        conflictStatus: "none",
        rawReferenceChecksum: null,
        policyVersion: WEBSITE_ASSESSMENT_POLICY_VERSION,
        claimState: observation.claimState,
        verificationState: "not_checked",
        decisionState: "unknown",
        createdAt: input.observedAt,
        updatedAt: input.observedAt,
      }));
      counts.operational += 1;
    }
  }

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
    // Service-language rule hits persist as service evidence keyed by rule id,
    // so calibration reads observations from the database, not from memory.
    for (const hit of evidence.serviceLanguage.hits) {
      websiteAssessments.addServiceEvidence({
        id: rowId("sev", pageId, `rule:${hit.ruleId}`),
        assessmentId: evidence.assessmentId, pageId, evidenceId: null,
        evidenceState: evidence.serviceLanguage.facilityOrRetail ? "ambiguous" : "positive",
        // Canonical model term so the unchanged qualifier can match it; the
        // originating rule id stays traceable through the row id.
        term: hit.canonicalServiceTerm,
        basis: "service_description",
        observedAt: evidence.observedAt,
        extractionPolicyVersion: SERVICE_LANGUAGE_RULESET_VERSION,
        sourceClass: "public_business_website", claimState: "observed",
      });
      counts.services += 1;
      counts.serviceLanguageHits += 1;
    }
    for (const [index, service] of evidence.services.entries()) {
      // A provider category is a fact about the business, not about this page, so
      // it is stored assessment-scoped with a null page and an id derived from
      // the assessment and the category term. Two pages of the same site can
      // therefore never turn one provider observation into two service facts.
      const providerCategory = service.basis === "provider_category";
      const id = providerCategory
        ? rowId("sev", evidence.assessmentId, `provider_category:${service.term ?? ""}`)
        : rowId("sev", pageId, `${index}:${service.term ?? service.basis}`);
      if (providerCategory && persistedServiceEvidenceIds.has(id)) continue;
      websiteAssessments.addServiceEvidence({
        id,
        assessmentId: evidence.assessmentId,
        pageId: providerCategory ? null : pageId,
        evidenceId: null,
        evidenceState: service.state, term: service.term, basis: service.basis,
        observedAt: evidence.observedAt,
        extractionPolicyVersion: LIVE_WEBSITE_ASSESSMENT_VERSION,
        sourceClass: service.sourceClass, claimState: service.claimState,
      });
      persistedServiceEvidenceIds.add(id);
      counts.services += 1;
      if (providerCategory) counts.providerCategories += 1;
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
      recordOperationalEvidence: (observation) => {
        // Buffered like page evidence and identity conflicts: the business row is
        // only created once the parent assessment is written.
        pendingOperational.set(observation.assessmentId, {
          observations: observation.observations,
          sourceUrl: observation.sourceUrl,
          observedAt: observation.observedAt,
        });
      },
      recordIdentityConflict: (conflict) => {
        // Recorded before the parent assessment row exists, so buffer and flush
        // once the foreign-key target is written.
        pendingConflicts.set(conflict.assessmentId, {
          candidateKey: conflict.candidateKey, observedNameCount: conflict.observedNameCount,
        });
      },
      recordAssessment: (record) => {
        // One transaction for the assessment row and every piece of evidence that
        // belongs to it.
        //
        // Resume depends on this: `hasAssessment` is the only signal that a
        // candidate is finished, so an assessment row must never become visible
        // without its pages, contacts, people, services, conversions, structured
        // data, operational facts, and conflicts. Without the transaction an
        // interruption between the two writes would leave a row that resume reads
        // as "already done" while its evidence is missing forever.
        withTransaction(database, () => {
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

        const operational = pendingOperational.get(record.assessmentId);
        if (operational) {
          writeOperationalEvidence({
            assessmentId: record.assessmentId, businessId,
            observations: operational.observations,
            sourceUrl: operational.sourceUrl, observedAt: operational.observedAt,
          });
          pendingOperational.delete(record.assessmentId);
        }

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
        });
      },
    },
    assessmentsPersisted: () => persisted,
    evidenceCounts: () => Object.freeze({ ...counts }),
    businessIdFor: businessIdForKey,
    assessmentBusinessIds: () => Object.freeze([...assessmentRows]),
    close: () => database.close(),
  };
}
