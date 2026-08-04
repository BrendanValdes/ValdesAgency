import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULT_LEAD_POLICY_ROOT } from "../src/lead-engine/config/lead-policy.js";
import { isPathInside } from "../src/lead-engine/config/loader.js";
import { NetworkPolicyAuthorizer } from "../src/lead-engine/config/network-capability.js";
import { loadNicheConfigurations } from "../src/lead-engine/config/niches.js";
import {
  assessmentIdFor,
  createAssessmentStore,
  type AssessmentStore,
} from "../src/lead-engine/assessment/assessment-store.js";
import { qualifyAndRankBatch } from "../src/lead-engine/assessment/batch-runner.js";
import {
  createEphemeralWebsiteCanaryPolicy,
  WEBSITE_HTTP_PROVIDER_ID,
} from "../src/lead-engine/assessment/website-canary-policy.js";
import {
  runLiveWebsiteAssessment,
  type LiveWebsiteAssessmentLimits,
} from "../src/lead-engine/assessment/live-website-assessment.js";
import {
  marketIdForLabel,
  planPoolServiceMarketCoverage,
  POOL_SERVICE_MARKETS,
  POOL_SERVICE_MARKET_WINDOW_VERSION,
} from "../src/lead-engine/assessment/market-windows.js";
import { WebsiteCrawler } from "../src/lead-engine/crawl/crawler.js";
import { createDirectHttpFetcher } from "../src/lead-engine/crawl/fetchers/direct-http.js";
import { validateCrawlLimits } from "../src/lead-engine/crawl/policies.js";
import { discoverSuburbanPhoenixCandidates } from "./overture-suburban-candidates.js";
import type { EligibleCandidate } from "../src/lead-engine/assessment/candidate-gate.js";
import type { CoverageCell, CoverageManifest } from "../src/lead-engine/geography/types.js";

/**
 * Bounded multi-market pool-service lead batch.
 *
 * Same production path as the Phase 5C canary — discovery, admission gate, live
 * website assessment, identity corroboration, qualification, deterministic
 * ranking, persisted internal queue — run at the volume needed for a usable book
 * of leads instead of a smoke test.
 *
 * Two things differ from the canary and nothing else does:
 *   1. coverage windows are sized to the measured provider read window and tiled
 *      across several configured markets, so decoded rows land inside the cell
 *      that paid for them (the instrumented pass measured 59% of decoded rows
 *      falling outside the old 20 km² cells);
 *   2. the artifact is durable, written through the existing production database
 *      mode which enforces 0700 on the directory and 0600 on the file.
 *
 * Read-only discovery and bounded public HTTPS GETs only. No form, message,
 * call, booking, CRM write, import, export to a third party, notification,
 * publication, paid integration, or account change exists anywhere in this path.
 * The queue lives only as rows in the batch's own database.
 */

/**
 * Explicit budgets.
 *
 * Every ceiling below is the measured requirement plus ~20% headroom, derived
 * from the instrumented 2-cell pass (2,000 rows, 2.23 MB and ~5.5 requests per
 * cell, ~0.12% of in-cell rows are pool-service candidates) and from the Phase 5C
 * batch (gate admits ~50% of envelopes; crawl costs 2.6 requests and ~95 KiB per
 * site). Nothing here raises a provider hard cap: the tracker still refuses more
 * than 10,000 rows, 32 asset requests, 16 asset inspections, and 256 MiB per
 * pass, and the assessment stage still refuses more than 25 businesses, 100
 * requests, 32 MiB, and 120 s per invocation.
 */
