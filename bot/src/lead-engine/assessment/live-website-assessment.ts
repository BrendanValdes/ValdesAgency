import { extractBusinessIdentity } from "../extraction/business-identity.js";
import {
  assessIdentityCorroboration,
  type IdentityCorroborationResult,
} from "../identity/corroboration.js";
import {
  evaluateServiceLanguage,
  type ServiceLanguageEvaluation,
} from "../qualification/service-language.js";
import { extractContactInformation } from "../extraction/contact.js";
import { extractConversionSignals } from "../extraction/conversion.js";
import { extractHtml } from "../extraction/html.js";
import { extractJsonLd } from "../extraction/json-ld.js";
import { extractPersonCandidates } from "../extraction/people.js";
import { extractServiceEvidence } from "../extraction/services.js";
import {
  assessBusinessOperationalEvidence,
  type OperationalEvidence,
} from "../validation/business-operational.js";
import { assessConversionFeatures, WEBSITE_ASSESSMENT_POLICY_VERSION } from "../validation/website-assessment.js";
import { sameSiteAllowingWwwAlias } from "../crawl/url-safety.js";
import type { CrawlPage, CrawlResult, PageKind } from "../crawl/types.js";
import type { ContactObservation } from "../extraction/contact.js";
import type { PersonEvidenceCandidate } from "../extraction/people.js";
import type { ServiceEvidenceObservation } from "../extraction/services.js";
import type { ConversionFeatureAssessment } from "../validation/website-assessment.js";
import type { NicheConfiguration } from "../config/niches.js";
import type { EvidenceValue } from "../crawl/types.js";
import type { EligibleCandidate } from "./candidate-gate.js";

export const LIVE_WEBSITE_ASSESSMENT_VERSION = "live-website-assessment-1.0.0";

/**
 * The only operational facts this phase persists.
 *
 * Both are directly observed properties of the homepage fetch that the crawler
 * already establishes. Every other kind the operational assessor can produce —
 * identity agreement, contact consistency, parked, placeholder, closed, moved,
 * different-business redirect, content unavailable — stays unpersisted here, so
 * this change cannot reach an identity rule or a hard disqualifier.
 */
export const PERSISTED_OPERATIONAL_KINDS = Object.freeze([
  "homepage_usable",
  "https_works",
] as const);

/**
 * Directly and affirmatively observed successful homepage facts, or nothing.
 *
 * `assessBusinessOperationalEvidence` is the existing production producer for
 * these kinds; it reads only `crawl.pages[0]`, which the crawler always fills
 * with the homepage, so a failed secondary page can neither fabricate nor erase
 * a confirmed homepage or HTTPS observation. Only `positive` survives the
 * filter: blocked, unavailable, negative, and unknown statuses persist nothing.
 */
export function persistableOperationalEvidence(input: {
  expectedBusinessName: string;
  crawl: CrawlResult;
}): OperationalEvidence[] {
  if (input.crawl.robots.status !== "allowed") return [];
  const allowed = new Set<string>(PERSISTED_OPERATIONAL_KINDS);
  return assessBusinessOperationalEvidence({
    expectedBusinessName: input.expectedBusinessName,
    crawl: input.crawl,
    // Identity is corroborated separately and must not leak into legitimacy here.
    identity: null,
  }).evidence.filter((item) => allowed.has(item.kind) && item.status === "positive");
}

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
  /** Per-site observed rule ids, for calibration. Ids only, never text. */
  readonly serviceLanguageBySite: ReadonlyArray<ReadonlyArray<string>>;
  readonly identityDecisions: Readonly<Record<string, number>>;
}

/**
 * Per-page evidence handed to the persistence layer. Everything here stays
 * public-unverified: the extractors set candidateStatus/claimState and nothing
 * in this phase promotes or verifies any value.
 */
