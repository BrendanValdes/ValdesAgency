import { describe, expect, it } from "vitest";
import { CRAWL_POLICY_VERSION, EXTRACTION_POLICY_VERSION } from "../../src/lead-engine/crawl/types.js";
import { createWebsiteAssessmentRepository } from "../../src/lead-engine/db/website-assessment-repository.js";
import { getMigrationHistory, migrateDatabase } from "../../src/lead-engine/db/migrate.js";
import { WEBSITE_ASSESSMENT_POLICY_VERSION } from "../../src/lead-engine/validation/website-assessment.js";
import { createTestDatabase, syntheticBusiness } from "./fixtures/synthetic.js";

const timestamp = "2026-01-15T12:00:00.000Z";

describe("migration 004 website assessment persistence", () => {
  it("applies the complete migration chain in order and remains idempotent", () => {
    const fixture = createTestDatabase();
    try {
      expect(getMigrationHistory(fixture.database).map(({ version }) => version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(migrateDatabase(fixture.database)).toEqual(getMigrationHistory(fixture.database));
    } finally {
      fixture.cleanup();
    }
  });

  it("round-trips assessment metadata without retaining raw page bodies", () => {
    const fixture = createTestDatabase();
    const repository = createWebsiteAssessmentRepository(fixture.database);
    try {
      fixture.database.prepare("INSERT INTO businesses (id, canonical_name, state, niche_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(syntheticBusiness.id, syntheticBusiness.canonicalName, syntheticBusiness.state, syntheticBusiness.nicheId, timestamp, timestamp);
      const assessment = repository.createAssessment({
        id: "assessment-synthetic-001", businessId: syntheticBusiness.id, sourceWebsiteUrl: "https://clearwater.example/",
        canonicalHomepageUrl: "https://clearwater.example/", status: "complete", startedAt: timestamp, assessedAt: timestamp,
        freshUntil: "2026-01-16T12:00:00.000Z", crawlPolicyVersion: CRAWL_POLICY_VERSION,
        extractionPolicyVersion: EXTRACTION_POLICY_VERSION, browserStatus: "disabled", identityState: "agrees", reviewRequired: false,
        sourceClass: "synthetic_fixture",
      });
      expect(repository.getAssessment(assessment.id)).toEqual(assessment);
      const fetch = repository.addFetch({
        id: "fetch-synthetic-001", assessmentId: assessment.id, requestedUrl: "https://clearwater.example/",
        finalUrl: "https://clearwater.example/", outcome: "success", httpStatus: 200, errorCode: null, retryable: false,
        attempts: 1, contentType: "text/html", compressedBytes: 100, decompressedBytes: 120,
        contentChecksum: "a".repeat(64), etag: '"synthetic"', lastModified: null, redirectHistory: [], fetchedAt: timestamp,
      });
      const page = repository.addPage({
        id: "page-synthetic-001", assessmentId: assessment.id, fetchId: fetch.id, pageUrl: "https://clearwater.example/",
        pageKind: "homepage", inspectionStatus: "successful", title: "Clearwater Example Pool Care", metaDescription: null,
        language: "en", viewport: "width=device-width", contentChecksum: "a".repeat(64), observedAt: timestamp, fetchedAt: timestamp,
      });
      const person = repository.addPersonCandidate({
        id: "person-candidate-synthetic-001", assessmentId: assessment.id, businessId: syntheticBusiness.id, pageId: page.id,
        evidenceId: null, displayedName: "Avery Example", displayedTitle: "Operations Manager",
        candidateStatus: "unverified_evidence_candidate", ambiguityState: "none", extractionMethod: "json_ld", observedAt: timestamp,
        sourceClass: "synthetic_fixture", claimState: "public_unverified_candidate",
      });
      repository.addLink({
        id: "link-synthetic-001", pageId: page.id, targetUrl: "https://clearwater.example/contact",
        linkKind: "contact", linkTextChecksum: "b".repeat(64), extractionMethod: "html_anchor", observedAt: timestamp,
      });
      repository.addRobotsDecision({
        id: "robots-synthetic-001", assessmentId: assessment.id, pageUrl: page.pageUrl,
        robotsUrl: "https://clearwater.example/robots.txt", decision: "allowed", reason: "matched_allow",
        matchedRule: "/", contentChecksum: "c".repeat(64), fetchedAt: timestamp, expiresAt: "2026-01-16T12:00:00.000Z",
      });
      const cache = repository.upsertCacheEntry({
        id: "cache-synthetic-001", cacheUrl: page.pageUrl, fetchedAt: timestamp, expiresAt: "2026-01-16T12:00:00.000Z",
        etag: '"synthetic"', lastModified: null, contentChecksum: "a".repeat(64), httpStatus: 200,
        contentType: "text/html", robotsStatus: "allowed", extractionPolicyVersion: EXTRACTION_POLICY_VERSION,
      });
      repository.addFailure({
        id: "failure-synthetic-001", assessmentId: assessment.id, pageUrl: "https://clearwater.example/unavailable",
        errorCode: "connection_failure", retryable: true, attempts: 3, httpStatus: null, occurredAt: timestamp,
      });
      repository.addStructuredDataObservation({
        id: "structured-synthetic-001", pageId: page.id, evidenceId: null, schemaType: "LocalBusiness",
        structuredDataPath: "$[1]", fieldName: "name", claimedValue: "Clearwater Example Pool Care",
        confidence: "high", observedAt: timestamp, fetchedAt: timestamp, contentChecksum: "a".repeat(64),
        extractionPolicyVersion: EXTRACTION_POLICY_VERSION,
        sourceClass: "synthetic_fixture", claimState: "observed",
      });
      const contact = repository.addContactObservation({
        id: "contact-observation-synthetic-001", assessmentId: assessment.id, pageId: page.id, evidenceId: null,
        contactKind: "email", displayedValue: "hello@example.test", candidateStatus: "public_unverified",
        extractionMethod: "html", selectorOrPath: "a:nth-of-type(1)", observedAt: timestamp, fetchedAt: timestamp,
        contentChecksum: "a".repeat(64), extractionPolicyVersion: EXTRACTION_POLICY_VERSION,
        sourceClass: "synthetic_fixture", claimState: "public_unverified_candidate",
      });
      const service = repository.addServiceEvidence({
        id: "service-evidence-synthetic-001", assessmentId: assessment.id, pageId: page.id, evidenceId: null,
        evidenceState: "positive", term: "pool maintenance", basis: "heading", observedAt: timestamp,
        extractionPolicyVersion: EXTRACTION_POLICY_VERSION,
        sourceClass: "synthetic_fixture", claimState: "observed",
      });
      repository.addIdentityConflict({
        id: "identity-conflict-synthetic-001", assessmentId: assessment.id, businessId: syntheticBusiness.id,
        pageId: page.id, evidenceId: null, conflictType: "business_name", expectedValue: syntheticBusiness.canonicalName,
        observedValue: "Unrelated Example Roofing", reviewState: "pending", observedAt: timestamp, resolvedAt: null,
        sourceClass: "synthetic_fixture", claimState: "conflicting",
      });
      repository.addConversionObservation({
        id: "conversion-synthetic-001", assessmentId: assessment.id, pageId: page.id, evidenceId: null,
        feature: "contact_form", status: "present", observedAt: timestamp, freshUntil: "2026-01-16T12:00:00.000Z",
        policyVersion: WEBSITE_ASSESSMENT_POLICY_VERSION,
        sourceClass: "synthetic_fixture", claimState: "observed",
      });
      expect(repository.listFetches(assessment.id)).toEqual([fetch]);
      expect(repository.listPages(assessment.id)).toEqual([page]);
      expect(repository.listPersonCandidates(assessment.id)).toEqual([person]);
      expect(repository.listConversionObservations(assessment.id)[0]?.status).toBe("present");
      expect(repository.getCacheEntry(page.pageUrl)).toEqual(cache);
      repository.upsertCacheEntry({ ...cache, id: "cache-synthetic-failed", fetchedAt: "2026-01-15T13:00:00.000Z", contentChecksum: null, httpStatus: null, contentType: null });
      expect(repository.getCacheEntry(page.pageUrl)?.contentChecksum).toBe("a".repeat(64));
      expect(repository.listContactObservations(assessment.id)).toEqual([contact]);
      expect(repository.listServiceEvidence(assessment.id)).toEqual([service]);
      for (const table of ["website_links", "robots_decisions", "crawl_failures", "structured_data_observations", "website_identity_conflicts"]) {
        expect(fixture.database.prepare(`SELECT count(*) AS count FROM ${table}`).get()).toEqual({ count: 1 });
      }
      const columns = fixture.database.prepare("PRAGMA table_info(website_fetches)").all() as Array<{ name: string }>;
      expect(columns.map(({ name }) => name).some((name) => /(?:raw|body|html)/i.test(name))).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  it("enforces foreign keys and cascades assessment records by business", () => {
    const fixture = createTestDatabase();
    try {
      expect(() => fixture.database.prepare(`INSERT INTO website_assessments
        (id, business_id, source_website_url, status, started_at, assessed_at, fresh_until, crawl_policy_version,
         extraction_policy_version, browser_status, identity_state, review_required, source_class)
        VALUES ('orphan', 'missing', 'https://clearwater.example/', 'failed', ?, ?, ?, 'v1', 'v1', 'disabled', 'unavailable', 0, 'synthetic_fixture')`)
        .run(timestamp, timestamp, timestamp)).toThrow();
      fixture.database.prepare("INSERT INTO businesses (id, canonical_name, state, niche_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(syntheticBusiness.id, syntheticBusiness.canonicalName, syntheticBusiness.state, syntheticBusiness.nicheId, timestamp, timestamp);
      fixture.database.prepare(`INSERT INTO website_assessments
        (id, business_id, source_website_url, status, started_at, assessed_at, fresh_until, crawl_policy_version,
         extraction_policy_version, browser_status, identity_state, review_required, source_class)
        VALUES ('cascade', ?, 'https://clearwater.example/', 'failed', ?, ?, ?, 'v1', 'v1', 'disabled', 'unavailable', 0, 'synthetic_fixture')`)
        .run(syntheticBusiness.id, timestamp, timestamp, timestamp);
      fixture.database.prepare("DELETE FROM businesses WHERE id = ?").run(syntheticBusiness.id);
      expect(fixture.database.prepare("SELECT count(*) AS count FROM website_assessments").get()).toEqual({ count: 0 });
    } finally {
      fixture.cleanup();
    }
  });
});
