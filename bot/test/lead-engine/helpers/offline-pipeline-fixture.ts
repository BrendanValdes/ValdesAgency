import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { WebsiteCrawler } from "../../../src/lead-engine/crawl/crawler.js";
import { EXTRACTION_POLICY_VERSION, type FetchResult } from "../../../src/lead-engine/crawl/types.js";
import { loadRuntimeLeadPolicy } from "../../../src/lead-engine/config/lead-policy.js";
import { createSqliteRepositories } from "../../../src/lead-engine/db/sqlite-repositories.js";
import { createWebsiteAssessmentRepository } from "../../../src/lead-engine/db/website-assessment-repository.js";
import { acceptedDiscoveryObservations } from "../../../src/lead-engine/discovery/result-normalizer.js";
import { generateDiscoveryQueries } from "../../../src/lead-engine/discovery/query-generator.js";
import { extractBusinessIdentity } from "../../../src/lead-engine/extraction/business-identity.js";
import { extractContactInformation } from "../../../src/lead-engine/extraction/contact.js";
import { extractConversionSignals } from "../../../src/lead-engine/extraction/conversion.js";
import { extractHtml } from "../../../src/lead-engine/extraction/html.js";
import { extractJsonLd } from "../../../src/lead-engine/extraction/json-ld.js";
import { extractPersonCandidates } from "../../../src/lead-engine/extraction/people.js";
import { extractServiceEvidence } from "../../../src/lead-engine/extraction/services.js";
import { planCoverage } from "../../../src/lead-engine/geography/coverage-planner.js";
import type { BusinessIdentityRecord } from "../../../src/lead-engine/identity/hierarchy.js";
import { matchBusinessIdentity } from "../../../src/lead-engine/identity/matcher.js";
import {
  OFFLINE_ORCHESTRATION_VERSION,
  type OfflineLeadPipelineDependencies,
  type OfflineLeadPipelineInput,
  type OfflinePipelineEvent,
} from "../../../src/lead-engine/orchestration/types.js";
import type {
  OfflineDurableStage,
  OfflineReliabilityControl,
} from "../../../src/lead-engine/orchestration/reliability/types.js";
import { FixtureDiscoveryProvider } from "../../../src/lead-engine/providers/adapters/fixture.js";
import type { NormalizedDiscoveryResult } from "../../../src/lead-engine/providers/contracts.js";
import { ProviderRegistry } from "../../../src/lead-engine/providers/registry.js";
import { stableHash, stableId } from "../../../src/lead-engine/shared/stable.js";
import { syntheticMetro } from "../fixtures/geography/synthetic.js";
import { createTestDatabase, SYNTHETIC_TIMESTAMP } from "../fixtures/synthetic.js";

const fixtureHtml = readFileSync(
  path.join(process.cwd(), "test/lead-engine/fixtures/websites/synthetic/valid-local-business.html"),
  "utf8",
);

export const offlineDiscoveryRecord: NormalizedDiscoveryResult = {
  providerPlaceId: "fixture-place-offline-001",
  name: "Clearwater Example Pool Care",
  categories: ["pool_service"],
  address: {
    line1: "100 Example Way",
    city: "Testville",
    region: "AZ",
    postalCode: "85000",
    countryCode: "US",
  },
  domains: ["clearwater.example"],
  phones: ["+1 202-555-0100"],
  brandName: null,
  groupHint: null,
};

