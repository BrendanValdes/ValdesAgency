import {
  assertRuntimeLeadPolicy,
  requireProviderPolicy,
} from "../config/lead-policy.js";
import { nicheConfigurationHash } from "../config/niches.js";
import { DEFAULT_CRAWL_LIMITS } from "../crawl/policies.js";
import {
  CRAWL_POLICY_VERSION,
  EXTRACTION_POLICY_VERSION,
  type CrawlLimits,
  type CrawlResult,
  type FetchFailure,
  type FetchResult,
  type SafeFetcher,
} from "../crawl/types.js";
import { createEvidence } from "../domain/evidence.js";
import { microUsd } from "../domain/money.js";
import { PROVENANCE_POLICY_VERSION } from "../domain/provenance.js";
import type { Evidence } from "../domain/types.js";
import { withTransaction } from "../db/transaction.js";
import type { DiscoveryObservation } from "../discovery/result-normalizer.js";
import type { DiscoveryQuery } from "../discovery/query-generator.js";
import { extractLinks } from "../extraction/links.js";
import type { HtmlExtraction } from "../extraction/html.js";
import type { JsonLdExtraction } from "../extraction/json-ld.js";
import type { PersonEvidenceCandidate } from "../extraction/people.js";
import type { ServiceEvidenceObservation } from "../extraction/services.js";
import type { ContactObservation } from "../extraction/contact.js";
import type { CoverageManifest } from "../geography/types.js";
import type {
  BusinessIdentityRecord,
  IdentityMatchDecision,
  IdentitySignalEvidence,
} from "../identity/hierarchy.js";
import {
  normalizeBusinessName,
  normalizePhoneCandidate,
} from "../identity/normalize.js";
import type {
  NormalizedDiscoveryResult,
  ProviderEnvelope,
} from "../providers/contracts.js";
import { assessBusinessOperationalEvidence } from "../validation/business-operational.js";
import {
  assessConversionFeatures,
  WEBSITE_ASSESSMENT_POLICY_VERSION,
} from "../validation/website-assessment.js";
import {
  OFFLINE_ORCHESTRATION_VERSION,
  type OfflineBudgetSnapshot,
  type OfflineBudgetUsage,
  type OfflineLeadPipelineDependencies,
  type OfflineLeadPipelineInput,
  type OfflineLeadPipelineResult,
  type OfflinePipelineEvent,
  type OfflinePipelineStage,
  type OfflineRunBudget,
  type OfflineWebsiteAssessmentResult,
} from "./types.js";
import {
  OfflineClassifiedFailure,
  OfflineManualInterventionError,
  OfflineProcessInterrupted,
  OfflineRetryNotReadyError,
  OfflineRetryScheduledError,
  OfflineTransientFailure,
} from "./reliability/errors.js";
import { OfflineReliabilityRepository } from "./reliability/repository.js";
import {
  boundedRetryPolicy,
  classifyOfflineFailure,
  retryDelayMs,
} from "./reliability/retry-policy.js";
import {
  OFFLINE_DURABLE_STAGE_VERSIONS,
  OFFLINE_TERMINAL_RUN_STATES,
  type OfflineCheckpointReference,
  type OfflineDurableStage,
  type OfflineLeaseCredentials,
  type OfflineStageCheckpoint,
} from "./reliability/types.js";

const MAX_SAFE_BUDGET = 10_000_000;
const FRESHNESS_MS = 86_400_000;

class PipelineCancelled extends Error {
  readonly stage: OfflinePipelineStage;

  constructor(stage: OfflinePipelineStage) {
    super(`Offline lead pipeline cancelled during ${stage}`);
    this.name = "PipelineCancelled";
    this.stage = stage;
  }
}

class PipelineBudgetBlocked extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`Offline lead pipeline budget blocked: ${reason}`);
    this.name = "PipelineBudgetBlocked";
    this.reason = reason;
  }
}

interface MutableUsage {
  providerCalls: number;
  websiteRequests: number;
  pages: number;
  compressedBytes: number;
  decompressedBytes: number;
  elapsedCrawlMs: number;
  retryAttempts: number;
  costMicroUsd: 0;
}

class BudgetTracker {
  readonly #allowed: OfflineRunBudget;
  readonly #usage: MutableUsage;
  readonly #onChange: (usage: OfflineBudgetUsage) => void;
  #denialReason: string | null = null;

