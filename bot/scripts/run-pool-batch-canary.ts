import { existsSync, realpathSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULT_LEAD_POLICY_ROOT } from "../src/lead-engine/config/lead-policy.js";
import { isPathInside } from "../src/lead-engine/config/loader.js";
import { NetworkPolicyAuthorizer } from "../src/lead-engine/config/network-capability.js";
import { loadNicheConfigurations } from "../src/lead-engine/config/niches.js";
import {
  assessmentIdFor,
  createAssessmentStore,
} from "../src/lead-engine/assessment/assessment-store.js";
import { qualifyAndRankBatch } from "../src/lead-engine/assessment/batch-runner.js";
import {
  createEphemeralWebsiteCanaryPolicy,
  WEBSITE_HTTP_PROVIDER_ID,
} from "../src/lead-engine/assessment/website-canary-policy.js";
import {
  runLiveWebsiteAssessment,
  LIVE_WEBSITE_ASSESSMENT_VERSION,
  type LiveWebsiteAssessmentLimits,
} from "../src/lead-engine/assessment/live-website-assessment.js";
import { WEBSITE_ASSESSMENT_POLICY_VERSION } from "../src/lead-engine/validation/website-assessment.js";
import { WebsiteCrawler } from "../src/lead-engine/crawl/crawler.js";
import { createDirectHttpFetcher } from "../src/lead-engine/crawl/fetchers/direct-http.js";
import { validateCrawlLimits } from "../src/lead-engine/crawl/policies.js";
import { discoverSuburbanPhoenixCandidates } from "./overture-suburban-candidates.js";
import {
  calibrateServiceLanguage,
  IDENTITY_CORROBORATION_VERSION,
  SERVICE_LANGUAGE_RULESET_VERSION,
} from "../src/lead-engine/assessment/calibration.js";

/**
 * Phase 5C bounded end-to-end batch canary.
 *
 * discovery → gate → website assessment → identity review → qualification →
 * ranking → persisted internal calling queue.
 *
 * Everything is bounded, the queue is written only into a throwaway database
 * under the OS temp directory, and the report is aggregate-only: no name,
 * domain, phone, email, address, page text, HTML, or raw row is ever printed.
 */

export const BATCH_CANARY_LIMITS = Object.freeze({
  targetCallableLeads: 10,
  maxCells: 30,
  maxDiscoveryCandidates: 60,
  // Discovery runs in bounded passes over distinct cell slices; each pass sits
  // inside the 10,000-row provider rail, so the mandated 50,000-row ceiling is
  // approached in steps rather than by raising any rail.
  maxDiscoveryPasses: 5,
  maxCellsPerPass: 6,
  maxWebsitesAttempted: 20,
  targetEligibleWebsites: 15,
  maxPagesPerBusiness: 3,
  // The mandated 90-request total is split across the two live stages: bounded
  // Overture discovery spends at most 30, so the crawl stage takes 60. That also
  // keeps the crawl inside the ephemeral website policy's own hard rails.
  maxTotalRequests: 220,
  maxDiscoveryRequests: 180,
  maxTotalCrawlRequests: 60,
  // Mandated totals, split across the two live stages. Bounded Overture
  // discovery already spends up to 32 MiB downloaded and 64 MiB processed, so
  // the crawl stage takes the remaining half of each.
  maxDownloadedBytes: 128 * 1024 * 1024,
  maxProcessedBytes: 256 * 1024 * 1024,
  maxCrawlDownloadedBytes: 32 * 1024 * 1024,
  maxCrawlProcessedBytes: 64 * 1024 * 1024,
  maxRuntimeMs: 420_000,
  maxCrawlRuntimeMs: 120_000,
  maxRetriesPerBusiness: 2,
});

export interface PoolBatchReport {
  readonly ran: boolean;
  readonly releaseId: string;
  readonly discovery: Readonly<Record<string, unknown>>;
  readonly websites: Readonly<Record<string, unknown>>;
  readonly calibration: Readonly<Record<string, unknown>>;
  readonly evidence: Readonly<Record<string, number>>;
  readonly qualification: Readonly<Record<string, number>>;
  readonly queue: Readonly<Record<string, unknown>>;
  readonly usage: Readonly<Record<string, number>>;
  readonly aggregateVerdict: string;
  readonly safetyWarnings: ReadonlyArray<string>;
}

