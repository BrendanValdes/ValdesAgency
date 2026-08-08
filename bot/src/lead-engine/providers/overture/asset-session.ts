import { overtureFailure } from "./errors.js";
import type { CapabilityRangeSource } from "./capability-range-source.js";
import type { OvertureParquetFooter } from "./parquet-metadata.js";
import type { OvertureBudgetTracker } from "./budgets.js";

export const OVERTURE_ASSET_SESSION_VERSION = "overture-asset-session-1.0.0" as const;

/**
 * A range source and its already-parsed Parquet footer, shared across the
 * coverage cells of one bounded discovery pass.
 *
 * Every coverage cell of a metro-scale traversal reads the same pinned asset. On
 * the unshared path each cell re-opened that asset from scratch: one request to
 * revalidate the Parquet magic and asset identity, more to re-read the footer,
 * then a fresh byte-range cache that re-downloaded the same row-group column
 * spans a previous cell had already fetched. That is pure duplicate IO — the
 * bytes are immutable, because the release is pinned and every read revalidates
 * the strong ETag or object version.
 *
 * Sharing changes nothing about what is read or admitted: same cells, same
 * spatial pruning, same projection, same candidate predicate, same budgets. It
 * only stops paying for identical bytes repeatedly.
 */
export interface OvertureAssetHandle {
  readonly source: CapabilityRangeSource;
  readonly footer: OvertureParquetFooter;
}

export interface OvertureAssetSessionMetrics {
  /** Distinct assets opened over the session's lifetime. */
  readonly assetsOpened: number;
  /** Times an already-open asset handle was reused instead of reopened. */
  readonly handleReuses: number;
  /** Current bounded byte-cache occupancy across the open handles. */
  readonly cacheEntries: number;
  readonly cacheBytes: number;
}

export interface OvertureAssetSession {
  readonly kind: typeof OVERTURE_ASSET_SESSION_VERSION;
  /**
   * Return the handle for `key`, creating it via `create` on first use.
   *
   * The session is a pure memoizer: it never constructs a source itself, so it
   * cannot skip a policy, capability, release-pin, or asset-identity check. It
   * only stores what the engine already built under those checks.
   */
  acquire(
    key: string,
    guard: OvertureAssetSessionGuard,
    create: () => Promise<OvertureAssetHandle>,
  ): Promise<OvertureAssetHandle>;
  metrics(): OvertureAssetSessionMetrics;
  /** Zero and drop every cached byte range. Called at the end of a pass. */
  close(): void;
}

/**
 * The budget and cancellation scope a cached handle was created under.
 *
 * A cached source captured its budget tracker and abort signal at creation, so
 * reusing it under a different budget would charge the wrong tracker and ignore a
 * newer cancellation. The session therefore refuses to serve a handle across a
 * scope change rather than silently mis-accounting.
 */
export interface OvertureAssetSessionGuard {
  readonly budget: OvertureBudgetTracker;
  readonly signal: AbortSignal;
}

export function createOvertureAssetSession(guard: OvertureAssetSessionGuard): OvertureAssetSession {
  const handles = new Map<string, OvertureAssetHandle>();
  let assetsOpened = 0;
  let handleReuses = 0;
  let closed = false;

  return {
    kind: OVERTURE_ASSET_SESSION_VERSION,
    async acquire(key, requested, create) {
      if (closed) {
        throw overtureFailure("asset_session_closed", "Overture asset session was already closed", {
          category: "policy_blocked",
        });
      }
      if (requested.budget !== guard.budget || requested.signal !== guard.signal) {
        throw overtureFailure(
          "asset_session_scope_mismatch",
          "Overture asset session cannot be reused across a different budget or cancellation scope",
          { category: "policy_blocked" },
        );
      }
      const existing = handles.get(key);
      if (existing) {
        handleReuses += 1;
        return existing;
      }
      const handle = await create();
      handles.set(key, handle);
      assetsOpened += 1;
      return handle;
    },
    metrics() {
      let cacheEntries = 0;
      let cacheBytes = 0;
      for (const handle of handles.values()) {
        const snapshot = handle.source.cacheSnapshot();
        cacheEntries += snapshot.entries;
        cacheBytes += snapshot.bytes;
      }
      return Object.freeze({ assetsOpened, handleReuses, cacheEntries, cacheBytes });
    },
    close() {
      closed = true;
      for (const handle of handles.values()) handle.source.clearCache();
      handles.clear();
    },
  };
}
