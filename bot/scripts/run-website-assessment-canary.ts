import { existsSync, realpathSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULT_LEAD_POLICY_ROOT } from "../src/lead-engine/config/lead-policy.js";
import { isPathInside } from "../src/lead-engine/config/loader.js";
import { NetworkPolicyAuthorizer } from "../src/lead-engine/config/network-capability.js";
import { loadNicheConfigurations } from "../src/lead-engine/config/niches.js";
import {
  createEphemeralWebsiteCanaryPolicy,
  WEBSITE_HTTP_PROVIDER_ID,
} from "../src/lead-engine/assessment/website-canary-policy.js";
import {
  selectAssessableCandidates,
  type EligibleCandidate,
} from "../src/lead-engine/assessment/candidate-gate.js";
import {
  runLiveWebsiteAssessment,
  LIVE_WEBSITE_ASSESSMENT_VERSION,
  type LiveWebsiteAssessmentLimits,
} from "../src/lead-engine/assessment/live-website-assessment.js";
import { WEBSITE_ASSESSMENT_POLICY_VERSION } from "../src/lead-engine/validation/website-assessment.js";
import { WebsiteCrawler } from "../src/lead-engine/crawl/crawler.js";
import { createDirectHttpFetcher } from "../src/lead-engine/crawl/fetchers/direct-http.js";
import { validateCrawlLimits } from "../src/lead-engine/crawl/policies.js";
import {
  assessmentIdFor,
  createAssessmentStore,
} from "../src/lead-engine/assessment/assessment-store.js";
import type { NormalizedDiscoveryResult, ProviderEnvelope } from "../src/lead-engine/providers/contracts.js";

/**
 * Phase 5B bounded website-assessment canary.
 *
 * Assesses websites for accepted Overture candidates only. Live crawling stays
 * disabled in the checked-in configuration: this script must be given both
 * --confirm-live-website-assessment and --enable-live-crawl, and it activates
 * website_http only inside a throwaway policy tree under the OS temp directory.
 *
 * The report is aggregate-only. No business name, phone, email, website,
 * address, page text, or HTML is ever printed.
 */

export const WEBSITE_CANARY_HARD_LIMITS: LiveWebsiteAssessmentLimits = Object.freeze({
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

export interface WebsiteCanaryArguments {
  readonly confirmed: true;
  readonly market: "phoenix-canary";
  readonly databasePath: string;
  /** Absent by default so the checked-in canary performs zero network I/O. */
  readonly enableLiveCrawl: boolean;
}

export interface WebsiteCanaryReport {
  readonly ran: boolean;
  readonly approvedDestinationsContacted: number;
  readonly candidatesConsidered: number;
  readonly candidatesEligible: number;
  readonly gateBlockedCounts: Readonly<Record<string, number>>;
  readonly businessesAttempted: number;
  readonly websitesAssessed: number;
  readonly duplicateAssessmentsSkipped: number;
  readonly websiteBlockedCounts: Readonly<Record<string, number>>;
  readonly pages: number;
  readonly requests: number;
  readonly downloadedBytes: number;
  readonly processedBytes: number;
  readonly opportunitySignals: number;
  readonly publicContactCandidates: number;
  readonly publicPersonCandidates: number;
  readonly serviceEvidenceCount: number;
  readonly structuredDataCount: number;
  readonly identityAgrees: number;
  readonly identityReview: number;
  readonly assessmentsPersisted: number;
  readonly elapsedMs: number;
  readonly stopReason: string;
  readonly budgetsRemaining: Readonly<Record<string, number>>;
  readonly crawlPolicyVersion: string;
  readonly extractionPolicyVersion: string;
  readonly aggregateVerdict: string;
  readonly safetyWarnings: ReadonlyArray<string>;
}

export function parseWebsiteCanaryArguments(
  argv: ReadonlyArray<string>,
  repositoryRoot: string,
): WebsiteCanaryArguments {
  const values = new Map<string, string | true>();
  const valueFlags = new Set(["--market", "--database"]);
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index] as string;
    if (flag === "--confirm-live-website-assessment" || flag === "--enable-live-crawl") {
      if (values.has(flag)) throw new Error(`Website canary flag was repeated: ${flag}`);
      values.set(flag, true);
      continue;
    }
    if (!valueFlags.has(flag)) throw new Error(`Unknown website canary argument: ${flag}`);
    if (values.has(flag)) throw new Error(`Website canary argument was repeated: ${flag}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Website canary argument requires a value: ${flag}`);
    values.set(flag, value);
    index += 1;
  }
  if (values.get("--confirm-live-website-assessment") !== true) {
    throw new Error("Live website canary requires --confirm-live-website-assessment");
  }
  if (values.get("--market") !== "phoenix-canary") {
    throw new Error("Live website canary is restricted to --market phoenix-canary");
  }
  const databaseValue = values.get("--database");
  if (typeof databaseValue !== "string" || !path.isAbsolute(databaseValue)) {
    throw new Error("Website canary database must be an explicit absolute path");
  }
  const databasePath = path.resolve(databaseValue);
  let databaseParent: string;
  try {
    databaseParent = realpathSync(path.dirname(databasePath));
  } catch {
    throw new Error("Website canary database parent must already exist under the OS temp directory");
  }
  if (isPathInside(path.resolve(repositoryRoot), databasePath) ||
    !isPathInside(realpathSync(os.tmpdir()), databaseParent) ||
    path.extname(databasePath) !== ".sqlite") {
    throw new Error("Website canary database must be a .sqlite file under the OS temp directory and outside the repository");
  }
  if (existsSync(databasePath)) {
    throw new Error("Website canary database path must not already exist");
  }
  return {
    confirmed: true,
    market: "phoenix-canary",
    databasePath,
    enableLiveCrawl: values.get("--enable-live-crawl") === true,
  };
}

