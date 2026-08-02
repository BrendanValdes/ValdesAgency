import { extractBusinessIdentity, identityAgreement } from "../extraction/business-identity.js";
import { extractContactInformation } from "../extraction/contact.js";
import { extractConversionSignals } from "../extraction/conversion.js";
import { extractHtml } from "../extraction/html.js";
import { extractJsonLd } from "../extraction/json-ld.js";
import { extractPersonCandidates } from "../extraction/people.js";
import { extractServiceEvidence } from "../extraction/services.js";
import { assessConversionFeatures, WEBSITE_ASSESSMENT_POLICY_VERSION } from "../validation/website-assessment.js";
import { sameSite } from "../crawl/url-safety.js";
import type { CrawlPage, CrawlResult } from "../crawl/types.js";
import type { NicheConfiguration } from "../config/niches.js";
import type { EvidenceValue } from "../crawl/types.js";
import type { EligibleCandidate } from "./candidate-gate.js";

export const LIVE_WEBSITE_ASSESSMENT_VERSION = "live-website-assessment-1.0.0";

/**
 * Phase 5B bounded live website assessment.
 *
 * Crawls only candidates that already cleared the admission gate, using the
 * hardened HTTP crawler (GET/HEAD only, HTTPS-only, DNS/IP/SSRF pinning,
 * redirect revalidation, robots, content-type, byte, page, duration, and retry
 * controls all live inside the injected fetcher and crawler). This module adds
 * the per-run budget ceiling, the domain/business compatibility check, dedupe,
 * and aggregate accounting.
 *
 * It never submits a form, never clicks, never authenticates, and never emits a
 * business-identifying value: every number it returns is a count.
 */

export type WebsiteBlockReason =
  | "robots_denied"
  | "invalid_domain"
  | "redirect_off_domain"
  | "no_usable_page"
  | "identity_review"
  | "crawl_failed";

export type AssessmentStopReason =
  | "all_candidates_processed"
  | "business_target_reached"
  | "assessed_target_reached"
  | "request_budget_exhausted"
  | "byte_budget_exhausted"
  | "processed_byte_budget_exhausted"
  | "duration_budget_exhausted"
  | "cancelled";

export interface LiveWebsiteAssessmentLimits {
  readonly maxBusinessesAttempted: number;
  readonly maxWebsitesAssessed: number;
  readonly maxPagesPerBusiness: number;
  readonly maxRequestsPerBusiness: number;
  readonly maxTotalRequests: number;
  readonly maxDownloadedBytes: number;
  readonly maxProcessedBytes: number;
  readonly maxDurationMs: number;
  readonly maxRetriesPerBusiness: number;
}

export interface LiveWebsiteAssessmentSummary {
  readonly candidatesEligible: number;
  readonly businessesAttempted: number;
  readonly websitesAssessed: number;
  readonly duplicateAssessmentsSkipped: number;
  readonly blockedCounts: Readonly<Record<WebsiteBlockReason, number>>;
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
  readonly elapsedMs: number;
  readonly stopReason: AssessmentStopReason;
  readonly budgetsRemaining: Readonly<Record<string, number>>;
}

/** Minimal persistence seam. The canary supplies the real repository. */
export interface AssessmentSink {
  /** True when this candidate already has a persisted assessment. */
  hasAssessment(assessmentId: string): boolean;
  recordAssessment(input: {
    assessmentId: string;
    candidateKey: string;
    sourceWebsiteUrl: string;
    canonicalHomepageUrl: string | null;
    status: "complete" | "partial" | "blocked" | "failed";
    identityState: "agrees" | "conflicts" | "ambiguous" | "unavailable";
    reviewRequired: boolean;
    startedAt: string;
    assessedAt: string;
    pages: number;
    requests: number;
    downloadedBytes: number;
    processedBytes: number;
  }): void;
}

export interface LiveWebsiteCrawler {
  crawl(input: { websiteUrl: string; observedAt?: string; signal?: AbortSignal }): Promise<CrawlResult>;
}

