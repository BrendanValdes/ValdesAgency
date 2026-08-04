import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  selectAssessableCandidates,
  type EligibleCandidate,
} from "../../src/lead-engine/assessment/candidate-gate.js";
import {
  runLiveWebsiteAssessment,
  type AssessmentSink,
  type LiveWebsiteAssessmentLimits,
} from "../../src/lead-engine/assessment/live-website-assessment.js";
import {
  parseWebsiteCanaryArguments,
  runWebsiteAssessmentCanary,
  WEBSITE_CANARY_HARD_LIMITS,
} from "../../scripts/run-website-assessment-canary.js";
import { sameSiteAllowingWwwAlias } from "../../src/lead-engine/crawl/url-safety.js";
import type { CrawlPage, CrawlResult, RobotsDecision } from "../../src/lead-engine/crawl/types.js";
import type {
  NormalizedDiscoveryResult,
  ProviderEnvelope,
} from "../../src/lead-engine/providers/contracts.js";

const HOST = "example-pool-co.invalid";
const HOMEPAGE = `https://${HOST}/`;
const BUSINESS = "Example Pool Co";

// --- discovery envelope fixtures ---------------------------------------------

function envelope(overrides: {
  accepted?: boolean;
  disposition?: "strong" | "supporting" | "review";
  operatingStatus?: "open" | "temporarily_closed" | "permanently_closed" | "unknown";
  domains?: string[];
  placeId?: string;
  name?: string;
}): ProviderEnvelope<NormalizedDiscoveryResult> {
  const accepted = overrides.accepted ?? true;
  const result: NormalizedDiscoveryResult = {
    providerPlaceId: overrides.placeId ?? "place-001",
    name: overrides.name ?? BUSINESS,
    categories: ["pool_cleaning_service"],
    address: { line1: "1 Test Way", city: "Phoenix", region: "AZ", postalCode: "85004", countryCode: "US" },
    domains: overrides.domains ?? [HOMEPAGE],
    phones: ["+15550101001"],
    brandName: null,
    groupHint: null,
    providerObservation: {
      releaseId: "2026-07-22.0",
      featureVersion: 1,
      schemaVersion: "1.0.0",
      taxonomyMappingVersion: "overture_pool_service_taxonomy_v2",
      basicCategory: "pool_cleaning_service",
      taxonomyPrimary: "pool_cleaning_service",
      taxonomyHierarchy: [],
      taxonomyAlternates: [],
      categoryDisposition: overrides.disposition ?? "strong",
      providerConfidence: 0.9,
      operatingStatus: overrides.operatingStatus ?? "open",
      sourceMetadata: [],
    },
  } as NormalizedDiscoveryResult;
  return {
    providerId: "overture_places_live",
    sourceClass: "local_public_dataset",
    claimState: "public_unverified_candidate",
    operation: "discovery",
    providerSchemaVersion: "1.0.0",
    correlationId: "run:query",
    providerResultId: overrides.placeId ?? "place-001",
    observedAt: "2026-08-02T00:00:00.000Z",
    retrievedAt: "2026-08-02T00:00:00.000Z",
    cost: { billable: false, billableUnits: 0, unit: "none", microUsd: 0 },
    cache: { status: "bypassed", key: null },
    normalizedResult: accepted ? result : null,
    validation: accepted ? { status: "accepted", issues: [] } : { status: "rejected", issues: [] },
    error: accepted ? null : { category: "schema_validation_failed", retryable: false },
    rawReferenceChecksum: null,
  };
}

// --- crawl fixtures -----------------------------------------------------------

function robots(status: RobotsDecision["status"]): RobotsDecision {
  return {
    origin: `https://${HOST}`,
    robotsUrl: `https://${HOST}/robots.txt`,
    status,
    reason: status === "allowed" ? "no_matching_rule" : "matched_disallow",
    matchedRule: null,
    fetchedAt: "2026-08-02T00:00:00.000Z",
    expiresAt: "2026-08-03T00:00:00.000Z",
    contentChecksum: null,
    sitemapUrls: [],
  };
}

