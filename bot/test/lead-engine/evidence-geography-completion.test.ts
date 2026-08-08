import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createAssessmentStore,
  type AssessmentStore,
} from "../../src/lead-engine/assessment/assessment-store.js";
import { qualifyAndRankBatch } from "../../src/lead-engine/assessment/batch-runner.js";
import {
  providerObservedLocation,
  selectAssessableCandidates,
  type EligibleCandidate,
} from "../../src/lead-engine/assessment/candidate-gate.js";
import {
  runLiveWebsiteAssessment,
  type LiveWebsiteAssessmentLimits,
} from "../../src/lead-engine/assessment/live-website-assessment.js";
import { planSuburbanCoverage } from "../../src/lead-engine/assessment/suburban-discovery.js";
import { POOL_SERVICE_ICP_MODEL_VERSION } from "../../src/lead-engine/qualification/pool-service-model.js";
import { createQualificationRepository } from "../../src/lead-engine/qualification/repository.js";
import { qualifyPoolServiceLead } from "../../src/lead-engine/qualification/qualifier.js";
import { createCallingQueueRepository } from "../../src/lead-engine/ranking/queue-repository.js";
import { CALLABLE_EVIDENCE_REASONS, rankQueueCandidate } from "../../src/lead-engine/ranking/ranker.js";
import { defaultQueueConstraints } from "./helpers/ranking-fixture.js";
import { DISCOVERY_COVERAGE_SCHEME } from "../../src/lead-engine/geography/coverage-keys.js";
import type { CrawlPage, CrawlResult, RobotsDecision } from "../../src/lead-engine/crawl/types.js";
import type { SqliteDatabase } from "../../src/lead-engine/db/database.js";
import type {
  NormalizedDiscoveryResult,
  ProviderEnvelope,
} from "../../src/lead-engine/providers/contracts.js";
import type { PoolServiceQualificationResult } from "../../src/lead-engine/qualification/types.js";
import type { CoverageManifest } from "../../src/lead-engine/geography/types.js";

/**
 * Evidence and geography completion, exercised through the production modules.
 *
 * Every assertion here runs the real admission gate, the real live-assessment
 * traversal, the real assessment store, the real qualification repository and
 * qualifier, and the real calling-queue repository and ranker. Nothing is
 * hand-seeded into a scoring table, so a rule that only passes against a fixture
 * cannot pass here.
 */

const REPO_ROOT = path.resolve(process.cwd(), "..");
const NOW = "2026-08-02T00:00:00.000Z";
const temporaryRoots: string[] = [];
const openStores: AssessmentStore[] = [];

afterEach(() => {
  while (openStores.length > 0) {
    const store = openStores.pop() as AssessmentStore;
    if (store.database.open) store.close();
  }
  while (temporaryRoots.length > 0) {
    rmSync(temporaryRoots.pop() as string, { recursive: true, force: true });
  }
});

function temporaryDatabase(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "rocco-evidence-geo-"));
  temporaryRoots.push(root);
  return path.join(root, "batch.sqlite");
}

/**
 * The real suburban planner output. Its cells are genuine US/AZ grid cells, so
 * the market a test compares against is the market the production planner
 * actually produces rather than a string chosen to make a rule pass.
 */
function coverageManifest(): CoverageManifest {
  return planSuburbanCoverage({
    configurationVersion: "1.0.0",
    queryVersion: "evidence-geography-completion-1.0.0",
    maxCells: 3,
  });
}

const IN_MARKET = { city: "Mesa", region: "AZ", postalCode: "85201", countryCode: "US" };
const OUT_OF_MARKET = { city: "Henderson", region: "NV", postalCode: "89012", countryCode: "US" };

/** A provider category the configured pool_service niche treats as relevant. */
const RELEVANT_CATEGORY = "swimming_pool_repair_service";

