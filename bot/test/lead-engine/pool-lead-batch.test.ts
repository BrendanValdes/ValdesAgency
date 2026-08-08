import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  marketIdForLabel,
  marketWindows,
  planPoolServiceMarketCoverage,
  POOL_SERVICE_MARKETS,
  poolServiceMarketTargets,
} from "../../src/lead-engine/assessment/market-windows.js";
import {
  csvCell,
  exportRows,
  marketPasses,
  parsePoolLeadBatchArguments,
  POOL_LEAD_BATCH_BUDGETS,
  resolveBatchPaths,
  runPoolLeadBatch,
} from "../../scripts/run-pool-lead-batch.js";
import { runLiveWebsiteAssessment } from "../../src/lead-engine/assessment/live-website-assessment.js";
import { createHash } from "node:crypto";
import type { CrawlPage, CrawlResult, RobotsDecision } from "../../src/lead-engine/crawl/types.js";
import type { EligibleCandidate } from "../../src/lead-engine/assessment/candidate-gate.js";
import {
  boundingAreaSquareKm,
  createOverturePlacesQueryPlan,
  OVERTURE_MAX_PLAN_ROWS,
} from "../../src/lead-engine/providers/overture/query.js";
import { selectAssessableCandidates } from "../../src/lead-engine/assessment/candidate-gate.js";
import { createAssessmentStore } from "../../src/lead-engine/assessment/assessment-store.js";
import { inspectPoolLeadBatch } from "../../scripts/inspect-pool-lead-batch.js";
import type { NormalizedDiscoveryResult, ProviderEnvelope } from "../../src/lead-engine/providers/contracts.js";

/**
 * Multi-market lead batch.
 *
 * The batch changes coverage-window geometry and nothing else, so these tests pin
 * the geometry against the provider's own limits, confirm the markets are the
 * configured ones, and confirm the admission gate is strictly no more permissive
 * than before.
 */

const REPO_ROOT = path.resolve(process.cwd(), "..");
const roots: string[] = [];

afterAll(() => {
  while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true });
});