function blockedReport(reason: string, warning: string): WebsiteCanaryReport {
  return {
    ran: false,
    approvedDestinationsContacted: 0,
    candidatesConsidered: 0,
    candidatesEligible: 0,
    gateBlockedCounts: {},
    businessesAttempted: 0,
    websitesAssessed: 0,
    duplicateAssessmentsSkipped: 0,
    websiteBlockedCounts: {},
    pages: 0,
    requests: 0,
    downloadedBytes: 0,
    processedBytes: 0,
    opportunitySignals: 0,
    publicContactCandidates: 0,
    publicPersonCandidates: 0,
    serviceEvidenceCount: 0,
    structuredDataCount: 0,
    identityAgrees: 0,
    identityReview: 0,
    assessmentsPersisted: 0,
    elapsedMs: 0,
    stopReason: "not_started",
    budgetsRemaining: {},
    crawlPolicyVersion: WEBSITE_ASSESSMENT_POLICY_VERSION,
    extractionPolicyVersion: LIVE_WEBSITE_ASSESSMENT_VERSION,
    aggregateVerdict: reason,
    safetyWarnings: [warning],
  };
}

export async function runWebsiteAssessmentCanary(input: {
  argv: ReadonlyArray<string>;
  repositoryRoot: string;
  /**
   * Accepted discovery envelopes to assess. Supplied by the caller so the
   * canary never re-runs discovery implicitly.
   */
  envelopes: ReadonlyArray<ProviderEnvelope<NormalizedDiscoveryResult>>;
  now?: () => Date;
}): Promise<WebsiteCanaryReport> {
  const args = parseWebsiteCanaryArguments(input.argv, input.repositoryRoot);
  const now = input.now ?? (() => new Date());
  const gate = selectAssessableCandidates(input.envelopes);

  if (!args.enableLiveCrawl) {
    return {
      ...blockedReport("blocked_live_crawl_disabled", "live_crawl_disabled_by_default"),
      candidatesConsidered: gate.consideredCount,
      candidatesEligible: gate.eligible.length,
      gateBlockedCounts: gate.blockedCounts,
    };
  }

  const limits = WEBSITE_CANARY_HARD_LIMITS;
  const policy = createEphemeralWebsiteCanaryPolicy({
    checkedInConfigurationRoot: DEFAULT_LEAD_POLICY_ROOT,
    maxRequests: limits.maxTotalRequests,
    maxBytes: limits.maxDownloadedBytes,
    maxDurationMs: limits.maxDurationMs,
  });
  let databaseWasCreated = false;
  const contacted = new Set<string>();
  const startedAtMs = now().getTime();
  try {
    const runId = "website-phoenix-canary";
    const assessmentScopeId = "website-phoenix-canary-scope";
    const store = createAssessmentStore({
      databasePath: args.databasePath,
      repositoryRoot: input.repositoryRoot,
      candidates: gate.eligible,
      now,
    });
    databaseWasCreated = true;
    const niche = loadNicheConfigurations().get("pool_service");
    if (!niche) throw new Error("Website canary requires a configured pool_service niche");

    const authorizer = new NetworkPolicyAuthorizer(policy.policy, { now: () => now().getTime() });
    const capability = authorizer.issuePublicWebCapability({
      providerId: WEBSITE_HTTP_PROVIDER_ID,
      runId,
      assessmentId: assessmentScopeId,
      operation: "website_assessment",
      maxRequests: limits.maxTotalRequests,
      maxBytes: limits.maxDownloadedBytes,
      maxBytesPerRequest: 512 * 1024,
      maxRequestDurationMs: 15_000,
      costBudgetMicroUsd: 0,
      ttlMs: limits.maxDurationMs,
    });

    const crawlLimits = validateCrawlLimits({
      maxPages: limits.maxPagesPerBusiness,
      maxSitemapFiles: 1,
      maxSitemapUrls: 20,
      maxRedirects: 3,
      maxRetries: limits.maxRetriesPerBusiness,
      maxCompressedBytes: 512 * 1024,
      maxDecompressedBytes: 1024 * 1024,
      connectionTimeoutMs: 5_000,
      responseTimeoutMs: 10_000,
      crawlDurationMs: Math.floor(limits.maxDurationMs / limits.maxBusinessesAttempted),
      sameDomainConcurrency: 1,
    });

    const summary = await runLiveWebsiteAssessment({
      candidates: gate.eligible,
      limits,
      niche,
      now,
      assessmentId: (candidate) => assessmentIdFor(runId, candidate),
      createCrawler: (candidate) => {
        contacted.add(candidate.candidateHost);
        return new WebsiteCrawler({
          fetcher: createDirectHttpFetcher({
            capability,
            providerId: WEBSITE_HTTP_PROVIDER_ID,
            runId,
            assessmentId: assessmentScopeId,
            operation: "website_assessment",
            limits: crawlLimits,
          }),
          limits: crawlLimits,
          now,
        });
      },
      sink: store.sink,
    });

    store.close();
    return {
      ran: true,
      approvedDestinationsContacted: contacted.size,
      candidatesConsidered: gate.consideredCount,
      candidatesEligible: gate.eligible.length,
      gateBlockedCounts: gate.blockedCounts,
      businessesAttempted: summary.businessesAttempted,
      websitesAssessed: summary.websitesAssessed,
      duplicateAssessmentsSkipped: summary.duplicateAssessmentsSkipped,
      websiteBlockedCounts: summary.blockedCounts,
      pages: summary.pages,
      requests: summary.requests,
      downloadedBytes: summary.downloadedBytes,
      processedBytes: summary.processedBytes,
      opportunitySignals: summary.opportunitySignals,
      publicContactCandidates: summary.publicContactCandidates,
      publicPersonCandidates: summary.publicPersonCandidates,
      serviceEvidenceCount: summary.serviceEvidenceCount,
      structuredDataCount: summary.structuredDataCount,
      identityAgrees: summary.identityAgrees,
      identityReview: summary.identityReview,
      assessmentsPersisted: store.assessmentsPersisted(),
      elapsedMs: now().getTime() - startedAtMs,
      stopReason: summary.stopReason,
      budgetsRemaining: summary.budgetsRemaining,
      crawlPolicyVersion: WEBSITE_ASSESSMENT_POLICY_VERSION,
      extractionPolicyVersion: LIVE_WEBSITE_ASSESSMENT_VERSION,
      aggregateVerdict: summary.websitesAssessed > 0 ? "completed" : "completed_no_assessable_website",
      safetyWarnings: [],
    };
  } catch (error) {
    return {
      ...blockedReport(
        "blocked_website_safety_policy",
        error instanceof Error ? error.name : "unknown_canary_error",
      ),
      approvedDestinationsContacted: contacted.size,
      candidatesConsidered: gate.consideredCount,
      candidatesEligible: gate.eligible.length,
      gateBlockedCounts: gate.blockedCounts,
      elapsedMs: now().getTime() - startedAtMs,
    };
  } finally {
    policy.cleanup();
    if (databaseWasCreated && existsSync(args.databasePath)) {
      rmSync(args.databasePath, { force: true });
      for (const suffix of ["-wal", "-shm"]) {
        rmSync(`${args.databasePath}${suffix}`, { force: true });
      }
    }
  }
}

async function main(): Promise<void> {
  const repositoryRoot = path.resolve(process.cwd(), "..");
  // Discovery envelopes come from the Phase 5A.3 bounded suburban traversal,
  // which yields strong-category contractors rather than downtown facilities.
  const { discoverSuburbanPhoenixCandidates } = await import("./overture-suburban-candidates.js");
  const envelopes = (await discoverSuburbanPhoenixCandidates()).envelopes;
  const report = await runWebsiteAssessmentCanary({
    argv: process.argv.slice(2),
    repositoryRoot,
    envelopes,
  });
  console.log(JSON.stringify(report));
  if (!report.ran) process.exitCode = 2;
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (entry === import.meta.url) {
  void main().catch((error: unknown) => {
    console.error(JSON.stringify({
      aggregateVerdict: "canary_rejected",
      safetyWarnings: [error instanceof Error ? error.message : "unknown_canary_error"],
    }));
    process.exitCode = 1;
  });
}