function envelope(input: {
  placeId: string;
  name: string;
  host: string;
  categories?: ReadonlyArray<string>;
  address?: Partial<NormalizedDiscoveryResult["address"]>;
  blankAddress?: boolean;
}): ProviderEnvelope<NormalizedDiscoveryResult> {
  const address = {
    line1: "1 Test Way",
    ...IN_MARKET,
    ...input.address,
  } as NormalizedDiscoveryResult["address"];
  const result = {
    providerPlaceId: input.placeId,
    name: input.name,
    categories: [...(input.categories ?? [RELEVANT_CATEGORY])],
    // A blank locality/region is what an incomplete provider record looks like.
    // The gate must refuse to turn it into a location rather than guessing one.
    address: input.blankAddress ? { ...address, city: "  ", region: " " } : address,
    domains: [`https://${input.host}/`],
    phones: ["+15550101001"],
    brandName: null,
    groupHint: null,
    providerObservation: {
      releaseId: "2026-07-22.0",
      featureVersion: 1,
      schemaVersion: "1.0.0",
      taxonomyMappingVersion: "overture_pool_service_taxonomy_v2",
      basicCategory: RELEVANT_CATEGORY,
      taxonomyPrimary: RELEVANT_CATEGORY,
      taxonomyHierarchy: [],
      taxonomyAlternates: [],
      categoryDisposition: "strong",
      providerConfidence: 0.9,
      operatingStatus: "open",
      sourceMetadata: [],
      coverageKey: "cell",
      queryFingerprint: "fingerprint",
      assetIds: ["a".repeat(64)],
    },
  } as NormalizedDiscoveryResult;
  return {
    providerId: "overture_places_live",
    sourceClass: "local_public_dataset",
    claimState: "public_unverified_candidate",
    operation: "discovery",
    providerSchemaVersion: "1.0.0",
    correlationId: "run:query",
    providerResultId: input.placeId,
    observedAt: NOW,
    retrievedAt: NOW,
    cost: { billable: false, billableUnits: 0, unit: "none", microUsd: 0 },
    cache: { status: "bypassed", key: null },
    normalizedResult: result,
    validation: { status: "accepted", issues: [] },
    error: null,
    rawReferenceChecksum: null,
  };
}

/** The real gate, then the coverage-cell attachment discovery performs. */
function gatedCandidate(
  input: Parameters<typeof envelope>[0],
  coverageKey: string,
): EligibleCandidate {
  const gate = selectAssessableCandidates([envelope(input)]);
  const candidate = gate.eligible[0];
  if (!candidate) throw new Error("Test candidate did not pass the production admission gate");
  return { ...candidate, discoveredCoverageKey: coverageKey };
}

function robots(host: string): RobotsDecision {
  return {
    origin: `https://${host}`, robotsUrl: `https://${host}/robots.txt`,
    status: "allowed", reason: "no_matching_rule", matchedRule: null,
    fetchedAt: NOW, expiresAt: "2026-08-03T00:00:00.000Z",
    contentChecksum: null, sitemapUrls: [],
  };
}

function html(input: { name: string; phone?: boolean; email?: boolean }): string {
  return [
    `<html lang="en"><head><title>${input.name}</title>`,
    '<meta name="viewport" content="width=device-width">',
    '<script type="application/ld+json">',
    JSON.stringify({ "@type": "Organization", name: input.name }),
    "</script></head><body><h1>Pool cleaning</h1><h2>Pool service</h2>",
    input.phone === false ? "" : '<a href="tel:+15550101001">Call us</a>',
    input.email === false ? "" : '<a href="mailto:hello@example.invalid">Email us</a>',
    '<a href="/contact">Contact</a><a href="/services">Our services</a>',
    "</body></html>",
  ].join("");
}

function crawl(candidate: EligibleCandidate, body: string, options: {
  extraPage?: boolean;
} = {}): CrawlResult {
  const fetchOf = (url: string, content: string): CrawlPage["fetch"] => ({
    ok: true, requestedUrl: url, finalUrl: url, status: 200,
    contentType: "text/html", body: content,
    compressedBytes: 2_000, decompressedBytes: 4_000,
    contentChecksum: createHash("sha256").update(content).digest("hex"),
    etag: null, lastModified: null, redirectHistory: [], fetchedAt: NOW, attempts: 1,
  });
  const pages: CrawlPage[] = [{
    url: candidate.candidateUrl, kind: "homepage", inspectionStatus: "successful",
    fetch: fetchOf(candidate.candidateUrl, body), html: body,
  }];
  if (options.extraPage) {
    const url = `${candidate.candidateUrl}services`;
    pages.push({
      url, kind: "services", inspectionStatus: "successful",
      fetch: fetchOf(url, body), html: body,
    });
  }
  const decision = { ...robots(candidate.candidateHost), origin: candidate.candidateUrl };
  return {
    requestedUrl: candidate.candidateUrl, sourceClass: "public_business_website",
    canonicalHomepage: candidate.candidateUrl,
    startedAt: NOW, completedAt: "2026-08-02T00:00:01.000Z",
    pages, robots: decision, robotsDecisions: [decision],
    complete: true, timedOut: false,
  };
}