function page(input: {
  url?: string;
  finalUrl?: string;
  html?: string | null;
  contentType?: string;
  status?: number;
  ok?: boolean;
  bytes?: number;
}): CrawlPage {
  const url = input.url ?? HOMEPAGE;
  const ok = input.ok ?? true;
  if (!ok) {
    return {
      url, kind: "homepage", inspectionStatus: "unavailable",
      fetch: {
        ok: false, requestedUrl: url, errorCode: "unsupported_content_type", retryable: false,
        attempts: 1, redirectHistory: [], fetchedAt: "2026-08-02T00:00:00.000Z", httpStatus: 415,
      },
      html: null,
    };
  }
  const body = input.html ?? "<html><head><title>Example Pool Co</title></head><body></body></html>";
  return {
    url, kind: "homepage", inspectionStatus: "inspected",
    fetch: {
      ok: true, requestedUrl: url, finalUrl: input.finalUrl ?? url, status: input.status ?? 200,
      contentType: input.contentType ?? "text/html", body,
      compressedBytes: input.bytes ?? 1_000, decompressedBytes: (input.bytes ?? 1_000) * 2,
      contentChecksum: createHash("sha256").update(body).digest("hex"),
      etag: null, lastModified: null, redirectHistory: [],
      fetchedAt: "2026-08-02T00:00:00.000Z", attempts: 1,
    },
    html: body,
  };
}

function crawlResult(input: {
  pages: CrawlPage[];
  robotsStatus?: RobotsDecision["status"];
  complete?: boolean;
}): CrawlResult {
  const decision = robots(input.robotsStatus ?? "allowed");
  return {
    requestedUrl: HOMEPAGE,
    sourceClass: "public_business_website",
    canonicalHomepage: HOMEPAGE,
    startedAt: "2026-08-02T00:00:00.000Z",
    completedAt: "2026-08-02T00:00:01.000Z",
    pages: input.pages,
    robots: decision,
    robotsDecisions: [decision],
    complete: input.complete ?? true,
    timedOut: false,
  };
}

const NICHE = {
  service_synonyms: ["pool cleaning", "pool service"],
  required_indicators: ["pool"],
  negative_keywords: [],
  excluded_adjacent_industries: [],
  relevant_categories: ["pool_cleaning_service"],
} as never;

const LIMITS: LiveWebsiteAssessmentLimits = WEBSITE_CANARY_HARD_LIMITS;

function recordingSink(existing: Set<string> = new Set()): AssessmentSink & {
  readonly records: Array<Record<string, unknown>>;
} {
  const records: Array<Record<string, unknown>> = [];
  return {
    records,
    hasAssessment: (id) => existing.has(id),
    recordAssessment: (record) => {
      records.push(record as unknown as Record<string, unknown>);
      existing.add(record.assessmentId);
    },
  };
}

function candidate(overrides: Partial<EligibleCandidate> = {}): EligibleCandidate {
  return {
    candidateKey: "place-001",
    expectedBusinessName: BUSINESS,
    candidateUrl: HOMEPAGE,
    candidateHost: HOST,
    providerPlaceId: "place-001",
    releaseId: "2026-07-22.0",
    expectedLocality: "Phoenix",
    expectedPhones: ["+15550101001"],
    ...overrides,
  };
}

async function run(input: {
  candidates: EligibleCandidate[];
  crawl: (candidate: EligibleCandidate) => CrawlResult | Promise<never>;
  limits?: Partial<LiveWebsiteAssessmentLimits>;
  sink?: ReturnType<typeof recordingSink>;
  signal?: AbortSignal;
  clock?: () => Date;
}) {
  const sink = input.sink ?? recordingSink();
  let tick = 0;
  const summary = await runLiveWebsiteAssessment({
    candidates: input.candidates,
    limits: { ...LIMITS, ...input.limits },
    niche: NICHE,
    now: input.clock ?? (() => new Date(Date.parse("2026-08-02T00:00:00.000Z") + tick++ * 10)),
    assessmentId: (entry) => `wa_${entry.candidateKey}`,
    createCrawler: (entry) => ({ crawl: async () => input.crawl(entry) as CrawlResult }),
    sink,
    ...(input.signal ? { signal: input.signal } : {}),
  });
  return { summary, sink };
}

// --- admission gate -----------------------------------------------------------