export const POOL_LEAD_BATCH_BUDGETS = Object.freeze({
  /** Assessed unique candidates the batch aims for. */
  targetAssessedCandidates: 100,
  /** Eligible candidates to collect before assessment starts. */
  targetEligibleCandidates: 130,
  /** Cells per discovery pass: 5 x 2,000 rows saturates the 10,000-row cap. */
  cellsPerPass: 5,
  /** Cells are the scarce resource: 5 per pass, ~440 windows across 4 markets. */
  maxDiscoveryPasses: 320,
  maxWindowsPerMarket: 600,
  /**
   * Businesses per assessment invocation.
   *
   * The binding rail is the ephemeral website policy's 64-request hard cap, not
   * the assessment stage's 25-business cap. At the measured 2.6 requests per site
   * plus robots, 16 sites per chunk needs ~50 requests — the cap with ~20% spare.
   */
  assessmentChunkSize: 16,
  maxPagesPerBusiness: 2,
  maxRequestsPerBusiness: 4,
  maxRequestsPerAssessmentChunk: 64,
  maxBytesPerAssessmentChunk: 32 * 1024 * 1024,
  maxProcessedBytesPerAssessmentChunk: 64 * 1024 * 1024,
  maxAssessmentChunkDurationMs: 110_000,
  maxRetriesPerBusiness: 1,
  /** Whole-run rails, checked between stages. */
  maxDiscoveryRequests: 2_000,
  maxDiscoveryBytes: 1_200 * 1024 * 1024,
  maxCrawlRequests: 700,
  maxCrawlBytes: 48 * 1024 * 1024,
  maxRuntimeMs: 5_400_000,
});

export interface PoolLeadBatchPaths {
  readonly dataRoot: string;
  readonly databasePath: string;
  readonly csvPath: string;
  readonly summaryPath: string;
}

export interface PoolLeadBatchArguments {
  readonly dataRoot: string;
  readonly enableLiveBatch: boolean;
  readonly marketIds: ReadonlyArray<string>;
  readonly targetEligible: number;
}

/**
 * Durable artifact root guard.
 *
 * Requires an explicit absolute path outside the repository, and refuses the OS
 * temp directory so a run that is meant to survive cannot silently land somewhere
 * that gets swept. The directory is created 0700 and every file written 0600.
 */
export function resolveBatchPaths(dataRoot: string, repositoryRoot: string): PoolLeadBatchPaths {
  if (!path.isAbsolute(dataRoot)) throw new Error("Lead batch data root must be an absolute path");
  const resolved = path.resolve(dataRoot);
  if (isPathInside(path.resolve(repositoryRoot), resolved)) {
    throw new Error("Lead batch data root must stay outside the repository");
  }
  if (resolved === path.resolve("/tmp") || isPathInside(path.resolve("/tmp"), resolved)) {
    throw new Error("Lead batch data root must be durable, not under /tmp");
  }
  return Object.freeze({
    dataRoot: resolved,
    databasePath: path.join(resolved, "pool-lead-batch.sqlite"),
    csvPath: path.join(resolved, "pool-lead-batch.csv"),
    summaryPath: path.join(resolved, "pool-lead-batch-summary.json"),
  });
}