describe("pool-service market windows", () => {
  it("tiles every configured market inside the geographic-area ceiling", () => {
    for (const market of POOL_SERVICE_MARKETS) {
      const windows = marketWindows(market);
      expect(windows.length).toBeGreaterThan(0);
      for (const window of windows) {
        const area = boundingAreaSquareKm(window.bounds);
        // The provider refuses a cell over its area limit; every window must be
        // admissible without the caller relaxing anything.
        expect(area).toBeLessThanOrEqual(25);
        expect(area).toBeGreaterThan(0);
        // Clipped to the market: a window can never reach outside the market it
        // belongs to, so a cell cannot silently widen the searched geography.
        expect(window.bounds.west).toBeGreaterThanOrEqual(market.bounds.west);
        expect(window.bounds.east).toBeLessThanOrEqual(market.bounds.east);
        expect(window.bounds.south).toBeGreaterThanOrEqual(market.bounds.south);
        expect(window.bounds.north).toBeLessThanOrEqual(market.bounds.north);
        expect(window.countryCode).toBe(market.countryCode);
        expect(window.subdivisionCode).toBe(market.subdivisionCode);
      }
    }
  });

  it("keeps windows at the cell geometry the provider actually serves", () => {
    const phoenix = POOL_SERVICE_MARKETS.find((market) => market.id === "phoenix_az");
    if (!phoenix) throw new Error("phoenix market missing");
    const areas = marketWindows(phoenix).map((window) => boundingAreaSquareKm(window.bounds));
    const largest = Math.max(...areas);
    // A live pass proved that windows much larger than this intersect more row
    // groups than the pruner's fail-closed ceiling, so the traversal refuses to
    // run at all. ~20 km² is the geometry the partition demonstrably serves.
    expect(largest).toBeGreaterThan(18);
    expect(largest).toBeLessThan(25);
  });

  it("plans non-overlapping windows the provider will accept as query plans", () => {
    const coverage = planPoolServiceMarketCoverage({
      configurationVersion: "1.0.0", queryVersion: "test-1.0.0",
    });
    // Volume comes from cell count, not cell area: each cell is capped at 2,000
    // provider rows, so 100+ assessed candidates needs several hundred windows.
    expect(coverage.cells.length).toBeGreaterThanOrEqual(350);
    expect(coverage.overlaps).toEqual([]);
    expect(new Set(coverage.cells.map((cell) => cell.coverageKey)).size)
      .toBe(coverage.cells.length);
    for (const cell of coverage.cells) {
      // Every planned window survives the real plan builder at the real row cap.
      const plan = createOverturePlacesQueryPlan({
        releaseId: "2026-07-22.0", coverageCell: cell,
        maxRows: OVERTURE_MAX_PLAN_ROWS, maxAreaSquareKm: 25,
      });
      expect(plan.maxRows).toBe(OVERTURE_MAX_PLAN_ROWS);
      expect(plan.areaSquareKm).toBeLessThanOrEqual(25);
    }
  });

  it("covers only configured pool-service subdivisions", () => {
    const coverage = planPoolServiceMarketCoverage({
      configurationVersion: "1.0.0", queryVersion: "test-1.0.0",
    });
    const subdivisions = new Set(coverage.cells.map((cell) => cell.subdivisionCode));
    expect([...subdivisions].sort()).toEqual(["AZ", "CA", "NV"]);
    expect(new Set(coverage.cells.map((cell) => cell.countryCode))).toEqual(new Set(["US"]));
  });

  it("rejects an unknown market and requires at least one", () => {
    expect(() => poolServiceMarketTargets(["not_a_market"])).toThrow(/At least one configured/);
    expect(() => poolServiceMarketTargets([])).toThrow(/At least one configured/);
    expect(marketIdForLabel("Phoenix metro 1-2")).toBe("phoenix_az");
    expect(marketIdForLabel("Nowhere 0-0")).toBe("unknown_market");
  });

  it("slices a market into row-budget-sized passes without losing a window", () => {
    const coverage = planPoolServiceMarketCoverage({
      configurationVersion: "1.0.0", queryVersion: "test-1.0.0", marketIds: ["tucson_az"],
    });
    const passes = marketPasses(coverage, POOL_LEAD_BATCH_BUDGETS.cellsPerPass);
    expect(passes.length).toBe(Math.ceil(coverage.cells.length / POOL_LEAD_BATCH_BUDGETS.cellsPerPass));
    expect(passes.flatMap((pass) => pass.cells.map((cell) => cell.coverageKey)))
      .toEqual(coverage.cells.map((cell) => cell.coverageKey));
    for (const pass of passes) {
      // 5 cells x 2,000 plan rows is exactly the 10,000-row tracker cap.
      expect(pass.cells.length).toBeLessThanOrEqual(POOL_LEAD_BATCH_BUDGETS.cellsPerPass);
      expect(pass.cells.length * OVERTURE_MAX_PLAN_ROWS).toBeLessThanOrEqual(10_000);
    }
  });
});

