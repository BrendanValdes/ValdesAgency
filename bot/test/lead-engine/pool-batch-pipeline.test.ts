import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAssessmentStore } from "../../src/lead-engine/assessment/assessment-store.js";
import { qualifyAndRankBatch } from "../../src/lead-engine/assessment/batch-runner.js";
import {
  runLiveWebsiteAssessment,
  type LiveWebsiteAssessmentLimits,
} from "../../src/lead-engine/assessment/live-website-assessment.js";
import {
  parseBatchCanaryArguments,
  runPoolBatchCanary,
  BATCH_CANARY_LIMITS,
} from "../../scripts/run-pool-batch-canary.js";
import type { EligibleCandidate } from "../../src/lead-engine/assessment/candidate-gate.js";
import type { CrawlPage, CrawlResult, RobotsDecision } from "../../src/lead-engine/crawl/types.js";

const REPO_ROOT = path.resolve(process.cwd(), "..");
const temporaryRoots: string[] = [];

afterEach(() => {
  while (temporaryRoots.length > 0) {
    rmSync(temporaryRoots.pop() as string, { recursive: true, force: true });
  }
});

function temporaryDatabase(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "rocco-batch-test-"));
  temporaryRoots.push(root);
  return path.join(root, "batch.sqlite");
}

function candidate(index: number): EligibleCandidate {
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
  };
}

function robots(): RobotsDecision {
  return {
    origin: "https://pool-co.invalid", robotsUrl: "https://pool-co.invalid/robots.txt",
    status: "allowed", reason: "no_matching_rule", matchedRule: null,
    fetchedAt: "2026-08-02T00:00:00.000Z", expiresAt: "2026-08-03T00:00:00.000Z",
    contentChecksum: null, sitemapUrls: [],
  };
}

function richHtml(name: string): string {
  return [
    `<html lang="en"><head><title>${name}</title>`,
    '<meta name="viewport" content="width=device-width">',
    '<script type="application/ld+json">',
    JSON.stringify({ "@type": "Organization", name }),
    "</script></head><body><h1>Pool cleaning</h1><h2>Pool service</h2>",
    '<a href="tel:+15550101001">Call us</a>',
    '<a href="mailto:hello@pool-co.invalid">Email us</a>',
    '<a href="/contact">Contact</a><a href="/book">Book now</a>',
    '<a href="/services">Our services</a><a href="/estimate">Get an estimate</a>',
    "</body></html>",
  ].join("");
}