export interface PageEvidence {
  readonly assessmentId: string;
  readonly pageUrl: string;
  readonly pageKind: PageKind;
  readonly contentChecksum: string;
  readonly fetchedAt: string;
  readonly observedAt: string;
  readonly title: string | null;
  readonly metaDescription: string | null;
  readonly language: string | null;
  readonly viewport: string | null;
  readonly contacts: ReadonlyArray<ContactObservation>;
  readonly people: ReadonlyArray<PersonEvidenceCandidate>;
  readonly services: ReadonlyArray<ServiceEvidenceObservation>;
  readonly conversions: ReadonlyArray<ConversionFeatureAssessment>;
  /** Rule identifiers only — never the matched text. */
  readonly serviceLanguage: ServiceLanguageEvaluation;
  readonly structuredData: ReadonlyArray<{
    readonly schemaType: string;
    readonly path: string;
    readonly fieldName: string;
    readonly claimedValue: string;
    readonly confidence: "high" | "medium" | "low";
  }>;
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
  /** Optional: persist page-level evidence for downstream qualification. */
  recordPageEvidence?(evidence: PageEvidence): void;
  /** Optional: persist a domain/business identity conflict for review. */
  recordIdentityConflict?(input: {
    assessmentId: string;
    candidateKey: string;
    observedNameCount: number;
  }): void;
  /**
   * Optional: persist directly observed successful operational facts as internal
   * crawl evidence. Never a verification, never a corroborating source class.
   */
  recordOperationalEvidence?(input: {
    assessmentId: string;
    candidateKey: string;
    observations: ReadonlyArray<OperationalEvidence>;
    sourceUrl: string;
    observedAt: string;
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
  const identityOutcomes: IdentityCorroborationResult[] = [];
  const serviceLanguageBySite: string[][] = [];
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

    // Every usable page must still be on the approved candidate host, or on that
    // host's own www alias — an apex/www canonicalisation redirect is the same
    // site, and rejecting it discarded half of the measured Phoenix pilot. No
    // other subdomain and no protocol change is accepted. The fetcher still
    // revalidates every redirect hop (DNS/IP pin, protocol, port, hop limit,
    // loop protection); this is only the final destination check.
    const usablePages = crawl.pages.filter((page) => page.html !== null && page.fetch?.ok === true);
    const offDomain = usablePages.some((page) => {
      const finalUrl = page.fetch?.ok ? page.fetch.finalUrl : page.url;
      try {
        return !sameSiteAllowingWwwAlias(finalUrl, candidate.candidateUrl);
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
    // Reached only for an allowed, on-domain crawl with at least one usable page.
    // A failed secondary page leaves a confirmed homepage observation intact.
    const operationalObservations = persistableOperationalEvidence({
      expectedBusinessName: candidate.expectedBusinessName,
      crawl,
    });
    if (operationalObservations.length > 0) {
      input.sink.recordOperationalEvidence?.({
        assessmentId, candidateKey: candidate.candidateKey,
        observations: operationalObservations, sourceUrl: homepage, observedAt: assessedAt,
      });
    }
    let contactCount = 0;
    let personCount = 0;
    let serviceCount = 0;
    let structuredCount = 0;
    let signalCount = 0;
    const observedNames: EvidenceValue<string>[] = [];
    const structuredOrganizationNames: string[] = [];
    const observedPhones: string[] = [];
    const observedLocalities: string[] = [];
    const observedServiceAreas: string[] = [];
    const serviceLanguageRuleIds = new Set<string>();
    // Provider categories describe the business, not any one page, so they are
    // extracted exactly once per candidate — on the first usable page — rather
    // than re-derived for every page. That keeps a multi-page crawl from
    // multiplying one provider observation into several service-fit facts.
    let providerCategoriesExtracted = false;

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
      const contacts = extractContactInformation({ html, jsonLd, homepage });
      const people = extractPersonCandidates({
        html, jsonLd, knownBusinessNames: [candidate.expectedBusinessName],
      });
      const providerCategories = providerCategoriesExtracted
        ? []
        : candidate.providerCategories ?? [];
      providerCategoriesExtracted = true;
      const services = extractServiceEvidence({
        html, jsonLd, niche: input.niche,
        providerCategories,
        // The discovery envelope's own class, so provider evidence is never
        // relabelled as a website claim. No verification field is set anywhere.
        ...(candidate.providerSourceClass ? { providerSourceClass: candidate.providerSourceClass } : {}),
      }).filter((observation) => observation.state !== "unavailable");
      structuredOrganizationNames.push(...jsonLd.organizationNames.map((value) => value.value));
      observedPhones.push(...contacts.filter((entry) => entry.kind === "phone")
        .map((entry) => entry.displayedValue));
      // Text is inspected in memory only; nothing but rule ids and dimension
      // states leaves this loop.
      const pageText = html.visibleText;
      const locality = candidate.expectedLocality;
      if (locality && pageText.toLocaleLowerCase("en-US").includes(locality.toLocaleLowerCase("en-US"))) {
        observedLocalities.push(locality);
        if (/\b(?:service\s+areas?|areas?\s+we\s+serve|we\s+serve|proudly\s+serving)\b/i.test(pageText)) {
          observedServiceAreas.push(locality);
        }
      }
      const serviceLanguage = evaluateServiceLanguage(pageText);
      for (const hit of serviceLanguage.hits) serviceLanguageRuleIds.add(hit.ruleId);
      const structuredData = jsonLd.organizationNames.map((value) => ({
        // Canonical persisted field name. The qualification reader selects
        // structured business data by an explicit allow-list that contains
        // `organization_name`; the previous generic "name" never matched, so
        // every live Organization JSON-LD observation was persisted but unread.
        schemaType: "Organization", path: "organizationNames", fieldName: "organization_name",
        claimedValue: value.value, confidence: value.confidence,
      }));
      contactCount += contacts.length;
      personCount += people.length;
      serviceCount += services.length;
      structuredCount += structuredData.length + jsonLd.people.length;
      const signals = extractConversionSignals({ html, homepage, validResponse: true });
      signalCount += signals.length;
      let conversions: ReadonlyArray<ConversionFeatureAssessment> = [];
      if (page.kind === "homepage") {
        const identity = extractBusinessIdentity({ html, jsonLd });
        observedNames.push(...identity.names);
        conversions = assessConversionFeatures({
          crawl, signals, browser: { status: "not_checked" },
          assessedAt, freshUntil: new Date(Date.parse(assessedAt) + 86_400_000).toISOString(),
        });
        signalCount += conversions.filter((feature) => feature.status === "present").length;
      }
      input.sink.recordPageEvidence?.({
        assessmentId, pageUrl: fetched.finalUrl, pageKind: page.kind,
        contentChecksum: fetched.contentChecksum,
        fetchedAt: fetched.fetchedAt ?? assessedAt, observedAt: assessedAt,
        title: html.title?.value ?? null,
        metaDescription: html.metaDescription?.value ?? null,
        language: html.language?.value ?? null,
        viewport: html.viewport?.value ?? null,
        contacts, people, services, conversions, structuredData, serviceLanguage,
      });
    }

    // Domain/business compatibility is corroborated across independent
    // dimensions. Name similarity alone never attaches, and any conflicting
    // dimension forces review.
    const corroboration = assessIdentityCorroboration({
      expectedName: candidate.expectedBusinessName,
      candidateHost: candidate.candidateHost,
      expectedLocality: candidate.expectedLocality,
      expectedPhones: candidate.expectedPhones,
      observedNames: observedNames.map((entry) => entry.value),
      structuredOrganizationNames,
      observedPhones,
      observedLocalities,
      observedServiceAreas,
    });
    identityOutcomes.push(corroboration);
    const identityState = corroboration.decision === "attach"
      ? "agrees" as const
      : corroboration.decision === "conflict" ? "conflicts" as const
        : corroboration.compatibleCount > 0 ? "ambiguous" as const : "unavailable" as const;
    const reviewRequired = corroboration.decision !== "attach";
    if (reviewRequired) {
      identityReview += 1;
      blockedCounts.identity_review += 1;
      // A mismatch is recorded as a conflict for review, never silently accepted.
      input.sink.recordIdentityConflict?.({
        assessmentId, candidateKey: candidate.candidateKey, observedNameCount: observedNames.length,
      });
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

    serviceLanguageBySite.push([...serviceLanguageRuleIds].sort());
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
    serviceLanguageBySite: Object.freeze(serviceLanguageBySite.map((ids) => Object.freeze(ids))),
    identityDecisions: Object.freeze({
      attach: identityOutcomes.filter((entry) => entry.decision === "attach").length,
      review_required: identityOutcomes.filter((entry) => entry.decision === "review_required").length,
      conflict: identityOutcomes.filter((entry) => entry.decision === "conflict").length,
    }),
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