const NICHE = {
  service_synonyms: ["pool cleaning", "pool service"],
  required_indicators: ["pool"],
  negative_keywords: [],
  excluded_adjacent_industries: [],
  relevant_categories: ["pool_service", RELEVANT_CATEGORY],
} as never;

const LIMITS: LiveWebsiteAssessmentLimits = {
  maxBusinessesAttempted: 8, maxWebsitesAssessed: 8, maxPagesPerBusiness: 3,
  maxRequestsPerBusiness: 6, maxTotalRequests: 40,
  maxDownloadedBytes: 8 * 1024 * 1024, maxProcessedBytes: 16 * 1024 * 1024,
  maxDurationMs: 60_000, maxRetriesPerBusiness: 1,
};

/**
 * The whole production chain: coverage persistence, live assessment, evidence
 * persistence, qualification, ranking, and the persisted queue.
 */
async function runBatch(input: {
  candidates: ReadonlyArray<EligibleCandidate>;
  coverage: CoverageManifest;
  body?: (candidate: EligibleCandidate) => string;
  extraPage?: boolean;
  databasePath?: string;
}) {
  const databasePath = input.databasePath ?? temporaryDatabase();
  const store = createAssessmentStore({
    databasePath, repositoryRoot: REPO_ROOT,
    candidates: input.candidates, coverage: input.coverage,
    now: () => new Date(NOW),
  });
  openStores.push(store);
  const websites = await runLiveWebsiteAssessment({
    candidates: input.candidates,
    limits: LIMITS, niche: NICHE,
    now: () => new Date(NOW),
    assessmentId: (candidate) => `wa_${candidate.candidateKey}`,
    createCrawler: (candidate) => ({
      crawl: async () => crawl(
        candidate,
        input.body?.(candidate) ?? html({ name: candidate.expectedBusinessName }),
        { ...(input.extraPage ? { extraPage: true } : {}) },
      ),
    }),
    sink: store.sink,
  });
  const coverageKeys = input.coverage.cells.map((cell) => cell.coverageKey);
  const queue = qualifyAndRankBatch({
    database: store.database,
    assessments: store.assessmentBusinessIds()
      .map((row) => ({ assessmentId: row.assessmentId, businessId: row.businessId })),
    runId: "evidence-geography-completion",
    evaluatedAt: NOW,
    maximumCallable: 10, maximumReview: 10,
    coverageKeys,
    signal: new AbortController().signal,
  });
  return { store, websites, queue, databasePath, coverageKeys };
}

function resultFor(store: AssessmentStore, candidate: EligibleCandidate): PoolServiceQualificationResult {
  const result = createQualificationRepository(store.database)
    .getLatestForBusiness(store.businessIdFor(candidate.candidateKey));
  if (!result) throw new Error("No persisted qualification result for the candidate");
  return result;
}

function points(result: PoolServiceQualificationResult, ruleId: string): number {
  const outcome = result.componentScores.flatMap((component) => component.outcomes)
    .find((entry) => entry.ruleId === ruleId);
  if (!outcome) throw new Error(`Missing rule outcome: ${ruleId}`);
  return outcome.points;
}

function outcomeOf(result: PoolServiceQualificationResult, ruleId: string) {
  const outcome = result.componentScores.flatMap((component) => component.outcomes)
    .find((entry) => entry.ruleId === ruleId);
  if (!outcome) throw new Error(`Missing rule outcome: ${ruleId}`);
  return outcome;
}

const hardRuleIds = (result: PoolServiceQualificationResult): string[] =>
  result.hardDisqualifiers.map((entry) => entry.ruleId);

