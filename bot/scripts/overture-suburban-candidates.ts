import { DEFAULT_LEAD_POLICY_ROOT } from "../src/lead-engine/config/lead-policy.js";
import { NetworkPolicyAuthorizer } from "../src/lead-engine/config/network-capability.js";
import type { BoundingArea, CoverageCell, CoverageManifest } from "../src/lead-engine/geography/types.js";
import {
  discoverSuburbanWebsiteCandidates,
  planSuburbanCoverage,
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
import {
  createOvertureAssetSession,
  type OvertureAssetSession,
} from "../src/lead-engine/providers/overture/asset-session.js";
import { overturePlaceRecordSchema } from "../src/lead-engine/providers/overture/schema.js";
import {
  classifyOverturePoolCategory,
  OVERTURE_POOL_SERVICE_TAXONOMY_V1,
} from "../src/lead-engine/providers/overture/taxonomy.js";
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
/**
 * Accepted values for the early category filter: exactly the validated strong
 * mapping. Review categories such as hot_tub_and_pool_store, plus supporting,
 * facility, retail, and unknown categories, are never accepted here.
 */
const STRONG_CATEGORY_VALUES: ReadonlyArray<string> =
  Object.freeze([...OVERTURE_POOL_SERVICE_TAXONOMY_V1.strong]);
const STRONG_CATEGORY_SET = new Set<string>(STRONG_CATEGORY_VALUES);

/**
 * Early filter predicate over the minimum projection the classifier needs.
 * basic_category alone is not sufficient: the strong signal frequently lives in
 * taxonomy.primary, so probing only basic_category prunes real matches.
 */
function acceptsStrongCategory(row: Record<string, unknown>): boolean {
  const basic = row.basic_category;
  if (typeof basic === "string" && STRONG_CATEGORY_SET.has(basic)) return true;
  const taxonomy = row.taxonomy as
    | { primary?: unknown; hierarchy?: unknown; alternates?: unknown } | null | undefined;
  if (!taxonomy) return false;
  const values = [
    taxonomy.primary,
    ...(Array.isArray(taxonomy.hierarchy) ? taxonomy.hierarchy : []),
    ...(Array.isArray(taxonomy.alternates) ? taxonomy.alternates : []),
  ];
  return values.some((value) => typeof value === "string" && STRONG_CATEGORY_SET.has(value));
}

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

/**
 * Per-pass discovery economics.
 *
 * Everything is a count, a byte total, or a ratio, so the whole block is safe to
 * print. It exists to answer one question directly: what did each eligible
 * candidate cost, and which stage of the funnel destroyed the rest.
 */
export interface SuburbanDiscoveryMetrics {
  readonly cellsQueried: number;
  readonly requests: number;
  readonly downloadedBytes: number;
  readonly processedBytes: number;
  readonly budgetConsumed: Readonly<Record<string, number>>;
  readonly budgetRemaining: Readonly<Record<string, number>>;
  readonly rowsScanned: number;
  readonly rowsMaterialised: number;
  readonly rowGroupsSelected: number;
  readonly rowGroupsRead: number;
  readonly earlyFilteredGroups: number;
  readonly statisticsPrunedGroups: number;
  /** Row-level funnel summed across the pass's cells. */
  readonly decodedRows: number;
  readonly rejectedOutsideCell: number;
  readonly rejectedDuplicateId: number;
  readonly rejectedByCategory: number;
  readonly acceptedCandidates: number;
  /** Gate outcomes, i.e. candidates before and after admissibility. */
  readonly envelopesConsidered: number;
  readonly gateEligible: number;
  readonly duplicatesAcrossCells: number;
  readonly eligibleAfterDedupe: number;
  /** Byte-range cache effectiveness, the measure of duplicate IO removed. */
  readonly rangeCacheHits: number;
  readonly rangeCacheMisses: number;
  readonly assetHandleReuses: number;
  readonly sessionCacheBytes: number;
  /** Cost per eligible candidate. Infinity is reported as null. */
  readonly requestsPerEligible: number | null;
  readonly downloadedBytesPerEligible: number | null;
  readonly rowsScannedPerEligible: number | null;
  /** Observed provider category identifiers, keyed `disposition:identifier`. */
  readonly observedCategories: Readonly<Record<string, number>>;
}

export interface SuburbanDiscoveryOutcome {
  readonly summary: SuburbanDiscoverySummary;
  readonly metrics: SuburbanDiscoveryMetrics;
  /**
   * The coverage manifest this pass actually planned. Carried out of discovery so
   * the batch can persist the market it searched; it holds cell geometry and
   * labels only, never a business value.
   */
  readonly coverage: CoverageManifest;
  readonly envelopes: ReadonlyArray<ProviderEnvelope<NormalizedDiscoveryResult>>;
  readonly releaseId: string;
  readonly requests: number;
  readonly downloadedBytes: number;
  readonly processedBytes: number;
  readonly rowsConsidered: number;
  readonly rowsScanned: number;
  readonly rowsMaterialised: number;
  readonly earlyFilteredGroups: number;
  readonly statisticsPrunedGroups: number;
  readonly budgetRemaining: Readonly<Record<string, number>>;
  readonly destinationsContacted: ReadonlyArray<string>;
  readonly elapsedMs: number;
}

export async function discoverSuburbanPhoenixCandidates(options: {
  maxCells?: number;
  targetWebsiteCandidates?: number;
  maxAcceptedCandidates?: number;
  cellOffset?: number;
  /**
   * Coverage to traverse instead of the default suburban Phoenix plan. Lets a
   * multi-market batch reuse this bounded traversal verbatim — same policy,
   * capability, release pin, budget, session, engine, provider, and admission
   * gate — while supplying its own planner windows.
   */
  coverage?: CoverageManifest;
  /** Per-cell row ceiling, still bounded by OVERTURE_MAX_PLAN_ROWS. */
  budgetLimits?: Partial<OvertureBudgetLimits>;
} = {}): Promise<SuburbanDiscoveryOutcome> {
  const maxCells = options.maxCells ?? SUBURBAN_MAX_CELLS;
  const targetWebsiteCandidates = options.targetWebsiteCandidates ?? SUBURBAN_TARGET_WEBSITE_CANDIDATES;
  const limits: OvertureBudgetLimits = {
    ...SUBURBAN_CANARY_LIMITS,
    // One shared asset handle per pass, so a single inspection covers every cell.
    // Kept at the cell count when no session-aware caller overrides it.
    maxAssetsInspected: Math.min(16, Math.max(1, maxCells)),
    maxCandidates: options.maxAcceptedCandidates ?? SUBURBAN_CANARY_LIMITS.maxCandidates,
    ...options.budgetLimits,
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
  const efficiency = {
    rowsScanned: 0, rowsMaterialised: 0, earlyFilteredGroups: 0, statisticsPrunedGroups: 0,
    rowGroupsSelected: 0, rowGroupsRead: 0,
    decodedRows: 0, rejectedOutsideCell: 0, rejectedDuplicateId: 0,
    rejectedByCategory: 0, acceptedCandidates: 0,
    rangeCacheHits: 0, rangeCacheMisses: 0,
  };
  const observedCategories: Record<string, number> = {};
  // Hoisted so the finally block can zero the cache on the failure path too.
  let session: OvertureAssetSession | null = null;
  try {
    const coverage = options.coverage ?? planSuburbanCoverage({
      configurationVersion: policy.policy.schemaVersion,
      queryVersion: "overture-suburban-canary-1.0.0",
      maxCells,
      cellOffset: options.cellOffset ?? 0,
    });
    const cells = coverage.cells;
    if (cells.length === 0) throw new Error("Suburban discovery planned no coverage cells");

    const budget = new OvertureBudgetTracker({ limits });
    // Scoped to this pass: same budget tracker, same abort signal. The session
    // refuses to serve a handle across a different scope, so it can never charge
    // the wrong budget or outlive a cancellation.
    session = createOvertureAssetSession({ budget, signal: controller.signal });
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
          // One asset handle, footer, and bounded byte cache for the whole pass.
          // Every cell reads the same pinned asset, so reopening it per cell was
          // paying repeatedly for identical immutable bytes.
          ...(session ? { session } : {}),
          audit: { record: (event) => contacted.add(event.destinationHost) },
          now: nowIso,
          candidateTarget: targetWebsiteCandidates,
          isCandidate: isStrongPoolServiceCandidate,
          // Off-target rows are never materialised, so review-grade places
          // cannot consume the accepted-candidate budget or reach the gate.
          retainOnlyCandidates: true,
          // Client-side early column-projection filtering: only basic_category
          // is read per group first, and the full projection is materialised
          // only for groups that contain a strong value.
          earlyFilterColumns: ["basic_category", "taxonomy"],
          earlyFilterAccepts: acceptsStrongCategory,
          earlyFilterValues: STRONG_CATEGORY_VALUES,
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
        const audit = provider.audit();
        if (audit) {
          efficiency.rowsScanned += audit.rowsScanned;
          efficiency.rowsMaterialised += audit.rowsMaterialised;
          efficiency.earlyFilteredGroups += audit.earlyFilteredGroups;
          efficiency.statisticsPrunedGroups += audit.statisticsPrunedGroups;
          efficiency.rowGroupsSelected += audit.rowGroupsSelected;
          efficiency.rowGroupsRead += audit.rowGroupsRead;
          efficiency.decodedRows += audit.funnel?.decodedRows ?? 0;
          efficiency.rejectedOutsideCell += audit.funnel?.rejectedOutsideCell ?? 0;
          efficiency.rejectedDuplicateId += audit.funnel?.rejectedDuplicateId ?? 0;
          efficiency.rejectedByCategory += audit.funnel?.rejectedByCategory ?? 0;
          efficiency.acceptedCandidates += audit.funnel?.acceptedCandidates ?? 0;
          efficiency.rangeCacheHits += audit.cache?.rangeHits ?? 0;
          efficiency.rangeCacheMisses += audit.cache?.rangeMisses ?? 0;
          for (const [key, count] of Object.entries(audit.observedCategories)) {
            observedCategories[key] = (observedCategories[key] ?? 0) + count;
          }
        }
        collected.push(...batch.envelopes);
        return batch.envelopes;
      },
    });

    const snapshot = budget.snapshot();
    const sessionMetrics = session.metrics();
    const eligibleCount = summary.eligibleWebsiteCandidates.length;
    const perEligible = (value: number): number | null =>
      eligibleCount > 0 ? Number((value / eligibleCount).toFixed(2)) : null;
    const metrics: SuburbanDiscoveryMetrics = Object.freeze({
      cellsQueried: summary.cellsQueried,
      requests: snapshot.consumed.stacRequests + snapshot.consumed.assetRequests,
      downloadedBytes: snapshot.consumed.downloadedBytes,
      processedBytes: snapshot.consumed.processedBytes,
      budgetConsumed: Object.freeze({ ...snapshot.consumed }),
      budgetRemaining: Object.freeze({ ...snapshot.remaining }),
      rowsScanned: efficiency.rowsScanned,
      rowsMaterialised: efficiency.rowsMaterialised,
      rowGroupsSelected: efficiency.rowGroupsSelected,
      rowGroupsRead: efficiency.rowGroupsRead,
      earlyFilteredGroups: efficiency.earlyFilteredGroups,
      statisticsPrunedGroups: efficiency.statisticsPrunedGroups,
      decodedRows: efficiency.decodedRows,
      rejectedOutsideCell: efficiency.rejectedOutsideCell,
      rejectedDuplicateId: efficiency.rejectedDuplicateId,
      rejectedByCategory: efficiency.rejectedByCategory,
      acceptedCandidates: efficiency.acceptedCandidates,
      envelopesConsidered: summary.envelopesConsidered,
      gateEligible: summary.acceptedCandidates,
      duplicatesAcrossCells: summary.duplicatesAcrossCells,
      eligibleAfterDedupe: eligibleCount,
      rangeCacheHits: efficiency.rangeCacheHits,
      rangeCacheMisses: efficiency.rangeCacheMisses,
      assetHandleReuses: sessionMetrics.handleReuses,
      sessionCacheBytes: sessionMetrics.cacheBytes,
      requestsPerEligible: perEligible(
        snapshot.consumed.stacRequests + snapshot.consumed.assetRequests,
      ),
      downloadedBytesPerEligible: perEligible(snapshot.consumed.downloadedBytes),
      rowsScannedPerEligible: perEligible(efficiency.rowsScanned),
      observedCategories: Object.freeze({ ...observedCategories }),
    });
    return {
      summary,
      metrics,
      coverage,
      envelopes: Object.freeze(collected),
      releaseId: release.releaseId,
      requests: snapshot.consumed.stacRequests + snapshot.consumed.assetRequests,
      downloadedBytes: snapshot.consumed.downloadedBytes,
      processedBytes: snapshot.consumed.processedBytes,
      rowsConsidered: snapshot.consumed.rowsRead,
      rowsScanned: efficiency.rowsScanned,
      rowsMaterialised: efficiency.rowsMaterialised,
      earlyFilteredGroups: efficiency.earlyFilteredGroups,
      statisticsPrunedGroups: efficiency.statisticsPrunedGroups,
      budgetRemaining: Object.freeze({ ...snapshot.remaining }),
      destinationsContacted: Object.freeze([...contacted].sort()),
      elapsedMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(deadline);
    // Zero and drop every cached byte range before the pass ends.
    session?.close();
    policy.cleanup();
  }
}
