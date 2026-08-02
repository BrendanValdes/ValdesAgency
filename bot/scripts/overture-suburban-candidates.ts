import { DEFAULT_LEAD_POLICY_ROOT } from "../src/lead-engine/config/lead-policy.js";
import { NetworkPolicyAuthorizer } from "../src/lead-engine/config/network-capability.js";
import type { BoundingArea, CoverageCell } from "../src/lead-engine/geography/types.js";
import {
  discoverSuburbanWebsiteCandidates,
  planSuburbanCells,
  type SuburbanDiscoverySummary,
} from "../src/lead-engine/assessment/suburban-discovery.js";
import { OverturePlacesLiveDiscoveryProvider } from "../src/lead-engine/providers/adapters/overture-places-live.js";
import {
  OvertureBudgetTracker,
  type OvertureBudgetLimits,
} from "../src/lead-engine/providers/overture/budgets.js";
import { createEphemeralOvertureCanaryPolicy } from "../src/lead-engine/providers/overture/canary-policy.js";
import { createOfficialOvertureCatalogTransport } from "../src/lead-engine/providers/overture/catalog-transport.js";
import {
  createOverturePlacesQueryPlan,
  OVERTURE_MAX_PLAN_ROWS,
} from "../src/lead-engine/providers/overture/query.js";
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
 * Phase 5A.3 bounded suburban discovery over the official Overture release.
 *
 * The release is resolved once for the union of the planned suburban cells and
 * that single pin is reused for every cell, so release pinning, asset
 * validation, capability scoping, and byte-range controls all stay in force
 * while the STAC cost stays at one resolution for the whole traversal.
 */

export const SUBURBAN_CANARY_LIMITS: OvertureBudgetLimits = Object.freeze({
  maxStacRequests: 5,
  maxAssetRequests: 25,
  // Every suburban cell re-reads the same pinned partition, so one asset
  // inspection per cell. This is an internal operation counter, not one of the
  // mandated request/byte/row/time ceilings, which are unchanged.
  maxAssetsInspected: 5,
  maxRowGroupsInspected: 256,
  maxDownloadedBytes: 32 * 1024 * 1024,
  maxProcessedBytes: 64 * 1024 * 1024,
  maxRowsRead: 10_000,
  maxCandidates: 15,
  maxAreaSquareKm: 25,
  maxRuntimeMs: 90_000,
  maxRetryAttempts: 2,
  maxCostMicroUsd: 0,
});

export const SUBURBAN_MAX_CELLS = 5;
export const SUBURBAN_TARGET_WEBSITE_CANDIDATES = 3;

/**
 * Only a STRONG pool-service classification counts here. The shared classifier
 * maps any unrecognised category to "review", so a predicate that merely
 * excluded "excluded"/"missing" would treat every unrelated business as a
 * candidate and stop the traversal before it ever reached a contractor.
 */
function isStrongPoolServiceCandidate(row: Record<string, unknown>): boolean {
  const parsed = overturePlaceRecordSchema.safeParse(row);
  if (!parsed.success) return false;
  return classifyOverturePoolCategory({
    basicCategory: parsed.data.basic_category,
    taxonomy: parsed.data.taxonomy,
  }).disposition === "strong";
}

function unionBounds(cells: ReadonlyArray<CoverageCell>): BoundingArea {
  const west = Math.min(...cells.map((cell) => cell.bounds.west));
  const south = Math.min(...cells.map((cell) => cell.bounds.south));
  const east = Math.max(...cells.map((cell) => cell.bounds.east));
  const north = Math.max(...cells.map((cell) => cell.bounds.north));
  return { west, south, east, north };
}

export interface SuburbanDiscoveryOutcome {
  readonly summary: SuburbanDiscoverySummary;
  readonly envelopes: ReadonlyArray<ProviderEnvelope<NormalizedDiscoveryResult>>;
  readonly releaseId: string;
  readonly requests: number;
  readonly downloadedBytes: number;
  readonly processedBytes: number;
  readonly rowsConsidered: number;
  readonly budgetRemaining: Readonly<Record<string, number>>;
  readonly destinationsContacted: ReadonlyArray<string>;
  readonly elapsedMs: number;
}