describe("Phase 5B candidate admission gate", () => {
  it("admits an accepted, open, strong candidate with a usable observed website", () => {
    const gate = selectAssessableCandidates([envelope({})]);
    expect(gate.eligible).toHaveLength(1);
    expect(gate.eligible[0]).toMatchObject({ candidateHost: HOST, expectedBusinessName: BUSINESS });
  });

  it("blocks review-disposition and rejected candidates", () => {
    const gate = selectAssessableCandidates([
      envelope({ disposition: "review", placeId: "p-review" }),
      envelope({ accepted: false, placeId: "p-rejected" }),
    ]);
    expect(gate.eligible).toHaveLength(0);
    expect(gate.blockedCounts.review_disposition).toBe(1);
    expect(gate.blockedCounts.not_accepted).toBe(1);
  });

  it("blocks stale, website-less, and duplicate candidates", () => {
    const gate = selectAssessableCandidates([
      envelope({ operatingStatus: "permanently_closed", placeId: "p-closed" }),
      envelope({ domains: [], placeId: "p-nosite" }),
      envelope({ placeId: "p-a" }),
      // Same host as p-a: a duplicate crawl target.
      envelope({ placeId: "p-b" }),
    ]);
    expect(gate.eligible).toHaveLength(1);
    expect(gate.blockedCounts.not_operating).toBe(1);
    expect(gate.blockedCounts.no_observed_website).toBe(1);
    expect(gate.blockedCounts.duplicate_candidate).toBe(1);
  });

  it("blocks private, reserved, loopback, and credentialed candidate URLs", () => {
    for (const domain of [
      "http://127.0.0.1/", "https://10.0.0.5/", "https://192.168.1.10/", "https://169.254.169.254/",
      "https://[::1]/", "https://user:pass@example.invalid/", "https://example.invalid:8443/",
      "not a url",
    ]) {
      const gate = selectAssessableCandidates([envelope({ domains: [domain], placeId: `p-${domain}` })]);
      expect(gate.eligible).toHaveLength(0);
      expect(gate.blockedCounts.unsafe_candidate_url).toBe(1);
    }
  });

  it("treats an observed http candidate as an https-only target", () => {
    const gate = selectAssessableCandidates([envelope({ domains: [`http://${HOST}/`] })]);
    expect(gate.eligible[0]?.candidateUrl).toBe(HOMEPAGE);
  });
});

// --- bounded traversal --------------------------------------------------------

