import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAssessmentStore } from "../../src/lead-engine/assessment/assessment-store.js";
import { qualifyAndRankBatch } from "../../src/lead-engine/assessment/batch-runner.js";
import {
  runLiveWebsiteAssessment,
  type LiveWebsiteAssessmentLimits,
} from "../../src/lead-engine/assessment/live-website-assessment.js";
import { DISCOVERY_COVERAGE_SCHEME } from "../../src/lead-engine/geography/coverage-keys.js";
import { createCallingQueueRepository } from "../../src/lead-engine/ranking/queue-repository.js";
import { rankQueueCandidate } from "../../src/lead-engine/ranking/ranker.js";
import { POOL_SERVICE_ICP_MODEL_VERSION } from "../../src/lead-engine/qualification/pool-service-model.js";
import {
  createRankingFixture,
  defaultQueueConstraints,
  seedRankedLead,
} from "./helpers/ranking-fixture.js";
import type { EligibleCandidate } from "../../src/lead-engine/assessment/candidate-gate.js";
import type { CrawlPage, CrawlResult, RobotsDecision } from "../../src/lead-engine/crawl/types.js";

/**
 * Phase 5C live-batch scope propagation.
 *
 * A lead discovered inside the batch's coverage was being classified
 * `not_eligible / outside_queue_scope` before the contact-route gate ever ran,
 * because nothing carried its coverage cell from discovery through to ranking.
 * These tests pin the repaired lineage and, just as importantly, pin that the
 * repair did not weaken the scope gate or move a single qualification point.
 */

const REPO_ROOT = path.resolve(process.cwd(), "..");
const AT = "2026-08-02T00:00:00.000Z";
const CELL = "coverage:us-az:mesa-01";
const temporaryRoots: string[] = [];

afterEach(() => {
  while (temporaryRoots.length > 0) {
    rmSync(temporaryRoots.pop() as string, { recursive: true, force: true });
  }
});

function temporaryDatabase(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "rocco-scope-test-"));
  temporaryRoots.push(root);
  return path.join(root, "scope.sqlite");
}

function candidate(index: number, coverageKey: string | null): EligibleCandidate {
  const host = `pool-co-${index}.invalid`;
  return {
    candidateKey: `place-${index}`,
    expectedBusinessName: `Sunset Pool Care ${index}`,
    candidateUrl: `https://${host}/`,
    candidateHost: host,
    providerPlaceId: `place-${index}`,
    releaseId: "2026-07-22.0",
    expectedLocality: "Mesa",
    expectedPhones: ["+15550101001"],
    discoveredCoverageKey: coverageKey,
  };
}

function html(name: string): string {
  return [
    `<html lang="en"><head><title>${name}</title>`,
    '<meta name="viewport" content="width=device-width">',
    '<script type="application/ld+json">',
    JSON.stringify({ "@type": "Organization", name }),
    "</script></head><body><h1>Pool cleaning</h1><h2>Pool service</h2>",
    '<a href="tel:+15550101001">Call us</a>',
    '<a href="mailto:hello@pool-co.invalid">Email us</a>',
    '<a href="/contact">Contact</a><a href="/services">Our services</a>',
    "</body></html>",
  ].join("");
}

function crawlFor(entry: EligibleCandidate): CrawlResult {
  const body = html(entry.expectedBusinessName);
  const page: CrawlPage = {
    url: entry.candidateUrl, kind: "homepage", inspectionStatus: "successful",
    fetch: {
      ok: true, requestedUrl: entry.candidateUrl, finalUrl: entry.candidateUrl, status: 200,
      contentType: "text/html", body, compressedBytes: 2_000, decompressedBytes: 4_000,
      contentChecksum: createHash("sha256").update(body).digest("hex"),
      etag: null, lastModified: null, redirectHistory: [],
      fetchedAt: AT, attempts: 1,
    },
    html: body,
  };
  const decision: RobotsDecision = {
    origin: entry.candidateUrl, robotsUrl: `${entry.candidateUrl}robots.txt`,
    status: "allowed", reason: "no_matching_rule", matchedRule: null,
    fetchedAt: AT, expiresAt: "2026-08-03T00:00:00.000Z",
    contentChecksum: null, sitemapUrls: [],
  };
  return {
    requestedUrl: entry.candidateUrl, sourceClass: "public_business_website",
    canonicalHomepage: entry.candidateUrl,
    startedAt: AT, completedAt: "2026-08-02T00:00:01.000Z",
    pages: [page], robots: decision, robotsDecisions: [decision],
    complete: true, timedOut: false,
  };
}

