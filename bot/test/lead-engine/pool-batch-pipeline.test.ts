import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAssessmentStore } from "../../src/lead-engine/assessment/assessment-store.js";
import { qualifyAndRankBatch } from "../../src/lead-engine/assessment/batch-runner.js";
import {
  persistableOperationalEvidence,
  runLiveWebsiteAssessment,
  type LiveWebsiteAssessmentLimits,
} from "../../src/lead-engine/assessment/live-website-assessment.js";
import { createQualificationRepository } from "../../src/lead-engine/qualification/repository.js";
import {
  cleanupBatchDatabase,
  parseBatchCanaryArguments,
  runPoolBatchCanary,
  BATCH_CANARY_LIMITS,
} from "../../scripts/run-pool-batch-canary.js";
import type { EligibleCandidate } from "../../src/lead-engine/assessment/candidate-gate.js";
import type { CrawlPage, CrawlResult, RobotsDecision } from "../../src/lead-engine/crawl/types.js";
import type { SqliteDatabase } from "../../src/lead-engine/db/database.js";
import type { PoolServiceQualificationResult } from "../../src/lead-engine/qualification/types.js";

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
    url: entry.candidateUrl, kind: "homepage", inspectionStatus: "successful",
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

/**
 * Crawl shapes for the operational-evidence rules. Unlike `crawlFor` these use
 * the `successful` inspection status the production crawler actually emits, so
 * the operational assessor sees a real homepage observation.
 */
function operationalCrawl(entry: EligibleCandidate, options: {
  homepage?: "successful" | "failed" | "unavailable";
  robots?: RobotsDecision["status"];
  secondaryFailure?: boolean;
} = {}): CrawlResult {
  const homepageStatus = options.homepage ?? "successful";
  const usable = homepageStatus === "successful";
  const body = richHtml(entry.expectedBusinessName);
  const pages: CrawlPage[] = [{
    url: entry.candidateUrl, kind: "homepage", inspectionStatus: homepageStatus,
    fetch: usable ? {
      ok: true, requestedUrl: entry.candidateUrl, finalUrl: entry.candidateUrl, status: 200,
      contentType: "text/html", body, compressedBytes: 2_000, decompressedBytes: 4_000,
      contentChecksum: createHash("sha256").update(body).digest("hex"),
      etag: null, lastModified: null, redirectHistory: [],
      fetchedAt: "2026-08-02T00:00:00.000Z", attempts: 1,
    } : null,
    html: usable ? body : null,
  }];
  if (options.secondaryFailure) {
    // A secondary page that could not be read at all. The homepage observation
    // above stays confirmed.
    pages.push({
      url: `${entry.candidateUrl}contact`, kind: "contact",
      inspectionStatus: "failed", fetch: null, html: null,
    });
  }
  const decision: RobotsDecision = {
    ...robots(), origin: entry.candidateUrl, status: options.robots ?? "allowed",
  };
  return {
    requestedUrl: entry.candidateUrl, sourceClass: "public_business_website",
    canonicalHomepage: entry.candidateUrl,
    startedAt: "2026-08-02T00:00:00.000Z", completedAt: "2026-08-02T00:00:01.000Z",
    pages, robots: decision, robotsDecisions: [decision],
    complete: usable && !options.secondaryFailure, timedOut: false,
  };
}

interface OperationalRow {
  field_name: string;
  claimed_value: string | null;
  claim_state: string;
  source_class: string;
  external_verification_state: string;
  human_review_state: string;
  verification_dimension: string | null;
  verifier_id: string | null;
  verification_result: string | null;
  expires_at: string | null;
}

function operationalRows(database: SqliteDatabase): OperationalRow[] {
  return database.prepare(`
    SELECT field_name, claimed_value, claim_state, source_class,
           external_verification_state, human_review_state, verification_dimension,
           verifier_id, verification_result, expires_at
    FROM evidence WHERE field_name LIKE 'operational:%' ORDER BY field_name
  `).all() as OperationalRow[];
}