  constructor(
    allowed: OfflineRunBudget,
    initial: Partial<OfflineBudgetUsage> = {},
    onChange: (usage: OfflineBudgetUsage) => void = () => undefined,
  ) {
    this.#allowed = { ...allowed };
    this.#usage = {
      providerCalls: initial.providerCalls ?? 0,
      websiteRequests: initial.websiteRequests ?? 0,
      pages: initial.pages ?? 0,
      compressedBytes: initial.compressedBytes ?? 0,
      decompressedBytes: initial.decompressedBytes ?? 0,
      elapsedCrawlMs: initial.elapsedCrawlMs ?? 0,
      retryAttempts: initial.retryAttempts ?? 0,
      costMicroUsd: 0,
    };
    for (const [name, value] of Object.entries(this.#usage)) {
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(`Persisted budget usage ${name} is invalid`);
      }
    }
    this.#onChange = onChange;
  }

  #changed(): void {
    this.#onChange({ ...this.#usage });
  }

  deny(reason: string): never {
    this.#denialReason ??= reason;
    throw new PipelineBudgetBlocked(this.#denialReason);
  }

  beginProviderCall(): void {
    if (this.#usage.providerCalls >= this.#allowed.maxProviderCalls) {
      this.deny("provider_call_budget_exhausted");
    }
    this.#usage.providerCalls += 1;
    this.#changed();
  }

  beginWebsiteRequest(): boolean {
    if (this.#usage.websiteRequests >= this.#allowed.maxWebsiteRequests) {
      this.#denialReason ??= "website_request_budget_exhausted";
      return false;
    }
    this.#usage.websiteRequests += 1;
    this.#changed();
    return true;
  }

  recordWebsiteResponse(result: FetchResult): FetchResult {
    if (!result.ok) return result;
    this.#usage.compressedBytes += result.compressedBytes;
    this.#usage.decompressedBytes += result.decompressedBytes;
    this.#changed();
    if (this.#usage.compressedBytes > this.#allowed.maxCompressedBytes) {
      this.#denialReason ??= "compressed_byte_budget_exhausted";
      return failureFrom(result, "compressed_size_exceeded");
    }
    if (this.#usage.decompressedBytes > this.#allowed.maxDecompressedBytes) {
      this.#denialReason ??= "decompressed_byte_budget_exhausted";
      return failureFrom(result, "decompressed_size_exceeded");
    }
    return result;
  }

  recordCrawl(crawl: CrawlResult): void {
    this.#usage.pages += crawl.pages.length;
    const started = Date.parse(crawl.startedAt);
    const completed = Date.parse(crawl.completedAt);
    this.#usage.elapsedCrawlMs += Number.isFinite(started) && Number.isFinite(completed)
      ? Math.max(0, completed - started)
      : 0;
    this.#changed();
    if (this.#usage.pages > this.#allowed.maxPages) {
      this.#denialReason ??= "page_budget_exhausted";
    }
    if (this.#usage.elapsedCrawlMs > this.#allowed.maxElapsedCrawlMs) {
      this.#denialReason ??= "crawl_duration_budget_exhausted";
    }
  }

  recordRetryAttempt(): void {
    this.#usage.retryAttempts += 1;
    this.#changed();
  }

  assertWebsiteEligibility(): void {
    if (this.#allowed.maxWebsiteRequests === 0) {
      this.deny("website_request_budget_exhausted");
    }
    if (this.#allowed.maxPages === 0) this.deny("page_budget_exhausted");
    if (this.#allowed.maxCompressedBytes === 0) {
      this.deny("compressed_byte_budget_exhausted");
    }
    if (this.#allowed.maxDecompressedBytes === 0) {
      this.deny("decompressed_byte_budget_exhausted");
    }
    if (this.#allowed.maxElapsedCrawlMs === 0) {
      this.deny("crawl_duration_budget_exhausted");
    }
  }

  assertNotDenied(): void {
    if (this.#denialReason) throw new PipelineBudgetBlocked(this.#denialReason);
  }

  snapshot(): OfflineBudgetSnapshot {
    const consumed: OfflineBudgetUsage = { ...this.#usage };
    return {
      allowed: { ...this.#allowed },
      consumed,
      remaining: {
        maxProviderCalls: Math.max(0, this.#allowed.maxProviderCalls - consumed.providerCalls),
        maxWebsiteRequests: Math.max(0, this.#allowed.maxWebsiteRequests - consumed.websiteRequests),
        maxPages: Math.max(0, this.#allowed.maxPages - consumed.pages),
        maxCompressedBytes: Math.max(0, this.#allowed.maxCompressedBytes - consumed.compressedBytes),
        maxDecompressedBytes: Math.max(0, this.#allowed.maxDecompressedBytes - consumed.decompressedBytes),
        maxElapsedCrawlMs: Math.max(0, this.#allowed.maxElapsedCrawlMs - consumed.elapsedCrawlMs),
      },
      denialReason: this.#denialReason,
    };
  }
}

function failureFrom(
  result: Extract<FetchResult, { ok: true }>,
  errorCode: "compressed_size_exceeded" | "decompressed_size_exceeded",
): FetchFailure {
  return {
    ok: false,
    requestedUrl: result.requestedUrl,
    finalUrl: result.finalUrl,
    errorCode,
    retryable: false,
    attempts: result.attempts,
    redirectHistory: result.redirectHistory,
    fetchedAt: result.fetchedAt,
    httpStatus: result.status,
  };
}

function withoutRawPageBody(page: CrawlResult["pages"][number]): CrawlResult["pages"][number] {
  return {
    ...page,
    fetch: page.fetch?.ok ? { ...page.fetch, body: "" } : page.fetch,
    html: null,
  };
}

function withoutRawPageBodies(crawl: CrawlResult): CrawlResult {
  return {
    ...crawl,
    pages: crawl.pages.map(withoutRawPageBody),
  };
}

function restoreRawPageBodies(
  checkpointed: CrawlResult,
  live: CrawlResult,
): CrawlResult {
  const liveByUrl = new Map(live.pages.map((page) => [page.url, page]));
  return {
    ...checkpointed,
    pages: checkpointed.pages.map((page) => {
      if (page.inspectionStatus !== "successful" || !page.fetch?.ok) return page;
      const current = liveByUrl.get(page.url);
      if (
        !current?.fetch?.ok || !current.html ||
        current.fetch.contentChecksum !== page.fetch.contentChecksum
      ) {
        throw new OfflineClassifiedFailure({
          code: "fixture_content_reconciliation_failed",
          classification: "manual_intervention",
          retryable: false,
          safeSummary: "Synthetic fixture content no longer matches the durable crawl metadata",
          terminalOutcome: "manual_intervention",
        });
      }
      return { ...page, html: current.html };
    }),
  };
}

class BudgetedFixtureFetcher implements SafeFetcher {
  readonly sourceClass = "synthetic_fixture" as const;
  readonly #dependencies: Pick<OfflineLeadPipelineDependencies, "fixtureFetcher" | "clock">;
  readonly #budget: BudgetTracker;

  constructor(
    dependencies: Pick<OfflineLeadPipelineDependencies, "fixtureFetcher" | "clock">,
    budget: BudgetTracker,
  ) {
    this.#dependencies = dependencies;
    this.#budget = budget;
  }

  async fetch(request: Parameters<SafeFetcher["fetch"]>[0]): Promise<FetchResult> {
    if (request.signal?.aborted) {
      return {
        ok: false,
        requestedUrl: request.url,
        finalUrl: null,
        errorCode: "cancelled",
        retryable: false,
        attempts: 0,
        redirectHistory: [],
        fetchedAt: this.#dependencies.clock.now(),
        httpStatus: null,
      };
    }
    if (!this.#budget.beginWebsiteRequest()) {
      return {
        ok: false,
        requestedUrl: request.url,
        finalUrl: null,
        errorCode: "policy_rejected",
        retryable: false,
        attempts: 0,
        redirectHistory: [],
        fetchedAt: this.#dependencies.clock.now(),
        httpStatus: null,
      };
    }
    const result = await this.#dependencies.fixtureFetcher.fetch(request);
    return this.#budget.recordWebsiteResponse(result);
  }
}

interface PipelineState {
  coverage: CoverageManifest | null;
  queries: DiscoveryQuery[];
  observations: DiscoveryObservation[];
  selectedObservation: DiscoveryObservation | null;
  selectedBusiness: OfflineLeadPipelineResult["businessCandidate"];
  identityDecisions: IdentityMatchDecision[];
  website: OfflineWebsiteAssessmentResult | null;
  phones: ContactObservation[];
  emails: ContactObservation[];
  people: PersonEvidenceCandidate[];
  services: ServiceEvidenceObservation[];
  conversions: OfflineLeadPipelineResult["conversionSignals"];
  reviewReasons: string[];
  warnings: string[];
}

interface ProviderDiscoveryProgress {
  envelopes: Array<ProviderEnvelope<NormalizedDiscoveryResult>>;
  providerCallIds: Record<string, string>;
  completedQueryIds: string[];
}

interface OfflineRunRow {
  run_id: string;
  run_key: string;
  input_hash: string;
  status: string;
  execution_state: import("./reliability/types.js").OfflineRunState;
  next_retry_at: string | null;
  result_json: string | null;
  usage_json: string;
  started_at: string;
}

function integerBudget(name: string, value: number, maximum = MAX_SAFE_BUDGET): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new Error(`${name} must be a nonnegative safe integer no greater than ${maximum}`);
  }
}

function validateBudget(budget: OfflineRunBudget): void {
  integerBudget("Provider-call budget", budget.maxProviderCalls, 10_000);
  integerBudget("Website-request budget", budget.maxWebsiteRequests, 10_000);
  integerBudget("Page budget", budget.maxPages, 20);
  integerBudget("Compressed-byte budget", budget.maxCompressedBytes, 5_000_000);
  integerBudget("Decompressed-byte budget", budget.maxDecompressedBytes, 10_000_000);
  integerBudget("Crawl-duration budget", budget.maxElapsedCrawlMs, 120_000);
  if (budget.maxCompressedBytes > 0 && budget.maxCompressedBytes < 1_024) {
    throw new Error("Compressed-byte budget must be zero or at least 1024 bytes");
  }
  if (budget.maxDecompressedBytes > 0 && budget.maxDecompressedBytes < 1_024) {
    throw new Error("Decompressed-byte budget must be zero or at least 1024 bytes");
  }
  if (
    budget.maxCompressedBytes > 0 &&
    budget.maxDecompressedBytes > 0 &&
    budget.maxDecompressedBytes < budget.maxCompressedBytes
  ) {
    throw new Error("Decompressed-byte budget cannot be smaller than compressed-byte budget");
  }
  if (budget.maxElapsedCrawlMs > 0 && budget.maxElapsedCrawlMs < 500) {
    throw new Error("Crawl-duration budget must be zero or at least 500 ms");
  }
}

function validatedFixtureUrl(input: OfflineLeadPipelineInput): string {
  let parsed: URL;
  try {
    parsed = new URL(input.fixtureWebsite.url);
  } catch {
    throw new Error("Fixture website URL is invalid");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error("Fixture website URL must be an HTTP(S) URL without credentials");
  }
  parsed.hash = "";
  return parsed.href;
}

function deterministicInputFailure(
  code: string,
  message: string,
  classification: "deterministic" | "policy" | "schema" = "deterministic",
  cause?: unknown,
): never {
  throw new OfflineClassifiedFailure({
    code,
    classification,
    retryable: false,
    safeSummary: message,
    cause,
  });
}

function validateInput(
  input: OfflineLeadPipelineInput,
  dependencies: OfflineLeadPipelineDependencies,
): string {
  try {
    assertRuntimeLeadPolicy(dependencies.policy);
  } catch (error) {
    deterministicInputFailure(
      "invalid_policy",
      error instanceof Error ? error.message : "Runtime lead policy is invalid",
      "policy",
      error,
    );
  }
  if (input.executionScope !== "offline_synthetic") {
    deterministicInputFailure(
      "malformed_execution_scope",
      "Offline orchestration requires the offline_synthetic execution scope",
      "policy",
    );
  }
  if (
    dependencies.policy.networkMode !== "disabled" ||
    dependencies.policy.paidProvidersEnabled ||
    dependencies.policy.externalVerificationEnabled
  ) {
    deterministicInputFailure(
      "invalid_offline_policy",
      "Offline orchestration requires networking, paid providers, and external verification to be disabled",
      "policy",
    );
  }
  if (
    dependencies.policy.defaultNiche !== "pool_service" ||
    dependencies.policy.enabledNiches.length !== 1 ||
    dependencies.policy.enabledNiches[0] !== "pool_service"
  ) {
    deterministicInputFailure(
      "invalid_niche_policy",
      "Offline orchestration requires pool_service as the sole enabled/default niche",
      "policy",
    );
  }
  if (input.nicheId !== "pool_service" || dependencies.niche.id !== input.nicheId) {
    deterministicInputFailure("unsupported_niche", `Unsupported or disabled niche: ${input.nicheId}`, "policy");
  }
  if (!dependencies.niche.enabled || !dependencies.policy.enabledNiches.includes(dependencies.niche.id)) {
    deterministicInputFailure("disabled_niche", `Niche ${input.nicheId} is disabled`, "policy");
  }
  let providerPolicy: ReturnType<typeof requireProviderPolicy>;
  try {
    providerPolicy = requireProviderPolicy(dependencies.policy, input.providerId);
  } catch (error) {
    deterministicInputFailure(
      "disabled_provider",
      error instanceof Error ? error.message : `Provider ${input.providerId} is disabled`,
      "policy",
      error,
    );
  }
  if (
    !providerPolicy.enabled ||
    providerPolicy.sourceClass !== "synthetic_fixture" ||
    providerPolicy.requiresNetwork ||
    providerPolicy.canIncurCost ||
    !providerPolicy.operations.includes("discovery")
  ) {
    deterministicInputFailure(
      "disabled_provider",
      `Provider ${input.providerId} is not permitted for synthetic offline discovery`,
      "policy",
    );
  }
  const provider = dependencies.providerRegistry.require(input.providerId);
  if (provider.providerId !== input.providerId) {
    deterministicInputFailure("provider_registry_mismatch", "Provider registry returned a mismatched provider");
  }
  if (dependencies.fixtureFetcher.sourceClass !== "synthetic_fixture") {
    deterministicInputFailure(
      "invalid_fixture_fetcher",
      "Website assessment requires an injected synthetic fixture fetcher",
      "policy",
    );
  }
  if (!input.runKey.trim()) deterministicInputFailure("malformed_input", "Offline run key is required");
  if (!input.fixtureWebsite.fixtureId.trim()) deterministicInputFailure("malformed_input", "Fixture identity is required");
  if (!input.fixtureWebsite.providerResultId.trim()) {
    deterministicInputFailure("malformed_input", "Fixture provider result identity is required");
  }
  if (!input.fixtureWebsite.expectedBusinessName.trim()) {
    deterministicInputFailure("malformed_input", "Fixture business name is required");
  }
  if (input.market.length === 0) deterministicInputFailure("malformed_input", "At least one coverage target is required");
  if (!input.queryVersion.trim()) deterministicInputFailure("malformed_input", "Query version is required");
  if (input.orchestrationVersion !== OFFLINE_ORCHESTRATION_VERSION) {
    deterministicInputFailure("schema_version_mismatch", "Unsupported offline orchestration version", "schema");
  }
  if (input.extractionVersion !== EXTRACTION_POLICY_VERSION) {
    deterministicInputFailure(
      "extraction_version_mismatch",
      "Offline extraction version does not match the executable extractor policy",
      "schema",
    );
  }
  try {
    validateBudget(input.budget);
  } catch (error) {
    deterministicInputFailure(
      "invalid_budget_policy",
      error instanceof Error ? error.message : "Offline budget is invalid",
      "policy",
      error,
    );
  }
  let fixtureUrl: string;
  try {
    fixtureUrl = validatedFixtureUrl(input);
  } catch (error) {
    deterministicInputFailure(
      "malformed_fixture_url",
      error instanceof Error ? error.message : "Fixture website URL is invalid",
      "policy",
      error,
    );
  }
  if (!dependencies.fixtureFetcher.handles(fixtureUrl)) {
    deterministicInputFailure(
      "url_policy_denied",
      "Fixture website URL has no explicit synthetic fetcher mapping",
      "policy",
    );
  }
  return fixtureUrl;
}

function semanticInput(input: OfflineLeadPipelineInput, fixtureUrl: string): unknown {
  return {
    runKey: input.runKey,
    nicheId: input.nicheId,
    market: input.market,
    providerId: input.providerId,
    fixtureScenario: input.fixtureScenario ?? "success",
    fixtureWebsite: { ...input.fixtureWebsite, url: fixtureUrl },
    executionScope: input.executionScope,
    budget: input.budget,
    queryVersion: input.queryVersion,
    extractionVersion: input.extractionVersion,
    orchestrationVersion: input.orchestrationVersion,
  };
}

function emptyState(): PipelineState {
  return {
    coverage: null,
    queries: [],
    observations: [],
    selectedObservation: null,
    selectedBusiness: null,
    identityDecisions: [],
    website: null,
    phones: [],
    emails: [],
    people: [],
    services: [],
    conversions: [],
    reviewReasons: [],
    warnings: [],
  };
}

function identityEvidence(observation: DiscoveryObservation): IdentitySignalEvidence {
  return {
    sourceClass: observation.sourceClass,
    claimState: observation.claimState,
    externalVerificationState: "unassessed",
    verificationDimension: null,
    verifierId: null,
    verificationMethod: null,
    verificationResult: null,
    verifiedAt: null,
    expiresAt: null,
    normalizedValue: null,
    evidenceReference: observation.observationId,
  };
}

function observationIdentity(
  observation: DiscoveryObservation,
  dependencies: OfflineLeadPipelineDependencies,
): BusinessIdentityRecord {
  const evidence = identityEvidence(observation);
  const result = observation.result;
  const entityId = dependencies.ids.id("business_candidate", {
    providerId: observation.providerId,
    providerResultId: observation.providerResultId,
    name: normalizeBusinessName(result.name),
    address: result.address,
  });
  return {
    entityId,
    locationId: dependencies.ids.id("business_location", {
      entityId,
      address: result.address,
    }),
    groupId: result.groupHint,
    displayName: result.name,
    dbaNames: result.brandName ? [result.brandName] : [],
    legalName: null,
    nameEvidence: evidence,
    providerIdentifiers: observation.providerResultId
      ? [{
          providerId: observation.providerId,
          value: observation.providerResultId,
          trusted: false,
          evidence,
        }]
      : [],
    domains: result.domains.map((value) => ({ value, evidence })),
    phones: result.phones.map((value) => normalizePhoneCandidate(value, {
      evidence,
      associationCertain: false,
    })),
    address: {
      line1: result.address.line1 ?? "",
      city: result.address.city,
      region: result.address.region,
      postalCode: result.address.postalCode ?? "",
      countryCode: result.address.countryCode,
      evidence,
    },
    chainAffiliation: result.brandName
      ? { brandName: result.brandName, franchise: false, evidence }
      : null,
  };
}

function coverageLimits(input: OfflineLeadPipelineInput): CrawlLimits {
  return {
    ...DEFAULT_CRAWL_LIMITS,
    maxPages: input.budget.maxPages,
    maxSitemapFiles: 0,
    maxSitemapUrls: 0,
    maxRetries: 1,
    maxCompressedBytes: input.budget.maxCompressedBytes,
    maxDecompressedBytes: input.budget.maxDecompressedBytes,
    crawlDurationMs: input.budget.maxElapsedCrawlMs,
  };
}

function confidenceBasisPoints(confidence: "high" | "medium" | "low"): number {
  return confidence === "high" ? 9_000 : confidence === "medium" ? 7_000 : 5_000;
}

function sourceEvidence(input: {
  id: string;
  entityType: "business" | "person";
  entityId: string;
  fieldName: string;
  claimedValue: string | null;
  sourceClass: Evidence["sourceClass"];
  claimState: Evidence["claimState"];
  sourceUrl: string | null;
  observedAt: string;
  fetchedAt: string;
  confidenceBasisPoints: number;
  extractionMethod: string;
  contentChecksum: string | null;
  extractionVersion: string;
  currentAt: string;
  evidenceReference?: string | null;
}): Evidence {
  return createEvidence({
    id: input.id,
    entityType: input.entityType,
    entityId: input.entityId,
    fieldName: input.fieldName,
    claimedValue: input.claimedValue,
    source: "offline_synthetic_fixture",
    sourceClass: input.sourceClass,
    sourceUrl: input.sourceUrl,
    observedAt: input.observedAt,
    fetchedAt: input.fetchedAt,
    confidenceBasisPoints: input.confidenceBasisPoints,
    extractionMethod: input.extractionMethod,
    conflictStatus: input.claimState === "conflicting" ? "confirmed" : "none",
    rawReferenceChecksum: input.contentChecksum,
    policyVersion: input.extractionVersion,
    claimState: input.claimState,
    verificationState: "not_checked",
    decisionState: input.claimState === "conflicting" ? "human_review" : "unknown",
    evidenceReference: input.evidenceReference ?? input.contentChecksum,
    createdAt: input.currentAt,
    updatedAt: input.currentAt,
  });
}

function uniqueStrings(values: ReadonlyArray<string>): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function cancellationReason(signal: AbortSignal | undefined): string {
  if (!signal?.aborted) return "cancelled";
  if (typeof signal.reason === "string" && signal.reason.trim()) return signal.reason;
  if (signal.reason instanceof Error && signal.reason.message.trim()) return signal.reason.message;
  return "cancelled";
}

function resultFor(
  status: OfflineLeadPipelineResult["status"],
  input: OfflineLeadPipelineInput,
  runId: string,
  startedAt: string,
  completedAt: string,
  state: PipelineState,
  budget: OfflineBudgetSnapshot,
  rejectionReasons: ReadonlyArray<string>,
): OfflineLeadPipelineResult {
  const sources = uniqueStrings([
    ...state.observations.map((value) => value.sourceClass),
    ...state.phones.map((value) => value.sourceClass),
    ...state.emails.map((value) => value.sourceClass),
    ...state.people.map((value) => value.sourceClass),
    ...state.services.map((value) => value.sourceClass),
    ...state.conversions.map((value) => value.sourceClass),
  ]);
  const claims = uniqueStrings([
    ...state.observations.map((value) => value.claimState),
    ...state.phones.map((value) => value.claimState),
    ...state.emails.map((value) => value.claimState),
    ...state.people.map((value) => value.claimState),
    ...state.services.map((value) => value.claimState),
    ...state.conversions.map((value) => value.claimState),
  ]);
  const attachment = state.selectedBusiness?.assessmentAttachment ?? "not_assessed";
  return {
    status,
    run: {
      runId,
      runKey: input.runKey,
      executionMode: "offline_synthetic",
      nicheId: "pool_service",
      providerId: input.providerId,
      policyVersion: "",
      orchestrationVersion: input.orchestrationVersion,
      extractionVersion: input.extractionVersion,
      startedAt,
      completedAt,
    },
    coverage: state.coverage,
    queries: state.queries,
    discoveryEvidence: state.observations,
    businessCandidate: state.selectedBusiness,
    identityDecisions: state.identityDecisions,
    websiteAssessment: state.website,
    phoneCandidates: state.phones,
    emailCandidates: state.emails,
    personCandidates: state.people,
    serviceEvidence: state.services,
    conversionSignals: state.conversions,
    provenance: { sourceClasses: sources, claimStates: claims },
    verificationStates: {
      contacts: "not_checked",
      people: "not_checked",
      ownerRelationship: "not_checked",
      decisionAuthority: "not_checked",
    },
    review: {
      required: state.reviewReasons.length > 0,
      reasons: uniqueStrings(state.reviewReasons),
      assessmentAttachment: attachment,
    },
    warnings: uniqueStrings(state.warnings),
    rejectionReasons: uniqueStrings(rejectionReasons),
    budget,
  };
}

function withPolicyVersion(
  result: OfflineLeadPipelineResult,
  policyVersion: string,
): OfflineLeadPipelineResult {
  return { ...result, run: { ...result.run, policyVersion } };
}

function taskIds(
  runId: string,
  dependencies: OfflineLeadPipelineDependencies,
): Record<"coverage" | "discovery" | "identity" | "website" | "persistence", string> {
  return {
    coverage: dependencies.ids.id("offline_task", { runId, stage: "coverage" }),
    discovery: dependencies.ids.id("offline_task", { runId, stage: "discovery" }),
    identity: dependencies.ids.id("offline_task", { runId, stage: "identity" }),
    website: dependencies.ids.id("offline_task", { runId, stage: "website_assessment" }),
    persistence: dependencies.ids.id("offline_task", { runId, stage: "persistence" }),
  };
}

function budgetDelta(
  before: OfflineBudgetUsage,
  after: OfflineBudgetUsage,
): OfflineBudgetUsage {
  return {
    providerCalls: Math.max(0, after.providerCalls - before.providerCalls),
    websiteRequests: Math.max(0, after.websiteRequests - before.websiteRequests),
    pages: Math.max(0, after.pages - before.pages),
    compressedBytes: Math.max(0, after.compressedBytes - before.compressedBytes),
    decompressedBytes: Math.max(0, after.decompressedBytes - before.decompressedBytes),
    elapsedCrawlMs: Math.max(0, after.elapsedCrawlMs - before.elapsedCrawlMs),
    retryAttempts: Math.max(0, after.retryAttempts - before.retryAttempts),
    costMicroUsd: 0,
  };
}

interface DurableStageExecution<T extends object> {
  readonly output: T;
  readonly references?: ReadonlyArray<OfflineCheckpointReference>;
}

class DurableStageRunner {
  readonly #runId: string;
  readonly #inputHash: string;
  readonly #dependencies: OfflineLeadPipelineDependencies;
  readonly #reliability: OfflineReliabilityRepository;
  readonly #budget: BudgetTracker;
  readonly #retryPolicy: ReturnType<typeof boundedRetryPolicy>;
  readonly #lease: OfflineLeaseCredentials;
  #currentStage: OfflineDurableStage = "policy_validation";
  #currentCheckpoint: OfflineStageCheckpoint<object> | null = null;
  #usageBeforeStage: OfflineBudgetUsage;

  constructor(input: {
    runId: string;
    inputHash: string;
    dependencies: OfflineLeadPipelineDependencies;
    reliability: OfflineReliabilityRepository;
    budget: BudgetTracker;
    lease: OfflineLeaseCredentials;
  }) {
    this.#runId = input.runId;
    this.#inputHash = input.inputHash;
    this.#dependencies = input.dependencies;
    this.#reliability = input.reliability;
    this.#budget = input.budget;
    this.#lease = input.lease;
    this.#retryPolicy = boundedRetryPolicy(input.dependencies.reliability.retryPolicy);
    this.#usageBeforeStage = input.budget.snapshot().consumed;
  }

  get currentStage(): OfflineDurableStage {
    return this.#currentStage;
  }

  heartbeat(): void {
    this.#reliability.heartbeatLease(
      this.#runId,
      this.#lease,
      this.#dependencies.reliability.leaseDurationMs,
    );
  }

  recordBudgetUsage(usage: OfflineBudgetUsage): void {
    this.#reliability.updateRunningStageBudget({
      runId: this.#runId,
      stage: this.#currentStage,
      lease: this.#lease,
      budgetConsumed: usage,
    });
  }

  async run<T extends object>(input: {
    stage: OfflineDurableStage;
    fingerprintInput: unknown;
    execute: (control: {
      previousOutput: T | null;
      progress(output: T, references?: ReadonlyArray<OfflineCheckpointReference>): void;
    }) => Promise<DurableStageExecution<T>> | DurableStageExecution<T>;
  }): Promise<T> {
    this.#currentStage = input.stage;
    const stageVersion = OFFLINE_DURABLE_STAGE_VERSIONS[input.stage];
    const inputFingerprint = this.#dependencies.ids.hash({
      runId: this.#runId,
      inputHash: this.#inputHash,
      stage: input.stage,
      stageVersion,
      input: input.fingerprintInput,
    });
    const persisted = this.#reliability.getCheckpoint<T>(this.#runId, input.stage);
    if (persisted?.status === "completed") {
      const validation = this.#reliability.validateCompletedCheckpoint({
        checkpoint: persisted,
        inputFingerprint,
        stageVersion,
        orchestrationVersion: OFFLINE_ORCHESTRATION_VERSION,
      });
      if (!validation.reusable) {
        this.#reliability.recordManualIntervention({
          runId: this.#runId,
          stage: input.stage,
          reasonCode: validation.reasonCode,
          safeSummary: validation.summary,
        });
        this.#reliability.releaseLease(this.#runId, this.#lease);
        this.#reliability.transitionRun({
          runId: this.#runId,
          to: "manual_intervention",
          reasonCode: validation.reasonCode,
          terminalReasonCode: validation.reasonCode,
          safeErrorSummary: validation.summary,
        });
        throw new OfflineManualInterventionError(
          this.#runId,
          input.stage,
          validation.reasonCode,
          validation.summary,
        );
      }
      this.#reliability.recordCheckpointReuse(this.#runId, input.stage, this.#lease);
      return persisted.output as T;
    }

    this.#usageBeforeStage = this.#budget.snapshot().consumed;
    this.#currentCheckpoint = this.#reliability.beginStage({
      runId: this.#runId,
      stage: input.stage,
      inputFingerprint,
      stageVersion,
      orchestrationVersion: OFFLINE_ORCHESTRATION_VERSION,
      lease: this.#lease,
      budgetConsumed: this.#usageBeforeStage,
    });
    if (this.#currentCheckpoint.attemptNumber > 1) this.#budget.recordRetryAttempt();

    const progress = (output: T, references: ReadonlyArray<OfflineCheckpointReference> = []): void => {
      this.#reliability.updateStageProgress({
        runId: this.#runId,
        stage: input.stage,
        lease: this.#lease,
        output,
        outputFingerprint: this.#dependencies.ids.hash(output),
        references,
        budgetConsumed: this.#budget.snapshot().consumed,
      });
    };

    try {
      const result = await input.execute({
        previousOutput: this.#currentCheckpoint.output as T | null,
        progress,
      });
      const after = this.#budget.snapshot().consumed;
      this.#currentCheckpoint = this.#reliability.completeStage({
        runId: this.#runId,
        stage: input.stage,
        lease: this.#lease,
        output: result.output,
        outputFingerprint: this.#dependencies.ids.hash(result.output),
        references: result.references ?? [],
        budgetConsumed: after,
        budgetDelta: budgetDelta(this.#usageBeforeStage, after),
      });
      this.#dependencies.reliability.hooks?.afterStageCommitted?.(input.stage);
      return result.output;
    } catch (error) {
      if (
        error instanceof OfflineProcessInterrupted ||
        error instanceof PipelineCancelled ||
        error instanceof PipelineBudgetBlocked ||
        error instanceof OfflineRetryScheduledError ||
        error instanceof OfflineRetryNotReadyError ||
        error instanceof OfflineManualInterventionError
      ) {
        throw error;
      }
      const classification = classifyOfflineFailure(error, input.stage, this.#retryPolicy);
      const checkpoint = this.#reliability.getCheckpoint(this.#runId, input.stage);
      if (
        classification.retryable && checkpoint &&
        checkpoint.attemptNumber < classification.maximumAttempts
      ) {
        const delay = retryDelayMs(
          input.stage,
          checkpoint.attemptNumber,
          classification,
          this.#retryPolicy,
        );
        const nextRetryAt = new Date(Date.parse(this.#dependencies.clock.now()) + delay).toISOString();
        const after = this.#budget.snapshot().consumed;
        withTransaction(this.#dependencies.database, () => {
          this.#reliability.failStage({
            runId: this.#runId,
            stage: input.stage,
            lease: this.#lease,
            classification,
            status: "waiting_retry",
            nextRetryAt,
            retryDelayMs: delay,
            budgetConsumed: after,
            budgetDelta: budgetDelta(this.#usageBeforeStage, after),
          });
          this.#reliability.updateUsage(this.#runId, after);
          this.#reliability.releaseLease(this.#runId, this.#lease);
          this.#reliability.transitionRun({
            runId: this.#runId,
            to: "waiting_retry",
            reasonCode: classification.safeErrorCode,
            nextRetryAt,
          });
          this.#reliability.audit({
            runId: this.#runId,
            stageId: input.stage,
            action: "retry_scheduled",
            leaseId: this.#lease.leaseId,
            workerId: this.#lease.workerId,
            generation: this.#lease.generation,
            details: {
              attemptNumber: checkpoint.attemptNumber,
              delayMs: delay,
              nextRetryAt,
              errorCode: classification.safeErrorCode,
            },
          });
        });
        throw new OfflineRetryScheduledError({
          runId: this.#runId,
          stage: input.stage,
          attemptNumber: checkpoint.attemptNumber,
          nextRetryAt,
          safeErrorCode: classification.safeErrorCode,
        });
      }
      throw error;
    }
  }

  terminate(input: {
    classification: ReturnType<typeof classifyOfflineFailure>;
    runState: "cancelled" | "failed_terminal" | "manual_intervention";
  }): void {
    const checkpoint = this.#reliability.getCheckpoint(this.#runId, this.#currentStage);
    const after = this.#budget.snapshot().consumed;
    withTransaction(this.#dependencies.database, () => {
      if (checkpoint?.status === "running") {
        this.#reliability.failStage({
          runId: this.#runId,
          stage: this.#currentStage,
          lease: this.#lease,
          classification: input.classification,
          status: input.runState,
          nextRetryAt: null,
          retryDelayMs: null,
          budgetConsumed: after,
          budgetDelta: budgetDelta(this.#usageBeforeStage, after),
        });
      }
      if (input.runState === "cancelled") {
        this.#dependencies.database.prepare(`
          UPDATE offline_stage_checkpoints
          SET status = 'cancelled', error_classification = 'cancellation',
              error_code = ?, safe_error_summary = ?, retry_eligible = 0,
              next_retry_at = NULL, budget_consumed_json = ?, updated_at = ?
          WHERE run_id = ? AND status = 'waiting_retry'
        `).run(
          input.classification.safeErrorCode,
          input.classification.safeSummary,
          JSON.stringify(after),
          this.#dependencies.clock.now(),
          this.#runId,
        );
      }
      this.#reliability.updateUsage(this.#runId, after);
      if (input.runState === "cancelled") {
        this.#reliability.cancelLease(this.#runId, this.#lease);
      } else {
        this.#reliability.releaseLease(this.#runId, this.#lease);
      }
      this.#reliability.transitionRun({
        runId: this.#runId,
        to: input.runState,
        reasonCode: input.classification.safeErrorCode,
        terminalReasonCode: input.runState === "cancelled" ? null : input.classification.safeErrorCode,
        safeErrorSummary: input.runState === "cancelled" ? null : input.classification.safeSummary,
      });
      if (input.runState === "manual_intervention") {
        this.#reliability.recordManualIntervention({
          runId: this.#runId,
          stage: this.#currentStage,
          reasonCode: input.classification.safeErrorCode,
          safeSummary: input.classification.safeSummary,
        });
      }
    });
  }

  release(): void {
    this.#reliability.releaseLease(this.#runId, this.#lease);
  }
}

export async function runOfflineLeadAssessment(
  input: OfflineLeadPipelineInput,
  dependencies: OfflineLeadPipelineDependencies,
): Promise<OfflineLeadPipelineResult> {
  const fixtureUrl = validateInput(input, dependencies);
  const inputHash = dependencies.ids.hash(semanticInput(input, fixtureUrl));
  const runId = dependencies.ids.id("offline_run", { runKey: input.runKey, inputHash });
  const reliability = new OfflineReliabilityRepository({
    database: dependencies.database,
    clock: dependencies.clock,
    ids: dependencies.ids,
  });
  let existing = dependencies.database.prepare(`
    SELECT run_id, run_key, input_hash, status, execution_state, next_retry_at,
           result_json, usage_json, started_at
    FROM offline_orchestration_runs WHERE run_key = ?
  `).get(input.runKey) as OfflineRunRow | undefined;
  if (existing) {
    if (existing.input_hash !== inputHash) {
      throw new OfflineClassifiedFailure({
        code: "input_hash_conflict",
        classification: "deterministic",
        retryable: false,
        safeSummary: "Offline run key is already bound to different deterministic input",
      });
    }
    if (OFFLINE_TERMINAL_RUN_STATES.has(existing.execution_state) && existing.result_json) {
      return JSON.parse(existing.result_json) as OfflineLeadPipelineResult;
    }
    if (OFFLINE_TERMINAL_RUN_STATES.has(existing.execution_state)) {
      throw new OfflineManualInterventionError(
        existing.run_id,
        null,
        existing.execution_state,
        `Offline run ${existing.run_id} is terminal in ${existing.execution_state}`,
      );
    }
    if (
      existing.execution_state === "waiting_retry" && existing.next_retry_at &&
      existing.next_retry_at > dependencies.clock.now() && !input.signal?.aborted
    ) {
      throw new OfflineRetryNotReadyError(existing.run_id, existing.next_retry_at);
    }
  }

  const startedAt = existing?.started_at ?? dependencies.clock.now();
  const state = emptyState();

  if (!existing && input.signal?.aborted) {
    const budget = new BudgetTracker(input.budget);
    const completedAt = dependencies.clock.now();
    const result = withPolicyVersion(resultFor(
      "cancelled",
      input,
      runId,
      startedAt,
      completedAt,
      state,
      budget.snapshot(),
      [`cancelled_before_run:${cancellationReason(input.signal)}`],
    ), dependencies.policy.policyVersion);
    dependencies.events.emit({
      runId,
      stage: "validation",
      type: "cancelled",
      at: completedAt,
      details: { persisted: false, reason: cancellationReason(input.signal) },
    });
    return result;
  }

  const stageId = dependencies.ids.id("offline_stage", { runId, stage: "offline_lead_assessment" });
  const tasks = taskIds(runId, dependencies);

  if (!existing) {
    const initialBudget = new BudgetTracker(input.budget).snapshot();
    withTransaction(dependencies.database, () => {
      dependencies.repositories.runs.create({
        id: runId,
        state: "running",
        nicheId: "pool_service",
        budgetMicroUsd: microUsd(0),
        spentMicroUsd: microUsd(0),
        policyVersion: dependencies.policy.policyVersion,
        createdAt: startedAt,
        updatedAt: startedAt,
      });
      dependencies.database.prepare(`
        INSERT INTO offline_orchestration_runs
          (run_id, run_key, input_hash, execution_mode, status, niche_id, provider_id,
           fixture_id, fixture_url, policy_version, orchestration_version, extraction_version,
           budget_json, usage_json, review_required, assessment_attachment, denial_reason,
           result_json, started_at, completed_at, updated_at, execution_state, next_retry_at,
           terminal_reason_code, safe_error_summary, recovery_generation, state_version,
           last_transition_reason, last_transition_at)
        VALUES (?, ?, ?, 'offline_synthetic', 'running', 'pool_service', ?, ?, ?, ?, ?, ?, ?, ?,
          0, 'not_assessed', NULL, NULL, ?, NULL, ?, 'pending', NULL, NULL, NULL, 0, 0,
          'run_created', ?)
      `).run(
        runId,
        input.runKey,
        inputHash,
        input.providerId,
        input.fixtureWebsite.fixtureId,
        fixtureUrl,
        dependencies.policy.policyVersion,
        input.orchestrationVersion,
        input.extractionVersion,
        JSON.stringify(input.budget),
        JSON.stringify(initialBudget.consumed),
        startedAt,
        startedAt,
        startedAt,
      );
      dependencies.repositories.stagesAndTasks.createStage({
        id: stageId,
        runId,
        stageName: "offline_lead_assessment",
        state: "running",
        startedAt,
        finishedAt: null,
        createdAt: startedAt,
        updatedAt: startedAt,
      });
      for (const [name, id] of Object.entries(tasks)) {
        dependencies.repositories.stagesAndTasks.createTask({
          id,
          stageId,
          businessId: null,
          taskName: name,
          state: "not_checked",
          reasonCode: "value_not_checked",
          attempt: 0,
          createdAt: startedAt,
          updatedAt: startedAt,
        });
      }
    });
    dependencies.reliability.hooks?.afterRunCreated?.();
    existing = dependencies.database.prepare(`
      SELECT run_id, run_key, input_hash, status, execution_state, next_retry_at,
             result_json, usage_json, started_at
      FROM offline_orchestration_runs WHERE run_id = ?
    `).get(runId) as OfflineRunRow;
  }

  let recordRunningStageBudget: ((usage: OfflineBudgetUsage) => void) | null = null;
  const budget = new BudgetTracker(
    input.budget,
    JSON.parse(existing.usage_json) as OfflineBudgetUsage,
    (usage) => {
      if (recordRunningStageBudget) recordRunningStageBudget(usage);
      else reliability.updateUsage(runId, usage);
    },
  );
  const leaseToken = dependencies.reliability.leaseToken();
  const lease = reliability.acquireLease({
    runId,
    workerId: dependencies.reliability.workerId,
    token: leaseToken,
    durationMs: dependencies.reliability.leaseDurationMs,
  });
  const preLeaseState = reliability.getRun(runId)?.execution_state;
  if (!preLeaseState) throw new Error("Offline run disappeared before lease acquisition");
  if (preLeaseState === "pending") {
    reliability.transitionRun({ runId, to: "running", reasonCode: "worker_started" });
  } else if (preLeaseState === "waiting_retry") {
    reliability.transitionRun({ runId, to: "running", reasonCode: "retry_due" });
  } else if (preLeaseState === "running") {
    reliability.transitionRun({ runId, to: "recovering", reasonCode: "stale_worker_reclaimed" });
    reliability.transitionRun({ runId, to: "running", reasonCode: "checkpoint_recovery_started" });
    reliability.audit({
      runId,
      action: "run_recovered",
      leaseId: lease.leaseId,
      workerId: lease.workerId,
      generation: lease.generation,
      details: { previousState: preLeaseState },
    });
  } else if (preLeaseState === "recovering") {
    reliability.transitionRun({ runId, to: "running", reasonCode: "checkpoint_recovery_continued" });
  }

  const durable = new DurableStageRunner({
    runId,
    inputHash,
    dependencies,
    reliability,
    budget,
    lease,
  });
  recordRunningStageBudget = (usage) => durable.recordBudgetUsage(usage);

  const persistEvent = (event: OfflinePipelineEvent): void => {
    const eventId = dependencies.ids.id("offline_event", {
      runId: event.runId,
      stage: event.stage,
      type: event.type,
    });
    dependencies.database.prepare(`
      INSERT OR IGNORE INTO offline_orchestration_events
        (id, run_id, stage, event_type, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(eventId, event.runId, event.stage, event.type, JSON.stringify(event.details), event.at);
    dependencies.events.emit(event);
  };
  const event = (
    stage: OfflinePipelineStage,
    type: OfflinePipelineEvent["type"],
    details: Readonly<Record<string, unknown>> = {},
  ): void => persistEvent({ runId, stage, type, at: dependencies.clock.now(), details });
  const checkpoint = (stage: OfflinePipelineStage): void => {
    if (input.signal?.aborted) throw new PipelineCancelled(stage);
  };
  const updateTask = (
    taskId: string,
    taskState: "running" | "accepted" | "failed" | "human_review",
    reason: "value_not_checked" | "provider_failed" | "policy_rejected" | "human_review_required" | null = null,
  ): void => {
    dependencies.repositories.stagesAndTasks.updateTaskState(
      taskId,
      taskState,
      dependencies.clock.now(),
      reason,
    );
  };

  const assembleResult = (
    terminalStatus: OfflineLeadPipelineResult["status"],
    rejectionReasons: ReadonlyArray<string>,
  ): OfflineLeadPipelineResult => {
    const completedAt = dependencies.clock.now();
    const result = withPolicyVersion(resultFor(
      terminalStatus,
      input,
      runId,
      startedAt,
      completedAt,
      state,
      budget.snapshot(),
      rejectionReasons,
    ), dependencies.policy.policyVersion);
    return result;
  };
  const persistAssembledResult = (
    result: OfflineLeadPipelineResult,
    rejectionReasons: ReadonlyArray<string>,
  ): void => {
    const updatedAt = dependencies.clock.now();
    const updated = dependencies.database.prepare(`
      UPDATE offline_orchestration_runs
      SET usage_json = ?, review_required = ?, assessment_attachment = ?,
          denial_reason = ?, result_json = ?, updated_at = ?
      WHERE run_id = ? AND execution_state IN ('running', 'recovering')
    `).run(
      JSON.stringify(result.budget.consumed),
      result.review.required ? 1 : 0,
      result.review.assessmentAttachment,
      result.budget.denialReason ?? rejectionReasons[0] ?? null,
      JSON.stringify(result),
      updatedAt,
      runId,
    );
    if (updated.changes !== 1) throw new Error("Active offline run was not available for result persistence");
  };
  const updateCoreTerminalState = (
    terminalStatus: OfflineLeadPipelineResult["status"],
    completedAt: string,
  ): void => {
    const runState = terminalStatus === "completed"
      ? "accepted"
      : terminalStatus === "review_required"
        ? "human_review"
        : "failed";
    dependencies.repositories.runs.updateState(runId, runState, microUsd(0), completedAt);
    dependencies.repositories.stagesAndTasks.updateStageState(
      stageId,
      runState,
      completedAt,
      completedAt,
    );
    if (terminalStatus === "cancelled" || terminalStatus === "budget_blocked") {
      dependencies.database.prepare(`
        UPDATE stage_tasks
        SET state = CASE WHEN state IN ('accepted', 'human_review') THEN state ELSE 'failed' END,
            reason_code = CASE WHEN state IN ('accepted', 'human_review') THEN reason_code ELSE ? END,
            updated_at = ?
        WHERE stage_id = ?
      `).run("policy_rejected", completedAt, stageId);
    }
  };

  try {
    await durable.run({
      stage: "policy_validation",
      fingerprintInput: {
        policyVersion: dependencies.policy.policyVersion,
        nicheConfigurationVersion: dependencies.niche.configuration_version,
        fixtureUrl,
      },
      execute: () => ({
        output: {
          fixtureUrl,
          policyVersion: dependencies.policy.policyVersion,
          nicheConfigurationVersion: dependencies.niche.configuration_version,
        },
      }),
    });
    await durable.run({
      stage: "run_initialization",
      fingerprintInput: { runId, stageId, tasks },
      execute: () => ({
        output: { runId, stageId, tasks },
        references: [
          { table: "lead_runs", column: "id", id: runId },
          { table: "run_stages", column: "id", id: stageId },
          ...Object.values(tasks).map((id) => ({ table: "stage_tasks", column: "id", id })),
        ],
      }),
    });
    event("run", "started", { executionMode: "offline_synthetic" });
    checkpoint("run");

    updateTask(tasks.coverage, "running");
    event("coverage", "started");
    const configurationHash = nicheConfigurationHash(dependencies.niche);
    const configurationId = dependencies.ids.id("niche_configuration", {
      nicheId: dependencies.niche.id,
      version: dependencies.niche.configuration_version,
      hash: configurationHash,
    });
    const coverageOutput = await durable.run({
      stage: "coverage_planning",
      fingerprintInput: {
        nicheConfigurationHash: configurationHash,
        market: input.market,
        queryVersion: input.queryVersion,
      },
      execute: () => {
        const coverage = dependencies.coveragePlanner({
          nicheId: dependencies.niche.id,
          configurationVersion: dependencies.niche.configuration_version,
          queryVersion: input.queryVersion,
          strategy: dependencies.niche.geography_strategy.density,
          targets: input.market,
          resultCap: dependencies.niche.geography_strategy.result_cap,
          maxDepth: dependencies.niche.geography_strategy.max_depth,
        });
        withTransaction(dependencies.database, () => {
          dependencies.database.prepare(`
            INSERT OR IGNORE INTO niche_configuration_versions
              (id, niche_id, configuration_version, configuration_hash, enabled, is_default, created_at)
            VALUES (?, ?, ?, ?, 1, 1, ?)
          `).run(
            configurationId,
            dependencies.niche.id,
            dependencies.niche.configuration_version,
            configurationHash,
            dependencies.clock.now(),
          );
          dependencies.database.prepare(`
            INSERT OR IGNORE INTO coverage_manifests
              (id, niche_configuration_id, query_version, strategy, result_cap, maximum_depth, minimum_span, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            coverage.manifestId,
            configurationId,
            input.queryVersion,
            coverage.strategy,
            coverage.resultCap,
            coverage.maxDepth,
            coverage.minimumSpan,
            dependencies.clock.now(),
          );
          for (const cell of coverage.cells) {
            dependencies.database.prepare(`
              INSERT OR IGNORE INTO coverage_cells
                (coverage_key, manifest_id, parent_coverage_key, geography_level, label, country_code,
                 subdivision_code, west, south, east, north, depth, state, stop_reason, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              cell.coverageKey,
              coverage.manifestId,
              cell.parentCoverageKey,
              cell.level,
              cell.label,
              cell.countryCode,
              cell.subdivisionCode,
              cell.bounds.west,
              cell.bounds.south,
              cell.bounds.east,
              cell.bounds.north,
              cell.depth,
              cell.status,
              cell.stopReason,
              dependencies.clock.now(),
            );
          }
        });
        return {
          output: { coverage, configurationId },
          references: [
            { table: "niche_configuration_versions", column: "id", id: configurationId },
            { table: "coverage_manifests", column: "id", id: coverage.manifestId },
            ...coverage.cells.map((cell) => ({
              table: "coverage_cells", column: "coverage_key", id: cell.coverageKey,
            })),
          ],
        };
      },
    });
    state.coverage = coverageOutput.coverage;
    const queryOutput = await durable.run({
      stage: "query_generation",
      fingerprintInput: {
        coverageFingerprint: dependencies.ids.hash(state.coverage),
        nicheConfigurationHash: configurationHash,
        queryVersion: input.queryVersion,
      },
      execute: () => {
        const queries = (state.coverage?.cells ?? []).flatMap((cell) =>
          dependencies.queryGenerator({
            niche: dependencies.niche,
            geography: cell,
            queryVersion: input.queryVersion,
          })
        );
        withTransaction(dependencies.database, () => {
          for (const query of queries) {
            dependencies.database.prepare(`
              INSERT OR IGNORE INTO discovery_queries
                (id, coverage_key, niche_configuration_id, query_version, configuration_hash,
                 query_text, negative_policy_hash, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              query.queryId,
              query.coverageKey,
              configurationId,
              query.queryVersion,
              query.configurationHash,
              query.text,
              dependencies.ids.hash(query.negativeTerms),
              dependencies.clock.now(),
            );
          }
        });
        return {
          output: { queries },
          references: queries.map((query) => ({ table: "discovery_queries", column: "id", id: query.queryId })),
        };
      },
    });
    state.queries = queryOutput.queries;
    updateTask(tasks.coverage, "accepted", null);
    event("coverage", "completed", {
      manifestId: state.coverage.manifestId,
      cells: state.coverage.cells.length,
      queries: state.queries.length,
    });
    checkpoint("coverage");

    updateTask(tasks.discovery, "running");
    event("discovery", "started", { providerId: input.providerId });
    const provider = dependencies.providerRegistry.require(input.providerId);
    const discoveryOutput = await durable.run<ProviderDiscoveryProgress>({
      stage: "provider_discovery",
      fingerprintInput: {
        providerId: input.providerId,
        fixtureScenario: input.fixtureScenario ?? "success",
        queryFingerprint: dependencies.ids.hash(state.queries),
      },
      execute: async ({ previousOutput, progress }) => {
        const discovered: ProviderDiscoveryProgress = previousOutput ?? {
          envelopes: [],
          providerCallIds: {},
          completedQueryIds: [],
        };
        const completed = new Set(discovered.completedQueryIds);
        for (const query of state.queries) {
          if (completed.has(query.queryId)) continue;
          checkpoint("discovery");
          durable.heartbeat();
          budget.beginProviderCall();
          const correlationId = `${runId}:${query.queryId}`;
          const attemptNumber = reliability.getCheckpoint(runId, "provider_discovery")?.attemptNumber ?? 1;
          const providerCallId = dependencies.ids.id("provider_call", {
            provider: input.providerId,
            operation: "discovery",
            correlationId,
            attemptNumber,
          });
          dependencies.repositories.providerCalls.create({
            id: providerCallId,
            runId,
            taskId: tasks.discovery,
            provider: input.providerId,
            operation: "discovery",
            state: "running",
            estimatedCostMicroUsd: microUsd(0),
            actualCostMicroUsd: microUsd(0),
            cacheHit: false,
            errorReasonCode: null,
            startedAt: dependencies.clock.now(),
            finishedAt: null,
          });
          const observedAt = dependencies.clock.now();
          let batch: Awaited<ReturnType<typeof provider.discover>>;
          try {
            batch = await provider.discover({
              operation: "discovery",
              correlationId,
              queryId: query.queryId,
              queryText: query.text,
              nicheId: input.nicheId,
              coverageKey: query.coverageKey,
              observedAt,
              retrievedAt: dependencies.clock.now(),
              fixtureScenario: input.fixtureScenario,
            });
          } catch (error) {
            dependencies.repositories.providerCalls.updateResult(providerCallId, {
              state: "failed",
              actualCostMicroUsd: microUsd(0),
              errorReasonCode: "provider_failed",
              finishedAt: dependencies.clock.now(),
            });
            throw error;
          }
          if (batch.envelopes.some((envelope) =>
            envelope.cost.billable || envelope.cost.microUsd !== 0 ||
            envelope.sourceClass !== "synthetic_fixture"
          )) {
            throw new OfflineClassifiedFailure({
              code: "provider_offline_contract_violated",
              classification: "policy",
              retryable: false,
              safeSummary: "Synthetic discovery returned disallowed provenance or cost",
            });
          }
          dependencies.repositories.providerCalls.updateResult(providerCallId, {
            state: batch.status === "complete"
              ? "accepted"
              : batch.status === "partial"
                ? "human_review"
                : "failed",
            actualCostMicroUsd: microUsd(0),
            errorReasonCode: batch.status === "complete" ? null : "provider_failed",
            finishedAt: dependencies.clock.now(),
          });
          discovered.providerCallIds[correlationId] = providerCallId;
          const retryableFailure = batch.envelopes.find((envelope) => envelope.error?.retryable);
          if (batch.status === "failed" && retryableFailure?.error) {
            progress(discovered, Object.values(discovered.providerCallIds).map((id) => ({
              table: "provider_calls", column: "id", id,
            })));
            throw new OfflineTransientFailure(
              `provider_${retryableFailure.error.category}`,
              "Synthetic provider reported an explicitly transient failure",
              "provider_transient",
            );
          }
          discovered.envelopes.push(...batch.envelopes);
          completed.add(query.queryId);
          discovered.completedQueryIds = [...completed].sort();
          progress(discovered, Object.values(discovered.providerCallIds).map((id) => ({
            table: "provider_calls", column: "id", id,
          })));
        }
        return {
          output: discovered,
          references: Object.values(discovered.providerCallIds).map((id) => ({
            table: "provider_calls", column: "id", id,
          })),
        };
      },
    });
    const normalizationOutput = await durable.run({
      stage: "result_normalization",
      fingerprintInput: {
        discoveryFingerprint: dependencies.ids.hash(discoveryOutput),
        fixtureProviderResultId: input.fixtureWebsite.providerResultId,
      },
      execute: () => {
        const observations = dependencies.resultNormalizer(discoveryOutput.envelopes);
        const queryByCorrelation = new Map(state.queries.map((query) => [`${runId}:${query.queryId}`, query]));
        const observationIds: string[] = [];
        withTransaction(dependencies.database, () => {
          for (const observation of observations) {
            const query = queryByCorrelation.get(observation.correlationId);
            const providerCallId = discoveryOutput.providerCallIds[observation.correlationId];
            if (!query || !providerCallId) throw new Error("Normalized observation lost its query lineage");
            dependencies.database.prepare(`
              INSERT OR IGNORE INTO discovery_observations
                (id, query_id, provider_call_id, provider_id, provider_schema_version, correlation_id,
                 provider_result_id, observed_at, retrieved_at, validation_state, error_category,
                 cost_micro_usd, billable_units, cache_status, normalized_result_json,
                 raw_reference_checksum, source_class, claim_state)
              VALUES (?, ?, ?, ?, 'normalized-observation-1.0.0', ?, ?, ?, ?, 'accepted', NULL,
                0, 0, 'bypassed', ?, NULL, ?, ?)
            `).run(
              observation.observationId, query.queryId, providerCallId, observation.providerId,
              observation.correlationId, observation.providerResultId, observation.observedAt,
              observation.retrievedAt, JSON.stringify(observation.result), observation.sourceClass,
              observation.claimState,
            );
            observationIds.push(observation.observationId);
            if (observation.providerResultId) {
              dependencies.database.prepare(`
                INSERT INTO provider_result_identifiers
                  (provider_id, provider_result_id, observation_id, first_observed_at, last_observed_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(provider_id, provider_result_id) DO UPDATE SET
                  last_observed_at = excluded.last_observed_at
              `).run(
                observation.providerId, observation.providerResultId, observation.observationId,
                observation.observedAt, observation.observedAt,
              );
            }
          }
          for (const envelope of discoveryOutput.envelopes.filter((value) => value.validation.status === "rejected")) {
            const query = queryByCorrelation.get(envelope.correlationId);
            const providerCallId = discoveryOutput.providerCallIds[envelope.correlationId];
            if (!query || !providerCallId) continue;
            const rejectionId = dependencies.ids.id("observation_rejection", {
              providerId: envelope.providerId,
              providerResultId: envelope.providerResultId,
              correlationId: envelope.correlationId,
              validation: envelope.validation,
            });
            dependencies.database.prepare(`
              INSERT OR IGNORE INTO discovery_observations
                (id, query_id, provider_call_id, provider_id, provider_schema_version, correlation_id,
                 provider_result_id, observed_at, retrieved_at, validation_state, error_category,
                 cost_micro_usd, billable_units, cache_status, normalized_result_json,
                 raw_reference_checksum, source_class, claim_state)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'rejected', ?, 0, 0, ?, NULL, ?, ?, ?)
            `).run(
              rejectionId, query.queryId, providerCallId, envelope.providerId,
              envelope.providerSchemaVersion, envelope.correlationId, envelope.providerResultId,
              envelope.observedAt, envelope.retrievedAt,
              envelope.error?.category ?? "schema_validation_failed", envelope.cache.status,
              envelope.rawReferenceChecksum, envelope.sourceClass, envelope.claimState,
            );
            observationIds.push(rejectionId);
          }
          for (const cell of state.coverage?.cells ?? []) {
            dependencies.database.prepare(`
              UPDATE coverage_cells SET state = 'completed', stop_reason = NULL, updated_at = ?
              WHERE coverage_key = ?
            `).run(dependencies.clock.now(), cell.coverageKey);
          }
        });
        const selectedObservation = observations.find((observation) =>
          observation.providerResultId === input.fixtureWebsite.providerResultId
        ) ?? null;
        if (!selectedObservation) {
          throw new OfflineClassifiedFailure({
            code: "provider_identity_not_found",
            classification: "deterministic",
            retryable: false,
            safeSummary: "Synthetic fixture discovery did not produce the requested website identity",
          });
        }
        return {
          output: { observations, selectedObservation },
          references: observationIds.map((id) => ({ table: "discovery_observations", column: "id", id })),
        };
      },
    });
    state.observations = normalizationOutput.observations;
    state.selectedObservation = normalizationOutput.selectedObservation;
    const selectedObservation = state.selectedObservation;
    updateTask(tasks.discovery, "accepted", null);
    event("discovery", "completed", {
      observations: state.observations.length,
      selectedObservationId: state.selectedObservation.observationId,
      costMicroUsd: 0,
    });
    checkpoint("discovery");

    updateTask(tasks.identity, "running");
    event("identity", "started");
    const identityOutput = await durable.run({
      stage: "identity_resolution",
      fingerprintInput: {
        selectedObservationFingerprint: dependencies.ids.hash(selectedObservation),
        identityPolicyInput: dependencies.existingIdentities(selectedObservation),
      },
      execute: () => {
    const candidate = observationIdentity(selectedObservation, dependencies);
    const existingIdentities = dependencies.existingIdentities(selectedObservation);
    const matcherDecisions = existingIdentities.map((existingIdentity) => {
      const decision = dependencies.identityMatcher(candidate, existingIdentity, {
        currentAt: dependencies.clock.now(),
      });
      if (decision.action !== "auto_merge" || decision.conflictingSignals.length === 0) {
        return decision;
      }
      return {
        ...decision,
        decisionId: dependencies.ids.id("identity_decision", {
          originalDecisionId: decision.decisionId,
          action: "human_review",
          reason: "invalid_auto_merge_with_conflicts",
        }),
        action: "human_review" as const,
        reason: "conflicting_identifiers" as const,
        conflicts: [...decision.conflictingSignals],
        reviewReason: "invalid_auto_merge_with_conflicts",
      };
    });
    const conflicts = matcherDecisions.filter((decision) => decision.action === "human_review");
    const automatic = matcherDecisions.filter((decision) => decision.action === "auto_merge");
    if (automatic.length > 1 && conflicts.length === 0) {
      const ordered = [candidate.entityId, ...automatic.map((decision) =>
        decision.leftEntityId === candidate.entityId ? decision.rightEntityId : decision.leftEntityId
      )].sort();
      conflicts.push({
        decisionId: dependencies.ids.id("identity_decision", {
          ordered,
          reason: "multiple_safe_matches_require_review",
        }),
        leftEntityId: ordered[0] as string,
        rightEntityId: ordered[1] as string,
        action: "human_review",
        reason: "fuzzy_candidate",
        matchScore: Math.max(...automatic.map((decision) => decision.matchScore)),
        confidenceBasisPoints: Math.max(...automatic.map((decision) => decision.confidenceBasisPoints)),
        policyVersion: automatic[0]?.policyVersion ?? "identity-2.0.0",
        conflicts: ["multiple_safe_matches"],
        supportingSignals: automatic.flatMap((decision) => decision.supportingSignals),
        conflictingSignals: ["multiple_safe_matches"],
        verificationDimensions: automatic.flatMap((decision) => decision.verificationDimensions),
        reviewReason: "multiple_safe_matches_require_review",
      });
    }
    state.identityDecisions = [...matcherDecisions, ...conflicts.filter((decision) =>
      !matcherDecisions.some((existingDecision) => existingDecision.decisionId === decision.decisionId)
    )];
    const reviewRequired = conflicts.length > 0;
    const safeMatch = !reviewRequired && automatic.length === 1 ? automatic[0] : null;
    const safeBusinessId = safeMatch
      ? safeMatch.leftEntityId === candidate.entityId
        ? safeMatch.rightEntityId
        : safeMatch.leftEntityId
      : null;
    const businessId = safeBusinessId ?? candidate.entityId;
    const resolution = reviewRequired
      ? "review_required"
      : safeBusinessId
        ? "safe_match"
        : "new_candidate";
    const assessmentAttachment = reviewRequired
      ? "isolated_candidate"
      : safeBusinessId
        ? "safe_match"
        : "new_candidate";
    state.selectedBusiness = {
      businessId,
      canonicalName: candidate.displayName,
      resolution,
      assessmentAttachment,
    };
    state.reviewReasons.push(...conflicts.map((decision) =>
      decision.reviewReason ?? decision.reason
    ));
    withTransaction(dependencies.database, () => {
      if (!safeBusinessId && !dependencies.repositories.businesses.getById(businessId)) {
        dependencies.repositories.businesses.create({
          id: businessId,
          canonicalName: candidate.displayName,
          state: reviewRequired ? "human_review" : "found",
          nicheId: "pool_service",
          createdAt: dependencies.clock.now(),
          updatedAt: dependencies.clock.now(),
        });
      }
      if (!dependencies.repositories.businesses.getById(businessId)) {
        throw new Error("Safe identity match does not refer to a persisted business");
      }
      const providerIdentifier = state.selectedObservation?.providerResultId;
      if (providerIdentifier) {
        const scheme = `provider:${state.selectedObservation?.providerId}`;
        const alreadyPresent = dependencies.repositories.businesses.listIdentifiers(businessId)
          .some((identifier) => identifier.scheme === scheme && identifier.value === providerIdentifier);
        if (!alreadyPresent) {
          dependencies.repositories.businesses.addIdentifier({
            id: dependencies.ids.id("business_identifier", { businessId, scheme, providerIdentifier }),
            businessId,
            scheme,
            value: providerIdentifier,
            source: state.selectedObservation?.providerId ?? input.providerId,
            sourceClass: "synthetic_fixture",
            claimState: "observed",
            evidenceState: "found",
            createdAt: dependencies.clock.now(),
          });
        }
      }
      if (!dependencies.repositories.businesses.listLocations(businessId)
        .some((location) => location.id === candidate.locationId)) {
        dependencies.repositories.businesses.addLocation({
          id: candidate.locationId,
          businessId,
          line1: candidate.address?.line1 || null,
          city: candidate.address?.city ?? state.selectedObservation?.result.address.city ?? "Unknown",
          region: candidate.address?.region ?? state.selectedObservation?.result.address.region ?? "Unknown",
          postalCode: candidate.address?.postalCode || null,
          countryCode: candidate.address?.countryCode ?? "US",
          evidenceState: "found",
          sourceClass: "synthetic_fixture",
          claimState: "observed",
          createdAt: dependencies.clock.now(),
          updatedAt: dependencies.clock.now(),
        });
      }
      for (const decision of state.identityDecisions) {
        if (!dependencies.repositories.identityDecisions.getById(decision.decisionId)) {
          dependencies.repositories.identityDecisions.record(decision, dependencies.clock.now());
        }
        const pair = [decision.leftEntityId, decision.rightEntityId].sort();
        if (
          !dependencies.repositories.businesses.getById(pair[0] as string) ||
          !dependencies.repositories.businesses.getById(pair[1] as string)
        ) {
          continue;
        }
        const candidateId = dependencies.ids.id("identity_candidate", {
          pair,
          policyVersion: decision.policyVersion,
        });
        dependencies.database.prepare(`
          INSERT OR IGNORE INTO identity_candidates
            (id, left_business_id, right_business_id, candidate_reason, match_score,
             policy_version, state, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          candidateId,
          pair[0],
          pair[1],
          decision.reason,
          decision.matchScore,
          decision.policyVersion,
          decision.action === "human_review" ? "human_review" :
            decision.action === "auto_merge" ? "accepted" : "rejected",
          dependencies.clock.now(),
          dependencies.clock.now(),
        );
        for (const [index, conflict] of decision.conflictingSignals.entries()) {
          dependencies.database.prepare(`
            INSERT OR IGNORE INTO identity_conflicts
              (id, candidate_id, conflict_type, details_json, review_state, created_at, resolved_at)
            VALUES (?, ?, ?, ?, 'pending', ?, NULL)
          `).run(
            dependencies.ids.id("identity_conflict", { candidateId, conflict, index }),
            candidateId,
            conflict,
            JSON.stringify({
              rule: decision.reason,
              supportingSignals: decision.supportingSignals,
              conflictingSignals: decision.conflictingSignals,
              verificationDimensions: decision.verificationDimensions,
              reviewReason: decision.reviewReason,
            }),
            dependencies.clock.now(),
          );
        }
      }
    });
        return {
          output: {
            candidate,
            identityDecisions: state.identityDecisions,
            selectedBusiness: state.selectedBusiness,
            reviewReasons: state.reviewReasons,
            reviewRequired,
            safeBusinessId,
            businessId,
            resolution,
            assessmentAttachment,
          },
          references: [
            { table: "businesses", column: "id", id: businessId },
            { table: "business_locations", column: "id", id: candidate.locationId },
            ...state.identityDecisions.map((decision) => ({
              table: "identity_decision_audits", column: "id", id: decision.decisionId,
            })),
          ],
        };
      },
    });
    state.identityDecisions = identityOutput.identityDecisions;
    state.selectedBusiness = identityOutput.selectedBusiness;
    state.reviewReasons = [...identityOutput.reviewReasons];
    const candidate = identityOutput.candidate;
    const reviewRequired = identityOutput.reviewRequired;
    const businessId = identityOutput.businessId;
    const resolution = identityOutput.resolution;
    updateTask(
      tasks.identity,
      reviewRequired ? "human_review" : "accepted",
      reviewRequired ? "human_review_required" : null,
    );
    event(
      "identity",
      reviewRequired ? "review_required" : "completed",
      { businessId, resolution, decisions: state.identityDecisions.length },
    );
    checkpoint("identity");

    updateTask(tasks.website, "running");
    event("website_assessment", "started", { fixtureUrl });
    await durable.run({
      stage: "website_eligibility",
      fingerprintInput: { fixtureUrl, allowed: input.budget },
      execute: () => {
        budget.assertWebsiteEligibility();
        if (!dependencies.fixtureFetcher.handles(fixtureUrl)) {
          throw new OfflineClassifiedFailure({
            code: "fixture_mapping_missing",
            classification: "policy",
            retryable: false,
            safeSummary: "Synthetic fixture mapping is no longer available",
          });
        }
        return { output: { fixtureUrl, eligible: true } };
      },
    });
    checkpoint("website_assessment");
    let liveCrawl: CrawlResult | null = null;
    const loadLiveCrawl = async (): Promise<CrawlResult> => {
      const budgetedFetcher = new BudgetedFixtureFetcher(dependencies, budget);
      const crawler = dependencies.createWebsiteCrawler({
        fetcher: budgetedFetcher,
        limits: coverageLimits(input),
        now: () => new Date(dependencies.clock.now()),
      });
      const loaded = await crawler.crawl({
        websiteUrl: fixtureUrl,
        observedAt: dependencies.clock.now(),
        signal: input.signal,
      });
      budget.recordCrawl(loaded);
      budget.assertNotDenied();
      const transientFetch = loaded.pages.find((page) => !page.fetch?.ok && page.fetch?.retryable);
      if (transientFetch?.fetch && !transientFetch.fetch.ok) {
        throw new OfflineTransientFailure(
          `fixture_fetch_${transientFetch.fetch.errorCode}`,
          "Synthetic fixture fetcher reported a transient failure",
          "fixture_fetch",
        );
      }
      checkpoint("website_assessment");
      return loaded;
    };
    const crawlOutput = await durable.run({
      stage: "website_crawl",
      fingerprintInput: {
        fixtureUrl,
        crawlLimits: coverageLimits(input),
        fixtureId: input.fixtureWebsite.fixtureId,
      },
      execute: async () => {
        liveCrawl = await loadLiveCrawl();
        return { output: { crawl: withoutRawPageBodies(liveCrawl) } };
      },
    });
    const crawl = crawlOutput.crawl;

    const extractionOutput = await durable.run({
      stage: "extraction",
      fingerprintInput: {
        crawlFingerprint: dependencies.ids.hash(crawl),
        extractionVersion: input.extractionVersion,
        businessId,
      },
      execute: async () => {
    if (!liveCrawl) liveCrawl = await loadLiveCrawl();
    const crawlWithBodies = restoreRawPageBodies(crawl, liveCrawl);
    const assessedAt = dependencies.clock.now();
    const freshUntil = new Date(Date.parse(assessedAt) + FRESHNESS_MS).toISOString();
    const successfulPages: Array<{
      crawlPage: CrawlResult["pages"][number];
      pageId: string;
      html: HtmlExtraction;
      jsonLd: JsonLdExtraction;
    }> = [];
    for (const crawlPage of crawlWithBodies.pages) {
      if (crawlPage.inspectionStatus !== "successful" || !crawlPage.fetch?.ok || !crawlPage.html) continue;
      const context = {
        pageUrl: crawlPage.fetch.finalUrl,
        observedAt: assessedAt,
        fetchedAt: crawlPage.fetch.fetchedAt,
        contentChecksum: crawlPage.fetch.contentChecksum,
        sourceClass: crawl.sourceClass,
      };
      const html = dependencies.extractors.extractHtml(crawlPage.html, context);
      const jsonLd = dependencies.extractors.extractJsonLd(crawlPage.html, context);
      successfulPages.push({
        crawlPage,
        pageId: dependencies.ids.id("website_page", {
          businessId,
          url: crawlPage.url,
          checksum: crawlPage.fetch.contentChecksum,
          extractionVersion: input.extractionVersion,
        }),
        html,
        jsonLd,
      });
    }
    const homepageExtraction = successfulPages[0] ?? null;
    const businessIdentity = homepageExtraction
      ? dependencies.extractors.extractBusinessIdentity({
          html: homepageExtraction.html,
          jsonLd: homepageExtraction.jsonLd,
        })
      : null;
    const operational = assessBusinessOperationalEvidence({
      expectedBusinessName: input.fixtureWebsite.expectedBusinessName,
      crawl,
      identity: businessIdentity,
    });
    if (operational.reviewRequired) {
      state.reviewReasons.push(`website_identity_${operational.identityState}`);
      state.warnings.push("website_identity_requires_review");
    }
    const assessmentId = dependencies.ids.id("website_assessment", {
      businessId,
      fixtureUrl,
      checksums: crawl.pages.map((page) => page.fetch?.ok ? page.fetch.contentChecksum : null),
      extractionVersion: input.extractionVersion,
    });
    const assessmentRecord = {
      id: assessmentId,
      businessId,
      sourceWebsiteUrl: fixtureUrl,
      canonicalHomepageUrl: crawl.canonicalHomepage,
      status: crawl.complete ? "complete" as const :
        crawl.pages.length === 0 || crawl.robots.status !== "allowed" ? "blocked" as const : "partial" as const,
      startedAt: crawl.startedAt,
      assessedAt,
      freshUntil,
      crawlPolicyVersion: CRAWL_POLICY_VERSION,
      extractionPolicyVersion: input.extractionVersion,
      browserStatus: "not_checked" as const,
      identityState: operational.identityState,
      reviewRequired: state.reviewReasons.length > 0,
      sourceClass: "synthetic_fixture" as const,
    };
    const allContacts: ContactObservation[] = [];
    const allPeople: PersonEvidenceCandidate[] = [];
    const allServices: ServiceEvidenceObservation[] = [];
    const allSignals = [] as ReturnType<OfflineLeadPipelineDependencies["extractors"]["extractConversionSignals"]>;
    for (const page of successfulPages) {
      allContacts.push(...dependencies.extractors.extractContactInformation({
        html: page.html,
        jsonLd: page.jsonLd,
        homepage: crawl.canonicalHomepage ?? fixtureUrl,
      }));
      allPeople.push(...dependencies.extractors.extractPersonCandidates({
        html: page.html,
        jsonLd: page.jsonLd,
        knownBusinessNames: [candidate.displayName, input.fixtureWebsite.expectedBusinessName],
      }));
      allServices.push(...dependencies.extractors.extractServiceEvidence({
        html: page.html,
        jsonLd: page.jsonLd,
        niche: dependencies.niche,
        providerCategories: selectedObservation.result.categories,
        providerSourceClass: selectedObservation.sourceClass,
      }));
      allSignals.push(...dependencies.extractors.extractConversionSignals({
        html: page.html,
        homepage: crawl.canonicalHomepage ?? fixtureUrl,
        validResponse: true,
      }));
    }
    const uniqueContacts = new Map(allContacts.map((contact) => [
      `${contact.kind}:${contact.displayedValue.toLocaleLowerCase("en-US")}`,
      contact,
    ]));
    const uniquePeople = new Map(allPeople.map((person) => [
      normalizeBusinessName(person.displayedName),
      person,
    ]));
    const uniqueServices = new Map(allServices.map((service) => [
      `${service.state}:${service.basis}:${service.term ?? ""}:${service.evidence?.pageUrl ?? ""}`,
      service,
    ]));
    state.phones = [...uniqueContacts.values()].filter((contact) => contact.kind === "phone");
    state.emails = [...uniqueContacts.values()].filter((contact) => contact.kind === "email");
    state.people = [...uniquePeople.values()].sort((left, right) =>
      left.displayedName.localeCompare(right.displayedName)
    );
    state.services = [...uniqueServices.values()];
    const conversionAssessments = assessConversionFeatures({
      crawl,
      signals: allSignals,
      browser: { status: "not_checked" },
      assessedAt,
      freshUntil,
    });
    state.conversions = conversionAssessments.map((conversion) => ({
      feature: conversion.feature,
      status: conversion.status,
      sourceClass: conversion.sourceClass,
      claimState: conversion.claimState,
    }));
        return {
          output: {
            assessedAt,
            freshUntil,
            successfulPages: successfulPages.map((page) => ({
              ...page,
              crawlPage: withoutRawPageBody(page.crawlPage),
              html: { ...page.html, visibleText: "" },
            })),
            businessIdentity,
            operational,
            assessmentId,
            assessmentRecord,
            conversionAssessments,
            phones: state.phones,
            emails: state.emails,
            people: state.people,
            services: state.services,
            conversions: state.conversions,
            reviewReasons: state.reviewReasons,
            warnings: state.warnings,
          },
        };
      },
    });
    const {
      assessedAt,
      freshUntil,
      successfulPages,
      businessIdentity,
      operational,
      assessmentId,
      assessmentRecord,
      conversionAssessments,
    } = extractionOutput;
    const homepageExtraction = successfulPages[0] ?? null;
    state.phones = extractionOutput.phones;
    state.emails = extractionOutput.emails;
    state.people = extractionOutput.people;
    state.services = extractionOutput.services;
    state.conversions = extractionOutput.conversions;
    state.reviewReasons = [...extractionOutput.reviewReasons];
    state.warnings = [...extractionOutput.warnings];

    checkpoint("persistence");
    event("persistence", "started", {
      pages: crawl.pages.length,
      contacts: state.phones.length + state.emails.length,
      people: state.people.length,
    });
    updateTask(tasks.persistence, "running");
    const persistenceOutput = await durable.run({
      stage: "assessment_persistence",
      fingerprintInput: {
        extractionFingerprint: dependencies.ids.hash(extractionOutput),
        assessmentId,
      },
      execute: () => {
    withTransaction(dependencies.database, () => {
      const currentAssessment = dependencies.websiteAssessments.getAssessment(assessmentId);
      const persistedAssessment = currentAssessment ??
        dependencies.websiteAssessments.createAssessment(assessmentRecord);
      const persistedRobotsOrigins = new Set<string>();
      for (const decision of crawl.robotsDecisions) {
        if (persistedRobotsOrigins.has(decision.origin)) continue;
        persistedRobotsOrigins.add(decision.origin);
        dependencies.websiteAssessments.addRobotsDecision({
          id: dependencies.ids.id("robots_decision", { assessmentId, pageUrl: decision.robotsUrl }),
          assessmentId,
          pageUrl: decision.origin ? new URL("/", decision.origin).href : fixtureUrl,
          robotsUrl: decision.robotsUrl,
          decision: decision.status,
          reason: decision.reason,
          matchedRule: decision.matchedRule,
          contentChecksum: decision.contentChecksum,
          fetchedAt: decision.fetchedAt,
          expiresAt: decision.expiresAt,
        });
      }
      for (const crawlPage of crawl.pages) {
        const fetchId = crawlPage.fetch
          ? dependencies.ids.id("website_fetch", {
              assessmentId,
              requestedUrl: crawlPage.fetch.requestedUrl,
              finalUrl: crawlPage.fetch.finalUrl,
            })
          : null;
        if (crawlPage.fetch && fetchId) {
          dependencies.websiteAssessments.addFetch(crawlPage.fetch.ok ? {
            id: fetchId,
            assessmentId,
            requestedUrl: crawlPage.fetch.requestedUrl,
            finalUrl: crawlPage.fetch.finalUrl,
            outcome: "success",
            httpStatus: crawlPage.fetch.status,
            errorCode: null,
            retryable: false,
            attempts: crawlPage.fetch.attempts,
            contentType: crawlPage.fetch.contentType,
            compressedBytes: crawlPage.fetch.compressedBytes,
            decompressedBytes: crawlPage.fetch.decompressedBytes,
            contentChecksum: crawlPage.fetch.contentChecksum,
            etag: crawlPage.fetch.etag,
            lastModified: crawlPage.fetch.lastModified,
            redirectHistory: crawlPage.fetch.redirectHistory,
            fetchedAt: crawlPage.fetch.fetchedAt,
          } : {
            id: fetchId,
            assessmentId,
            requestedUrl: crawlPage.fetch.requestedUrl,
            finalUrl: crawlPage.fetch.finalUrl,
            outcome: "failed",
            httpStatus: crawlPage.fetch.httpStatus,
            errorCode: crawlPage.fetch.errorCode,
            retryable: crawlPage.fetch.retryable,
            attempts: crawlPage.fetch.attempts,
            contentType: null,
            compressedBytes: null,
            decompressedBytes: null,
            contentChecksum: null,
            etag: null,
            lastModified: null,
            redirectHistory: crawlPage.fetch.redirectHistory,
            fetchedAt: crawlPage.fetch.fetchedAt,
          });
        }
        const extracted = successfulPages.find((page) =>
          page.crawlPage.url === crawlPage.url &&
          (page.crawlPage.fetch?.ok ? page.crawlPage.fetch.contentChecksum : null) ===
            (crawlPage.fetch?.ok ? crawlPage.fetch.contentChecksum : null)
        );
        const pageId = extracted?.pageId ?? dependencies.ids.id("website_page", {
          assessmentId,
          url: crawlPage.url,
          status: crawlPage.inspectionStatus,
        });
        dependencies.websiteAssessments.addPage({
          id: pageId,
          assessmentId,
          fetchId,
          pageUrl: crawlPage.url,
          pageKind: crawlPage.kind,
          inspectionStatus: crawlPage.inspectionStatus,
          title: extracted?.html.title?.value ?? null,
          metaDescription: extracted?.html.metaDescription?.value ?? null,
          language: extracted?.html.language?.value ?? null,
          viewport: extracted?.html.viewport?.value ?? null,
          contentChecksum: crawlPage.fetch?.ok ? crawlPage.fetch.contentChecksum : null,
          observedAt: assessedAt,
          fetchedAt: crawlPage.fetch?.fetchedAt ?? null,
        });
        if (!crawlPage.fetch?.ok) continue;
        if (!extracted) continue;
        for (const link of extractLinks(extracted.html, crawl.canonicalHomepage ?? fixtureUrl)) {
          dependencies.websiteAssessments.addLink({
            id: dependencies.ids.id("website_link", { pageId, url: link.url, kind: link.kind }),
            pageId,
            targetUrl: link.url,
            linkKind: link.kind,
            linkTextChecksum: dependencies.ids.hash(link.text),
            extractionMethod: link.evidence.extractionMethod,
            observedAt: link.evidence.observedAt,
          });
        }
        const structured = [
          ...extracted.jsonLd.schemaTypes.map((evidence) => ({ field: "schema_type", evidence })),
          ...extracted.jsonLd.organizationNames.map((evidence) => ({ field: "organization_name", evidence })),
          ...extracted.jsonLd.addresses.map((evidence) => ({ field: "address", evidence })),
          ...extracted.jsonLd.contactPoints.map((evidence) => ({ field: "contact_point", evidence })),
          ...extracted.jsonLd.services.map((evidence) => ({ field: "service", evidence })),
          ...extracted.jsonLd.sameAs.map((evidence) => ({ field: "same_as", evidence })),
          ...extracted.jsonLd.people.map((evidence) => ({
            field: "person",
            evidence: { ...evidence, value: `${evidence.value.name}${evidence.value.title ? ` — ${evidence.value.title}` : ""}` },
          })),
        ];
        for (const item of structured) {
          dependencies.websiteAssessments.addStructuredDataObservation({
            id: dependencies.ids.id("structured_observation", {
              pageId,
              field: item.field,
              value: item.evidence.value,
              path: item.evidence.structuredDataPath,
            }),
            pageId,
            evidenceId: null,
            schemaType: item.field === "schema_type" ? item.evidence.value : "schema.org",
            structuredDataPath: item.evidence.structuredDataPath ?? "$",
            fieldName: item.field,
            claimedValue: item.evidence.value,
            confidence: item.evidence.confidence,
            observedAt: item.evidence.observedAt,
            fetchedAt: item.evidence.fetchedAt,
            contentChecksum: item.evidence.contentChecksum,
            extractionPolicyVersion: input.extractionVersion,
            sourceClass: item.evidence.sourceClass,
            claimState: item.evidence.claimState,
          });
        }
      }

      for (const contact of [...state.phones, ...state.emails]) {
        const page = successfulPages.find((candidatePage) =>
          candidatePage.crawlPage.url === contact.evidence.pageUrl ||
          candidatePage.crawlPage.fetch?.ok && candidatePage.crawlPage.fetch.finalUrl === contact.evidence.pageUrl
        );
        if (!page) throw new Error("Contact evidence lost its website page lineage");
        const evidenceId = dependencies.ids.id("evidence", {
          businessId,
          field: contact.kind,
          value: contact.displayedValue.toLocaleLowerCase("en-US"),
          pageUrl: contact.evidence.pageUrl,
          checksum: contact.evidence.contentChecksum,
          extractionVersion: input.extractionVersion,
        });
        dependencies.repositories.evidence.create(sourceEvidence({
          id: evidenceId,
          entityType: "business",
          entityId: businessId,
          fieldName: contact.kind,
          claimedValue: contact.displayedValue,
          sourceClass: contact.sourceClass,
          claimState: contact.claimState,
          sourceUrl: contact.evidence.pageUrl,
          observedAt: contact.evidence.observedAt,
          fetchedAt: contact.evidence.fetchedAt,
          confidenceBasisPoints: confidenceBasisPoints(contact.evidence.confidence),
          extractionMethod: contact.evidence.extractionMethod,
          contentChecksum: contact.evidence.contentChecksum,
          extractionVersion: input.extractionVersion,
          currentAt: dependencies.clock.now(),
        }));
        dependencies.websiteAssessments.addContactObservation({
          id: dependencies.ids.id("website_contact", { assessmentId, evidenceId }),
          assessmentId,
          pageId: page.pageId,
          evidenceId,
          contactKind: contact.kind,
          displayedValue: contact.displayedValue,
          candidateStatus: "public_unverified",
          extractionMethod: contact.evidence.extractionMethod,
          selectorOrPath: contact.evidence.selector ?? contact.evidence.structuredDataPath,
          observedAt: contact.evidence.observedAt,
          fetchedAt: contact.evidence.fetchedAt,
          contentChecksum: contact.evidence.contentChecksum,
          extractionPolicyVersion: input.extractionVersion,
          sourceClass: contact.sourceClass,
          claimState: "public_unverified_candidate",
        });
      }

      for (const person of state.people) {
        const page = successfulPages.find((candidatePage) =>
          candidatePage.crawlPage.url === person.evidence.pageUrl ||
          candidatePage.crawlPage.fetch?.ok && candidatePage.crawlPage.fetch.finalUrl === person.evidence.pageUrl
        );
        if (!page) throw new Error("Person evidence lost its website page lineage");
        const personId = dependencies.ids.id("person_candidate", {
          businessId,
          name: normalizeBusinessName(person.displayedName),
          title: person.displayedTitle,
          pageUrl: person.evidence.pageUrl,
          extractionVersion: input.extractionVersion,
        });
        const evidenceId = dependencies.ids.id("evidence", {
          personId,
          field: "person_candidate",
          checksum: person.evidence.contentChecksum,
        });
        dependencies.repositories.evidence.create(sourceEvidence({
          id: evidenceId,
          entityType: "person",
          entityId: personId,
          fieldName: "person_candidate",
          claimedValue: person.displayedName,
          sourceClass: person.sourceClass,
          claimState: person.claimState,
          sourceUrl: person.evidence.pageUrl,
          observedAt: person.evidence.observedAt,
          fetchedAt: person.evidence.fetchedAt,
          confidenceBasisPoints: confidenceBasisPoints(person.evidence.confidence),
          extractionMethod: person.evidence.extractionMethod === "json_ld" ? "json_ld" : "html",
          contentChecksum: person.evidence.contentChecksum,
          extractionVersion: input.extractionVersion,
          currentAt: dependencies.clock.now(),
        }));
        dependencies.repositories.contacts.create({
          id: personId,
          businessId,
          entityType: "person",
          personName: person.displayedName,
          title: person.displayedTitle,
          role: "unknown",
          evidenceState: "found",
          verificationState: "not_checked",
          decisionState: person.ambiguityState === "none" ? "unknown" : "human_review",
          sourceClass: person.sourceClass,
          claimState: "public_unverified_candidate",
          relationshipEvidenceId: null,
          createdAt: dependencies.clock.now(),
          updatedAt: dependencies.clock.now(),
        });
        dependencies.websiteAssessments.addPersonCandidate({
          id: personId,
          assessmentId,
          businessId,
          pageId: page.pageId,
          evidenceId,
          displayedName: person.displayedName,
          displayedTitle: person.displayedTitle,
          candidateStatus: "unverified_evidence_candidate",
          ambiguityState: person.ambiguityState,
          extractionMethod: person.evidence.extractionMethod === "json_ld" ? "json_ld" : "html",
          observedAt: person.evidence.observedAt,
          sourceClass: person.sourceClass,
          claimState: "public_unverified_candidate",
        });
      }

      for (const service of state.services) {
        const page = service.evidence
          ? successfulPages.find((candidatePage) =>
              candidatePage.crawlPage.url === service.evidence?.pageUrl ||
              candidatePage.crawlPage.fetch?.ok && candidatePage.crawlPage.fetch.finalUrl === service.evidence?.pageUrl
            )
          : null;
        const evidenceId = service.evidence
          ? dependencies.ids.id("evidence", {
              businessId,
              field: "service",
              term: service.term,
              pageUrl: service.evidence.pageUrl,
              checksum: service.evidence.contentChecksum,
            })
          : null;
        if (service.evidence && evidenceId) {
          dependencies.repositories.evidence.create(sourceEvidence({
            id: evidenceId,
            entityType: "business",
            entityId: businessId,
            fieldName: "service",
            claimedValue: service.term,
            sourceClass: service.sourceClass,
            claimState: service.claimState,
            sourceUrl: service.evidence.pageUrl,
            observedAt: service.evidence.observedAt,
            fetchedAt: service.evidence.fetchedAt,
            confidenceBasisPoints: confidenceBasisPoints(service.evidence.confidence),
            extractionMethod: service.evidence.extractionMethod,
            contentChecksum: service.evidence.contentChecksum,
            extractionVersion: input.extractionVersion,
            currentAt: dependencies.clock.now(),
          }));
        }
        dependencies.websiteAssessments.addServiceEvidence({
          id: dependencies.ids.id("service_evidence", {
            assessmentId,
            pageId: page?.pageId ?? null,
            state: service.state,
            term: service.term,
            basis: service.basis,
          }),
          assessmentId,
          pageId: page?.pageId ?? null,
          evidenceId,
          evidenceState: service.state,
          term: service.term,
          basis: service.basis,
          observedAt: service.evidence?.observedAt ?? assessedAt,
          extractionPolicyVersion: input.extractionVersion,
          sourceClass: service.sourceClass,
          claimState: service.claimState,
        });
      }

      for (const conversion of conversionAssessments) {
        const primaryEvidence = conversion.evidence[0] ?? null;
        const page = primaryEvidence
          ? successfulPages.find((candidatePage) =>
              candidatePage.crawlPage.url === primaryEvidence.pageUrl ||
              candidatePage.crawlPage.fetch?.ok && candidatePage.crawlPage.fetch.finalUrl === primaryEvidence.pageUrl
            )
          : null;
        const evidenceId = dependencies.ids.id("evidence", {
          businessId,
          field: `conversion:${conversion.feature}`,
          status: conversion.status,
          assessmentId,
        });
        dependencies.repositories.evidence.create(sourceEvidence({
          id: evidenceId,
          entityType: "business",
          entityId: businessId,
          fieldName: `conversion:${conversion.feature}`,
          claimedValue: conversion.status,
          sourceClass: conversion.sourceClass,
          claimState: conversion.claimState,
          sourceUrl: primaryEvidence?.pageUrl ?? fixtureUrl,
          observedAt: primaryEvidence?.observedAt ?? assessedAt,
          fetchedAt: primaryEvidence?.fetchedAt ?? assessedAt,
          confidenceBasisPoints: primaryEvidence ? confidenceBasisPoints(primaryEvidence.confidence) : 0,
          extractionMethod: primaryEvidence?.extractionMethod ?? "website_assessment",
          contentChecksum: primaryEvidence?.contentChecksum ?? null,
          extractionVersion: WEBSITE_ASSESSMENT_POLICY_VERSION,
          currentAt: dependencies.clock.now(),
        }));
        dependencies.websiteAssessments.addConversionObservation({
          id: dependencies.ids.id("conversion_observation", { assessmentId, feature: conversion.feature }),
          assessmentId,
          pageId: page?.pageId ?? null,
          evidenceId,
          feature: conversion.feature,
          status: conversion.status,
          observedAt: assessedAt,
          freshUntil,
          policyVersion: conversion.policyVersion,
          sourceClass: conversion.sourceClass,
          claimState: conversion.claimState,
        });
      }

      for (const item of operational.evidence) {
        const evidenceId = dependencies.ids.id("evidence", {
          businessId,
          assessmentId,
          field: `operational:${item.kind}`,
          status: item.status,
        });
        dependencies.repositories.evidence.create(sourceEvidence({
          id: evidenceId,
          entityType: "business",
          entityId: businessId,
          fieldName: `operational:${item.kind}`,
          claimedValue: item.detail,
          sourceClass: item.sourceClass,
          claimState: item.claimState,
          sourceUrl: fixtureUrl,
          observedAt: assessedAt,
          fetchedAt: assessedAt,
          confidenceBasisPoints: item.status === "positive" ? 8_000 : item.status === "negative" ? 8_000 : 5_000,
          extractionMethod: "website_operational_assessment",
          contentChecksum: null,
          extractionVersion: input.extractionVersion,
          currentAt: dependencies.clock.now(),
        }));
      }

      if (operational.identityState === "conflicts" || operational.identityState === "ambiguous") {
        dependencies.websiteAssessments.addIdentityConflict({
          id: dependencies.ids.id("website_identity_conflict", { assessmentId, businessId }),
          assessmentId,
          businessId,
          pageId: homepageExtraction?.pageId ?? null,
          evidenceId: null,
          conflictType: "business_name",
          expectedValue: input.fixtureWebsite.expectedBusinessName,
          observedValue: businessIdentity?.names.map((name) => name.value).join(" | ") ?? null,
          reviewState: "pending",
          observedAt: assessedAt,
          resolvedAt: null,
          sourceClass: "synthetic_fixture",
          claimState: "conflicting",
        });
      }
      state.website = {
        record: persistedAssessment,
        pages: crawl.pages.map((page) => ({
          url: page.url,
          kind: page.kind,
          inspectionStatus: page.inspectionStatus,
          contentChecksum: page.fetch?.ok ? page.fetch.contentChecksum : null,
        })),
        complete: crawl.complete,
        timedOut: crawl.timedOut,
      };
      dependencies.repositories.businesses.updateState(
        businessId,
        state.reviewReasons.length > 0 ? "human_review" : "found",
        dependencies.clock.now(),
      );
    });
        if (!state.website) throw new Error("Assessment persistence did not produce a website result");
        return {
          output: { website: state.website },
          references: [{ table: "website_assessments", column: "id", id: assessmentId }],
        };
      },
    });
    state.website = persistenceOutput.website;
    updateTask(tasks.website, state.reviewReasons.length > 0 ? "human_review" : "accepted",
      state.reviewReasons.length > 0 ? "human_review_required" : null);
    updateTask(tasks.persistence, "accepted", null);
    event("persistence", "completed", {
      assessmentId,
      evidencePolicyVersion: PROVENANCE_POLICY_VERSION,
    });
    checkpoint("persistence");
    event("website_assessment", state.reviewReasons.length > 0 ? "review_required" : "completed", {
      assessmentId,
      sourceClass: crawl.sourceClass,
      complete: crawl.complete,
    });

    event("finalization", "started");
    checkpoint("finalization");
    const terminalStatus = state.reviewReasons.length > 0 ? "review_required" : "completed";
    const assemblyOutput = await durable.run({
      stage: "result_assembly",
      fingerprintInput: {
        pipelineStateFingerprint: dependencies.ids.hash(state),
        budget: budget.snapshot(),
        terminalStatus,
      },
      execute: () => {
        const result = assembleResult(terminalStatus, []);
        persistAssembledResult(result, []);
        dependencies.reliability.hooks?.afterResultPersisted?.();
        return { output: { result, terminalStatus } };
      },
    });
    const result = assemblyOutput.result;
    await durable.run({
      stage: "finalization",
      fingerprintInput: {
        resultFingerprint: dependencies.ids.hash(result),
        terminalStatus,
      },
      execute: () => ({
        output: { resultFingerprint: dependencies.ids.hash(result), terminalStatus },
      }),
    });
    withTransaction(dependencies.database, () => {
      durable.release();
      reliability.transitionRun({
        runId,
        to: terminalStatus,
        reasonCode: terminalStatus === "completed" ? "pipeline_completed" : "human_review_required",
        completedAt: result.run.completedAt,
      });
      updateCoreTerminalState(terminalStatus, result.run.completedAt);
      reliability.audit({
        runId,
        action: "finalized_from_result",
        leaseId: lease.leaseId,
        workerId: lease.workerId,
        generation: lease.generation,
        details: { terminalStatus },
      });
    });
    event("finalization", terminalStatus === "review_required" ? "review_required" : "completed", {
      status: terminalStatus,
    });
    return result;
  } catch (error) {
    if (
      error instanceof OfflineProcessInterrupted ||
      error instanceof OfflineRetryScheduledError ||
      error instanceof OfflineRetryNotReadyError
    ) {
      throw error;
    }
    if (error instanceof OfflineManualInterventionError) {
      const failedAt = dependencies.clock.now();
      withTransaction(dependencies.database, () => {
        updateCoreTerminalState("budget_blocked", failedAt);
      });
      throw error;
    }
    if (error instanceof PipelineCancelled) {
      state.warnings.push(`cancelled_during_${error.stage}`);
      const reason = cancellationReason(input.signal);
      const rejectionReasons = [`cancelled_during_${error.stage}:${reason}`];
      const result = assembleResult("cancelled", rejectionReasons);
      const classification = classifyOfflineFailure(new OfflineClassifiedFailure({
        code: "pipeline_cancelled",
        classification: "cancellation",
        retryable: false,
        safeSummary: "Offline orchestration was cancelled",
        terminalOutcome: "cancelled",
      }), durable.currentStage, boundedRetryPolicy(dependencies.reliability.retryPolicy));
      withTransaction(dependencies.database, () => {
        persistAssembledResult(result, rejectionReasons);
        durable.terminate({ classification, runState: "cancelled" });
        updateCoreTerminalState("cancelled", result.run.completedAt);
        reliability.audit({
          runId,
          stageId: durable.currentStage,
          action: "cancellation_recorded",
          leaseId: lease.leaseId,
          workerId: lease.workerId,
          generation: lease.generation,
          details: { reason },
        });
      });
      event(error.stage, "cancelled", { reason });
      return result;
    }
    if (error instanceof PipelineBudgetBlocked) {
      state.warnings.push(error.reason);
      const result = assembleResult("budget_blocked", [error.reason]);
      const classification = classifyOfflineFailure(new OfflineClassifiedFailure({
        code: error.reason,
        classification: "budget",
        retryable: false,
        safeSummary: "Offline orchestration exhausted its configured budget",
      }), durable.currentStage, boundedRetryPolicy(dependencies.reliability.retryPolicy));
      withTransaction(dependencies.database, () => {
        persistAssembledResult(result, [error.reason]);
        durable.terminate({ classification, runState: "failed_terminal" });
        updateCoreTerminalState("budget_blocked", result.run.completedAt);
      });
      event("finalization", "budget_blocked", { reason: error.reason });
      return result;
    }
    if (error instanceof OfflineClassifiedFailure && error.classification === "lease_lost") {
      throw error;
    }
    const failedAt = dependencies.clock.now();
    try {
      const retryPolicy = boundedRetryPolicy(dependencies.reliability.retryPolicy);
      const originalClassification = classifyOfflineFailure(error, durable.currentStage, retryPolicy);
      const classification = originalClassification.retryable ? {
        ...originalClassification,
        retryable: false,
        safeErrorCode: `${originalClassification.safeErrorCode}_attempts_exhausted`,
        safeSummary: "Retry attempts were exhausted for the offline stage",
        terminalOutcome: "failed_terminal" as const,
      } : originalClassification;
      const runState = classification.terminalOutcome === "manual_intervention"
        ? "manual_intervention" as const
        : "failed_terminal" as const;
      withTransaction(dependencies.database, () => {
        durable.terminate({ classification, runState });
        updateCoreTerminalState("budget_blocked", failedAt);
      });
      event("finalization", "failed", {
        reason: classification.safeErrorCode,
      });
    } catch (persistenceError) {
      if (persistenceError instanceof OfflineManualInterventionError) throw persistenceError;
      // The original failure remains authoritative when failure-state persistence also fails.
    }
    throw error;
  }
}