describe("Phase 5B bounded live website assessment", () => {
  it("assesses an accepted candidate whose site identity agrees", async () => {
    const { summary, sink } = await run({
      candidates: [candidate()],
      crawl: () => crawlResult({ pages: [page({})] }),
    });
    expect(summary.websitesAssessed).toBe(1);
    expect(summary.identityAgrees).toBe(1);
    expect(sink.records[0]).toMatchObject({ status: "complete", identityState: "agrees", reviewRequired: false });
  });

  it("routes a domain/business mismatch to review instead of assessing it", async () => {
    const { summary, sink } = await run({
      candidates: [candidate()],
      crawl: () => crawlResult({
        pages: [page({ html: "<html><head><title>Completely Different Roofing</title></head><body></body></html>" })],
      }),
    });
    expect(summary.websitesAssessed).toBe(0);
    expect(summary.identityReview).toBe(1);
    expect(summary.blockedCounts.identity_review).toBe(1);
    expect(sink.records[0]).toMatchObject({ reviewRequired: true });
    expect(["conflicts", "ambiguous", "unavailable"]).toContain(sink.records[0]?.identityState);
  });

  it("blocks a page that finally resolves on another domain", async () => {
    const { summary, sink } = await run({
      candidates: [candidate()],
      crawl: () => crawlResult({
        pages: [page({ finalUrl: "https://other-domain.invalid/landing" })],
      }),
    });
    expect(summary.websitesAssessed).toBe(0);
    expect(summary.blockedCounts.redirect_off_domain).toBe(1);
    expect(sink.records[0]).toMatchObject({ status: "blocked" });
  });

  it("accepts an apex/www canonicalisation redirect in either direction", async () => {
    // Apex candidate that canonicalises onto its own www host.
    const toWww = await run({
      candidates: [candidate()],
      crawl: () => crawlResult({ pages: [page({ finalUrl: `https://www.${HOST}/` })] }),
    });
    expect(toWww.summary.blockedCounts.redirect_off_domain).toBe(0);
    expect(toWww.sink.records[0]).toMatchObject({ status: "complete" });

    // www candidate that canonicalises onto its own apex host.
    const toApex = await run({
      candidates: [candidate({ candidateUrl: `https://www.${HOST}/`, candidateHost: `www.${HOST}` })],
      crawl: () => crawlResult({ pages: [page({ url: `https://www.${HOST}/`, finalUrl: HOMEPAGE })] }),
    });
    expect(toApex.summary.blockedCounts.redirect_off_domain).toBe(0);
    expect(toApex.sink.records[0]).toMatchObject({ status: "complete" });
  });

  it("still blocks a redirect onto any host that is not the approved apex/www pair", async () => {
    for (const finalUrl of [
      // An arbitrary subdomain is not the same site, even under the same apex.
      `https://foo.${HOST}/`,
      `https://www.foo.${HOST}/`,
      // A www-lookalike label is not the www alias.
      `https://www1.${HOST}/`,
      `https://wwwexample-pool-co.invalid/`,
      // An unrelated domain, and the www alias of an unrelated domain.
      "https://other-domain.invalid/landing",
      "https://www.other-domain.invalid/",
    ]) {
      const { summary, sink } = await run({
        candidates: [candidate()],
        crawl: () => crawlResult({ pages: [page({ finalUrl })] }),
      });
      expect(summary.blockedCounts.redirect_off_domain).toBe(1);
      expect(summary.websitesAssessed).toBe(0);
      expect(sink.records[0]).toMatchObject({ status: "blocked" });
    }
  });

  it("records a robots denial without assessing", async () => {
    const { summary, sink } = await run({
      candidates: [candidate()],
      crawl: () => crawlResult({ pages: [], robotsStatus: "denied" }),
    });
    expect(summary.blockedCounts.robots_denied).toBe(1);
    expect(summary.websitesAssessed).toBe(0);
    expect(sink.records[0]).toMatchObject({ status: "blocked" });
  });

  it("treats an unsupported content type as no usable page", async () => {
    const { summary } = await run({
      candidates: [candidate()],
      crawl: () => crawlResult({ pages: [page({ ok: false })], complete: false }),
    });
    expect(summary.blockedCounts.no_usable_page).toBe(1);
    expect(summary.websitesAssessed).toBe(0);
    expect(summary.requests).toBe(1);
  });

  it("stops on the business, request, byte, and duration ceilings", async () => {
    const many = Array.from({ length: 6 }, (_unused, index) =>
      candidate({ candidateKey: `p-${index}`, candidateHost: `h${index}.invalid`, candidateUrl: `https://h${index}.invalid/` }));
    const okCrawl = (entry: EligibleCandidate): CrawlResult => ({
      ...crawlResult({ pages: [page({ url: entry.candidateUrl, finalUrl: entry.candidateUrl })] }),
      requestedUrl: entry.candidateUrl,
      canonicalHomepage: entry.candidateUrl,
      robots: { ...robots("allowed"), origin: entry.candidateUrl },
    });

    const businesses = await run({ candidates: many, crawl: okCrawl, limits: { maxBusinessesAttempted: 2 } });
    expect(businesses.summary.stopReason).toBe("business_target_reached");
    expect(businesses.summary.businessesAttempted).toBe(2);

    const requests = await run({ candidates: many, crawl: okCrawl, limits: { maxTotalRequests: 2 } });
    expect(requests.summary.stopReason).toBe("request_budget_exhausted");

    const bytes = await run({ candidates: many, crawl: okCrawl, limits: { maxDownloadedBytes: 1_500 } });
    expect(bytes.summary.stopReason).toBe("byte_budget_exhausted");

    const processed = await run({ candidates: many, crawl: okCrawl, limits: { maxProcessedBytes: 2_500 } });
    expect(processed.summary.stopReason).toBe("processed_byte_budget_exhausted");

    let ticks = 0;
    const duration = await run({
      candidates: many, crawl: okCrawl, limits: { maxDurationMs: 50 },
      clock: () => new Date(Date.parse("2026-08-02T00:00:00.000Z") + ticks++ * 40),
    });
    expect(duration.summary.stopReason).toBe("duration_budget_exhausted");
  });

  it("stops immediately on cancellation without attempting a business", async () => {
    const controller = new AbortController();
    controller.abort();
    const { summary, sink } = await run({
      candidates: [candidate()],
      crawl: () => crawlResult({ pages: [page({})] }),
      signal: controller.signal,
    });
    expect(summary.stopReason).toBe("cancelled");
    expect(summary.businessesAttempted).toBe(0);
    expect(sink.records).toHaveLength(0);
  });

  it("records a crawl failure as failed rather than throwing", async () => {
    const { summary, sink } = await run({
      candidates: [candidate()],
      crawl: () => Promise.reject(new Error("transport failure")) as Promise<never>,
    });
    expect(summary.blockedCounts.crawl_failed).toBe(1);
    expect(sink.records[0]).toMatchObject({ status: "failed", reviewRequired: true });
  });

  it("never repeats an assessment on retry or resume", async () => {
    const shared = recordingSink();
    const first = await run({ candidates: [candidate()], crawl: () => crawlResult({ pages: [page({})] }), sink: shared });
    expect(first.summary.websitesAssessed).toBe(1);

    const resumed = await run({ candidates: [candidate()], crawl: () => crawlResult({ pages: [page({})] }), sink: shared });
    expect(resumed.summary.duplicateAssessmentsSkipped).toBe(1);
    expect(resumed.summary.businessesAttempted).toBe(0);
    expect(shared.records).toHaveLength(1);
  });

  it("extracts contact, person, and service evidence as public-unverified only", async () => {
    const html = [
      "<html><head><title>Example Pool Co</title>",
      '<script type="application/ld+json">',
      JSON.stringify({
        "@type": "Organization", name: BUSINESS,
        employee: [{ "@type": "Person", name: "Dana Rivera", jobTitle: "Owner" }],
      }),
      "</script></head><body><h1>Pool cleaning</h1>",
      '<a href="tel:+15550101001">Call</a><a href="mailto:hi@example-pool-co.invalid">Email</a>',
      '<a href="/contact">Contact us</a><a href="/book">Book now</a>',
      "</body></html>",
    ].join("");
    const { summary } = await run({
      candidates: [candidate()],
      crawl: () => crawlResult({ pages: [page({ html })] }),
    });
    expect(summary.websitesAssessed).toBe(1);
    expect(summary.publicContactCandidates).toBeGreaterThan(0);
    expect(summary.opportunitySignals).toBeGreaterThan(0);
    // Only counts are surfaced; the summary never carries a contact value.
    const serialized = JSON.stringify(summary).toLowerCase();
    for (const forbidden of ["dana", "rivera", "tel:", "mailto:", "@example-pool-co", "example-pool-co.invalid"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("issues no request beyond the crawler and never submits a form", async () => {
    const seen: string[] = [];
    const html = '<html><head><title>Example Pool Co</title></head><body><form action="/signup" method="post">' +
      '<input name="email"><button type="submit">Join</button></form></body></html>';
    await runLiveWebsiteAssessment({
      candidates: [candidate()],
      limits: LIMITS,
      niche: NICHE,
      now: () => new Date("2026-08-02T00:00:00.000Z"),
      assessmentId: (entry) => `wa_${entry.candidateKey}`,
      createCrawler: () => ({
        crawl: async (request) => {
          seen.push(request.websiteUrl);
          return crawlResult({ pages: [page({ html })] });
        },
      }),
      sink: recordingSink(),
    });
    // Exactly one crawl of the approved homepage, and no other outbound action.
    expect(seen).toEqual([HOMEPAGE]);
  });
});

// --- canary surface -----------------------------------------------------------

describe("Phase 5B canary surface", () => {
  const repositoryRoot = path.resolve(process.cwd(), "..");
  const databasePath = (): string => path.join(os.tmpdir(), `rocco-website-canary-${process.pid}-${Math.trunc(performance.now())}.sqlite`);

  it("requires explicit confirmation, the phoenix market, and a /tmp database", () => {
    const base = ["--confirm-live-website-assessment", "--market", "phoenix-canary", "--database", databasePath()];
    expect(parseWebsiteCanaryArguments(base, repositoryRoot).enableLiveCrawl).toBe(false);
    expect(parseWebsiteCanaryArguments([...base, "--enable-live-crawl"], repositoryRoot).enableLiveCrawl).toBe(true);
    expect(() => parseWebsiteCanaryArguments(base.slice(1), repositoryRoot)).toThrow("confirm");
    expect(() => parseWebsiteCanaryArguments(
      ["--confirm-live-website-assessment", "--market", "vegas", "--database", databasePath()], repositoryRoot,
    )).toThrow("phoenix-canary");
    expect(() => parseWebsiteCanaryArguments(
      ["--confirm-live-website-assessment", "--market", "phoenix-canary",
        "--database", path.join(repositoryRoot, "inside.sqlite")], repositoryRoot,
    )).toThrow("temp directory");
  });

  it("keeps live crawling disabled by default and performs zero network work", async () => {
    const report = await runWebsiteAssessmentCanary({
      argv: ["--confirm-live-website-assessment", "--market", "phoenix-canary", "--database", databasePath()],
      repositoryRoot,
      envelopes: [envelope({})],
    });
    expect(report.ran).toBe(false);
    expect(report.aggregateVerdict).toBe("blocked_live_crawl_disabled");
    expect(report.safetyWarnings).toEqual(["live_crawl_disabled_by_default"]);
    expect(report.requests).toBe(0);
    expect(report.approvedDestinationsContacted).toBe(0);
    // The gate still reports aggregate eligibility without contacting anything.
    expect(report.candidatesEligible).toBe(1);
  });

  it("emits an aggregate-only report with no business-identifying values", async () => {
    const report = await runWebsiteAssessmentCanary({
      argv: ["--confirm-live-website-assessment", "--market", "phoenix-canary", "--database", databasePath()],
      repositoryRoot,
      envelopes: [envelope({}), envelope({ disposition: "review", placeId: "p-review" })],
    });
    const serialized = JSON.stringify(report).toLowerCase();
    for (const forbidden of [
      "example pool co", "example-pool-co", "1 test way", "+1555", "phoenix,", "tel:", "mailto:", "<html",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    for (const [key, value] of Object.entries(report)) {
      if (["gateBlockedCounts", "websiteBlockedCounts", "budgetsRemaining", "safetyWarnings"].includes(key)) continue;
      expect(["number", "string", "boolean"]).toContain(typeof value);
    }
  });

  it("pins the mandated bounded canary budgets", () => {
    expect(WEBSITE_CANARY_HARD_LIMITS).toMatchObject({
      maxBusinessesAttempted: 3,
      maxWebsitesAssessed: 3,
      maxPagesPerBusiness: 3,
      maxRequestsPerBusiness: 6,
      maxTotalRequests: 18,
      maxDownloadedBytes: 8 * 1024 * 1024,
      maxProcessedBytes: 16 * 1024 * 1024,
      maxDurationMs: 60_000,
      maxRetriesPerBusiness: 1,
    });
  });
});

// --- www-alias same-site semantics -------------------------------------------

describe("sameSiteAllowingWwwAlias", () => {
  it("accepts only an exact leading-www difference", () => {
    for (const [left, right] of [
      ["https://example.invalid/", "https://example.invalid/"],
      ["https://www.example.invalid/", "https://example.invalid/"],
      ["https://example.invalid/", "https://www.example.invalid/"],
      // Path, query, and case never matter; the host comparison is normalised.
      ["https://WWW.Example.invalid/contact?x=1", "https://example.invalid/"],
      // The www alias of a deeper host is still just that host's own alias.
      ["https://www.shop.example.invalid/", "https://shop.example.invalid/"],
    ] as const) {
      expect(sameSiteAllowingWwwAlias(left, right)).toBe(true);
    }
  });

  it("rejects arbitrary subdomains, www lookalikes, other domains, and other protocols", () => {
    for (const [left, right] of [
      // The requirement that motivated the change must not widen past www.
      ["https://foo.example.invalid/", "https://example.invalid/"],
      ["https://example.invalid/", "https://foo.example.invalid/"],
      ["https://www.foo.example.invalid/", "https://example.invalid/"],
      // Labels that merely start with "www".
      ["https://www1.example.invalid/", "https://example.invalid/"],
      ["https://wwwexample.invalid/", "https://example.invalid/"],
      // Unrelated registrable names, including via the www alias.
      ["https://www.other.invalid/", "https://example.invalid/"],
      ["https://www.example.invalid/", "https://example.test/"],
      // A suffix match is not a label match.
      ["https://notexample.invalid/", "https://example.invalid/"],
      // Protocol must still agree exactly, alias or not.
      ["http://www.example.invalid/", "https://example.invalid/"],
      ["http://example.invalid/", "https://example.invalid/"],
    ] as const) {
      expect(sameSiteAllowingWwwAlias(left, right)).toBe(false);
    }
  });

  it("keeps rejecting URLs the safety gate refuses", () => {
    for (const [left, right] of [
      ["https://127.0.0.1/", "https://example.invalid/"],
      ["https://user:pass@example.invalid/", "https://example.invalid/"],
      ["https://www.example.invalid:8443/", "https://example.invalid/"],
      ["not a url", "https://example.invalid/"],
    ] as const) {
      expect(() => sameSiteAllowingWwwAlias(left, right)).toThrow();
    }
  });
});