function emptyBlocked(): Record<WebsiteBlockReason, number> {
  return {
    robots_denied: 0,
    invalid_domain: 0,
    redirect_off_domain: 0,
    no_usable_page: 0,
    identity_review: 0,
    crawl_failed: 0,
  };
}

function validateLimits(limits: LiveWebsiteAssessmentLimits): LiveWebsiteAssessmentLimits {
  for (const [name, value, maximum] of [
    ["maxBusinessesAttempted", limits.maxBusinessesAttempted, 25],
    ["maxWebsitesAssessed", limits.maxWebsitesAssessed, 25],
    ["maxPagesPerBusiness", limits.maxPagesPerBusiness, 10],
    ["maxRequestsPerBusiness", limits.maxRequestsPerBusiness, 20],
    ["maxTotalRequests", limits.maxTotalRequests, 100],
    ["maxDownloadedBytes", limits.maxDownloadedBytes, 32 * 1024 * 1024],
    ["maxProcessedBytes", limits.maxProcessedBytes, 64 * 1024 * 1024],
    ["maxDurationMs", limits.maxDurationMs, 120_000],
    ["maxRetriesPerBusiness", limits.maxRetriesPerBusiness, 3],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
      throw new Error(`Live website assessment limit ${name} must be an integer between 1 and ${maximum}`);
    }
  }
  return limits;
}

/**
 * Count the bytes and requests a crawl actually consumed. Failed fetches still
 * cost a request, so they are counted too.
 */
function crawlUsage(pages: ReadonlyArray<CrawlPage>): {
  requests: number;
  downloadedBytes: number;
  processedBytes: number;
} {
  let requests = 0;
  let downloadedBytes = 0;
  let processedBytes = 0;
  for (const page of pages) {
    if (!page.fetch) continue;
    requests += 1;
    if (page.fetch.ok) {
      downloadedBytes += page.fetch.compressedBytes;
      processedBytes += page.fetch.decompressedBytes;
    }
  }
  return { requests, downloadedBytes, processedBytes };
}

