import type { RuntimeLeadPolicy } from "../config/lead-policy.js";
import type { NicheConfiguration } from "../config/niches.js";
import type { CrawlLimits, CrawlResult, SafeFetcher } from "../crawl/types.js";
import type { SqliteDatabase } from "../db/database.js";
import type { LeadEngineRepositories } from "../db/repositories.js";
import type {
  WebsiteAssessmentRecord,
  WebsiteAssessmentRepository,
} from "../db/website-assessment-repository.js";
import type { DiscoveryObservation } from "../discovery/result-normalizer.js";
import type { DiscoveryQuery } from "../discovery/query-generator.js";
import type { BusinessIdentityEvidence } from "../extraction/business-identity.js";
import type { ContactObservation } from "../extraction/contact.js";
import type { ConversionSignal } from "../extraction/conversion.js";
import type { HtmlExtraction, HtmlExtractionContext } from "../extraction/html.js";
import type { JsonLdExtraction } from "../extraction/json-ld.js";
import type { PersonEvidenceCandidate } from "../extraction/people.js";
import type { ServiceEvidenceObservation } from "../extraction/services.js";
import type { CoverageManifest, GeographyTarget } from "../geography/types.js";
import type {
  BusinessIdentityRecord,
  IdentityMatchDecision,
} from "../identity/hierarchy.js";
import type { FixtureScenario, ProviderEnvelope } from "../providers/contracts.js";
import type { ProviderRegistry } from "../providers/registry.js";
import type { FeatureAssessmentStatus } from "../validation/website-assessment.js";

export const OFFLINE_ORCHESTRATION_VERSION = "offline-orchestration-1.0.0";

export interface OfflineRunBudget {
  readonly maxProviderCalls: number;
  readonly maxWebsiteRequests: number;
  readonly maxPages: number;
  readonly maxCompressedBytes: number;
  readonly maxDecompressedBytes: number;
  readonly maxElapsedCrawlMs: number;
}

export interface OfflineBudgetUsage {
  readonly providerCalls: number;
  readonly websiteRequests: number;
  readonly pages: number;
  readonly compressedBytes: number;
  readonly decompressedBytes: number;
  readonly elapsedCrawlMs: number;
  readonly costMicroUsd: 0;
}

export interface OfflineBudgetSnapshot {
  readonly allowed: OfflineRunBudget;
  readonly consumed: OfflineBudgetUsage;
  readonly remaining: OfflineRunBudget;
  readonly denialReason: string | null;
}

export interface OfflineLeadPipelineInput {
  readonly runKey: string;
  readonly nicheId: string;
  readonly market: ReadonlyArray<GeographyTarget>;
  readonly providerId: string;
  readonly fixtureScenario?: FixtureScenario;
  readonly fixtureWebsite: Readonly<{
    fixtureId: string;
    providerResultId: string;
    expectedBusinessName: string;
    url: string;
  }>;
  readonly executionScope: "offline_synthetic";
  readonly budget: OfflineRunBudget;
  readonly queryVersion: string;
  readonly extractionVersion: string;
  readonly orchestrationVersion: string;
  readonly signal?: AbortSignal;
}

export interface OfflineFixtureFetcher extends SafeFetcher {
  readonly sourceClass: "synthetic_fixture";
  handles(url: string): boolean;
}

export interface OfflineWebsiteCrawler {
  crawl(input: {
    websiteUrl: string;
    observedAt?: string;
    signal?: AbortSignal;
  }): Promise<CrawlResult>;
}

export type OfflinePipelineStage =
  | "validation"
  | "run"
  | "coverage"
  | "discovery"
  | "identity"
  | "website_assessment"
  | "persistence"
  | "finalization";

export interface OfflinePipelineEvent {
  readonly runId: string;
  readonly stage: OfflinePipelineStage;
  readonly type:
    | "started"
    | "completed"
    | "review_required"
    | "cancelled"
    | "budget_blocked"
    | "failed";
  readonly at: string;
  readonly details: Readonly<Record<string, unknown>>;
}

export interface OfflineExtractors {
  extractHtml(source: string, context: HtmlExtractionContext): HtmlExtraction;
  extractJsonLd(source: string, context: HtmlExtractionContext): JsonLdExtraction;
  extractBusinessIdentity(input: {
    html: HtmlExtraction;
    jsonLd: JsonLdExtraction;
  }): BusinessIdentityEvidence;
  extractContactInformation(input: {
    html: HtmlExtraction;
    jsonLd: JsonLdExtraction;
    homepage: string;
  }): ContactObservation[];
  extractPersonCandidates(input: {
    html: HtmlExtraction;
    jsonLd: JsonLdExtraction;
    knownBusinessNames: ReadonlyArray<string>;
  }): PersonEvidenceCandidate[];
  extractServiceEvidence(input: {
    html: HtmlExtraction | null;
    jsonLd: JsonLdExtraction | null;
    niche: Pick<NicheConfiguration,
      | "service_synonyms"
      | "required_indicators"
      | "negative_keywords"
      | "excluded_adjacent_industries"
      | "relevant_categories">;
    providerCategories?: ReadonlyArray<string>;
    providerSourceClass?: DiscoveryObservation["sourceClass"];
  }): ServiceEvidenceObservation[];
  extractConversionSignals(input: {
    html: HtmlExtraction;
    homepage: string;
    validResponse: boolean;
  }): ConversionSignal[];
}