describe("admission is no more permissive than before", () => {
  function envelope(overrides: {
    disposition?: "strong" | "supporting" | "review";
    operatingStatus?: "open" | "temporarily_closed" | "permanently_closed" | "unknown";
    domains?: string[];
    category?: string;
    placeId?: string;
  }): ProviderEnvelope<NormalizedDiscoveryResult> {
    const category = overrides.category ?? "pool_cleaning";
    const result = {
      providerPlaceId: overrides.placeId ?? "place-1",
      name: "Example Pool Co",
      categories: [category],
      address: { line1: "1 Way", city: "Mesa", region: "AZ", postalCode: "85201", countryCode: "US" },
      domains: overrides.domains ?? ["https://example-pool.invalid/"],
      phones: ["+15550101001"],
      brandName: null,
      groupHint: null,
      providerObservation: {
        releaseId: "2026-07-22.0", featureVersion: 1, schemaVersion: "1.0.0",
        taxonomyMappingVersion: "overture_pool_service_taxonomy_v2",
        basicCategory: category, taxonomyPrimary: category,
        taxonomyHierarchy: [], taxonomyAlternates: [],
        categoryDisposition: overrides.disposition ?? "strong",
        providerConfidence: 0.9,
        operatingStatus: overrides.operatingStatus ?? "open",
        sourceMetadata: [], coverageKey: "cell", queryFingerprint: "fp",
        assetIds: ["a".repeat(64)],
      },
    } as NormalizedDiscoveryResult;
    return {
      providerId: "overture_places_live", sourceClass: "local_public_dataset",
      claimState: "public_unverified_candidate", operation: "discovery",
      providerSchemaVersion: "1.0.0", correlationId: "run:query",
      providerResultId: overrides.placeId ?? "place-1",
      observedAt: "2026-08-03T00:00:00.000Z", retrievedAt: "2026-08-03T00:00:00.000Z",
      cost: { billable: false, billableUnits: 0, unit: "none", microUsd: 0 },
      cache: { status: "bypassed", key: null },
      normalizedResult: result, validation: { status: "accepted", issues: [] },
      error: null, rawReferenceChecksum: null,
    };
  }

  it("still admits only strong, open candidates with a usable observed website", () => {
    expect(selectAssessableCandidates([envelope({})]).eligible).toHaveLength(1);
    const blocked = selectAssessableCandidates([
      envelope({ disposition: "review", placeId: "p-review" }),
      envelope({ disposition: "supporting", placeId: "p-supporting" }),
      envelope({ operatingStatus: "permanently_closed", placeId: "p-closed" }),
      envelope({ operatingStatus: "unknown", placeId: "p-unknown" }),
      envelope({ domains: [], placeId: "p-nosite" }),
      envelope({ domains: ["http://127.0.0.1/"], placeId: "p-loopback" }),
    ]);
    expect(blocked.eligible).toHaveLength(0);
    expect(blocked.blockedCounts).toMatchObject({
      review_disposition: 1, supporting_disposition: 1,
      not_operating: 2, no_observed_website: 1, unsafe_candidate_url: 1,
    });
  });

  it("still deduplicates by provider key and by host", () => {
    const gate = selectAssessableCandidates([
      envelope({ placeId: "dupe-a" }),
      envelope({ placeId: "dupe-b" }),
    ]);
    expect(gate.eligible).toHaveLength(1);
    expect(gate.blockedCounts.duplicate_candidate).toBe(1);
  });

  it("carries provider location and categories forward for every admitted candidate", () => {
    const candidate = selectAssessableCandidates([envelope({})]).eligible[0];
    expect(candidate?.providerLocation).toMatchObject({ city: "Mesa", region: "AZ", countryCode: "US" });
    expect(candidate?.providerCategories).toEqual(["pool_cleaning"]);
    expect(candidate?.providerSourceClass).toBe("local_public_dataset");
  });
});