export function parsePoolLeadBatchArguments(argv: ReadonlyArray<string>): PoolLeadBatchArguments {
  let dataRoot: string | null = null;
  let enableLiveBatch = false;
  let confirmed = false;
  let marketIds: string[] = POOL_SERVICE_MARKETS.map((market) => market.id);
  let targetEligible: number = POOL_LEAD_BATCH_BUDGETS.targetEligibleCandidates;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index] as string;
    if (flag === "--confirm-live-batch") { confirmed = true; continue; }
    if (flag === "--enable-live-batch") { enableLiveBatch = true; continue; }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Lead batch argument ${flag} requires a value`);
    index += 1;
    if (flag === "--data-root") { dataRoot = value; continue; }
    if (flag === "--markets") {
      marketIds = value.split(",").map((entry) => entry.trim()).filter(Boolean);
      continue;
    }
    if (flag === "--target-eligible") {
      targetEligible = Number(value);
      continue;
    }
    throw new Error(`Unknown lead batch argument: ${flag}`);
  }
  if (!confirmed) throw new Error("Live lead batch requires --confirm-live-batch");
  if (dataRoot === null) throw new Error("Lead batch requires --data-root");
  if (marketIds.length < 2 || marketIds.length > 5) {
    throw new Error("Lead batch requires between two and five configured markets");
  }
  for (const id of marketIds) {
    if (!POOL_SERVICE_MARKETS.some((market) => market.id === id)) {
      throw new Error(`Unknown pool-service market: ${id}`);
    }
  }
  if (!Number.isSafeInteger(targetEligible) || targetEligible < 1 || targetEligible > 400) {
    throw new Error("Lead batch eligible target must be an integer between 1 and 400");
  }
  return Object.freeze({ dataRoot, enableLiveBatch, marketIds: Object.freeze(marketIds), targetEligible });
}

/** Slice one market's windows into row-budget-sized passes. */
export function marketPasses(
  coverage: CoverageManifest,
  cellsPerPass: number,
): ReadonlyArray<CoverageManifest> {
  const passes: CoverageManifest[] = [];
  for (let index = 0; index < coverage.cells.length; index += cellsPerPass) {
    passes.push(Object.freeze({
      ...coverage,
      cells: Object.freeze(coverage.cells.slice(index, index + cellsPerPass)),
    }));
  }
  return Object.freeze(passes);
}

interface DiscoveredCandidate {
  readonly candidate: EligibleCandidate;
  readonly marketId: string;
}

function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export interface PoolLeadBatchReport {
  readonly ran: boolean;
  readonly releaseIds: ReadonlyArray<string>;
  readonly markets: ReadonlyArray<string>;
  readonly windowVersion: string;
  readonly discovery: Readonly<Record<string, unknown>>;
  readonly assessment: Readonly<Record<string, unknown>>;
  readonly evidence: Readonly<Record<string, number>>;
  readonly qualification: Readonly<Record<string, number>>;
  readonly queue: Readonly<Record<string, unknown>>;
  readonly usage: Readonly<Record<string, number>>;
  readonly budgets: Readonly<Record<string, number>>;
  readonly artifacts: Readonly<Record<string, string>>;
  readonly aggregateVerdict: string;
  readonly safetyWarnings: ReadonlyArray<string>;
}

export async function runPoolLeadBatch(input: {
  argv: ReadonlyArray<string>;
  repositoryRoot: string;
}): Promise<PoolLeadBatchReport> {
  const args = parsePoolLeadBatchArguments(input.argv);
  const paths = resolveBatchPaths(args.dataRoot, input.repositoryRoot);
  const startedAt = Date.now();
  const now = (): Date => new Date();
  const empty = {
    ran: false, releaseIds: [], markets: args.marketIds,
    windowVersion: POOL_SERVICE_MARKET_WINDOW_VERSION,
    discovery: {}, assessment: {}, evidence: {}, qualification: {}, queue: {},
    usage: {}, budgets: { ...POOL_LEAD_BATCH_BUDGETS }, artifacts: {},
    aggregateVerdict: "blocked_live_batch_disabled",
    safetyWarnings: ["live_batch_disabled_by_default"],
  } satisfies PoolLeadBatchReport;
  if (!args.enableLiveBatch) return empty;

  mkdirSync(paths.dataRoot, { recursive: true, mode: 0o700 });
  chmodSync(paths.dataRoot, 0o700);

  // Stage 1 — bounded read-only discovery, market by market.
  const discovered = new Map<string, DiscoveredCandidate>();
  const seenHosts = new Set<string>();
  const releaseIds = new Set<string>();
  const perMarket: Array<Record<string, unknown>> = [];
  const observedCategories: Record<string, number> = {};
  const coverageCells = new Map<string, CoverageCell>();
  let discoveryRequests = 0;
  let discoveryBytes = 0;
  let discoveryProcessedBytes = 0;
  let discoveryRowsScanned = 0;
  let passesRun = 0;
  const funnel = {
    decodedRows: 0, rejectedOutsideCell: 0, rejectedDuplicateId: 0,
    rejectedByCategory: 0, acceptedCandidates: 0,
    envelopesConsidered: 0, gateEligible: 0, duplicatesAcrossCells: 0,
    rangeCacheHits: 0, rangeCacheMisses: 0, assetHandleReuses: 0,
  };
  const gateBlocked: Record<string, number> = {};
  let discoveryStop = "target_reached";

  outer: for (const marketId of args.marketIds) {
    const market = planPoolServiceMarketCoverage({
      configurationVersion: "1.0.0",
      queryVersion: "pool-lead-batch-1.0.0",
      marketIds: [marketId],
      maxWindows: POOL_LEAD_BATCH_BUDGETS.maxWindowsPerMarket,
    });
    let marketEligible = 0;
    for (const pass of marketPasses(market, POOL_LEAD_BATCH_BUDGETS.cellsPerPass)) {
      if (discovered.size >= args.targetEligible) { discoveryStop = "target_reached"; break outer; }
      if (passesRun >= POOL_LEAD_BATCH_BUDGETS.maxDiscoveryPasses) {
        discoveryStop = "pass_budget_exhausted"; break outer;
      }
      if (discoveryRequests >= POOL_LEAD_BATCH_BUDGETS.maxDiscoveryRequests) {
        discoveryStop = "request_budget_exhausted"; break outer;
      }
      if (discoveryBytes >= POOL_LEAD_BATCH_BUDGETS.maxDiscoveryBytes) {
        discoveryStop = "byte_budget_exhausted"; break outer;
      }
      if (Date.now() - startedAt >= POOL_LEAD_BATCH_BUDGETS.maxRuntimeMs) {
        discoveryStop = "runtime_budget_exhausted"; break outer;
      }
      passesRun += 1;
      let outcome;
      try {
        outcome = await discoverSuburbanPhoenixCandidates({
          coverage: pass,
          maxCells: pass.cells.length,
          targetWebsiteCandidates: Math.max(1, args.targetEligible - discovered.size),
          maxAcceptedCandidates: 60,
        });
      } catch (error) {
        // A pass that cannot resolve a partition or exhausts a provider rail is a
        // bounded stop for that window slice, not a batch failure.
        perMarket.push({
          marketId, pass: passesRun, status: "failed",
          reason: error instanceof Error ? error.name : "unknown_pass_error",
        });
        continue;
      }
      releaseIds.add(outcome.releaseId);
      for (const cell of pass.cells) coverageCells.set(cell.coverageKey, cell);
      discoveryRequests += outcome.metrics.requests;
      discoveryBytes += outcome.metrics.downloadedBytes;
      discoveryProcessedBytes += outcome.metrics.processedBytes;
      discoveryRowsScanned += outcome.metrics.rowsScanned;
      funnel.decodedRows += outcome.metrics.decodedRows;
      funnel.rejectedOutsideCell += outcome.metrics.rejectedOutsideCell;
      funnel.rejectedDuplicateId += outcome.metrics.rejectedDuplicateId;
      funnel.rejectedByCategory += outcome.metrics.rejectedByCategory;
      funnel.acceptedCandidates += outcome.metrics.acceptedCandidates;
      funnel.envelopesConsidered += outcome.metrics.envelopesConsidered;
      funnel.gateEligible += outcome.metrics.gateEligible;
      funnel.duplicatesAcrossCells += outcome.metrics.duplicatesAcrossCells;
      funnel.rangeCacheHits += outcome.metrics.rangeCacheHits;
      funnel.rangeCacheMisses += outcome.metrics.rangeCacheMisses;
      funnel.assetHandleReuses += outcome.metrics.assetHandleReuses;
      for (const [key, count] of Object.entries(outcome.metrics.observedCategories)) {
        observedCategories[key] = (observedCategories[key] ?? 0) + count;
      }
      for (const [key, count] of Object.entries(outcome.summary.gateBlockedCounts)) {
        gateBlocked[key] = (gateBlocked[key] ?? 0) + count;
      }
      for (const candidate of outcome.summary.eligibleWebsiteCandidates) {
        // Cross-market dedupe on the same keys the gate uses inside one pass:
        // provider place key and candidate host.
        if (discovered.has(candidate.candidateKey) || seenHosts.has(candidate.candidateHost)) {
          funnel.duplicatesAcrossCells += 1;
          continue;
        }
        discovered.set(candidate.candidateKey, { candidate, marketId });
        seenHosts.add(candidate.candidateHost);
        marketEligible += 1;
        if (discovered.size >= args.targetEligible) break;
      }
      perMarket.push({
        marketId, pass: passesRun, status: "complete",
        cells: pass.cells.length,
        rowsScanned: outcome.metrics.rowsScanned,
        eligible: outcome.summary.eligibleWebsiteCandidates.length,
        stopReason: outcome.summary.stopReason,
      });
    }
    perMarket.push({ marketId, status: "market_complete", eligible: marketEligible });
  }

  const eligible = [...discovered.values()];
  const marketByKey = new Map(eligible.map((entry) => [entry.candidate.candidateKey, entry.marketId]));

  // Stage 2 — bounded assessment, in chunks the assessment stage will accept.
  const coverage: CoverageManifest | null = coverageCells.size > 0
    ? Object.freeze({
        ...planPoolServiceMarketCoverage({
          configurationVersion: "1.0.0",
          queryVersion: "pool-lead-batch-1.0.0",
          marketIds: args.marketIds,
        }),
        cells: Object.freeze([...coverageCells.values()]),
      })
    : null;

  try {
    // Stages 2 through 4 are the shared live path, entered here with this
    // batch's own discovery output, limits, and coverage lineage.
    const stages = await assessQualifyAndExport({
      candidates: eligible.map((entry) => entry.candidate),
      coverage,
      coverageKeys: [...coverageCells.keys()],
      marketByKey,
      paths,
      repositoryRoot: input.repositoryRoot,
      runId: "pool-lead-batch",
      limits: POOL_LEAD_BATCH_BUDGETS,
      deadlineAt: startedAt + POOL_LEAD_BATCH_BUDGETS.maxRuntimeMs,
      now,
    });
    const report: PoolLeadBatchReport = {
      ran: true,
      releaseIds: Object.freeze([...releaseIds].sort()),
      markets: args.marketIds,
      windowVersion: POOL_SERVICE_MARKET_WINDOW_VERSION,
      discovery: {
        passesRun,
        cellsQueried: coverageCells.size,
        rowsScanned: discoveryRowsScanned,
        ...funnel,
        inCellRate: funnel.decodedRows > 0
          ? Number(((funnel.decodedRows - funnel.rejectedOutsideCell) / funnel.decodedRows).toFixed(4))
          : null,
        eligibleUnique: eligible.length,
        gateBlockedCounts: gateBlocked,
        observedCategories,
        perMarket,
        stopReason: discoveryStop,
      },
      assessment: stages.assessment,
      evidence: stages.evidence,
      qualification: stages.qualification,
      queue: stages.queue,
      usage: {
        discoveryRequests, discoveryBytes, discoveryProcessedBytes,
        crawlRequests: stages.crawl.requests,
        crawlBytes: stages.crawl.downloadedBytes,
        crawlProcessedBytes: stages.crawl.processedBytes,
        totalRequests: discoveryRequests + stages.crawl.requests,
        elapsedMs: Date.now() - startedAt,
      },
      budgets: { ...POOL_LEAD_BATCH_BUDGETS },
      artifacts: {
        dataRoot: paths.dataRoot,
        databasePath: paths.databasePath,
        csvPath: paths.csvPath,
        summaryPath: paths.summaryPath,
      },
      aggregateVerdict: stages.rowCount >= POOL_LEAD_BATCH_BUDGETS.targetAssessedCandidates
        ? "completed" : "completed_below_target",
      safetyWarnings: [],
    };
    writeFileSync(paths.summaryPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    chmodSync(paths.summaryPath, 0o600);
    return report;
  } catch (error) {
    return {
      ...empty,
      ran: false,
      aggregateVerdict: "blocked_batch_policy",
      safetyWarnings: [error instanceof Error ? `${error.name}: ${error.message}` : "unknown_batch_error"],
      usage: { elapsedMs: Date.now() - startedAt },
      artifacts: { dataRoot: paths.dataRoot, databasePath: paths.databasePath },
    };
  }
}

/**
 * Ceilings stages 2 through 4 enforce. Every field is a limit, never a target,
 * and none of them can raise a provider hard cap: the assessment stage still
 * refuses more than 25 businesses, 100 requests, 32 MiB, and 120 s per
 * invocation whatever is passed here.
 */
export interface AssessmentStageLimits {
  readonly assessmentChunkSize: number;
  readonly maxPagesPerBusiness: number;
  readonly maxRequestsPerBusiness: number;
  readonly maxRequestsPerAssessmentChunk: number;
  readonly maxBytesPerAssessmentChunk: number;
  readonly maxProcessedBytesPerAssessmentChunk: number;
  readonly maxAssessmentChunkDurationMs: number;
  readonly maxRetriesPerBusiness: number;
  readonly maxCrawlRequests: number;
  readonly maxCrawlBytes: number;
}

export interface AssessmentStageResult {
  readonly assessment: Readonly<Record<string, unknown>>;
  readonly evidence: Readonly<Record<string, number>>;
  readonly qualification: Readonly<Record<string, number>>;
  /** Typed rather than a loose record: callers gate their verdict on these. */
  readonly queue: Readonly<{
    callableQueueSize: number;
    reviewQueueSize: number;
    notEligible: number;
    priorityBands: Readonly<Record<string, number>>;
    state: string;
    snapshotPersisted: boolean;
  }>;
  readonly crawl: Readonly<{
    requests: number;
    downloadedBytes: number;
    processedBytes: number;
    pages: number;
  }>;
  /** Rows written to the private CSV. */
  readonly rowCount: number;
}

/**
 * Stages 2 through 4 of the live path: bounded website assessment, then
 * qualification and deterministic ranking over the persisted evidence, then the
 * durable private exports.
 *
 * Extracted from runPoolLeadBatch with no behavior change, so a second discovery
 * source runs this identical path instead of growing a parallel one. Discovery is
 * the only thing that differs between callers; admissibility, identity, scoring,
 * ranking, and export are shared here by construction.
 *
 * Read-only crawling of public HTTPS pages only. No form, message, call, booking,
 * CRM write, import, third-party export, notification, publication, paid
 * integration, or account change exists in this path.
 */
export async function assessQualifyAndExport(input: {
  readonly candidates: ReadonlyArray<EligibleCandidate>;
  readonly coverage: CoverageManifest | null;
  /** Cells that scope both the geography hard rule and the generated queue. */
  readonly coverageKeys: ReadonlyArray<string>;
  /** Candidate key to market label, for the private CSV only. */
  readonly marketByKey: ReadonlyMap<string, string>;
  readonly paths: PoolLeadBatchPaths;
  readonly repositoryRoot: string;
  readonly runId: string;
  readonly limits: AssessmentStageLimits;
  /** Absolute wall-clock deadline for the whole stage, in epoch milliseconds. */
  readonly deadlineAt: number;
  readonly now: () => Date;
}): Promise<AssessmentStageResult> {
  const { limits, paths, runId, now } = input;
  let store: AssessmentStore | null = null;
  const contacted = new Set<string>();
  const assessmentChunks: Array<Record<string, unknown>> = [];
  let crawlRequests = 0;
  let crawlBytes = 0;
  let crawlProcessedBytes = 0;
  let crawlPages = 0;
  const blockedCounts: Record<string, number> = {};
  let identityReview = 0;
  let websitesAssessed = 0;
  let duplicateAssessmentsSkipped = 0;
  try {
    store = createAssessmentStore({
      databasePath: paths.databasePath,
      dataRoot: paths.dataRoot,
      repositoryRoot: input.repositoryRoot,
      candidates: input.candidates,
      coverage: input.coverage,
      now,
    });
    const niche = loadNicheConfigurations().get("pool_service");
    if (!niche) throw new Error("Lead batch requires a configured pool_service niche");

    const chunkSize = Math.min(limits.assessmentChunkSize, 25);
    for (let start = 0; start < input.candidates.length; start += chunkSize) {
      if (crawlRequests >= limits.maxCrawlRequests) break;
      if (crawlBytes >= limits.maxCrawlBytes) break;
      if (Date.now() >= input.deadlineAt) break;
      const chunk = input.candidates.slice(start, start + chunkSize);
      const assessmentLimits: LiveWebsiteAssessmentLimits = {
        maxBusinessesAttempted: chunk.length,
        maxWebsitesAssessed: chunk.length,
        maxPagesPerBusiness: limits.maxPagesPerBusiness,
        maxRequestsPerBusiness: limits.maxRequestsPerBusiness,
        maxTotalRequests: limits.maxRequestsPerAssessmentChunk,
        maxDownloadedBytes: limits.maxBytesPerAssessmentChunk,
        maxProcessedBytes: limits.maxProcessedBytesPerAssessmentChunk,
        maxDurationMs: limits.maxAssessmentChunkDurationMs,
        maxRetriesPerBusiness: limits.maxRetriesPerBusiness,
      };
      // A fresh ephemeral policy and capability per chunk, each scoped to that
      // chunk's own request, byte, and duration ceilings.
      const policy = createEphemeralWebsiteCanaryPolicy({
        checkedInConfigurationRoot: DEFAULT_LEAD_POLICY_ROOT,
        maxRequests: assessmentLimits.maxTotalRequests,
        maxBytes: assessmentLimits.maxDownloadedBytes,
        maxDurationMs: assessmentLimits.maxDurationMs,
      });
      try {
        const scopeId = `${runId}-chunk-${start}`;
        const capability = new NetworkPolicyAuthorizer(policy.policy, { now: Date.now })
          .issuePublicWebCapability({
            providerId: WEBSITE_HTTP_PROVIDER_ID,
            runId, assessmentId: scopeId, operation: "website_assessment",
            maxRequests: assessmentLimits.maxTotalRequests,
            maxBytes: assessmentLimits.maxDownloadedBytes,
            maxBytesPerRequest: 512 * 1024, maxRequestDurationMs: 15_000,
            costBudgetMicroUsd: 0, ttlMs: assessmentLimits.maxDurationMs,
          });
        const crawlLimits = validateCrawlLimits({
          maxPages: assessmentLimits.maxPagesPerBusiness,
          maxSitemapFiles: 1, maxSitemapUrls: 20, maxRedirects: 3,
          maxRetries: assessmentLimits.maxRetriesPerBusiness,
          maxCompressedBytes: 512 * 1024, maxDecompressedBytes: 1024 * 1024,
          connectionTimeoutMs: 5_000, responseTimeoutMs: 10_000,
          crawlDurationMs: 20_000, sameDomainConcurrency: 1,
        });
        const websites = await runLiveWebsiteAssessment({
          candidates: chunk,
          limits: assessmentLimits, niche, now,
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
        crawlRequests += websites.requests;
        crawlBytes += websites.downloadedBytes;
        crawlProcessedBytes += websites.processedBytes;
        crawlPages += websites.pages;
        websitesAssessed += websites.websitesAssessed;
        identityReview += websites.identityReview;
        duplicateAssessmentsSkipped += websites.duplicateAssessmentsSkipped;
        for (const [key, count] of Object.entries(websites.blockedCounts)) {
          blockedCounts[key] = (blockedCounts[key] ?? 0) + count;
        }
        assessmentChunks.push({
          chunk: assessmentChunks.length, attempted: websites.businessesAttempted,
          assessed: websites.websitesAssessed, identityReview: websites.identityReview,
          stopReason: websites.stopReason,
        });
      } finally {
        policy.cleanup();
      }
    }

    // Stage 3 — qualification and deterministic ranking over persisted evidence.
    const evaluatedAt = new Date(now().getTime()).toISOString();
    const queue = qualifyAndRankBatch({
      database: store.database,
      assessments: store.assessmentBusinessIds()
        .map((row) => ({ assessmentId: row.assessmentId, businessId: row.businessId })),
      runId,
      evaluatedAt,
      maximumCallable: 300,
      maximumReview: 400,
      coverageKeys: input.coverageKeys,
      signal: new AbortController().signal,
    });

    // Stage 4 — durable private exports. Written 0600, never echoed to the terminal.
    const rows = exportRows(store, input.marketByKey);
    const header = [
      "lead_id", "business_name", "website", "observed_phone", "market",
      "score", "result", "queue_disposition", "priority_score", "priority_band",
      "reason_codes", "missing_flags",
    ].join(",");
    const csv = [header, ...rows.map((row) => [
      csvCell(row.leadId), csvCell(row.businessName), csvCell(row.website),
      csvCell(row.observedPhone), csvCell(row.market), csvCell(row.score),
      csvCell(row.result), csvCell(row.queueDisposition), csvCell(row.priorityScore),
      csvCell(row.priorityBand), csvCell(row.reasonCodes.join("|")),
      csvCell(row.missingFlags.join("|")),
    ].join(","))].join("\n");
    writeFileSync(paths.csvPath, `${csv}\n`, { mode: 0o600 });
    chmodSync(paths.csvPath, 0o600);

    const evidence = store.evidenceCounts();
    return Object.freeze({
      assessment: Object.freeze({
        chunks: assessmentChunks,
        eligibleOffered: input.candidates.length,
        assessedComplete: websitesAssessed,
        identityReview,
        duplicateAssessmentsSkipped,
        blockedCounts,
        pages: crawlPages,
        approvedHostsContacted: contacted.size,
      }),
      evidence: Object.freeze({ ...evidence }),
      qualification: Object.freeze({
        evaluated: queue.evaluated,
        skippedAlreadyEvaluated: queue.skippedAlreadyEvaluated,
        ...queue.qualificationCounts,
      }),
      queue: Object.freeze({
        callableQueueSize: queue.callableQueueSize,
        reviewQueueSize: queue.reviewQueueSize,
        notEligible: queue.notEligible,
        priorityBands: queue.priorityBands,
        state: queue.queueState,
        snapshotPersisted: queue.snapshotId !== null,
      }),
      crawl: Object.freeze({
        requests: crawlRequests,
        downloadedBytes: crawlBytes,
        processedBytes: crawlProcessedBytes,
        pages: crawlPages,
      }),
      rowCount: rows.length,
    });
  } finally {
    if (store !== null && store.database.open) store.close();
  }
}

export interface ExportRow {
  readonly leadId: string;
  readonly businessName: string;
  readonly website: string;
  readonly observedPhone: string;
  readonly market: string;
  readonly score: number;
  readonly result: string;
  readonly queueDisposition: string;
  readonly priorityScore: number | null;
  readonly priorityBand: string;
  readonly reasonCodes: ReadonlyArray<string>;
  readonly missingFlags: ReadonlyArray<string>;
}

/**
 * Read the persisted batch back out for the private CSV.
 *
 * Reads only rows the pipeline itself wrote. A phone appears only when the
 * assessed website displayed it as a public contact observation for that same
 * assessment — never inferred, never taken from the provider record.
 */
export function exportRows(
  store: AssessmentStore,
  marketByKey: ReadonlyMap<string, string>,
): ReadonlyArray<ExportRow> {
  const marketByBusiness = new Map<string, string>();
  for (const [candidateKey, marketId] of marketByKey) {
    marketByBusiness.set(store.businessIdFor(candidateKey), marketId);
  }
  const rows = store.database.prepare(`
    SELECT b.id AS businessId, b.canonical_name AS businessName,
           a.canonical_homepage_url AS canonicalUrl, a.source_website_url AS sourceUrl,
           q.total_score AS score, q.icp_result AS result, q.missing_information_json AS missingJson,
           e.disposition AS disposition, e.priority_score AS priorityScore,
           e.priority_band AS priorityBand, e.reason_codes_json AS reasonJson
    FROM businesses b
    JOIN website_assessments a ON a.business_id = b.id
    LEFT JOIN icp_qualification_evaluations q ON q.business_id = b.id
    LEFT JOIN lead_queue_entries e ON e.source_business_id = b.id
    ORDER BY COALESCE(e.priority_score, -1) DESC, b.id
  `).all() as Array<{
    businessId: string; businessName: string;
    canonicalUrl: string | null; sourceUrl: string;
    score: number | null; result: string | null; missingJson: string | null;
    disposition: string | null; priorityScore: number | null;
    priorityBand: string | null; reasonJson: string | null;
  }>;
  const phone = store.database.prepare(`
    SELECT o.displayed_value AS value
    FROM website_contact_observations o
    JOIN website_assessments a ON a.id = o.assessment_id
    WHERE a.business_id = ? AND o.contact_kind = 'phone'
    ORDER BY o.id LIMIT 1
  `);
  return rows.map((row) => ({
    leadId: row.businessId,
    businessName: row.businessName,
    website: row.canonicalUrl ?? row.sourceUrl,
    observedPhone: (phone.get(row.businessId) as { value: string } | undefined)?.value ?? "",
    market: marketByBusiness.get(row.businessId) ?? "unknown_market",
    score: row.score ?? 0,
    result: row.result ?? "not_evaluated",
    queueDisposition: row.disposition ?? "not_queued",
    priorityScore: row.priorityScore,
    priorityBand: row.priorityBand ?? "",
    reasonCodes: row.reasonJson ? JSON.parse(row.reasonJson) as string[] : [],
    missingFlags: row.missingJson ? JSON.parse(row.missingJson) as string[] : [],
  }));
}

export { marketIdForLabel };

async function main(): Promise<void> {
  const report = await runPoolLeadBatch({
    argv: process.argv.slice(2),
    repositoryRoot: path.resolve(process.cwd(), ".."),
  });
  // Aggregate-only: counts, budgets, and artifact paths. No lead value is printed.
  console.log(JSON.stringify(report));
  if (!report.ran) process.exitCode = 2;
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (entry === import.meta.url) {
  void main().catch((error: unknown) => {
    console.error(JSON.stringify({
      aggregateVerdict: "batch_rejected",
      safetyWarnings: [error instanceof Error ? error.message : "unknown_batch_error"],
    }));
    process.exitCode = 1;
  });
}

export { existsSync, csvCell };