/** Rank one live candidate through the production queue repository and ranker. */
function rankLive(store: AssessmentStore, candidate: EligibleCandidate, coverageKeys: ReadonlyArray<string>) {
  const businessId = store.businessIdFor(candidate.candidateKey);
  const loaded = createCallingQueueRepository(store.database)
    .loadCandidates(POOL_SERVICE_ICP_MODEL_VERSION)
    .find((entry) => entry.businessId === businessId);
  if (!loaded) throw new Error("No queue candidate was loaded for the live business");
  const entry = rankQueueCandidate(loaded, defaultQueueConstraints({
    scope: { kind: "coverage_keys", coverageKeys: [...coverageKeys] },
    generatedAt: NOW,
  }));
  return { loaded, entry, codes: entry.reasons.map((reason) => reason.code) };
}

interface ServiceRow {
  id: string;
  page_id: string | null;
  basis: string;
  term: string | null;
  source_class: string;
  claim_state: string;
}

function providerCategoryRows(database: SqliteDatabase): ServiceRow[] {
  return database.prepare(`
    SELECT id, page_id, basis, term, source_class, claim_state
    FROM service_evidence WHERE basis = 'provider_category' ORDER BY id
  `).all() as ServiceRow[];
}

interface LocationRow {
  id: string;
  business_id: string;
  city: string;
  region: string;
  country_code: string;
  source_class: string;
  claim_state: string;
  evidence_state: string;
}

function locationRows(database: SqliteDatabase): LocationRow[] {
  return database.prepare(`
    SELECT id, business_id, city, region, country_code, source_class, claim_state, evidence_state
    FROM business_locations ORDER BY id
  `).all() as LocationRow[];
}

// --- A. structured organization name ------------------------------------------

describe("live Organization JSON-LD reaches the qualifier", () => {
  it("persists the canonical organization_name field and scores the existing two points", async () => {
    const coverage = coverageManifest();
    const candidate = gatedCandidate(
      { placeId: "org-1", name: "Sunset Pool Care", host: "sunset-pool-care.invalid" },
      coverage.cells[0]?.coverageKey as string,
    );
    const { store } = await runBatch({ candidates: [candidate], coverage });
    const structured = store.database.prepare(`
      SELECT schema_type, structured_data_path, field_name, claimed_value, source_class, claim_state
      FROM structured_data_observations ORDER BY id
    `).all() as Array<Record<string, string>>;
    expect(structured).toHaveLength(1);
    expect(structured[0]).toMatchObject({
      schema_type: "Organization",
      structured_data_path: "organizationNames",
      field_name: "organization_name",
      source_class: "public_business_website",
      claim_state: "observed",
    });
    // Only the canonical field is written: nothing broadened generic "name".
    const generic = store.database
      .prepare("SELECT COUNT(*) AS total FROM structured_data_observations WHERE field_name = 'name'")
      .get() as { total: number };
    expect(generic.total).toBe(0);

    const result = resultFor(store, candidate);
    const rule = outcomeOf(result, "legitimacy.structured_business_data");
    expect(rule.points).toBe(2);
    // The existing ceiling, not a new scoring path.
    expect(rule.maximumPoints).toBe(2);
    expect(rule.evidenceReferences.map((reference) => reference.sourceTable))
      .toEqual(["structured_data_observations"]);
    const legitimacy = result.componentScores
      .find((component) => component.component === "business_legitimacy");
    expect(legitimacy?.maximumPoints).toBe(15);
    expect(legitimacy?.points).toBeLessThanOrEqual(15);
  });
});

// --- B. provider category propagation -----------------------------------------