describe("durable artifact guards", () => {
  it("requires an absolute durable root outside the repository and outside /tmp", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "rocco-batch-args-"));
    roots.push(root);
    expect(() => resolveBatchPaths("relative/path", REPO_ROOT)).toThrow(/absolute/);
    expect(() => resolveBatchPaths(path.join(REPO_ROOT, "inside"), REPO_ROOT)).toThrow(/outside the repository/);
    expect(() => resolveBatchPaths(root, REPO_ROOT)).toThrow(/not under \/tmp/);
    const paths = resolveBatchPaths("/workspaces/rocco-lead-artifacts", REPO_ROOT);
    expect(paths.databasePath.endsWith(".sqlite")).toBe(true);
    expect(paths.csvPath.endsWith(".csv")).toBe(true);
    expect(paths.summaryPath.endsWith(".json")).toBe(true);
  });

  it("requires explicit confirmation, a data root, and two to five known markets", () => {
    const base = ["--confirm-live-batch", "--data-root", "/workspaces/rocco-lead-artifacts"];
    expect(parsePoolLeadBatchArguments(base).enableLiveBatch).toBe(false);
    expect(parsePoolLeadBatchArguments([...base, "--enable-live-batch"]).enableLiveBatch).toBe(true);
    expect(() => parsePoolLeadBatchArguments(["--data-root", "/workspaces/x"])).toThrow(/confirm/);
    expect(() => parsePoolLeadBatchArguments(["--confirm-live-batch"])).toThrow(/data-root/);
    expect(() => parsePoolLeadBatchArguments([...base, "--markets", "phoenix_az"]))
      .toThrow(/between two and five/);
    expect(() => parsePoolLeadBatchArguments([...base, "--markets", "phoenix_az,nope"]))
      .toThrow(/Unknown pool-service market/);
    expect(parsePoolLeadBatchArguments([...base, "--markets", "phoenix_az,las_vegas_nv"]).marketIds)
      .toEqual(["phoenix_az", "las_vegas_nv"]);
    expect(() => parsePoolLeadBatchArguments([...base, "--target-eligible", "0"])).toThrow(/between 1 and 400/);
  });

  it("does no network work and writes nothing while the live batch is disabled", async () => {
    const report = await runPoolLeadBatch({
      argv: ["--confirm-live-batch", "--data-root", "/workspaces/rocco-lead-artifacts-disabled"],
      repositoryRoot: REPO_ROOT,
    });
    expect(report.ran).toBe(false);
    expect(report.aggregateVerdict).toBe("blocked_live_batch_disabled");
    expect(report.artifacts).toEqual({});
  });

  it("pins the declared budgets so a raise is always an explicit edit", () => {
    expect(POOL_LEAD_BATCH_BUDGETS).toMatchObject({
      targetAssessedCandidates: 100,
      targetEligibleCandidates: 130,
      cellsPerPass: 5,
      assessmentChunkSize: 16,
      maxPagesPerBusiness: 2,
      maxRequestsPerAssessmentChunk: 64,
      maxAssessmentChunkDurationMs: 110_000,
      maxDiscoveryPasses: 320,
      maxWindowsPerMarket: 600,
    });
    // Every per-invocation ceiling stays inside the stage's own hard limits.
    expect(POOL_LEAD_BATCH_BUDGETS.assessmentChunkSize).toBeLessThanOrEqual(25);
    // The ephemeral website policy refuses more than 64 requests per activation.
    expect(POOL_LEAD_BATCH_BUDGETS.maxRequestsPerAssessmentChunk).toBeLessThanOrEqual(64);
    expect(POOL_LEAD_BATCH_BUDGETS.maxBytesPerAssessmentChunk).toBeLessThanOrEqual(64 * 1024 * 1024);
    expect(POOL_LEAD_BATCH_BUDGETS.maxAssessmentChunkDurationMs).toBeLessThanOrEqual(120_000);
    expect(POOL_LEAD_BATCH_BUDGETS.cellsPerPass * OVERTURE_MAX_PLAN_ROWS).toBeLessThanOrEqual(10_000);
  });
});

