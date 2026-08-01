import type { SqliteDatabase } from "./database.js";
import { withTransaction } from "./transaction.js";
import type { RedirectHop } from "../crawl/types.js";
import type { ConversionFeature } from "../extraction/conversion.js";
import type { FeatureAssessmentStatus } from "../validation/website-assessment.js";
import type { ClaimState, ProvenanceSourceClass } from "../domain/provenance.js";

export interface WebsiteAssessmentRecord {
  id: string;
  businessId: string;
  sourceWebsiteUrl: string;
  canonicalHomepageUrl: string | null;
  status: "complete" | "partial" | "blocked" | "failed" | "stale";
  startedAt: string;
  assessedAt: string;
  freshUntil: string;
  crawlPolicyVersion: string;
  extractionPolicyVersion: string;
  browserStatus: "disabled" | "unavailable" | "not_checked";
  identityState: "agrees" | "conflicts" | "ambiguous" | "unavailable";
  reviewRequired: boolean;
  sourceClass: Extract<ProvenanceSourceClass, "synthetic_fixture" | "public_business_website" | "legacy_unclassified">;
}

export interface WebsiteFetchRecord {
  id: string;
  assessmentId: string;
  requestedUrl: string;
  finalUrl: string | null;
  outcome: "success" | "failed";
  httpStatus: number | null;
  errorCode: string | null;
  retryable: boolean;
  attempts: number;
  contentType: string | null;
  compressedBytes: number | null;
  decompressedBytes: number | null;
  contentChecksum: string | null;
  etag: string | null;
  lastModified: string | null;
  redirectHistory: ReadonlyArray<RedirectHop>;
  fetchedAt: string;
}

export interface WebsitePageRecord {
  id: string;
  assessmentId: string;
  fetchId: string | null;
  pageUrl: string;
  pageKind: "homepage" | "contact" | "about" | "team" | "services" | "booking" | "sitemap_discovered" | "other";
  inspectionStatus: "successful" | "blocked" | "unavailable" | "failed" | "not_checked" | "stale";
  title: string | null;
  metaDescription: string | null;
  language: string | null;
  viewport: string | null;
  contentChecksum: string | null;
  observedAt: string;
  fetchedAt: string | null;
}

export interface PersonCandidateRecord {
  id: string;
  assessmentId: string;
  businessId: string;
  pageId: string;
  evidenceId: string | null;
  displayedName: string;
  displayedTitle: string | null;
  candidateStatus: "unverified_evidence_candidate";
  ambiguityState: "none" | "ambiguous" | "conflicting";
  extractionMethod: "html" | "json_ld";
  observedAt: string;
  sourceClass: ProvenanceSourceClass;
  claimState: Extract<ClaimState, "public_unverified_candidate">;
}

export interface ConversionObservationRecord {
  id: string;
  assessmentId: string;
  pageId: string | null;
  evidenceId: string | null;
  feature: ConversionFeature;
  status: FeatureAssessmentStatus;
  observedAt: string;
  freshUntil: string;
  policyVersion: string;
  sourceClass: ProvenanceSourceClass;
  claimState: ClaimState;
}

export interface WebsiteLinkRecord {
  id: string;
  pageId: string;
  targetUrl: string;
  linkKind: "homepage" | "contact" | "about" | "team" | "services" | "booking" | "sitemap_discovered" | "other" | "social" | "telephone" | "email" | "external";
  linkTextChecksum: string;
  extractionMethod: string;
  observedAt: string;
}

export interface RobotsDecisionRecord {
  id: string;
  assessmentId: string;
  pageUrl: string;
  robotsUrl: string;
  decision: "allowed" | "denied" | "unavailable";
  reason: "matched_allow" | "matched_disallow" | "no_matching_rule" | "not_published" | "fetch_failed";
  matchedRule: string | null;
  contentChecksum: string | null;
  fetchedAt: string;
  expiresAt: string;
}