describe("provider categories survive discovery to service evidence", () => {
  it("carries the provider's categories and provenance through the admission gate", () => {
    const gate = selectAssessableCandidates([envelope({
      placeId: "cat-gate", name: "Gate Pool Co", host: "gate-pool-co.invalid",
      categories: [RELEVANT_CATEGORY, "pool_cleaning"],
    })]);
    expect(gate.eligible[0]?.providerCategories).toEqual(["pool_cleaning", RELEVANT_CATEGORY]);
    expect(gate.eligible[0]?.providerSourceClass).toBe("local_public_dataset");
  });

  it("persists one provider-category service fact and feeds only existing service-fit rules", async () => {
    const coverage = coverageManifest();
    const candidate = gatedCandidate(
      { placeId: "cat-1", name: "Mesa Pool Repair", host: "mesa-pool-repair.invalid" },
      coverage.cells[0]?.coverageKey as string,
    );
    // Two usable pages: one provider observation must not become two facts.
    const { store } = await runBatch({ candidates: [candidate], coverage, extraPage: true });
    const rows = providerCategoryRows(store.database);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      // Assessment-scoped, not page-scoped: the provider did not state this on a page.
      page_id: null,
      basis: "provider_category",
      term: RELEVANT_CATEGORY,
      // Discovery provenance preserved, never relabelled as a website claim.
      source_class: "local_public_dataset",
      claim_state: "observed",
    });
    expect(store.evidenceCounts().providerCategories).toBe(1);

    const result = resultFor(store, candidate);
    const relevant = outcomeOf(result, "niche.relevant_category");
    expect(relevant.points).toBe(5);
    expect(relevant.maximumPoints).toBe(5);
    expect(relevant.evidenceReferences.some((reference) =>
      reference.sourceTable === "service_evidence" && reference.sourceClass === "local_public_dataset"
    )).toBe(true);
    const serviceFit = result.componentScores
      .find((component) => component.component === "niche_service_fit");
    expect(serviceFit?.maximumPoints).toBe(25);
    expect(serviceFit?.points).toBeLessThanOrEqual(25);
  });

  it("grants no verification, human confirmation, or promotion credit", async () => {
    const coverage = coverageManifest();
    const candidate = gatedCandidate(
      { placeId: "cat-2", name: "Gilbert Pool Repair", host: "gilbert-pool-repair.invalid" },
      coverage.cells[0]?.coverageKey as string,
    );
    const { store } = await runBatch({ candidates: [candidate], coverage });
    const result = resultFor(store, candidate);
    for (const ruleId of [
      "contact.phone_reachability_verified", "contact.email_deliverability_verified",
      "person.employment_verified", "person.owner_relationship_verified",
      "person.decision_authority_verified", "person.human_confirmation",
    ]) expect(points(result, ruleId)).toBe(0);
    expect(result.confidence.usedAsVerification).toBe(false);
    expect(result.identityReviewState).toBe("clear");
    for (const table of ["evidence_promotion_decisions", "identity_decision_audits"]) {
      const row = store.database.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get() as { total: number };
      expect(row.total).toBe(0);
    }
    // No verification field is set on any provider-derived row.
    const rows = store.database.prepare(`
      SELECT COUNT(*) AS total FROM evidence
      WHERE verification_dimension IS NOT NULL OR verifier_id IS NOT NULL
         OR verification_result IS NOT NULL
    `).get() as { total: number };
    expect(rows.total).toBe(0);
  });

  it("adds no corroboration credit of its own beyond the provider location already present", async () => {
    const coverage = coverageManifest();
    const withCategories = gatedCandidate(
      { placeId: "corr-1", name: "Chandler Pool Repair", host: "chandler-pool-repair.invalid" },
      coverage.cells[0]?.coverageKey as string,
    );
    const withoutCategories: EligibleCandidate = {
      ...gatedCandidate(
        { placeId: "corr-2", name: "Chandler Pool Repair", host: "chandler-pool-repair-b.invalid" },
        coverage.cells[0]?.coverageKey as string,
      ),
      providerCategories: [],
    };
    const { store } = await runBatch({
      candidates: [withCategories, withoutCategories], coverage,
    });
    const withRow = resultFor(store, withCategories);
    const withoutRow = resultFor(store, withoutCategories);
    // The category rows move service fit and nothing else in evidence quality.
    expect(points(withRow, "quality.corroborated_sources"))
      .toBe(points(withoutRow, "quality.corroborated_sources"));
    expect(withRow.evidenceQuality.sourceClasses).toEqual(withoutRow.evidenceQuality.sourceClasses);
    expect(points(withRow, "niche.relevant_category")).toBe(5);
    expect(points(withoutRow, "niche.relevant_category")).toBe(0);
  });

  it("does not duplicate the provider-category fact when the batch is reprocessed", async () => {
    const coverage = coverageManifest();
    const databasePath = temporaryDatabase();
    const candidate = gatedCandidate(
      { placeId: "cat-3", name: "Tempe Pool Repair", host: "tempe-pool-repair.invalid" },
      coverage.cells[0]?.coverageKey as string,
    );
    const first = await runBatch({ candidates: [candidate], coverage, databasePath });
    const firstScore = resultFor(first.store, candidate).overallScore;
    expect(providerCategoryRows(first.store.database)).toHaveLength(1);
    first.store.close();

    const second = await runBatch({ candidates: [candidate], coverage, databasePath });
    expect(second.websites.duplicateAssessmentsSkipped).toBe(1);
    expect(providerCategoryRows(second.store.database)).toHaveLength(1);
    expect(resultFor(second.store, candidate).overallScore).toBe(firstScore);
  });
});