function crawlFor(entry: EligibleCandidate, html: string): CrawlResult {
  const body = html;
  const page: CrawlPage = {
    url: entry.candidateUrl, kind: "homepage", inspectionStatus: "inspected",
    fetch: {
      ok: true, requestedUrl: entry.candidateUrl, finalUrl: entry.candidateUrl, status: 200,
      contentType: "text/html", body, compressedBytes: 2_000, decompressedBytes: 4_000,
      contentChecksum: createHash("sha256").update(body).digest("hex"),
      etag: null, lastModified: null, redirectHistory: [],
      fetchedAt: "2026-08-02T00:00:00.000Z", attempts: 1,
    },
    html: body,
  };
  const decision = { ...robots(), origin: entry.candidateUrl };
  return {
    requestedUrl: entry.candidateUrl, sourceClass: "public_business_website",
    canonicalHomepage: entry.candidateUrl,
    startedAt: "2026-08-02T00:00:00.000Z", completedAt: "2026-08-02T00:00:01.000Z",
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

async function runPipeline(input: {
  candidates: EligibleCandidate[];
  html?: (entry: EligibleCandidate) => string;
  databasePath?: string;
  signal?: AbortSignal;
}) {
  const databasePath = input.databasePath ?? temporaryDatabase();
  const store = createAssessmentStore({
    databasePath, repositoryRoot: REPO_ROOT, candidates: input.candidates,
    now: () => new Date("2026-08-02T00:00:00.000Z"),
  });
  const websites = await runLiveWebsiteAssessment({
    candidates: input.candidates,
    limits: LIMITS, niche: NICHE,
    now: () => new Date("2026-08-02T00:00:00.000Z"),
    assessmentId: (entry) => `wa_${entry.candidateKey}`,
    createCrawler: (entry) => ({
      crawl: async () => crawlFor(entry, input.html?.(entry) ?? richHtml(entry.expectedBusinessName)),
    }),
    sink: store.sink,
    ...(input.signal ? { signal: input.signal } : {}),
  });
  const queue = qualifyAndRankBatch({
    database: store.database,
    assessments: store.assessmentBusinessIds()
      .map((row) => ({ assessmentId: row.assessmentId, businessId: row.businessId })),
    runId: "test-run",
    evaluatedAt: "2026-08-02T00:00:00.000Z",
    maximumCallable: 10, maximumReview: 10,
    coverageKeys: ["coverage_test"],
    signal: input.signal ?? new AbortController().signal,
  });
  const evidence = store.evidenceCounts();
  return { store, websites, queue, evidence, databasePath };
}

describe("Phase 5C live-evidence pipeline", () => {
  it("carries live evidence through assessment, qualification, and ranking", async () => {
    const { store, websites, queue, evidence } = await runPipeline({ candidates: [candidate(1)] });
    expect(websites.websitesAssessed).toBe(1);
    // Evidence is actually persisted, not just counted in memory.
    expect(evidence.pages).toBe(1);
    expect(evidence.contacts).toBeGreaterThan(0);
    expect(evidence.conversions).toBeGreaterThan(0);
    expect(queue.evaluated).toBe(1);
    expect(queue.queueState).toBe("completed");
    expect(queue.snapshotId).not.toBeNull();
    store.close();
  });

  it("stores contacts and people as public-unverified with no verification", async () => {
    const { store } = await runPipeline({ candidates: [candidate(2)] });
    const contacts = store.database
      .prepare("SELECT candidate_status, claim_state FROM website_contact_observations").all() as
      Array<{ candidate_status: string; claim_state: string }>;
    expect(contacts.length).toBeGreaterThan(0);
    for (const row of contacts) {
      expect(row.candidate_status).toBe("public_unverified");
      expect(row.claim_state).toBe("public_unverified_candidate");
    }
    // No verification or promotion decision is produced anywhere in this phase.
    for (const table of ["identity_decision_audits", "evidence_promotion_decisions"]) {
      const row = store.database.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get() as { total: number };
      expect(row.total).toBe(0);
    }
    store.close();
  });

  it("keeps a domain mismatch in identity review and out of the callable queue", async () => {
    const { store, websites, queue } = await runPipeline({
      candidates: [candidate(3)],
      html: () => richHtml("Completely Different Roofing Company"),
    });
    expect(websites.websitesAssessed).toBe(0);
    expect(websites.identityReview).toBe(1);
    const conflicts = store.database
      .prepare("SELECT review_state FROM website_identity_conflicts").all() as Array<{ review_state: string }>;
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.review_state).toBe("pending");
    expect(queue.callableQueueSize).toBe(0);
    store.close();
  });

  it("produces a deterministic queue across repeated runs", async () => {
    const first = await runPipeline({ candidates: [candidate(4), candidate(5)] });
    const second = await runPipeline({ candidates: [candidate(4), candidate(5)] });
    expect(second.queue.callableQueueSize).toBe(first.queue.callableQueueSize);
    expect(second.queue.priorityBands).toEqual(first.queue.priorityBands);
    expect(second.queue.qualificationCounts).toEqual(first.queue.qualificationCounts);
    first.store.close();
    second.store.close();
  });

  it("is idempotent on resume and never double-evaluates or double-assesses", async () => {
    const databasePath = temporaryDatabase();
    const candidates = [candidate(6)];
    const first = await runPipeline({ candidates, databasePath });
    expect(first.queue.evaluated).toBe(1);
    first.store.close();

    // Re-run against the same database: the assessment and the evaluation are reused.
    const second = await runPipeline({ candidates, databasePath });
    expect(second.websites.duplicateAssessmentsSkipped).toBe(1);
    expect(second.websites.businessesAttempted).toBe(0);
    expect(second.queue.evaluated).toBe(0);
    // The durable state is what matters: one assessment and one evaluation.
    const assessments = second.store.database
      .prepare("SELECT COUNT(*) AS total FROM website_assessments").get() as { total: number };
    const evaluations = second.store.database
      .prepare("SELECT COUNT(*) AS total FROM icp_qualification_evaluations").get() as { total: number };
    expect(assessments.total).toBe(1);
    expect(evaluations.total).toBe(1);
    second.store.close();
  });

  it("excludes duplicates so one business yields one assessment", async () => {
    const duplicate = candidate(7);
    const { store, websites } = await runPipeline({ candidates: [duplicate, { ...duplicate }] });
    expect(websites.businessesAttempted).toBe(1);
    expect(websites.duplicateAssessmentsSkipped).toBe(1);
    const rows = store.database
      .prepare("SELECT COUNT(*) AS total FROM website_assessments").get() as { total: number };
    expect(rows.total).toBe(1);
    store.close();
  });

  it("stops on cancellation without evaluating or queueing", async () => {
    const controller = new AbortController();
    controller.abort();
    const { store, websites, queue } = await runPipeline({
      candidates: [candidate(8)], signal: controller.signal,
    });
    expect(websites.stopReason).toBe("cancelled");
    expect(websites.businessesAttempted).toBe(0);
    expect(queue.evaluated).toBe(0);
    expect(queue.callableQueueSize).toBe(0);
    store.close();
  });

  it("stops on the website budget before exceeding it", async () => {
    const many = Array.from({ length: 6 }, (_unused, index) => candidate(20 + index));
    const databasePath = temporaryDatabase();
    const store = createAssessmentStore({
      databasePath, repositoryRoot: REPO_ROOT, candidates: many,
      now: () => new Date("2026-08-02T00:00:00.000Z"),
    });
    const websites = await runLiveWebsiteAssessment({
      candidates: many,
      limits: { ...LIMITS, maxBusinessesAttempted: 2 },
      niche: NICHE,
      now: () => new Date("2026-08-02T00:00:00.000Z"),
      assessmentId: (entry) => `wa_${entry.candidateKey}`,
      createCrawler: (entry) => ({ crawl: async () => crawlFor(entry, richHtml(entry.expectedBusinessName)) }),
      sink: store.sink,
    });
    expect(websites.stopReason).toBe("business_target_reached");
    expect(websites.businessesAttempted).toBe(2);
    store.close();
  });
});

describe("Phase 5C batch canary surface", () => {
  it("keeps the live batch disabled by default and does no network work", async () => {
    const report = await runPoolBatchCanary({
      argv: ["--confirm-live-batch", "--database", temporaryDatabase()],
      repositoryRoot: REPO_ROOT,
    });
    expect(report.ran).toBe(false);
    expect(report.aggregateVerdict).toBe("blocked_live_batch_disabled");
    expect(report.safetyWarnings).toEqual(["live_batch_disabled_by_default"]);
    expect(report.usage).toEqual({});
  });

  it("requires explicit confirmation and a /tmp database", () => {
    const database = temporaryDatabase();
    expect(parseBatchCanaryArguments(["--confirm-live-batch", "--database", database], REPO_ROOT)
      .enableLiveBatch).toBe(false);
    expect(parseBatchCanaryArguments(
      ["--confirm-live-batch", "--enable-live-batch", "--database", database], REPO_ROOT,
    ).enableLiveBatch).toBe(true);
    expect(() => parseBatchCanaryArguments(["--database", database], REPO_ROOT)).toThrow("confirm");
    expect(() => parseBatchCanaryArguments(
      ["--confirm-live-batch", "--database", path.join(REPO_ROOT, "inside.sqlite")], REPO_ROOT,
    )).toThrow("temp directory");
  });

  it("pins the mandated bounded batch budgets", () => {
    expect(BATCH_CANARY_LIMITS).toMatchObject({
      targetCallableLeads: 10,
      maxCells: 20,
      maxDiscoveryCandidates: 40,
      maxDiscoveryPasses: 3,
      maxCellsPerPass: 7,
      maxWebsitesAttempted: 20,
      maxPagesPerBusiness: 3,
      maxTotalRequests: 90,
      maxDiscoveryRequests: 30,
      maxTotalCrawlRequests: 60,
      maxDownloadedBytes: 64 * 1024 * 1024,
      maxProcessedBytes: 128 * 1024 * 1024,
      maxCrawlDownloadedBytes: 32 * 1024 * 1024,
      maxCrawlProcessedBytes: 64 * 1024 * 1024,
      maxRuntimeMs: 180_000,
      maxCrawlRuntimeMs: 120_000,
      maxRetriesPerBusiness: 2,
    });
  });

  it("emits aggregate-only output with no business-identifying values", async () => {
    const { queue, evidence, websites } = await runPipeline({ candidates: [candidate(9)] });
    const serialized = JSON.stringify({ queue, evidence, websites }).toLowerCase();
    for (const forbidden of [
      "sunset pool care", "pool-co-", ".invalid", "tel:", "mailto:", "+1555", "<html", "hello@",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("performs no external export or outbound action beyond the crawl", async () => {
    const seen: string[] = [];
    const databasePath = temporaryDatabase();
    const entry = candidate(10);
    const store = createAssessmentStore({
      databasePath, repositoryRoot: REPO_ROOT, candidates: [entry],
      now: () => new Date("2026-08-02T00:00:00.000Z"),
    });
    await runLiveWebsiteAssessment({
      candidates: [entry], limits: LIMITS, niche: NICHE,
      now: () => new Date("2026-08-02T00:00:00.000Z"),
      assessmentId: () => "wa_export_check",
      createCrawler: () => ({
        crawl: async (request) => {
          seen.push(request.websiteUrl);
          return crawlFor(entry, richHtml(entry.expectedBusinessName));
        },
      }),
      sink: store.sink,
    });
    // Exactly one crawl of the approved homepage; the queue lives only in SQLite.
    expect(seen).toEqual([entry.candidateUrl]);
    const snapshots = store.database
      .prepare("SELECT COUNT(*) AS total FROM lead_queue_snapshots").get() as { total: number };
    expect(snapshots.total).toBe(0);
    store.close();
  });
});