describe("read-only batch inspection", () => {
  it("reports quality without exposing any contact value", async () => {
    // Build a small real artifact through the production path, then inspect it.
    const root = mkdtempSync(path.join(os.tmpdir(), "rocco-inspect-"));
    roots.push(root);
    const databasePath = path.join(root, "inspect.sqlite");
    const coverage = planPoolServiceMarketCoverage({
      configurationVersion: "1.0.0", queryVersion: "inspect-1.0.0",
      marketIds: ["tucson_az"], maxWindows: 2,
    });
    const store = createAssessmentStore({
      databasePath, repositoryRoot: REPO_ROOT, coverage,
      candidates: [], now: () => new Date("2026-08-03T00:00:00.000Z"),
    });
    try {
      const report = inspectPoolLeadBatch({ databasePath });
      expect(report.version).toBe("pool-lead-batch-inspection-1.0.0");
      expect(report.totals.businesses).toBe(0);
      expect(report.totals.coverageCells).toBe(coverage.cells.length);
      expect(report.sample.size).toBe(0);
      // Callable verification is present and empty rather than absent.
      expect(report.callableVerification.callableRows).toBe(0);
      // Nothing in the serialised report can carry a lead value.
      const serialized = JSON.stringify(report).toLowerCase();
      for (const forbidden of ["tel:", "mailto:", "http://"]) {
        expect(serialized).not.toContain(forbidden);
      }
    } finally {
      store.close();
    }
  });
});


const EXPORT_NOW = "2026-08-03T00:00:00.000Z";

function exportCandidate(
  placeId: string, name: string, host: string, coverageKey: string,
): EligibleCandidate {
  const result = {
    providerPlaceId: placeId, name, categories: ["pool_cleaning"],
    address: { line1: "1 Way", city: "Tucson", region: "AZ", postalCode: "85701", countryCode: "US" },
    domains: [`https://${host}/`],
    // The provider states a phone for both candidates on purpose.
    phones: ["+15550109999"],
    brandName: null, groupHint: null,
    providerObservation: {
      releaseId: "2026-07-22.0", featureVersion: 1, schemaVersion: "1.0.0",
      taxonomyMappingVersion: "overture_pool_service_taxonomy_v2",
      basicCategory: "pool_cleaning", taxonomyPrimary: "pool_cleaning",
      taxonomyHierarchy: [], taxonomyAlternates: [],
      categoryDisposition: "strong", providerConfidence: 0.9, operatingStatus: "open",
      sourceMetadata: [], coverageKey: "cell", queryFingerprint: "fp",
      assetIds: ["a".repeat(64)],
    },
  } as NormalizedDiscoveryResult;
  const envelope: ProviderEnvelope<NormalizedDiscoveryResult> = {
    providerId: "overture_places_live", sourceClass: "local_public_dataset",
    claimState: "public_unverified_candidate", operation: "discovery",
    providerSchemaVersion: "1.0.0", correlationId: "run:query", providerResultId: placeId,
    observedAt: EXPORT_NOW, retrievedAt: EXPORT_NOW,
    cost: { billable: false, billableUnits: 0, unit: "none", microUsd: 0 },
    cache: { status: "bypassed", key: null },
    normalizedResult: result, validation: { status: "accepted", issues: [] },
    error: null, rawReferenceChecksum: null,
  };
  const admitted = selectAssessableCandidates([envelope]).eligible[0];
  if (!admitted) throw new Error("export candidate failed the gate");
  return { ...admitted, candidateKey: placeId, discoveredCoverageKey: coverageKey };
}

function exportCrawl(candidate: EligibleCandidate, showPhone: boolean): CrawlResult {
  const body = [
    `<html lang="en"><head><title>${candidate.expectedBusinessName}</title>`,
    '<meta name="viewport" content="width=device-width">',
    '<script type="application/ld+json">',
    JSON.stringify({ "@type": "Organization", name: candidate.expectedBusinessName }),
    "</script></head><body><h1>Pool cleaning</h1>",
    showPhone ? '<a href="tel:+15550101001">Call</a>' : "",
    '<a href="/contact">Contact</a></body></html>',
  ].join("");
  const page: CrawlPage = {
    url: candidate.candidateUrl, kind: "homepage", inspectionStatus: "successful",
    fetch: {
      ok: true, requestedUrl: candidate.candidateUrl, finalUrl: candidate.candidateUrl,
      status: 200, contentType: "text/html", body,
      compressedBytes: 1_000, decompressedBytes: 2_000,
      contentChecksum: createHash("sha256").update(body).digest("hex"),
      etag: null, lastModified: null, redirectHistory: [], fetchedAt: EXPORT_NOW, attempts: 1,
    },
    html: body,
  };
  const decision: RobotsDecision = {
    origin: candidate.candidateUrl, robotsUrl: `${candidate.candidateUrl}robots.txt`,
    status: "allowed", reason: "no_matching_rule", matchedRule: null,
    fetchedAt: EXPORT_NOW, expiresAt: "2026-08-04T00:00:00.000Z",
    contentChecksum: null, sitemapUrls: [],
  };
  return {
    requestedUrl: candidate.candidateUrl, sourceClass: "public_business_website",
    canonicalHomepage: candidate.candidateUrl,
    startedAt: EXPORT_NOW, completedAt: "2026-08-03T00:00:01.000Z",
    pages: [page], robots: decision, robotsDecisions: [decision],
    complete: true, timedOut: false,
  };
}