const NICHE = {
  service_synonyms: ["pool cleaning", "pool service"],
  required_indicators: ["pool"],
  negative_keywords: [],
  excluded_adjacent_industries: [],
  relevant_categories: ["pool_cleaning"],
} as never;

const LIMITS: LiveWebsiteAssessmentLimits = {
  maxBusinessesAttempted: 5, maxWebsitesAssessed: 5, maxPagesPerBusiness: 3,
  maxRequestsPerBusiness: 6, maxTotalRequests: 30,
  maxDownloadedBytes: 8 * 1024 * 1024, maxProcessedBytes: 16 * 1024 * 1024,
  maxDurationMs: 60_000, maxRetriesPerBusiness: 1,
};

/** Runs the real production path offline: no network, no provider, no canary. */
async function runBatch(candidates: EligibleCandidate[]) {
  const store = createAssessmentStore({
    databasePath: temporaryDatabase(), repositoryRoot: REPO_ROOT,
    candidates, now: () => new Date(AT),
  });
  await runLiveWebsiteAssessment({
    candidates, limits: LIMITS, niche: NICHE, now: () => new Date(AT),
    assessmentId: (entry) => `wa_${entry.candidateKey}`,
    createCrawler: (entry) => ({ crawl: async () => crawlFor(entry) }),
    sink: store.sink,
  });
  const queue = qualifyAndRankBatch({
    database: store.database,
    assessments: store.assessmentBusinessIds()
      .map((row) => ({ assessmentId: row.assessmentId, businessId: row.businessId })),
    runId: "scope-test-run",
    evaluatedAt: AT,
    maximumCallable: 10, maximumReview: 10,
    coverageKeys: [CELL],
    signal: new AbortController().signal,
  });
  const candidatesLoaded = createCallingQueueRepository(store.database)
    .loadCandidates(POOL_SERVICE_ICP_MODEL_VERSION);
  return { store, queue, candidates: candidatesLoaded };
}