// --- C. business location and hard geography ----------------------------------

describe("provider location persistence", () => {
  it("refuses to invent a location the provider did not supply", () => {
    expect(providerObservedLocation({
      line1: null, city: "  ", region: "AZ", postalCode: null, countryCode: "US",
    })).toBeNull();
    expect(providerObservedLocation({
      line1: null, city: "Mesa", region: "   ", postalCode: null, countryCode: "US",
    })).toBeNull();
    expect(providerObservedLocation({
      line1: null, city: "Mesa", region: "AZ", postalCode: null, countryCode: "USA",
    })).toBeNull();
    expect(providerObservedLocation({
      line1: " 1 Way ", city: " Mesa ", region: " az ", postalCode: " ", countryCode: "us",
    })).toEqual({
      line1: "1 Way", city: "Mesa", region: "az", postalCode: null, countryCode: "US",
    });
  });

  it("persists exactly one location per business with the provider's own provenance", async () => {
    const coverage = coverageManifest();
    const candidate = gatedCandidate(
      { placeId: "loc-1", name: "Mesa Pool Repair", host: "loc-mesa-pool.invalid" },
      coverage.cells[0]?.coverageKey as string,
    );
    const { store } = await runBatch({ candidates: [candidate], coverage, extraPage: true });
    const rows = locationRows(store.database);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      city: "Mesa", region: "AZ", country_code: "US",
      source_class: "local_public_dataset", claim_state: "observed", evidence_state: "found",
    });
    expect(store.evidenceCounts().locations).toBe(1);
    const result = resultFor(store, candidate);
    const rule = outcomeOf(result, "legitimacy.location_observed");
    expect(rule.points).toBe(2);
    expect(rule.evidenceReferences.map((reference) => reference.sourceTable))
      .toEqual(["business_locations"]);
  });

  it("does not duplicate the location when the batch is reprocessed", async () => {
    const coverage = coverageManifest();
    const databasePath = temporaryDatabase();
    const candidate = gatedCandidate(
      { placeId: "loc-2", name: "Peoria Pool Repair", host: "loc-peoria-pool.invalid" },
      coverage.cells[0]?.coverageKey as string,
    );
    const first = await runBatch({ candidates: [candidate], coverage, databasePath });
    expect(locationRows(first.store.database)).toHaveLength(1);
    first.store.close();
    const second = await runBatch({ candidates: [candidate], coverage, databasePath });
    expect(locationRows(second.store.database)).toHaveLength(1);
  });
});