const VERIFICATION_ONLY_RULES = [
  "contact.phone_reachability_verified",
  "contact.email_deliverability_verified",
  "person.employment_verified",
  "person.owner_relationship_verified",
  "person.decision_authority_verified",
  "person.human_confirmation",
] as const;

async function runPipeline(input: {
  candidates: EligibleCandidate[];
  html?: (entry: EligibleCandidate) => string;
  crawl?: (entry: EligibleCandidate) => CrawlResult;
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
      crawl: async () => input.crawl?.(entry)
        ?? crawlFor(entry, input.html?.(entry) ?? richHtml(entry.expectedBusinessName)),
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

describe("operational crawl evidence", () => {
  const points = (result: PoolServiceQualificationResult, ruleId: string): number => {
    const outcome = result.componentScores
      .flatMap((component) => component.outcomes)
      .find((entry) => entry.ruleId === ruleId);
    if (!outcome) throw new Error(`Missing rule outcome: ${ruleId}`);
    return outcome.points;
  };
  const evaluate = async (
    entry: EligibleCandidate,
    build: (candidateEntry: EligibleCandidate) => CrawlResult,
    databasePath?: string,
  ) => {
    const run = await runPipeline({
      candidates: [entry], crawl: build,
      ...(databasePath ? { databasePath } : {}),
    });
    // Read back through the real qualification repository, not the in-memory result.
    const businessId = run.store.businessIdFor(entry.candidateKey);
    const result = createQualificationRepository(run.store.database)
      .getLatestForBusiness(businessId);
    return { run, result, businessId };
  };

  it("persists both facts from a directly observed successful homepage", async () => {
    const { run, result } = await evaluate(candidate(20), (entry) => operationalCrawl(entry));
    const rows = operationalRows(run.store.database);
    expect(rows.map((row) => row.field_name)).toEqual([
      "operational:homepage_usable", "operational:https_works",
    ]);
    expect(rows[0]?.claimed_value).toBe("successful");
    expect(rows[1]?.claimed_value).toBe("https:");
    expect(run.evidence.operational).toBe(2);
    // The rows reach the scorer through the real repository and input assembly.
    expect(result).not.toBeNull();
    expect(points(result as PoolServiceQualificationResult, "legitimacy.homepage_usable")).toBe(5);
    expect(points(result as PoolServiceQualificationResult, "legitimacy.https_observed")).toBe(2);
    run.store.close();
  });

  it("caps the combined operational credit at the existing seven points", async () => {
    const { run, result } = await evaluate(candidate(21), (entry) => operationalCrawl(entry));
    const scored = result as PoolServiceQualificationResult;
    const combined = points(scored, "legitimacy.homepage_usable") +
      points(scored, "legitimacy.https_observed");
    expect(combined).toBe(7);
    const legitimacy = scored.componentScores
      .find((component) => component.component === "business_legitimacy");
    // Unchanged component ceiling: nothing here creates a parallel scoring path.
    expect(legitimacy?.maximumPoints).toBe(15);
    expect(legitimacy?.points).toBeLessThanOrEqual(15);
    expect(scored.overallScore).toBeLessThanOrEqual(100);
    run.store.close();
  });

  it("writes nothing when robots denies the crawl", async () => {
    const { run, result } = await evaluate(candidate(22), (entry) =>
      operationalCrawl(entry, { robots: "denied" }));
    expect(operationalRows(run.store.database)).toEqual([]);
    expect(run.evidence.operational).toBe(0);
    expect(points(result as PoolServiceQualificationResult, "legitimacy.homepage_usable")).toBe(0);
    expect(points(result as PoolServiceQualificationResult, "legitimacy.https_observed")).toBe(0);
    run.store.close();
  });

  it("writes nothing when the homepage failed or was unavailable", async () => {
    for (const [index, homepage] of (["failed", "unavailable"] as const).entries()) {
      const { run, result } = await evaluate(candidate(23 + index), (entry) =>
        operationalCrawl(entry, { homepage }));
      expect(operationalRows(run.store.database)).toEqual([]);
      expect(run.evidence.operational).toBe(0);
      expect(points(result as PoolServiceQualificationResult, "legitimacy.homepage_usable")).toBe(0);
      expect(points(result as PoolServiceQualificationResult, "legitimacy.https_observed")).toBe(0);
      run.store.close();
    }
    // The producer itself refuses non-successful and robots-denied observations,
    // independently of where the pipeline happens to stop.
    const entry = candidate(25);
    for (const options of [
      { homepage: "failed" as const }, { homepage: "unavailable" as const },
      { robots: "denied" as const }, { robots: "unavailable" as const },
    ]) {
      expect(persistableOperationalEvidence({
        expectedBusinessName: entry.expectedBusinessName,
        crawl: operationalCrawl(entry, options),
      })).toEqual([]);
    }
  });

  it("keeps a confirmed homepage when a secondary page failed", async () => {
    const { run, result } = await evaluate(candidate(26), (entry) =>
      operationalCrawl(entry, { secondaryFailure: true }));
    const scored = result as PoolServiceQualificationResult;
    // The crawl is incomplete, yet the homepage fact is neither erased nor faked.
    const assessment = run.store.database
      .prepare("SELECT status FROM website_assessments LIMIT 1").get() as { status: string };
    expect(assessment.status).toBe("partial");
    expect(operationalRows(run.store.database).map((row) => row.field_name)).toEqual([
      "operational:homepage_usable", "operational:https_works",
    ]);
    expect(points(scored, "legitimacy.homepage_usable")).toBe(5);
    expect(points(scored, "legitimacy.https_observed")).toBe(2);
    run.store.close();
  });

  it("does not duplicate evidence or points when the batch is reprocessed", async () => {
    const databasePath = temporaryDatabase();
    const entry = candidate(27);
    const first = await evaluate(entry, (target) => operationalCrawl(target), databasePath);
    const firstScore = (first.result as PoolServiceQualificationResult).overallScore;
    expect(operationalRows(first.run.store.database)).toHaveLength(2);
    first.run.store.close();

    const second = await evaluate(entry, (target) => operationalCrawl(target), databasePath);
    expect(second.run.websites.duplicateAssessmentsSkipped).toBe(1);
    expect(operationalRows(second.run.store.database)).toHaveLength(2);
    expect((second.result as PoolServiceQualificationResult).overallScore).toBe(firstScore);
    const evaluations = second.run.store.database
      .prepare("SELECT COUNT(*) AS total FROM icp_qualification_evaluations").get() as { total: number };
    expect(evaluations.total).toBe(1);
    second.run.store.close();
  });

  it("never counts as verification, human confirmation, or a second source class", async () => {
    const { run, result } = await evaluate(candidate(28), (entry) => operationalCrawl(entry));
    const scored = result as PoolServiceQualificationResult;
    for (const row of operationalRows(run.store.database)) {
      expect(row.claim_state).toBe("observed");
      expect(row.source_class).toBe("public_business_website");
      expect(row.external_verification_state).toBe("unassessed");
      expect(row.human_review_state).toBe("unreviewed");
      expect(row.verification_dimension).toBeNull();
      expect(row.verifier_id).toBeNull();
      expect(row.verification_result).toBeNull();
      expect(row.expires_at).toBeNull();
    }
    // Every verification-gated rule stays unsatisfied.
    for (const ruleId of VERIFICATION_ONLY_RULES) expect(points(scored, ruleId)).toBe(0);
    expect(scored.confidence.usedAsVerification).toBe(false);
    // No independent corroborating source class was introduced.
    expect(points(scored, "quality.corroborated_sources")).toBe(0);
    expect(scored.evidenceQuality.sourceClasses).toEqual(["public_business_website"]);
    expect(scored.componentScores
      .find((component) => component.component === "decision_maker_evidence")?.points).toBe(0);
    run.store.close();
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

  it("defaults database retention to false and only enables it on the explicit flag", () => {
    const database = temporaryDatabase();
    expect(parseBatchCanaryArguments(["--confirm-live-batch", "--database", database], REPO_ROOT)
      .retainDatabase).toBe(false);
    expect(parseBatchCanaryArguments(
      ["--confirm-live-batch", "--retain-database", "--database", database], REPO_ROOT,
    ).retainDatabase).toBe(true);
    // Retention is diagnosis-only and never implies a live batch.
    expect(parseBatchCanaryArguments(
      ["--confirm-live-batch", "--retain-database", "--database", database], REPO_ROOT,
    ).enableLiveBatch).toBe(false);
  });

  it("keeps every path containment protection while retention is requested", () => {
    const database = temporaryDatabase();
    // The flag must not smuggle a path past any existing guard.
    expect(() => parseBatchCanaryArguments(
      ["--confirm-live-batch", "--retain-database", "--database", path.join(REPO_ROOT, "inside.sqlite")],
      REPO_ROOT,
    )).toThrow("temp directory");
    expect(() => parseBatchCanaryArguments(
      ["--confirm-live-batch", "--retain-database", "--database", path.join(os.homedir(), "outside.sqlite")],
      REPO_ROOT,
    )).toThrow("temp directory");
    expect(() => parseBatchCanaryArguments(
      ["--confirm-live-batch", "--retain-database", "--database", `${path.dirname(database)}/batch.db`],
      REPO_ROOT,
    )).toThrow("temp directory");
    expect(() => parseBatchCanaryArguments(
      ["--confirm-live-batch", "--retain-database", "--database", "relative.sqlite"], REPO_ROOT,
    )).toThrow("absolute path");
    expect(() => parseBatchCanaryArguments(
      ["--retain-database", "--database", database], REPO_ROOT,
    )).toThrow("confirm");
    writeFileSync(database, "");
    expect(() => parseBatchCanaryArguments(
      ["--confirm-live-batch", "--retain-database", "--database", database], REPO_ROOT,
    )).toThrow("must not already exist");
  });

  it("removes the database and its SQLite companions by default", () => {
    const database = temporaryDatabase();
    const companions = [`${database}-wal`, `${database}-shm`];
    for (const file of [database, ...companions]) writeFileSync(file, "");
    expect(cleanupBatchDatabase(database, false)).toBe(false);
    for (const file of [database, ...companions]) expect(existsSync(file)).toBe(false);
  });

  it("preserves the database and its SQLite companions when retention is enabled", () => {
    const database = temporaryDatabase();
    const companions = [`${database}-wal`, `${database}-shm`];
    for (const file of [database, ...companions]) writeFileSync(file, "");
    expect(cleanupBatchDatabase(database, true)).toBe(true);
    for (const file of [database, ...companions]) expect(existsSync(file)).toBe(true);
  });

  it("wires the parsed retention flag into the cleanup performed in finally", () => {
    // The finally block is only reachable after live discovery creates the store,
    // so the wiring itself is asserted against the production source rather than
    // by injecting a seam into the batch orchestration.
    const source = readFileSync(
      path.join(process.cwd(), "scripts/run-pool-batch-canary.ts"), "utf8",
    );
    expect(source).toContain("cleanupBatchDatabase(args.databasePath, args.retainDatabase)");
    expect(source).toContain("if (store !== null && store.database.open) store.close();");
    // Deletion stays inside the helper, so no second removal path can drift.
    expect(source.match(/rmSync\(/g) ?? []).toHaveLength(2);
  });

  it("pins the mandated bounded batch budgets", () => {
    expect(BATCH_CANARY_LIMITS).toMatchObject({
      targetCallableLeads: 10,
      maxCells: 30,
      maxDiscoveryCandidates: 60,
      maxDiscoveryPasses: 5,
      maxCellsPerPass: 6,
      maxWebsitesAttempted: 20,
      maxPagesPerBusiness: 3,
      maxTotalRequests: 220,
      maxDiscoveryRequests: 180,
      maxTotalCrawlRequests: 60,
      maxDownloadedBytes: 128 * 1024 * 1024,
      maxProcessedBytes: 256 * 1024 * 1024,
      maxCrawlDownloadedBytes: 32 * 1024 * 1024,
      maxCrawlProcessedBytes: 64 * 1024 * 1024,
      maxRuntimeMs: 420_000,
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