describe("live batch scope propagation", () => {
  it("persists the discovered coverage cell through the existing identifier model", async () => {
    const { store } = await runBatch([candidate(1, CELL)]);
    const rows = store.database.prepare(`
      SELECT scheme, value, source, source_class, claim_state, evidence_state
      FROM business_identifiers WHERE scheme = ?
    `).all(DISCOVERY_COVERAGE_SCHEME) as Array<Record<string, string>>;

    expect(rows).toHaveLength(1);
    // Provenance stays honest: the cell came from the discovery dataset, not the
    // website, and it is never promoted to a verification.
    expect(rows[0]).toMatchObject({
      scheme: DISCOVERY_COVERAGE_SCHEME,
      source_class: "local_public_dataset",
      claim_state: "observed",
    });
    expect(rows[0]?.value).toContain(CELL);
    store.close();
  });

  it("populates candidate.coverageKeys through the real repositories", async () => {
    const { store, candidates } = await runBatch([candidate(2, CELL)]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.coverageKeys).toContain(CELL);
    store.close();
  });

  it("leaves coverageKeys empty when discovery attributed no cell", async () => {
    // Nothing is defaulted in-scope: a candidate with no discovered cell keeps
    // the previous fail-closed behaviour.
    const { store, candidates } = await runBatch([candidate(3, null)]);
    expect(candidates[0]?.coverageKeys).toEqual([]);
    store.close();
  });

  it("does not classify an in-scope candidate as outside_queue_scope", async () => {
    const { store, candidates } = await runBatch([candidate(4, CELL)]);
    const entry = rankQueueCandidate(
      candidates[0] as never,
      defaultQueueConstraints({
        scope: { kind: "coverage_keys", coverageKeys: [CELL] }, generatedAt: AT,
      }),
    );
    expect(entry.reasons.map((reason) => reason.code)).not.toContain("outside_queue_scope");
    store.close();
  });

  it("still rejects a candidate outside the requested scope", async () => {
    const { store, candidates } = await runBatch([candidate(5, CELL)]);
    const entry = rankQueueCandidate(
      candidates[0] as never,
      defaultQueueConstraints({
        scope: { kind: "coverage_keys", coverageKeys: ["coverage:us-nv:henderson-01"] },
        generatedAt: AT,
      }),
    );
    expect(entry.disposition).toBe("not_eligible");
    expect(entry.reasons.map((reason) => reason.code)).toContain("outside_queue_scope");
    store.close();
  });

  it("does not change any qualification score or result state", async () => {
    // The identifier row is invisible to qualification. Same evidence with and
    // without a discovered cell must produce an identical evaluation.
    const withCell = await runBatch([candidate(6, CELL)]);
    const withoutCell = await runBatch([candidate(6, null)]);
    const scored = (result: Awaited<ReturnType<typeof runBatch>>) => {
      const row = result.store.database.prepare(`
        SELECT icp_result, total_score, score_tier, review_required FROM icp_qualification_evaluations
      `).get() as Record<string, unknown>;
      return row;
    };
    expect(scored(withCell)).toEqual(scored(withoutCell));
    expect(withCell.queue.qualificationCounts).toEqual(withoutCell.queue.qualificationCounts);
    withCell.store.close();
    withoutCell.store.close();
  });

  it("keeps the contact-route gate downstream of the scope gate", () => {
    // A live-path lead cannot currently reach `qualified`, so the ordering of
    // the two gates is pinned with the existing ranker fixture.
    const fixture = createRankingFixture();
    seedRankedLead(fixture.database, {
      id: "no-route", result: "qualified", score: 75,
      coverageKey: CELL, publicPhone: false, publicEmail: false, form: false,
    });
    const candidates = createCallingQueueRepository(fixture.database)
      .loadCandidates(POOL_SERVICE_ICP_MODEL_VERSION);
    const target = candidates[0] as never;

    // In scope, no route -> the route gate is what stops it.
    const inScope = rankQueueCandidate(target, defaultQueueConstraints({
      scope: { kind: "coverage_keys", coverageKeys: [CELL] },
    }));
    expect(inScope.reasons.map((reason) => reason.code)).toContain("contact_route_unavailable");
    expect(inScope.reasons.map((reason) => reason.code)).not.toContain("outside_queue_scope");

    // Out of scope, no route -> scope is evaluated first and short-circuits.
    const outOfScope = rankQueueCandidate(target, defaultQueueConstraints({
      scope: { kind: "coverage_keys", coverageKeys: ["coverage:elsewhere"] },
    }));
    expect(outOfScope.reasons.map((reason) => reason.code)).toContain("outside_queue_scope");
    expect(outOfScope.reasons.map((reason) => reason.code)).not.toContain("contact_route_unavailable");
    fixture.database.close();
  });

  it("lets a qualified in-scope lead reach the callable queue, and no further", async () => {
    const { store, queue } = await runBatch([candidate(7, CELL)]);
    const row = store.database.prepare(`
      SELECT icp_result, total_score FROM icp_qualification_evaluations
    `).get() as { icp_result: string; total_score: number };

    // Repairing scope is what makes this reachable: the lead already scored
    // into `qualified`, and only the broken coverage lineage was holding it in
    // not_eligible. Pinned deliberately so any future change to the callable
    // boundary has to break this test on purpose.
    expect(row.icp_result).toBe("qualified");
    expect(row.total_score).toBeGreaterThanOrEqual(65);
    expect(queue.callableQueueSize).toBe(1);

    // The queue is still inert: it exists only as rows in this run's own
    // throwaway database and no consumer reads it.
    const persisted = store.database.prepare(`
      SELECT COUNT(*) AS total FROM lead_queue_entries WHERE disposition = 'callable'
    `).get() as { total: number };
    expect(persisted.total).toBe(1);
    store.close();

    // The touched sources stay inside the containment boundary.
    const sources = [
      "src/lead-engine/ranking/queue-repository.ts",
      "src/lead-engine/geography/coverage-keys.ts",
      "src/lead-engine/assessment/assessment-store.ts",
    ].map((name) => readFileSync(path.join(process.cwd(), name), "utf8")).join("\n");
    expect(sources).not.toMatch(/discord|retell|crm|node-cron|scheduler|fetch\(|https?:\/\//i);
  });
});