describe("hard geography", () => {
  it("rejects a genuinely out-of-market business and keeps an in-market one", async () => {
    const coverage = coverageManifest();
    const cell = coverage.cells[0]?.coverageKey as string;
    const inMarket = gatedCandidate(
      { placeId: "geo-in", name: "Mesa Pool Repair", host: "geo-in-pool.invalid" }, cell,
    );
    const outOfMarket = gatedCandidate(
      {
        placeId: "geo-out", name: "Henderson Pool Repair", host: "geo-out-pool.invalid",
        address: OUT_OF_MARKET,
      }, cell,
    );
    const { store } = await runBatch({ candidates: [inMarket, outOfMarket], coverage });

    const inside = resultFor(store, inMarket);
    expect(hardRuleIds(inside)).not.toContain("hard.outside_selected_geography");
    expect(inside.icpResult).not.toBe("disqualified");

    const outside = resultFor(store, outOfMarket);
    expect(hardRuleIds(outside)).toEqual(["hard.outside_selected_geography"]);
    expect(outside.icpResult).toBe("disqualified");
    // The rejection cites both sides of the comparison, from real rows.
    const cited = outside.hardDisqualifiers[0]?.evidenceReferences.map((reference) => reference.sourceTable);
    expect(cited).toContain("business_locations");
    expect(cited).toContain("coverage_cells");
  });

  it("persists the market it compared against as real coverage cells", async () => {
    const coverage = coverageManifest();
    const candidate = gatedCandidate(
      { placeId: "geo-cells", name: "Mesa Pool Repair", host: "geo-cells-pool.invalid" },
      coverage.cells[0]?.coverageKey as string,
    );
    const { store } = await runBatch({ candidates: [candidate], coverage });
    const cells = store.database.prepare(`
      SELECT coverage_key, country_code, subdivision_code FROM coverage_cells ORDER BY coverage_key
    `).all() as Array<{ coverage_key: string; country_code: string; subdivision_code: string | null }>;
    expect(cells).toHaveLength(coverage.cells.length);
    for (const row of cells) {
      expect(row.country_code).toBe("US");
      expect(row.subdivision_code).toBe("AZ");
    }
  });

  it("fabricates no geography certainty when the provider supplied no location", async () => {
    const coverage = coverageManifest();
    const candidate = gatedCandidate(
      {
        placeId: "geo-none", name: "Unknown Place Pool Repair", host: "geo-none-pool.invalid",
        blankAddress: true,
      },
      coverage.cells[0]?.coverageKey as string,
    );
    expect(candidate.providerLocation).toBeNull();
    const { store } = await runBatch({ candidates: [candidate], coverage });
    expect(locationRows(store.database)).toEqual([]);
    const result = resultFor(store, candidate);
    // Neither in-market nor out-of-market: unknown stays unknown and is flagged.
    expect(hardRuleIds(result)).not.toContain("hard.outside_selected_geography");
    expect(points(result, "legitimacy.location_observed")).toBe(0);
    expect(result.missingInformationFlags).toContain("business_location_missing");
  });

  it("does not fire the geography rule when no market was selected", async () => {
    const coverage = coverageManifest();
    const candidate = gatedCandidate(
      {
        placeId: "geo-nomarket", name: "Henderson Pool Repair", host: "geo-nomarket-pool.invalid",
        address: OUT_OF_MARKET,
      },
      coverage.cells[0]?.coverageKey as string,
    );
    const { store } = await runBatch({ candidates: [candidate], coverage });
    // An out-of-market business with no selected market is not evidence of being
    // outside anything, so the rule must stay silent and say so. Loaded and
    // scored through the production repository and qualifier with no market.
    const repository = createQualificationRepository(store.database);
    const businessId = store.businessIdFor(candidate.candidateKey);
    const marketless = repository.loadPoolServiceInput({
      businessId, runId: null, evaluatedAt: NOW,
      assessmentId: `wa_${candidate.candidateKey}`,
    });
    expect(marketless.geography.selectedMarkets).toEqual([]);
    expect(marketless.geography.locations).toHaveLength(1);
    const result = qualifyPoolServiceLead(marketless, {
      modelVersion: POOL_SERVICE_ICP_MODEL_VERSION,
    });
    expect(hardRuleIds(result)).not.toContain("hard.outside_selected_geography");
    expect(result.missingInformationFlags).toContain("selected_geography_missing");
    // With the market supplied, the same rows do produce the rejection.
    const scoped = repository.loadPoolServiceInput({
      businessId, runId: null, evaluatedAt: NOW,
      assessmentId: `wa_${candidate.candidateKey}`,
      coverageKeys: coverage.cells.map((cell) => cell.coverageKey),
    });
    expect(hardRuleIds(qualifyPoolServiceLead(scoped, {
      modelVersion: POOL_SERVICE_ICP_MODEL_VERSION,
    }))).toEqual(["hard.outside_selected_geography"]);
  });
});

// --- 6/7. coverage propagation and the callable gate --------------------------