export interface CrawlCacheEntryRecord {
  id: string;
  cacheUrl: string;
  fetchedAt: string;
  expiresAt: string;
  etag: string | null;
  lastModified: string | null;
  contentChecksum: string | null;
  httpStatus: number | null;
  contentType: string | null;
  robotsStatus: "allowed" | "denied" | "unavailable" | null;
  extractionPolicyVersion: string;
}

export interface CrawlFailureRecord {
  id: string;
  assessmentId: string;
  pageUrl: string;
  errorCode: string;
  retryable: boolean;
  attempts: number;
  httpStatus: number | null;
  occurredAt: string;
}

export interface StructuredDataObservationRecord {
  id: string;
  pageId: string;
  evidenceId: string | null;
  schemaType: string;
  structuredDataPath: string;
  fieldName: string;
  claimedValue: string | null;
  confidence: "high" | "medium" | "low";
  observedAt: string;
  fetchedAt: string;
  contentChecksum: string;
  extractionPolicyVersion: string;
  sourceClass: ProvenanceSourceClass;
  claimState: ClaimState;
}

export interface WebsiteContactObservationRecord {
  id: string;
  assessmentId: string;
  pageId: string;
  evidenceId: string | null;
  contactKind: "phone" | "email" | "address";
  displayedValue: string;
  candidateStatus: "public_unverified";
  extractionMethod: string;
  selectorOrPath: string | null;
  observedAt: string;
  fetchedAt: string;
  contentChecksum: string;
  extractionPolicyVersion: string;
  sourceClass: ProvenanceSourceClass;
  claimState: Extract<ClaimState, "public_unverified_candidate">;
}

export interface ServiceEvidenceRecord {
  id: string;
  assessmentId: string;
  pageId: string | null;
  evidenceId: string | null;
  evidenceState: "positive" | "negative" | "ambiguous" | "unavailable";
  term: string | null;
  basis: "heading" | "service_description" | "json_ld_service" | "navigation" | "provider_category" | "not_available";
  observedAt: string;
  extractionPolicyVersion: string;
  sourceClass: ProvenanceSourceClass;
  claimState: ClaimState;
}

export interface WebsiteIdentityConflictRecord {
  id: string;
  assessmentId: string;
  businessId: string;
  pageId: string | null;
  evidenceId: string | null;
  conflictType: "business_name" | "contact_information" | "redirect_destination";
  expectedValue: string | null;
  observedValue: string | null;
  reviewState: "pending" | "resolved" | "rejected";
  observedAt: string;
  resolvedAt: string | null;
  sourceClass: ProvenanceSourceClass;
  claimState: Extract<ClaimState, "conflicting">;
}

export interface WebsiteAssessmentRepository {
  createAssessment(record: WebsiteAssessmentRecord): WebsiteAssessmentRecord;
  getAssessment(id: string): WebsiteAssessmentRecord | null;
  addFetch(record: WebsiteFetchRecord): WebsiteFetchRecord;
  listFetches(assessmentId: string): WebsiteFetchRecord[];
  addPage(record: WebsitePageRecord): WebsitePageRecord;
  listPages(assessmentId: string): WebsitePageRecord[];
  addPersonCandidate(record: PersonCandidateRecord): PersonCandidateRecord;
  listPersonCandidates(assessmentId: string): PersonCandidateRecord[];
  addConversionObservation(record: ConversionObservationRecord): ConversionObservationRecord;
  listConversionObservations(assessmentId: string): ConversionObservationRecord[];
  addLink(record: WebsiteLinkRecord): WebsiteLinkRecord;
  addRobotsDecision(record: RobotsDecisionRecord): RobotsDecisionRecord;
  upsertCacheEntry(record: CrawlCacheEntryRecord): CrawlCacheEntryRecord;
  getCacheEntry(cacheUrl: string): CrawlCacheEntryRecord | null;
  addFailure(record: CrawlFailureRecord): CrawlFailureRecord;
  addStructuredDataObservation(record: StructuredDataObservationRecord): StructuredDataObservationRecord;
  addContactObservation(record: WebsiteContactObservationRecord): WebsiteContactObservationRecord;
  listContactObservations(assessmentId: string): WebsiteContactObservationRecord[];
  addServiceEvidence(record: ServiceEvidenceRecord): ServiceEvidenceRecord;
  listServiceEvidence(assessmentId: string): ServiceEvidenceRecord[];
  addIdentityConflict(record: WebsiteIdentityConflictRecord): WebsiteIdentityConflictRecord;
  transaction<T>(operation: (repository: WebsiteAssessmentRepository) => T): T;
}