export async function runLiveWebsiteAssessment(input: {
  candidates: ReadonlyArray<EligibleCandidate>;
  limits: LiveWebsiteAssessmentLimits;
  niche: Pick<NicheConfiguration,
    "service_synonyms" | "required_indicators" | "negative_keywords" |
    "excluded_adjacent_industries" | "relevant_categories">;
  /** One crawler per business, so per-business limits are enforced by the crawler itself. */
  createCrawler: (candidate: EligibleCandidate) => LiveWebsiteCrawler;
  sink: AssessmentSink;
  assessmentId: (candidate: EligibleCandidate) => string;
  now: () => Date;
  signal?: AbortSignal;
}): Promise<LiveWebsiteAssessmentSummary> {
  const limits = validateLimits(input.limits);
  const startedAtMs = input.now().getTime();
  const blockedCounts = emptyBlocked();

  let businessesAttempted = 0;
  let websitesAssessed = 0;
  let duplicateAssessmentsSkipped = 0;
  let pages = 0;
  let requests = 0;
  let downloadedBytes = 0;
  let processedBytes = 0;
  let opportunitySignals = 0;
  let publicContactCandidates = 0;
  let publicPersonCandidates = 0;
  let serviceEvidenceCount = 0;
  let structuredDataCount = 0;
  let identityAgrees = 0;
  let identityReview = 0;
  let stopReason: AssessmentStopReason = "all_candidates_processed";

  const elapsed = (): number => input.now().getTime() - startedAtMs;
  // A traversal stop is always an explicit bounded reason. Reserve headroom for
  // one more business before starting it, rather than overrunning a ceiling.
  const haltReason = (): AssessmentStopReason | null => {
    if (input.signal?.aborted) return "cancelled";
    if (businessesAttempted >= limits.maxBusinessesAttempted) return "business_target_reached";
    if (websitesAssessed >= limits.maxWebsitesAssessed) return "assessed_target_reached";
    if (requests >= limits.maxTotalRequests) return "request_budget_exhausted";
    if (downloadedBytes >= limits.maxDownloadedBytes) return "byte_budget_exhausted";
    if (processedBytes >= limits.maxProcessedBytes) return "processed_byte_budget_exhausted";
    if (elapsed() >= limits.maxDurationMs) return "duration_budget_exhausted";
    return null;
  };

  for (const candidate of input.candidates) {
    const halt = haltReason();
    if (halt) {
      stopReason = halt;
      break;
    }
    const assessmentId = input.assessmentId(candidate);
    // Resume safety: an already-persisted assessment is never repeated, and a
    // repeat does not consume the attempt budget.
    if (input.sink.hasAssessment(assessmentId)) {
      duplicateAssessmentsSkipped += 1;
      continue;
    }

    businessesAttempted += 1;
    const startedAt = input.now().toISOString();
    let crawl: CrawlResult;
    try {
      crawl = await input.createCrawler(candidate).crawl({
        websiteUrl: candidate.candidateUrl,
        observedAt: startedAt,
        ...(input.signal ? { signal: input.signal } : {}),
      });
    } catch {
      blockedCounts.crawl_failed += 1;
      input.sink.recordAssessment({
        assessmentId, candidateKey: candidate.candidateKey,
        sourceWebsiteUrl: candidate.candidateUrl, canonicalHomepageUrl: null,
        status: "failed", identityState: "unavailable", reviewRequired: true,
        startedAt, assessedAt: input.now().toISOString(),
        pages: 0, requests: 0, downloadedBytes: 0, processedBytes: 0,
      });
      continue;
    }

    const usage = crawlUsage(crawl.pages);
    requests += usage.requests;
    downloadedBytes += usage.downloadedBytes;
    processedBytes += usage.processedBytes;
    pages += crawl.pages.length;
    const assessedAt = input.now().toISOString();

    if (crawl.robots.status !== "allowed") {
      blockedCounts.robots_denied += 1;
      input.sink.recordAssessment({
        assessmentId, candidateKey: candidate.candidateKey,
        sourceWebsiteUrl: candidate.candidateUrl,
        canonicalHomepageUrl: crawl.canonicalHomepage,
        status: "blocked", identityState: "unavailable", reviewRequired: true,
        startedAt, assessedAt, pages: crawl.pages.length, ...usage,
      });
      continue;
    }

    // Every usable page must still be on the approved candidate host. The
    // fetcher revalidates each redirect hop; this is the final destination check.
    const usablePages = crawl.pages.filter((page) => page.html !== null && page.fetch?.ok === true);
    const offDomain = usablePages.some((page) => {
      const finalUrl = page.fetch?.ok ? page.fetch.finalUrl : page.url;
      try {
        return !sameSite(finalUrl, candidate.candidateUrl);
      } catch {
        return true;
      }
    });
    if (offDomain) {
      blockedCounts.redirect_off_domain += 1;
      input.sink.recordAssessment({
        assessmentId, candidateKey: candidate.candidateKey,
        sourceWebsiteUrl: candidate.candidateUrl,
        canonicalHomepageUrl: crawl.canonicalHomepage,
        status: "blocked", identityState: "unavailable", reviewRequired: true,
        startedAt, assessedAt, pages: crawl.pages.length, ...usage,
      });
      continue;
    }
    if (usablePages.length === 0) {
      blockedCounts.no_usable_page += 1;
      input.sink.recordAssessment({
        assessmentId, candidateKey: candidate.candidateKey,
        sourceWebsiteUrl: candidate.candidateUrl,
        canonicalHomepageUrl: crawl.canonicalHomepage,
        status: crawl.pages.some((page) => page.inspectionStatus === "unavailable") ? "partial" : "failed",
        identityState: "unavailable", reviewRequired: true,
        startedAt, assessedAt, pages: crawl.pages.length, ...usage,
      });
      continue;
    }

    const homepage = crawl.canonicalHomepage ?? candidate.candidateUrl;
    let contactCount = 0;
    let personCount = 0;
    let serviceCount = 0;
    let structuredCount = 0;
    let signalCount = 0;
    const observedNames: EvidenceValue<string>[] = [];

    for (const page of usablePages) {
      const fetched = page.fetch;
      if (!fetched?.ok || page.html === null) continue;
      const context = {
        pageUrl: fetched.finalUrl,
        observedAt: assessedAt,
        fetchedAt: fetched.fetchedAt ?? assessedAt,
        contentChecksum: fetched.contentChecksum,
        sourceClass: crawl.sourceClass,
      };
      const html = extractHtml(page.html, context);
      const jsonLd = extractJsonLd(page.html, context);
      // Contacts, people, services and structured data stay public-unverified:
      // the extractors set candidateStatus/claimState and nothing here promotes
      // them. No verifier runs in this phase.
      contactCount += extractContactInformation({ html, jsonLd, homepage }).length;
      personCount += extractPersonCandidates({
        html, jsonLd, knownBusinessNames: [candidate.expectedBusinessName],
      }).length;
      serviceCount += extractServiceEvidence({ html, jsonLd, niche: input.niche })
        .filter((observation) => observation.state !== "unavailable").length;
      structuredCount += jsonLd.organizationNames.length + jsonLd.people.length;
      const signals = extractConversionSignals({ html, homepage, validResponse: true });
      signalCount += signals.length;
      if (page.kind === "homepage") {
        const identity = extractBusinessIdentity({ html, jsonLd });
        observedNames.push(...identity.names);
        const features = assessConversionFeatures({
          crawl, signals, browser: { status: "not_checked" },
          assessedAt, freshUntil: new Date(Date.parse(assessedAt) + 86_400_000).toISOString(),
        });
        signalCount += features.filter((feature) => feature.status === "present").length;
      }
    }

    // Domain/business compatibility uses the existing identity rules. A conflict
    // or ambiguity routes the candidate to review; it is not counted as assessed.
    const identityState = identityAgreement(candidate.expectedBusinessName, observedNames);
    const reviewRequired = identityState !== "agrees";
    if (reviewRequired) {
      identityReview += 1;
      blockedCounts.identity_review += 1;
    } else {
      identityAgrees += 1;
    }

    input.sink.recordAssessment({
      assessmentId, candidateKey: candidate.candidateKey,
      sourceWebsiteUrl: candidate.candidateUrl,
      canonicalHomepageUrl: crawl.canonicalHomepage,
      status: crawl.complete ? "complete" : "partial",
      identityState, reviewRequired,
      startedAt, assessedAt, pages: crawl.pages.length, ...usage,
    });

    if (!reviewRequired) {
      websitesAssessed += 1;
      opportunitySignals += signalCount;
      publicContactCandidates += contactCount;
      publicPersonCandidates += personCount;
      serviceEvidenceCount += serviceCount;
      structuredDataCount += structuredCount;
    }
  }

  return {
    candidatesEligible: input.candidates.length,
    businessesAttempted,
    websitesAssessed,
    duplicateAssessmentsSkipped,
    blockedCounts: Object.freeze(blockedCounts),
    pages,
    requests,
    downloadedBytes,
    processedBytes,
    opportunitySignals,
    publicContactCandidates,
    publicPersonCandidates,
    serviceEvidenceCount,
    structuredDataCount,
    identityAgrees,
    identityReview,
    elapsedMs: elapsed(),
    stopReason,
    budgetsRemaining: Object.freeze({
      businessesAttempted: Math.max(0, limits.maxBusinessesAttempted - businessesAttempted),
      websitesAssessed: Math.max(0, limits.maxWebsitesAssessed - websitesAssessed),
      totalRequests: Math.max(0, limits.maxTotalRequests - requests),
      downloadedBytes: Math.max(0, limits.maxDownloadedBytes - downloadedBytes),
      processedBytes: Math.max(0, limits.maxProcessedBytes - processedBytes),
      durationMs: Math.max(0, limits.maxDurationMs - elapsed()),
    }),
  };
}

export { WEBSITE_ASSESSMENT_POLICY_VERSION };