function checksum(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export interface OfflinePipelineFixtureOptions {
  readonly records?: ReadonlyArray<NormalizedDiscoveryResult>;
  readonly existingIdentities?: ReadonlyArray<BusinessIdentityRecord>;
  readonly html?: string;
  readonly onEvent?: (event: OfflinePipelineEvent) => void;
  readonly onFetch?: (url: string) => void;
  readonly startedAt?: string;
  readonly workerId?: string;
  readonly leaseDurationMs?: number;
  readonly retryPolicy?: OfflineReliabilityControl["retryPolicy"];
  readonly afterRunCreated?: () => void;
  readonly afterStageCommitted?: (stage: OfflineDurableStage) => void;
  readonly afterResultPersisted?: () => void;
}

export function createOfflinePipelineFixture(
  options: OfflinePipelineFixtureOptions = {},
) {
  const databaseFixture = createTestDatabase();
  const policy = loadRuntimeLeadPolicy();
  const providerRegistry = new ProviderRegistry(policy);
  providerRegistry.register(new FixtureDiscoveryProvider({
    records: options.records ?? [offlineDiscoveryRecord],
  }));
  const events: OfflinePipelineEvent[] = [];
  let nowMs = Date.parse(options.startedAt ?? SYNTHETIC_TIMESTAMP);
  let leaseSequence = 0;
  const clock = {
    now: () => new Date(nowMs).toISOString(),
    advance(ms: number) {
      nowMs += ms;
      return this.now();
    },
  };
  const websiteSource = options.html ?? fixtureHtml;
  const fixtureFetcher = {
    sourceClass: "synthetic_fixture" as const,
    handles(url: string): boolean {
      try {
        return new URL(url).origin === "https://clearwater.example";
      } catch {
        return false;
      }
    },
    async fetch(request: { url: string; signal?: AbortSignal }): Promise<FetchResult> {
      options.onFetch?.(request.url);
      if (request.signal?.aborted) {
        return {
          ok: false,
          requestedUrl: request.url,
          finalUrl: null,
          errorCode: "cancelled",
          retryable: false,
          attempts: 0,
          redirectHistory: [],
          fetchedAt: clock.now(),
          httpStatus: null,
        };
      }
      if (!this.handles(request.url)) {
        return {
          ok: false,
          requestedUrl: request.url,
          finalUrl: null,
          errorCode: "policy_rejected",
          retryable: false,
          attempts: 0,
          redirectHistory: [],
          fetchedAt: clock.now(),
          httpStatus: null,
        };
      }
      const parsed = new URL(request.url);
      const isRobots = parsed.pathname === "/robots.txt";
      const body = isRobots ? "" : websiteSource;
      return {
        ok: true,
        requestedUrl: request.url,
        finalUrl: request.url,
        status: isRobots ? 404 : 200,
        contentType: isRobots ? "text/plain" : "text/html",
        body,
        compressedBytes: Buffer.byteLength(body),
        decompressedBytes: Buffer.byteLength(body),
        contentChecksum: checksum(body),
        etag: null,
        lastModified: null,
        redirectHistory: [],
        fetchedAt: clock.now(),
        attempts: 1,
      };
    },
  };
  const repositories = createSqliteRepositories(databaseFixture.database, {
    dataRoot: databaseFixture.dataRoot,
  });
  const dependencies: OfflineLeadPipelineDependencies = {
    policy,
    niche: policy.niches.pool_service,
    providerRegistry,
    repositories,
    websiteAssessments: createWebsiteAssessmentRepository(databaseFixture.database),
    database: databaseFixture.database,
    fixtureFetcher,
    createWebsiteCrawler: (crawlerOptions) => new WebsiteCrawler(crawlerOptions),
    coveragePlanner: planCoverage,
    queryGenerator: generateDiscoveryQueries,
    resultNormalizer: acceptedDiscoveryObservations,
    identityMatcher: matchBusinessIdentity,
    existingIdentities: () => options.existingIdentities ?? [],
    extractors: {
      extractHtml,
      extractJsonLd,
      extractBusinessIdentity,
      extractContactInformation,
      extractPersonCandidates,
      extractServiceEvidence,
      extractConversionSignals,
    },
    clock,
    ids: { id: stableId, hash: stableHash },
    events: {
      emit(event) {
        events.push(event);
        options.onEvent?.(event);
      },
    },
    reliability: {
      workerId: options.workerId ?? "offline-worker-001",
      leaseDurationMs: options.leaseDurationMs ?? 30_000,
      leaseToken: () => `offline-lease-token-${++leaseSequence}`,
      retryPolicy: options.retryPolicy,
      hooks: {
        afterRunCreated: options.afterRunCreated,
        afterStageCommitted: options.afterStageCommitted,
        afterResultPersisted: options.afterResultPersisted,
      },
    },
  };

  const makeInput = (
    overrides: Partial<Omit<OfflineLeadPipelineInput, "budget" | "fixtureWebsite">> & {
      budget?: Partial<OfflineLeadPipelineInput["budget"]>;
      fixtureWebsite?: Partial<OfflineLeadPipelineInput["fixtureWebsite"]>;
    } = {},
  ): OfflineLeadPipelineInput => ({
    runKey: overrides.runKey ?? "offline-run-key-001",
    nicheId: overrides.nicheId ?? "pool_service",
    market: overrides.market ?? [syntheticMetro],
    providerId: overrides.providerId ?? "fixture",
    fixtureScenario: overrides.fixtureScenario,
    fixtureWebsite: {
      fixtureId: "synthetic-website-clearwater-001",
      providerResultId: offlineDiscoveryRecord.providerPlaceId as string,
      expectedBusinessName: "Clearwater Example Pool Care",
      url: "https://clearwater.example/",
      ...overrides.fixtureWebsite,
    },
    executionScope: overrides.executionScope ?? "offline_synthetic",
    budget: {
      maxProviderCalls: 10,
      maxWebsiteRequests: 10,
      maxPages: 3,
      maxCompressedBytes: 100_000,
      maxDecompressedBytes: 100_000,
      maxElapsedCrawlMs: 5_000,
      ...overrides.budget,
    },
    queryVersion: overrides.queryVersion ?? "offline-query-1.0.0",
    extractionVersion: overrides.extractionVersion ?? EXTRACTION_POLICY_VERSION,
    orchestrationVersion: overrides.orchestrationVersion ?? OFFLINE_ORCHESTRATION_VERSION,
    signal: overrides.signal,
  });

  return {
    ...databaseFixture,
    dependencies,
    events,
    clock,
    makeInput,
  };
}