function bool(value: number): boolean {
  return value === 1;
}

export function createWebsiteAssessmentRepository(database: SqliteDatabase): WebsiteAssessmentRepository {
  const getAssessment = (id: string): WebsiteAssessmentRecord | null => {
    const row = database.prepare("SELECT * FROM website_assessments WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? {
      id: row.id as string,
      businessId: row.business_id as string,
      sourceWebsiteUrl: row.source_website_url as string,
      canonicalHomepageUrl: row.canonical_homepage_url as string | null,
      status: row.status as WebsiteAssessmentRecord["status"],
      startedAt: row.started_at as string,
      assessedAt: row.assessed_at as string,
      freshUntil: row.fresh_until as string,
      crawlPolicyVersion: row.crawl_policy_version as string,
      extractionPolicyVersion: row.extraction_policy_version as string,
      browserStatus: row.browser_status as WebsiteAssessmentRecord["browserStatus"],
      identityState: row.identity_state as WebsiteAssessmentRecord["identityState"],
      reviewRequired: bool(row.review_required as number),
      sourceClass: row.source_class as WebsiteAssessmentRecord["sourceClass"],
    } : null;
  };

  let repository: WebsiteAssessmentRepository;
  repository = {
    createAssessment(record) {
      database.prepare(`INSERT INTO website_assessments
        (id, business_id, source_website_url, canonical_homepage_url, status, started_at, assessed_at, fresh_until,
         crawl_policy_version, extraction_policy_version, browser_status, identity_state, review_required, source_class)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(record.id, record.businessId, record.sourceWebsiteUrl, record.canonicalHomepageUrl, record.status,
          record.startedAt, record.assessedAt, record.freshUntil, record.crawlPolicyVersion,
          record.extractionPolicyVersion, record.browserStatus, record.identityState, record.reviewRequired ? 1 : 0,
          record.sourceClass);
      return getAssessment(record.id) as WebsiteAssessmentRecord;
    },
    getAssessment,
    addFetch(record) {
      database.prepare(`INSERT INTO website_fetches
        (id, assessment_id, requested_url, final_url, outcome, http_status, error_code, retryable, attempts,
         content_type, compressed_bytes, decompressed_bytes, content_checksum, etag, last_modified,
         redirect_history_json, fetched_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(record.id, record.assessmentId, record.requestedUrl, record.finalUrl, record.outcome, record.httpStatus,
          record.errorCode, record.retryable ? 1 : 0, record.attempts, record.contentType, record.compressedBytes,
          record.decompressedBytes, record.contentChecksum, record.etag, record.lastModified,
          JSON.stringify(record.redirectHistory), record.fetchedAt);
      return repository.listFetches(record.assessmentId).find((value) => value.id === record.id) as WebsiteFetchRecord;
    },
    listFetches(assessmentId) {
      const rows = database.prepare("SELECT * FROM website_fetches WHERE assessment_id = ? ORDER BY fetched_at, id").all(assessmentId) as Array<Record<string, unknown>>;
      return rows.map((row) => ({
        id: row.id as string, assessmentId: row.assessment_id as string, requestedUrl: row.requested_url as string,
        finalUrl: row.final_url as string | null, outcome: row.outcome as WebsiteFetchRecord["outcome"],
        httpStatus: row.http_status as number | null, errorCode: row.error_code as string | null,
        retryable: bool(row.retryable as number), attempts: row.attempts as number,
        contentType: row.content_type as string | null, compressedBytes: row.compressed_bytes as number | null,
        decompressedBytes: row.decompressed_bytes as number | null, contentChecksum: row.content_checksum as string | null,
        etag: row.etag as string | null, lastModified: row.last_modified as string | null,
        redirectHistory: JSON.parse(row.redirect_history_json as string) as RedirectHop[], fetchedAt: row.fetched_at as string,
      }));
    },
    addPage(record) {
      database.prepare(`INSERT INTO website_pages
        (id, assessment_id, fetch_id, page_url, page_kind, inspection_status, title, meta_description,
         language, viewport, content_checksum, observed_at, fetched_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(record.id, record.assessmentId, record.fetchId, record.pageUrl, record.pageKind, record.inspectionStatus,
          record.title, record.metaDescription, record.language, record.viewport, record.contentChecksum,
          record.observedAt, record.fetchedAt);
      return repository.listPages(record.assessmentId).find((value) => value.id === record.id) as WebsitePageRecord;
    },
    listPages(assessmentId) {
      const rows = database.prepare("SELECT * FROM website_pages WHERE assessment_id = ? ORDER BY observed_at, id").all(assessmentId) as Array<Record<string, unknown>>;
      return rows.map((row) => ({
        id: row.id as string, assessmentId: row.assessment_id as string, fetchId: row.fetch_id as string | null,
        pageUrl: row.page_url as string, pageKind: row.page_kind as WebsitePageRecord["pageKind"],
        inspectionStatus: row.inspection_status as WebsitePageRecord["inspectionStatus"], title: row.title as string | null,
        metaDescription: row.meta_description as string | null, language: row.language as string | null,
        viewport: row.viewport as string | null, contentChecksum: row.content_checksum as string | null,
        observedAt: row.observed_at as string, fetchedAt: row.fetched_at as string | null,
      }));
    },
    addPersonCandidate(record) {
      database.prepare(`INSERT INTO person_evidence_candidates
        (id, assessment_id, business_id, page_id, evidence_id, displayed_name, displayed_title,
         candidate_status, ambiguity_state, extraction_method, observed_at, source_class, claim_state)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(record.id, record.assessmentId, record.businessId, record.pageId, record.evidenceId,
          record.displayedName, record.displayedTitle, record.candidateStatus, record.ambiguityState,
          record.extractionMethod, record.observedAt, record.sourceClass, record.claimState);
      return repository.listPersonCandidates(record.assessmentId).find((value) => value.id === record.id) as PersonCandidateRecord;
    },
    listPersonCandidates(assessmentId) {
      const rows = database.prepare("SELECT * FROM person_evidence_candidates WHERE assessment_id = ? ORDER BY displayed_name, id").all(assessmentId) as Array<Record<string, unknown>>;
      return rows.map((row) => ({
        id: row.id as string, assessmentId: row.assessment_id as string, businessId: row.business_id as string,
        pageId: row.page_id as string, evidenceId: row.evidence_id as string | null, displayedName: row.displayed_name as string,
        displayedTitle: row.displayed_title as string | null, candidateStatus: row.candidate_status as PersonCandidateRecord["candidateStatus"],
        ambiguityState: row.ambiguity_state as PersonCandidateRecord["ambiguityState"],
        extractionMethod: row.extraction_method as PersonCandidateRecord["extractionMethod"], observedAt: row.observed_at as string,
        sourceClass: row.source_class as ProvenanceSourceClass, claimState: row.claim_state as PersonCandidateRecord["claimState"],
      }));
    },
    addConversionObservation(record) {
      database.prepare(`INSERT INTO conversion_feature_observations
        (id, assessment_id, page_id, evidence_id, feature, status, observed_at, fresh_until, policy_version,
         source_class, claim_state)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(record.id, record.assessmentId, record.pageId, record.evidenceId, record.feature, record.status,
          record.observedAt, record.freshUntil, record.policyVersion, record.sourceClass, record.claimState);
      return repository.listConversionObservations(record.assessmentId).find((value) => value.id === record.id) as ConversionObservationRecord;
    },
    listConversionObservations(assessmentId) {
      const rows = database.prepare("SELECT * FROM conversion_feature_observations WHERE assessment_id = ? ORDER BY feature").all(assessmentId) as Array<Record<string, unknown>>;
      return rows.map((row) => ({
        id: row.id as string, assessmentId: row.assessment_id as string, pageId: row.page_id as string | null,
        evidenceId: row.evidence_id as string | null, feature: row.feature as ConversionFeature,
        status: row.status as FeatureAssessmentStatus, observedAt: row.observed_at as string,
        freshUntil: row.fresh_until as string, policyVersion: row.policy_version as string,
        sourceClass: row.source_class as ProvenanceSourceClass, claimState: row.claim_state as ClaimState,
      }));
    },
    addLink(record) {
      database.prepare(`INSERT INTO website_links
        (id, page_id, target_url, link_kind, link_text_checksum, extraction_method, observed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(record.id, record.pageId, record.targetUrl, record.linkKind, record.linkTextChecksum,
          record.extractionMethod, record.observedAt);
      return { ...record };
    },
    addRobotsDecision(record) {
      database.prepare(`INSERT INTO robots_decisions
        (id, assessment_id, page_url, robots_url, decision, reason, matched_rule, content_checksum, fetched_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(record.id, record.assessmentId, record.pageUrl, record.robotsUrl, record.decision, record.reason,
          record.matchedRule, record.contentChecksum, record.fetchedAt, record.expiresAt);
      return { ...record };
    },
    upsertCacheEntry(record) {
      database.prepare(`INSERT INTO crawl_cache_entries
        (id, cache_url, fetched_at, expires_at, etag, last_modified, content_checksum, http_status,
         content_type, robots_status, extraction_policy_version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(cache_url) DO UPDATE SET
          id = excluded.id, fetched_at = excluded.fetched_at, expires_at = excluded.expires_at,
          etag = excluded.etag, last_modified = excluded.last_modified,
          content_checksum = COALESCE(excluded.content_checksum, crawl_cache_entries.content_checksum),
          http_status = excluded.http_status, content_type = excluded.content_type,
          robots_status = excluded.robots_status, extraction_policy_version = excluded.extraction_policy_version`)
        .run(record.id, record.cacheUrl, record.fetchedAt, record.expiresAt, record.etag, record.lastModified,
          record.contentChecksum, record.httpStatus, record.contentType, record.robotsStatus, record.extractionPolicyVersion);
      return repository.getCacheEntry(record.cacheUrl) as CrawlCacheEntryRecord;
    },
    getCacheEntry(cacheUrl) {
      const row = database.prepare("SELECT * FROM crawl_cache_entries WHERE cache_url = ?").get(cacheUrl) as Record<string, unknown> | undefined;
      return row ? {
        id: row.id as string, cacheUrl: row.cache_url as string, fetchedAt: row.fetched_at as string,
        expiresAt: row.expires_at as string, etag: row.etag as string | null, lastModified: row.last_modified as string | null,
        contentChecksum: row.content_checksum as string | null, httpStatus: row.http_status as number | null,
        contentType: row.content_type as string | null, robotsStatus: row.robots_status as CrawlCacheEntryRecord["robotsStatus"],
        extractionPolicyVersion: row.extraction_policy_version as string,
      } : null;
    },
    addFailure(record) {
      database.prepare(`INSERT INTO crawl_failures
        (id, assessment_id, page_url, error_code, retryable, attempts, http_status, occurred_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(record.id, record.assessmentId, record.pageUrl, record.errorCode, record.retryable ? 1 : 0,
          record.attempts, record.httpStatus, record.occurredAt);
      return { ...record };
    },
    addStructuredDataObservation(record) {
      database.prepare(`INSERT INTO structured_data_observations
        (id, page_id, evidence_id, schema_type, structured_data_path, field_name, claimed_value,
         confidence, observed_at, fetched_at, content_checksum, extraction_policy_version, source_class, claim_state)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(record.id, record.pageId, record.evidenceId, record.schemaType, record.structuredDataPath,
          record.fieldName, record.claimedValue, record.confidence, record.observedAt, record.fetchedAt,
          record.contentChecksum, record.extractionPolicyVersion, record.sourceClass, record.claimState);
      return { ...record };
    },
    addContactObservation(record) {
      database.prepare(`INSERT INTO website_contact_observations
        (id, assessment_id, page_id, evidence_id, contact_kind, displayed_value, candidate_status,
         extraction_method, selector_or_path, observed_at, fetched_at, content_checksum, extraction_policy_version,
         source_class, claim_state)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(record.id, record.assessmentId, record.pageId, record.evidenceId, record.contactKind,
          record.displayedValue, record.candidateStatus, record.extractionMethod, record.selectorOrPath,
          record.observedAt, record.fetchedAt, record.contentChecksum, record.extractionPolicyVersion,
          record.sourceClass, record.claimState);
      return repository.listContactObservations(record.assessmentId).find((value) => value.id === record.id) as WebsiteContactObservationRecord;
    },
    listContactObservations(assessmentId) {
      const rows = database.prepare("SELECT * FROM website_contact_observations WHERE assessment_id = ? ORDER BY contact_kind, id").all(assessmentId) as Array<Record<string, unknown>>;
      return rows.map((row) => ({
        id: row.id as string, assessmentId: row.assessment_id as string, pageId: row.page_id as string,
        evidenceId: row.evidence_id as string | null, contactKind: row.contact_kind as WebsiteContactObservationRecord["contactKind"],
        displayedValue: row.displayed_value as string, candidateStatus: row.candidate_status as WebsiteContactObservationRecord["candidateStatus"],
        extractionMethod: row.extraction_method as string, selectorOrPath: row.selector_or_path as string | null,
        observedAt: row.observed_at as string, fetchedAt: row.fetched_at as string,
        contentChecksum: row.content_checksum as string, extractionPolicyVersion: row.extraction_policy_version as string,
        sourceClass: row.source_class as ProvenanceSourceClass,
        claimState: row.claim_state as WebsiteContactObservationRecord["claimState"],
      }));
    },
    addServiceEvidence(record) {
      database.prepare(`INSERT INTO service_evidence
        (id, assessment_id, page_id, evidence_id, evidence_state, term, basis, observed_at, extraction_policy_version,
         source_class, claim_state)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(record.id, record.assessmentId, record.pageId, record.evidenceId, record.evidenceState,
          record.term, record.basis, record.observedAt, record.extractionPolicyVersion,
          record.sourceClass, record.claimState);
      return repository.listServiceEvidence(record.assessmentId).find((value) => value.id === record.id) as ServiceEvidenceRecord;
    },
    listServiceEvidence(assessmentId) {
      const rows = database.prepare("SELECT * FROM service_evidence WHERE assessment_id = ? ORDER BY evidence_state, id").all(assessmentId) as Array<Record<string, unknown>>;
      return rows.map((row) => ({
        id: row.id as string, assessmentId: row.assessment_id as string, pageId: row.page_id as string | null,
        evidenceId: row.evidence_id as string | null, evidenceState: row.evidence_state as ServiceEvidenceRecord["evidenceState"],
        term: row.term as string | null, basis: row.basis as ServiceEvidenceRecord["basis"], observedAt: row.observed_at as string,
        extractionPolicyVersion: row.extraction_policy_version as string,
        sourceClass: row.source_class as ProvenanceSourceClass, claimState: row.claim_state as ClaimState,
      }));
    },
    addIdentityConflict(record) {
      database.prepare(`INSERT INTO website_identity_conflicts
        (id, assessment_id, business_id, page_id, evidence_id, conflict_type, expected_value,
         observed_value, review_state, observed_at, resolved_at, source_class, claim_state)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(record.id, record.assessmentId, record.businessId, record.pageId, record.evidenceId,
          record.conflictType, record.expectedValue, record.observedValue, record.reviewState,
          record.observedAt, record.resolvedAt, record.sourceClass, record.claimState);
      return { ...record };
    },
    transaction(operation) {
      return withTransaction(database, () => operation(repository));
    },
  };
  return repository;
}