export interface OfflineLeadPipelineDependencies {
  readonly policy: RuntimeLeadPolicy;
  readonly niche: NicheConfiguration;
  readonly providerRegistry: Pick<ProviderRegistry, "require">;
  readonly repositories: LeadEngineRepositories;
  readonly websiteAssessments: WebsiteAssessmentRepository;
  readonly database: SqliteDatabase;
  readonly fixtureFetcher: OfflineFixtureFetcher;
  readonly createWebsiteCrawler: (options: {
    fetcher: SafeFetcher;
    limits: CrawlLimits;
    now: () => Date;
  }) => OfflineWebsiteCrawler;
  readonly coveragePlanner: typeof import("../geography/coverage-planner.js").planCoverage;
  readonly queryGenerator: typeof import("../discovery/query-generator.js").generateDiscoveryQueries;
  readonly resultNormalizer: (
    envelopes: ReadonlyArray<ProviderEnvelope<DiscoveryObservation["result"]>>,
  ) => DiscoveryObservation[];
  readonly identityMatcher: (
    left: BusinessIdentityRecord,
    right: BusinessIdentityRecord,
    options?: { currentAt?: string },
  ) => IdentityMatchDecision;
  readonly existingIdentities: (
    observation: DiscoveryObservation,
  ) => ReadonlyArray<BusinessIdentityRecord>;
  readonly extractors: OfflineExtractors;
  readonly clock: { now(): string };
  readonly ids: {
    id(prefix: string, value: unknown): string;
    hash(value: unknown): string;
  };
  readonly events: { emit(event: OfflinePipelineEvent): void };
}

export interface OfflineWebsiteAssessmentResult {
  readonly record: WebsiteAssessmentRecord;
  readonly pages: ReadonlyArray<{
    url: string;
    kind: string;
    inspectionStatus: string;
    contentChecksum: string | null;
  }>;
  readonly complete: boolean;
  readonly timedOut: boolean;
}

export interface OfflineLeadPipelineResult {
  readonly status: "completed" | "review_required" | "cancelled" | "budget_blocked";
  readonly run: Readonly<{
    runId: string;
    runKey: string;
    executionMode: "offline_synthetic";
    nicheId: "pool_service";
    providerId: string;
    policyVersion: string;
    orchestrationVersion: string;
    extractionVersion: string;
    startedAt: string;
    completedAt: string;
  }>;
  readonly coverage: CoverageManifest | null;
  readonly queries: ReadonlyArray<DiscoveryQuery>;
  readonly discoveryEvidence: ReadonlyArray<DiscoveryObservation>;
  readonly businessCandidate: Readonly<{
    businessId: string;
    canonicalName: string;
    resolution: "new_candidate" | "safe_match" | "review_required";
    assessmentAttachment: "not_assessed" | "new_candidate" | "safe_match" | "isolated_candidate";
  }> | null;
  readonly identityDecisions: ReadonlyArray<IdentityMatchDecision>;
  readonly websiteAssessment: OfflineWebsiteAssessmentResult | null;
  readonly phoneCandidates: ReadonlyArray<ContactObservation>;
  readonly emailCandidates: ReadonlyArray<ContactObservation>;
  readonly personCandidates: ReadonlyArray<PersonEvidenceCandidate>;
  readonly serviceEvidence: ReadonlyArray<ServiceEvidenceObservation>;
  readonly conversionSignals: ReadonlyArray<{
    feature: string;
    status: FeatureAssessmentStatus;
    sourceClass: string;
    claimState: string;
  }>;
  readonly provenance: Readonly<{
    sourceClasses: ReadonlyArray<string>;
    claimStates: ReadonlyArray<string>;
  }>;
  readonly verificationStates: Readonly<{
    contacts: "not_checked";
    people: "not_checked";
    ownerRelationship: "not_checked";
    decisionAuthority: "not_checked";
  }>;
  readonly review: Readonly<{
    required: boolean;
    reasons: ReadonlyArray<string>;
    assessmentAttachment: "not_assessed" | "new_candidate" | "safe_match" | "isolated_candidate";
  }>;
  readonly warnings: ReadonlyArray<string>;
  readonly rejectionReasons: ReadonlyArray<string>;
  readonly budget: OfflineBudgetSnapshot;
}