export async function discoverSuburbanPhoenixCandidates(options: {
  maxCells?: number;
  targetWebsiteCandidates?: number;
  maxAcceptedCandidates?: number;
} = {}): Promise<SuburbanDiscoveryOutcome> {
  const maxCells = options.maxCells ?? SUBURBAN_MAX_CELLS;
  const targetWebsiteCandidates = options.targetWebsiteCandidates ?? SUBURBAN_TARGET_WEBSITE_CANDIDATES;
  const limits: OvertureBudgetLimits = {
    ...SUBURBAN_CANARY_LIMITS,
    maxAssetsInspected: Math.min(16, Math.max(1, maxCells)),
    maxCandidates: options.maxAcceptedCandidates ?? SUBURBAN_CANARY_LIMITS.maxCandidates,
  };
  const startedAt = Date.now();
  const policy = createEphemeralOvertureCanaryPolicy({
    checkedInConfigurationRoot: DEFAULT_LEAD_POLICY_ROOT,
    maxRequests: limits.maxStacRequests + limits.maxAssetRequests,
    maxBytes: limits.maxDownloadedBytes,
    maxDurationMs: limits.maxRuntimeMs,
  });
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), limits.maxRuntimeMs);
  const contacted = new Set<string>();
  const collected: ProviderEnvelope<NormalizedDiscoveryResult>[] = [];
  try {
    const cells = planSuburbanCells({
      configurationVersion: policy.policy.schemaVersion,
      queryVersion: "overture-suburban-canary-1.0.0",
      maxCells,
    });
    if (cells.length === 0) throw new Error("Suburban discovery planned no coverage cells");

    const budget = new OvertureBudgetTracker({ limits });
    const nowIso = (): string => new Date().toISOString();
    const runId = "overture-suburban-canary";
    const assessmentId = "overture-suburban-canary-scope";

    const authorizer = new NetworkPolicyAuthorizer(policy.policy, { now: Date.now });
    const capability = authorizer.issuePublicWebCapability({
      providerId: OVERTURE_PLACES_PROVIDER_ID,
      runId,
      assessmentId,
      operation: "discovery",
      maxRequests: limits.maxStacRequests + limits.maxAssetRequests,
      maxBytes: limits.maxDownloadedBytes,
      maxBytesPerRequest: limits.maxDownloadedBytes,
      maxRequestDurationMs: limits.maxRuntimeMs,
      costBudgetMicroUsd: 0,
      ttlMs: limits.maxRuntimeMs,
    });

    // One release resolution for the whole traversal, over the union of cells.
    const resolver = new OvertureReleaseResolver({
      transport: createOfficialOvertureCatalogTransport({
        capability,
        providerId: OVERTURE_PLACES_PROVIDER_ID,
        runId,
        assessmentId,
        maximumBytes: 512 * 1024,
        maximumDurationMs: 30_000,
        now: nowIso,
      }),
      budget,
      clock: { now: nowIso },
    });
    const release = await resolver.resolve({
      requestedRelease: "latest",
      bounds: unionBounds(cells),
      signal: controller.signal,
    });

    const rangeTransport = createOfficialOvertureRangeHttpTransport({
      capability,
      runId,
      assessmentId,
      maximumBodyBytesPerRequest: Math.max(
        1,
        Math.min(limits.maxDownloadedBytes - OVERTURE_RANGE_HEADER_OVERHEAD_BYTES - 1, 8 * 1024 * 1024),
      ),
      maximumDurationMs: 60_000,
    });

    const summary = await discoverSuburbanWebsiteCandidates({
      cells,
      limits: {
        maxCells,
        targetWebsiteCandidates,
        maxAcceptedCandidates: limits.maxCandidates,
      },
      signal: controller.signal,
      isBudgetExhausted: () => {
        const remaining = budget.snapshot().remaining;
        return remaining.maxRowsRead <= 0 || remaining.maxAssetRequests <= 0 ||
          remaining.maxDownloadedBytes <= 0 || remaining.maxProcessedBytes <= 0;
      },
      queryCell: async (cell) => {
        const plan = createOverturePlacesQueryPlan({
          releaseId: release.releaseId,
          coverageCell: cell,
          // Each cell may decode at most one plan's worth of rows; the shared
          // budget caps the traversal total.
          maxRows: Math.min(OVERTURE_MAX_PLAN_ROWS, budget.snapshot().remaining.maxRowsRead),
          maxAreaSquareKm: limits.maxAreaSquareKm,
        });
        const engine = createSecureOvertureAssetQueryEngine({
          policy: policy.policy,
          capability,
          runId,
          assessmentId,
          transport: rangeTransport,
          audit: { record: (event) => contacted.add(event.destinationHost) },
          now: nowIso,
          candidateTarget: targetWebsiteCandidates,
          isCandidate: isStrongPoolServiceCandidate,
          // Off-target rows are never materialised, so review-grade places
          // cannot consume the accepted-candidate budget or reach the gate.
          retainOnlyCandidates: true,
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
          correlationId: `${runId}:${cell.coverageKey}`,
          queryId: `suburban-${cell.coverageKey}`,
          queryText: "overture pool service phoenix suburban",
          nicheId: "pool_service",
          coverageKey: cell.coverageKey,
          observedAt: nowIso(),
          retrievedAt: nowIso(),
        };
        const batch = await provider.discover(request);
        collected.push(...batch.envelopes);
        return batch.envelopes;
      },
    });

    const snapshot = budget.snapshot();
    return {
      summary,
      envelopes: Object.freeze(collected),
      releaseId: release.releaseId,
      requests: snapshot.consumed.stacRequests + snapshot.consumed.assetRequests,
      downloadedBytes: snapshot.consumed.downloadedBytes,
      processedBytes: snapshot.consumed.processedBytes,
      rowsConsidered: snapshot.consumed.rowsRead,
      budgetRemaining: snapshot.remaining,
      destinationsContacted: Object.freeze([...contacted].sort()),
      elapsedMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(deadline);
    policy.cleanup();
  }
}