describe("private CSV export", () => {
  it("emits a phone only when the assessed website itself displayed one", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "rocco-export-"));
    roots.push(root);
    const databasePath = path.join(root, "export.sqlite");
    const coverage = planPoolServiceMarketCoverage({
      configurationVersion: "1.0.0", queryVersion: "export-1.0.0",
      marketIds: ["tucson_az"], maxWindows: 1,
    });
    const cellKey = coverage.cells[0]?.coverageKey as string;
    // Two candidates: one site shows a tel: link, the other shows none. The
    // provider supplied a phone for BOTH, so a leaked provider phone would show up.
    const withPhone = exportCandidate("exp-1", "Mesa Pool Repair", "exp-one.invalid", cellKey);
    const withoutPhone = exportCandidate("exp-2", "Gilbert Pool Repair", "exp-two.invalid", cellKey);
    const store = createAssessmentStore({
      databasePath, repositoryRoot: REPO_ROOT, coverage,
      candidates: [withPhone, withoutPhone], now: () => new Date(EXPORT_NOW),
    });
    try {
      await runLiveWebsiteAssessment({
        candidates: [withPhone, withoutPhone],
        limits: {
          maxBusinessesAttempted: 2, maxWebsitesAssessed: 2, maxPagesPerBusiness: 1,
          maxRequestsPerBusiness: 2, maxTotalRequests: 10,
          maxDownloadedBytes: 4 * 1024 * 1024, maxProcessedBytes: 8 * 1024 * 1024,
          maxDurationMs: 30_000, maxRetriesPerBusiness: 1,
        },
        niche: {
          service_synonyms: ["pool cleaning"], required_indicators: ["pool"],
          negative_keywords: [], excluded_adjacent_industries: [],
          relevant_categories: ["pool_cleaning"],
        } as never,
        now: () => new Date(EXPORT_NOW),
        assessmentId: (candidate) => `wa_${candidate.candidateKey}`,
        createCrawler: (candidate) => ({
          crawl: async () => exportCrawl(candidate, candidate.candidateKey === "exp-1"),
        }),
        sink: store.sink,
      });
      const rows = exportRows(store, new Map([
        [withPhone.candidateKey, "tucson_az"],
        [withoutPhone.candidateKey, "tucson_az"],
      ]));
      expect(rows).toHaveLength(2);
      const shown = rows.find((row) => row.leadId === store.businessIdFor("exp-1"));
      const hidden = rows.find((row) => row.leadId === store.businessIdFor("exp-2"));
      expect(shown?.observedPhone).not.toBe("");
      // The provider phone is never substituted for an unobserved website phone.
      expect(hidden?.observedPhone).toBe("");
      for (const row of rows) {
        expect(row.market).toBe("tucson_az");
        expect(row.website.startsWith("https://")).toBe(true);
      }
      // CSV quoting is applied to any value that could break the row shape.
      expect(csvCell('Pool "Pros", Inc')).toBe('"Pool ""Pros"", Inc"');
      expect(csvCell(null)).toBe("");
    } finally {
      store.close();
    }
  });
});