export function parseBatchCanaryArguments(
  argv: ReadonlyArray<string>,
  repositoryRoot: string,
): {
  databasePath: string;
  enableLiveBatch: boolean;
  retainDatabase: boolean;
  resume: boolean;
} {
  const values = new Map<string, string | true>();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index] as string;
    if (flag === "--confirm-live-batch" || flag === "--enable-live-batch" ||
      flag === "--retain-database" || flag === "--resume") {
      values.set(flag, true);
      continue;
    }
    if (flag !== "--database") throw new Error(`Unknown batch canary argument: ${flag}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error("Batch canary --database requires a value");
    values.set(flag, value);
    index += 1;
  }
  if (values.get("--confirm-live-batch") !== true) {
    throw new Error("Live batch canary requires --confirm-live-batch");
  }
  const databaseValue = values.get("--database");
  if (typeof databaseValue !== "string" || !path.isAbsolute(databaseValue)) {
    throw new Error("Batch canary database must be an explicit absolute path");
  }
  const databasePath = path.resolve(databaseValue);
  let parent: string;
  try {
    parent = realpathSync(path.dirname(databasePath));
  } catch {
    throw new Error("Batch canary database parent must already exist under the OS temp directory");
  }
  if (isPathInside(path.resolve(repositoryRoot), databasePath) ||
    !isPathInside(realpathSync(os.tmpdir()), parent) ||
    path.extname(databasePath) !== ".sqlite") {
    throw new Error("Batch canary database must be a .sqlite file under the OS temp directory and outside the repository");
  }
  // Resume is the only way an existing artifact is accepted, and it accepts one
  // only after every other path guard above has already passed: still absolute,
  // still a .sqlite file, still under the OS temp directory, still outside the
  // repository. Resuming also implies retention — deleting the artifact you just
  // continued from would defeat the point.
  const resume = values.get("--resume") === true;
  if (existsSync(databasePath) && !resume) {
    throw new Error("Batch canary database path must not already exist");
  }
  if (resume && !existsSync(databasePath)) {
    throw new Error("Batch canary --resume requires an existing retained database");
  }
  return {
    databasePath,
    enableLiveBatch: values.get("--enable-live-batch") === true,
    // Diagnosis-only retention. Default stays false, so the throwaway database is
    // still removed unless retention is asked for explicitly.
    retainDatabase: values.get("--retain-database") === true || resume,
    resume,
  };
}

/**
 * Remove or retain the throwaway batch database and its SQLite companions.
 *
 * Default behaviour is unchanged: the database, -wal, and -shm files are all
 * deleted. With retention the artifact is left in place for read-only
 * inspection, which is the only way per-candidate qualification rows survive the
 * run. Returns whether the artifact was retained.
 */
export function cleanupBatchDatabase(databasePath: string, retain: boolean): boolean {
  if (retain) return true;
  rmSync(databasePath, { force: true });
  for (const suffix of ["-wal", "-shm"]) rmSync(`${databasePath}${suffix}`, { force: true });
  return false;
}

export async function runPoolBatchCanary(input: {
  argv: ReadonlyArray<string>;
  repositoryRoot: string;
}): Promise<PoolBatchReport> {
  const args = parseBatchCanaryArguments(input.argv, input.repositoryRoot);
  const startedAt = Date.now();
  const now = (): Date => new Date();
  const empty = {
    ran: false, releaseId: "not_resolved",
    discovery: {}, websites: {}, calibration: {}, evidence: {}, qualification: {}, queue: {},
    usage: {}, aggregateVerdict: "blocked_live_batch_disabled",
    safetyWarnings: ["live_batch_disabled_by_default"],
  } satisfies PoolBatchReport;
  if (!args.enableLiveBatch) return empty;

  // Stage 1 — bounded live discovery over deterministic suburban cells.
  const passes: Awaited<ReturnType<typeof discoverSuburbanPhoenixCandidates>>[] = [];
  const eligibleByKey = new Map<string, (typeof passes)[number]["summary"]["eligibleWebsiteCandidates"][number]>();
  const seenHosts = new Set<string>();
  for (let pass = 0; pass < BATCH_CANARY_LIMITS.maxDiscoveryPasses; pass += 1) {
    if (eligibleByKey.size >= BATCH_CANARY_LIMITS.targetEligibleWebsites) break;
    const outcome = await discoverSuburbanPhoenixCandidates({
      maxCells: BATCH_CANARY_LIMITS.maxCellsPerPass,
      cellOffset: pass * BATCH_CANARY_LIMITS.maxCellsPerPass,
      targetWebsiteCandidates: BATCH_CANARY_LIMITS.targetEligibleWebsites,
      maxAcceptedCandidates: BATCH_CANARY_LIMITS.maxDiscoveryCandidates,
    });
    passes.push(outcome);
    for (const found of outcome.summary.eligibleWebsiteCandidates) {
      if (eligibleByKey.has(found.candidateKey) || seenHosts.has(found.candidateHost)) continue;
      eligibleByKey.set(found.candidateKey, found);
      seenHosts.add(found.candidateHost);
    }
  }
  const discovery = passes[0];
  if (!discovery) throw new Error("Bounded calibration produced no discovery pass");
  const eligible = [...eligibleByKey.values()].slice(0, BATCH_CANARY_LIMITS.maxWebsitesAttempted);
  // Every pass plans from the same targets, configuration, and query version, so
  // they share one manifest identity and differ only in which slice of cells they
  // took. Unioning the slices gives the whole market this batch planned.
  const coverage = {
    ...discovery.coverage,
    cells: Object.freeze([...new Map(
      passes.flatMap((pass) => pass.coverage.cells).map((cell) => [cell.coverageKey, cell]),
    ).values()]),
  };
  // The cells actually queried, across every pass. Using only the first pass left
  // a candidate found in a later pass outside the queue scope and outside the
  // selected market, which is a lineage falsehood rather than a real rejection.
  const queriedCoverageKeys = [...new Set(
    passes.flatMap((pass) => pass.summary.perCell.map((cell) => cell.coverageCellSafeId)),
  )].sort();
  const discoveryTotals = passes.reduce((totals, pass) => ({
    cellsPlanned: totals.cellsPlanned + pass.summary.cellsPlanned,
    cellsQueried: totals.cellsQueried + pass.summary.cellsQueried,
    rows: totals.rows + pass.rowsConsidered,
    rowsScanned: totals.rowsScanned + pass.rowsScanned,
    rowsMaterialised: totals.rowsMaterialised + pass.rowsMaterialised,
    earlyFilteredGroups: totals.earlyFilteredGroups + pass.earlyFilteredGroups,
    statisticsPrunedGroups: totals.statisticsPrunedGroups + pass.statisticsPrunedGroups,
    requests: totals.requests + pass.requests,
    bytes: totals.bytes + pass.downloadedBytes,
    processed: totals.processed + pass.processedBytes,
    envelopes: totals.envelopes + pass.summary.envelopesConsidered,
    accepted: totals.accepted + pass.summary.acceptedCandidates,
    duplicates: totals.duplicates + pass.summary.duplicatesAcrossCells,
  }), { cellsPlanned: 0, cellsQueried: 0, rows: 0, rowsScanned: 0, rowsMaterialised: 0,
       earlyFilteredGroups: 0, statisticsPrunedGroups: 0, requests: 0, bytes: 0, processed: 0, envelopes: 0, accepted: 0, duplicates: 0 });
  const gateBlockedTotals: Record<string, number> = {};
  for (const pass of passes) {
    for (const [key, value] of Object.entries(pass.summary.gateBlockedCounts)) {
      gateBlockedTotals[key] = (gateBlockedTotals[key] ?? 0) + value;
    }
  }

  const limits: LiveWebsiteAssessmentLimits = {
    maxBusinessesAttempted: BATCH_CANARY_LIMITS.maxWebsitesAttempted,
    maxWebsitesAssessed: BATCH_CANARY_LIMITS.maxWebsitesAttempted,
    maxPagesPerBusiness: BATCH_CANARY_LIMITS.maxPagesPerBusiness,
    maxRequestsPerBusiness: 6,
    maxTotalRequests: BATCH_CANARY_LIMITS.maxTotalCrawlRequests,
    maxDownloadedBytes: BATCH_CANARY_LIMITS.maxCrawlDownloadedBytes,
    maxProcessedBytes: BATCH_CANARY_LIMITS.maxCrawlProcessedBytes,
    maxDurationMs: BATCH_CANARY_LIMITS.maxCrawlRuntimeMs,
    maxRetriesPerBusiness: BATCH_CANARY_LIMITS.maxRetriesPerBusiness,
  };

  const policy = createEphemeralWebsiteCanaryPolicy({
    checkedInConfigurationRoot: DEFAULT_LEAD_POLICY_ROOT,
    maxRequests: limits.maxTotalRequests,
    maxBytes: limits.maxDownloadedBytes,
    maxDurationMs: limits.maxDurationMs,
  });
  let databaseCreated = false;
  // Hoisted so the finally block can close the handle on the failure path too,
  // rather than leaving a live -wal behind next to a retained database.
  let store: ReturnType<typeof createAssessmentStore> | null = null;
  const contacted = new Set<string>();
  try {
    const runId = "pool-batch-canary";
    const scopeId = "pool-batch-canary-scope";
    store = createAssessmentStore({
      databasePath: args.databasePath,
      repositoryRoot: input.repositoryRoot,
      candidates: eligible,
      now,
      coverage,
    });
    databaseCreated = true;
    const niche = loadNicheConfigurations().get("pool_service");
    if (!niche) throw new Error("Batch canary requires a configured pool_service niche");

    const capability = new NetworkPolicyAuthorizer(policy.policy, { now: Date.now })
      .issuePublicWebCapability({
        providerId: WEBSITE_HTTP_PROVIDER_ID,
        runId, assessmentId: scopeId, operation: "website_assessment",
        maxRequests: limits.maxTotalRequests, maxBytes: limits.maxDownloadedBytes,
        maxBytesPerRequest: 512 * 1024, maxRequestDurationMs: 15_000,
        costBudgetMicroUsd: 0, ttlMs: limits.maxDurationMs,
      });
    const crawlLimits = validateCrawlLimits({
      maxPages: limits.maxPagesPerBusiness,
      maxSitemapFiles: 1, maxSitemapUrls: 20, maxRedirects: 3,
      maxRetries: limits.maxRetriesPerBusiness,
      maxCompressedBytes: 512 * 1024, maxDecompressedBytes: 1024 * 1024,
      connectionTimeoutMs: 5_000, responseTimeoutMs: 10_000,
      crawlDurationMs: 20_000, sameDomainConcurrency: 1,
    });

    // Stage 2 — bounded website assessment persisting the live evidence chain.
    const websites = await runLiveWebsiteAssessment({
      candidates: eligible,
      limits, niche, now,
      assessmentId: (candidate) => assessmentIdFor(runId, candidate),
      createCrawler: (candidate) => {
        contacted.add(candidate.candidateHost);
        return new WebsiteCrawler({
          fetcher: createDirectHttpFetcher({
            capability, providerId: WEBSITE_HTTP_PROVIDER_ID, runId,
            assessmentId: scopeId, operation: "website_assessment", limits: crawlLimits,
          }),
          limits: crawlLimits,
          now,
        });
      },
      sink: store.sink,
    });

    // Stage 3 — qualification and deterministic ranking over persisted evidence.
    const evaluatedAt = new Date(now().getTime()).toISOString();
    const assessments = store.assessmentBusinessIds()
      .map((row) => ({ assessmentId: row.assessmentId, businessId: row.businessId }));
    const queue = qualifyAndRankBatch({
      database: store.database,
      assessments,
      runId,
      evaluatedAt,
      maximumCallable: BATCH_CANARY_LIMITS.targetCallableLeads,
      maximumReview: BATCH_CANARY_LIMITS.maxWebsitesAttempted,
      coverageKeys: queriedCoverageKeys,
      signal: new AbortController().signal,
    });

    const calibration = calibrateServiceLanguage({
      observationsBySite: websites.serviceLanguageBySite,
    });
    const evidence = store.evidenceCounts();
    return {
      ran: true,
      releaseId: discovery.releaseId,
      discovery: {
        passes: passes.length,
        cellsPlanned: discoveryTotals.cellsPlanned,
        cellsQueried: discoveryTotals.cellsQueried,
        rowsConsidered: discoveryTotals.rows,
        filteringLevel: "client_side_early_column_projection_with_row_group_statistics_pruning",
        rowsScanned: discoveryTotals.rowsScanned,
        rowsMaterialised: discoveryTotals.rowsMaterialised,
        earlyFilteredGroups: discoveryTotals.earlyFilteredGroups,
        statisticsPrunedGroups: discoveryTotals.statisticsPrunedGroups,
        envelopesConsidered: discoveryTotals.envelopes,
        acceptedCandidates: discoveryTotals.accepted,
        eligibleCandidates: eligible.length,
        duplicatesAcrossCells: discoveryTotals.duplicates,
        gateBlockedCounts: gateBlockedTotals,
        cellsPersisted: coverage.cells.length,
        cellsSelectedAsMarket: queriedCoverageKeys.length,
        stopReason: passes[passes.length - 1]?.summary.stopReason ?? "not_started",
      },
      calibration: {
        rulesetVersion: SERVICE_LANGUAGE_RULESET_VERSION,
        identityVersion: IDENTITY_CORROBORATION_VERSION,
        sitesObserved: calibration.sitesObserved,
        minimumIndependentSites: calibration.minimumIndependentSites,
        promoted: calibration.promoted,
        rejected: calibration.rejected,
        familyCounts: calibration.familyCounts,
        identityDecisions: websites.identityDecisions,
      },
      websites: {
        attempted: websites.businessesAttempted,
        assessed: websites.websitesAssessed,
        identityReview: websites.identityReview,
        blockedCounts: websites.blockedCounts,
        duplicateAssessmentsSkipped: websites.duplicateAssessmentsSkipped,
        pages: websites.pages,
        opportunitySignals: websites.opportunitySignals,
        publicContactCandidates: websites.publicContactCandidates,
        publicPersonCandidates: websites.publicPersonCandidates,
        stopReason: websites.stopReason,
      },
      evidence: { ...evidence },
      qualification: {
        evaluated: queue.evaluated,
        skippedAlreadyEvaluated: queue.skippedAlreadyEvaluated,
        ...queue.qualificationCounts,
      },
      queue: {
        callableQueueSize: queue.callableQueueSize,
        reviewQueueSize: queue.reviewQueueSize,
        notEligible: queue.notEligible,
        priorityBands: queue.priorityBands,
        state: queue.queueState,
        snapshotPersisted: queue.snapshotId !== null,
      },
      usage: {
        discoveryRequests: discoveryTotals.requests,
        discoveryBytes: discoveryTotals.bytes,
        discoveryProcessedBytes: discoveryTotals.processed,
        websiteRequests: websites.requests,
        websiteDownloadedBytes: websites.downloadedBytes,
        websiteProcessedBytes: websites.processedBytes,
        totalRequests: discoveryTotals.requests + websites.requests,
        approvedWebsiteHostsContacted: contacted.size,
        elapsedMs: Date.now() - startedAt,
      },
      aggregateVerdict: queue.callableQueueSize > 0 ? "completed" : "completed_no_callable_lead",
      safetyWarnings: [],
    };
  } catch (error) {
    return {
      ...empty,
      aggregateVerdict: "blocked_batch_policy",
      safetyWarnings: [error instanceof Error ? error.name : "unknown_batch_error"],
      usage: { elapsedMs: Date.now() - startedAt },
    };
  } finally {
    policy.cleanup();
    // Every connection is closed normally before the artifact is reported or
    // inspected, on both the success and the failure path.
    if (store !== null && store.database.open) store.close();
    if (databaseCreated && existsSync(args.databasePath)) {
      const retained = cleanupBatchDatabase(args.databasePath, args.retainDatabase);
      if (retained) {
        // Aggregate-safe: a temp-directory path, never a lead value or secret.
        process.stderr.write(`retained batch canary database: ${args.databasePath}\n`);
      }
    }
  }
}

async function main(): Promise<void> {
  const report = await runPoolBatchCanary({
    argv: process.argv.slice(2),
    repositoryRoot: path.resolve(process.cwd(), ".."),
  });
  console.log(JSON.stringify(report));
  if (!report.ran) process.exitCode = 2;
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (entry === import.meta.url) {
  void main().catch((error: unknown) => {
    console.error(JSON.stringify({
      aggregateVerdict: "canary_rejected",
      safetyWarnings: [error instanceof Error ? error.message : "unknown_batch_error"],
      policyVersions: [WEBSITE_ASSESSMENT_POLICY_VERSION, LIVE_WEBSITE_ASSESSMENT_VERSION],
    }));
    process.exitCode = 1;
  });
}
