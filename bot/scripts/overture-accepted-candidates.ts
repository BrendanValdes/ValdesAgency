import { DEFAULT_LEAD_POLICY_ROOT } from "../src/lead-engine/config/lead-policy.js";
import { NetworkPolicyAuthorizer } from "../src/lead-engine/config/network-capability.js";
import { planCoverage } from "../src/lead-engine/geography/coverage-planner.js";
import type { GeographyTarget } from "../src/lead-engine/geography/types.js";
import { OverturePlacesLiveDiscoveryProvider } from "../src/lead-engine/providers/adapters/overture-places-live.js";
import {
  OVERTURE_CANARY_HARD_LIMITS,
  OvertureBudgetTracker,
} from "../src/lead-engine/providers/overture/budgets.js";
import { createEphemeralOvertureCanaryPolicy } from "../src/lead-engine/providers/overture/canary-policy.js";
import { createOfficialOvertureCatalogTransport } from "../src/lead-engine/providers/overture/catalog-transport.js";
import { createOverturePlacesQueryPlan } from "../src/lead-engine/providers/overture/query.js";
import {
  createOfficialOvertureRangeHttpTransport,
  OVERTURE_RANGE_HEADER_OVERHEAD_BYTES,
} from "../src/lead-engine/providers/overture/range-http-transport.js";
import { OvertureReleaseResolver } from "../src/lead-engine/providers/overture/release-resolver.js";
import { createSecureOvertureAssetQueryEngine } from "../src/lead-engine/providers/overture/secure-asset-query-engine.js";
import { overturePlaceRecordSchema } from "../src/lead-engine/providers/overture/schema.js";
import { classifyOverturePoolCategory } from "../src/lead-engine/providers/overture/taxonomy.js";
import { OVERTURE_PLACES_PROVIDER_ID } from "../src/lead-engine/providers/overture/types.js";
import type {
  DiscoveryProviderRequest,
  NormalizedDiscoveryResult,
  ProviderEnvelope,
} from "../src/lead-engine/providers/contracts.js";

/**
 * Reuse the Phase 5A.2 bounded Overture discovery path to produce the accepted
 * candidate envelopes that Phase 5B may assess. This performs Overture reads
 * only — it never touches a business website.
 */

const PHOENIX_CANARY_TARGET: GeographyTarget = Object.freeze({
  level: "grid_cell",
  label: "Phoenix canary cell",
  countryCode: "US",
  subdivisionCode: "AZ",
  bounds: Object.freeze({ west: -112.094, south: 33.438, east: -112.044, north: 33.478 }),
  density: "dense",
});

const CANDIDATE_TARGET = 10;

function isPoolServiceCandidate(row: Record<string, unknown>): boolean {
  const parsed = overturePlaceRecordSchema.safeParse(row);
  if (!parsed.success) return false;
  const decision = classifyOverturePoolCategory({
    basicCategory: parsed.data.basic_category,
    taxonomy: parsed.data.taxonomy,
  });
  return decision.disposition !== "excluded" && decision.disposition !== "missing";
}

export async function discoverAcceptedPhoenixCandidates(): Promise<
  ReadonlyArray<ProviderEnvelope<NormalizedDiscoveryResult>>
> {
  const maxBytes = OVERTURE_CANARY_HARD_LIMITS.maxDownloadedBytes;
  const durationMs = OVERTURE_CANARY_HARD_LIMITS.maxRuntimeMs;
  const policy = createEphemeralOvertureCanaryPolicy({
    checkedInConfigurationRoot: DEFAULT_LEAD_POLICY_ROOT,
    maxRequests: OVERTURE_CANARY_HARD_LIMITS.maxStacRequests + OVERTURE_CANARY_HARD_LIMITS.maxAssetRequests,
    maxBytes,
    maxDurationMs: durationMs,
  });
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), durationMs);
  try {
    const coverage = planCoverage({
      nicheId: "pool_service",
      configurationVersion: policy.policy.schemaVersion,
      queryVersion: "overture-places-canary-1.0.0",
      strategy: "dense",
      targets: [PHOENIX_CANARY_TARGET],
      resultCap: 100,
      maxDepth: 0,
    });
    const cell = coverage.cells[0];
    if (!cell) throw new Error("Phoenix canary must resolve to exactly one coverage cell");
    const budget = new OvertureBudgetTracker({ limits: OVERTURE_CANARY_HARD_LIMITS });
    const nowIso = (): string => new Date().toISOString();
    const runId = "overture-accepted-candidates";
    const assessmentId = "overture-accepted-candidates-scope";

    const authorizer = new NetworkPolicyAuthorizer(policy.policy, { now: Date.now });
    const capability = authorizer.issuePublicWebCapability({
      providerId: OVERTURE_PLACES_PROVIDER_ID,
      runId,
      assessmentId,
      operation: "discovery",
      maxRequests: OVERTURE_CANARY_HARD_LIMITS.maxStacRequests + OVERTURE_CANARY_HARD_LIMITS.maxAssetRequests,
      maxBytes,
      maxBytesPerRequest: maxBytes,
      maxRequestDurationMs: durationMs,
      costBudgetMicroUsd: 0,
      ttlMs: durationMs,
    });

    const resolver = new OvertureReleaseResolver({
      transport: createOfficialOvertureCatalogTransport({
        capability,
        providerId: OVERTURE_PLACES_PROVIDER_ID,
        runId,
        assessmentId,
        maximumBytes: 512 * 1024,
        maximumDurationMs: Math.min(durationMs, 30_000),
        now: nowIso,
      }),
      budget,
      clock: { now: nowIso },
    });
    const release = await resolver.resolve({
      requestedRelease: "latest",
      bounds: cell.bounds,
      signal: controller.signal,
    });
    const plan = createOverturePlacesQueryPlan({
      releaseId: release.releaseId,
      coverageCell: cell,
      maxRows: OVERTURE_CANARY_HARD_LIMITS.maxRowsRead,
      maxAreaSquareKm: OVERTURE_CANARY_HARD_LIMITS.maxAreaSquareKm,
    });
    const engine = createSecureOvertureAssetQueryEngine({
      policy: policy.policy,
      capability,
      runId,
      assessmentId,
      transport: createOfficialOvertureRangeHttpTransport({
        capability,
        runId,
        assessmentId,
        maximumBodyBytesPerRequest: Math.max(
          1,
          Math.min(maxBytes - OVERTURE_RANGE_HEADER_OVERHEAD_BYTES - 1, 8 * 1024 * 1024),
        ),
        maximumDurationMs: Math.min(durationMs, 60_000),
      }),
      now: nowIso,
      candidateTarget: CANDIDATE_TARGET,
      isCandidate: isPoolServiceCandidate,
    });
    const provider = new OverturePlacesLiveDiscoveryProvider({
      policy: policy.policy,
      capability,
      runId,
      assessmentId,
      release,
      coverageCell: cell,
      plan,
      budget,
      signal: controller.signal,
      queryEngine: engine,
    });
    const request: DiscoveryProviderRequest = {
      operation: "discovery",
      correlationId: `${runId}:overture-accepted-candidates-query`,
      queryId: "overture-accepted-candidates-query",
      queryText: "overture pool service phoenix candidates",
      nicheId: "pool_service",
      coverageKey: cell.coverageKey,
      observedAt: nowIso(),
      retrievedAt: nowIso(),
    };
    const batch = await provider.discover(request);
    return batch.envelopes;
  } finally {
    clearTimeout(deadline);
    policy.cleanup();
  }
}