describe("coverage propagation and the callable-evidence gate", () => {
  it("keeps the discovery coverage key on the business and inside queue scope", async () => {
    const coverage = coverageManifest();
    const cell = coverage.cells[0]?.coverageKey as string;
    const candidate = gatedCandidate(
      { placeId: "scope-1", name: "Mesa Pool Repair", host: "scope-mesa-pool.invalid" }, cell,
    );
    const { store, coverageKeys } = await runBatch({ candidates: [candidate], coverage });
    const identifiers = store.database.prepare(`
      SELECT scheme, value FROM business_identifiers WHERE scheme = ?
    `).all(DISCOVERY_COVERAGE_SCHEME) as Array<{ scheme: string; value: string }>;
    expect(identifiers).toHaveLength(1);
    expect(identifiers[0]?.value.startsWith(`${cell}|`)).toBe(true);

    const ranked = rankLive(store, candidate, coverageKeys);
    expect(ranked.loaded.coverageKeys).toContain(cell);
    expect(ranked.codes).not.toContain("outside_queue_scope");
    expect(ranked.loaded.geographies).toEqual([{ countryCode: "US", subdivisionCode: "US-AZ" }]);
  });

  it("still rejects a lead outside the queue scope before the evidence gate", async () => {
    const coverage = coverageManifest();
    const candidate = gatedCandidate(
      { placeId: "scope-2", name: "Mesa Pool Repair", host: "scope-out-pool.invalid" },
      coverage.cells[0]?.coverageKey as string,
    );
    const { store, coverageKeys } = await runBatch({ candidates: [candidate], coverage });
    expect(coverageKeys.length).toBeGreaterThan(0);
    const ranked = rankLive(store, candidate, ["coverage:elsewhere"]);
    expect(ranked.entry.disposition).toBe("not_eligible");
    expect(ranked.codes).toContain("outside_queue_scope");
    expect(ranked.codes).not.toContain(CALLABLE_EVIDENCE_REASONS.incomplete);
  });

  it("lets a fully evidenced in-market lead become callable, and names why", async () => {
    const coverage = coverageManifest();
    const candidate = gatedCandidate(
      { placeId: "callable-1", name: "Mesa Pool Repair", host: "callable-mesa-pool.invalid" },
      coverage.cells[0]?.coverageKey as string,
    );
    const { store, coverageKeys, queue } = await runBatch({ candidates: [candidate], coverage });
    const result = resultFor(store, candidate);
    expect(result.icpResult).toBe("qualified");
    expect(result.overallScore).toBeGreaterThanOrEqual(65);
    const ranked = rankLive(store, candidate, coverageKeys);
    expect(ranked.entry.disposition).toBe("callable");
    expect(ranked.codes).toContain("callable");
    expect(ranked.codes).not.toContain(CALLABLE_EVIDENCE_REASONS.incomplete);
    expect(queue.callableQueueSize).toBe(1);
  });

  it("still refuses a lead whose only routes are email and a form", async () => {
    const coverage = coverageManifest();
    const candidate = gatedCandidate(
      { placeId: "callable-2", name: "Mesa Pool Repair", host: "callable-email-pool.invalid" },
      coverage.cells[0]?.coverageKey as string,
    );
    const { store, coverageKeys, queue } = await runBatch({
      candidates: [candidate], coverage,
      body: (entry) => html({ name: entry.expectedBusinessName, phone: false }),
    });
    const ranked = rankLive(store, candidate, coverageKeys);
    expect(ranked.entry.disposition).not.toBe("callable");
    expect(ranked.codes).toContain(CALLABLE_EVIDENCE_REASONS.phoneRoute);
    expect(queue.callableQueueSize).toBe(0);
  });

  it("still refuses a lead whose assessed site identity does not agree", async () => {
    const coverage = coverageManifest();
    const candidate = gatedCandidate(
      { placeId: "callable-3", name: "Mesa Pool Repair", host: "callable-identity-pool.invalid" },
      coverage.cells[0]?.coverageKey as string,
    );
    const { store, queue } = await runBatch({
      candidates: [candidate], coverage,
      body: () => html({ name: "Completely Different Roofing Company" }),
    });
    expect(queue.callableQueueSize).toBe(0);
    const result = resultFor(store, candidate);
    expect(result.identityReviewState).toBe("required");
    expect(result.icpResult).toBe("identity_review_required");
  });
});
