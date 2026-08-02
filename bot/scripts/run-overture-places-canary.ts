import { existsSync, realpathSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULT_LEAD_POLICY_ROOT, type RuntimeLeadPolicy } from "../src/lead-engine/config/lead-policy.js";
import { isPathInside } from "../src/lead-engine/config/loader.js";
import { NetworkPolicyAuthorizer } from "../src/lead-engine/config/network-capability.js";
import { planCoverage } from "../src/lead-engine/geography/coverage-planner.js";
import type { CoverageCell, GeographyTarget } from "../src/lead-engine/geography/types.js";
import type { DiscoveryProviderRequest } from "../src/lead-engine/providers/contracts.js";
import { OverturePlacesLiveDiscoveryProvider } from "../src/lead-engine/providers/adapters/overture-places-live.js";
import {
  OVERTURE_CANARY_HARD_LIMITS,
  OvertureBudgetTracker,
} from "../src/lead-engine/providers/overture/budgets.js";
import { createEphemeralOvertureCanaryPolicy } from "../src/lead-engine/providers/overture/canary-policy.js";
import {
  OVERTURE_CATALOG_HOST,
  validateOvertureReleaseId,
} from "../src/lead-engine/providers/overture/asset-validator.js";
import { createOfficialOvertureCatalogTransport } from "../src/lead-engine/providers/overture/catalog-transport.js";
import { OverturePlacesError } from "../src/lead-engine/providers/overture/errors.js";
import { createOverturePlacesQueryPlan } from "../src/lead-engine/providers/overture/query.js";
import {
  createOfficialOvertureRangeHttpTransport,
  OVERTURE_RANGE_HEADER_OVERHEAD_BYTES,
} from "../src/lead-engine/providers/overture/range-http-transport.js";
import { OvertureReleaseResolver } from "../src/lead-engine/providers/overture/release-resolver.js";
import { createSecureOvertureAssetQueryEngine } from "../src/lead-engine/providers/overture/secure-asset-query-engine.js";
import { overturePlaceRecordSchema } from "../src/lead-engine/providers/overture/schema.js";
import { classifyOverturePoolCategory } from "../src/lead-engine/providers/overture/taxonomy.js";
import {
  OVERTURE_PLACES_PROVIDER_ID,
  OVERTURE_PLACES_SCHEMA_CONTRACT_VERSION,
  OVERTURE_POOL_TAXONOMY_MAPPING_VERSION,
} from "../src/lead-engine/providers/overture/types.js";

// Stop the bounded traversal once this many pool-service candidates are found.
// The hard ceiling stays OVERTURE_CANARY_HARD_LIMITS.maxCandidates.
const PHOENIX_CANARY_CANDIDATE_TARGET = 10;

/**
 * Candidate predicate for traversal stopping. Delegates to the same authoritative
 * classifier the adapter uses, so traversal never applies its own taxonomy rules.
 */
function isPoolServiceCandidate(row: Record<string, unknown>): boolean {
  const parsed = overturePlaceRecordSchema.safeParse(row);
  if (!parsed.success) return false;
  const decision = classifyOverturePoolCategory({
    basicCategory: parsed.data.basic_category,
    taxonomy: parsed.data.taxonomy,
  });
  return decision.disposition !== "excluded" && decision.disposition !== "missing";
}

const PHOENIX_CANARY_TARGET: GeographyTarget = Object.freeze({
  level: "grid_cell",
  label: "Phoenix canary cell",
  countryCode: "US",
  subdivisionCode: "AZ",
  bounds: Object.freeze({
    west: -112.094,
    south: 33.438,
    east: -112.044,
    north: 33.478,
  }),
  density: "dense",
});

export interface OvertureCanaryArguments {
  readonly confirmed: true;
  readonly market: "phoenix-canary";
  readonly maxResults: number;
  readonly maxBytes: number;
  readonly maxSeconds: number;
  readonly databasePath: string;
  readonly release: "latest" | string;
  // Opt-in: wire the secure remote GeoParquet engine and attempt live reads.
  // Absent by default so the checked-in canary stays blocked with no network.
  readonly enableSecureEngine: boolean;
}

export interface OvertureCanaryReport {
  readonly ran: boolean;
  readonly approvedDestinationsContacted: ReadonlyArray<string>;
  readonly releaseId: string;
  readonly schemaVersion: string;
  readonly taxonomyMappingVersion: string;
  readonly coverageCellSafeId: string;
  readonly requests: number;
  readonly bytes: number;
  readonly rowsConsidered: number;
  readonly acceptedCount: number;
  readonly rejectedCount: number;
  readonly duplicateCount: number;
  readonly reviewCount: number;
  readonly elapsedMs: number;
  readonly budgetRemaining: Readonly<Record<string, number>>;
  readonly aggregateVerdict: string;
  readonly safetyWarnings: ReadonlyArray<string>;
  // Aggregate bounded-traversal progress.
  readonly candidateTarget: number;
  readonly rowGroupsSelected: number;
  readonly rowGroupsRead: number;
  readonly duplicateRowsSkipped: number;
  readonly traversalStopReason: string | null;
}

function positiveInteger(name: string, value: string | undefined): number {
  const parsed = value && /^\d+$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

export function parseOvertureCanaryArguments(
  argv: ReadonlyArray<string>,
  repositoryRoot: string,
): OvertureCanaryArguments {
  const values = new Map<string, string | true>();
  const valueFlags = new Set([
    "--market",
    "--max-results",
    "--max-bytes",
    "--max-seconds",
    "--database",
    "--release",
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index] as string;
    if (flag === "--confirm-live-overture" || flag === "--enable-secure-engine") {
      if (values.has(flag)) throw new Error(`Overture canary flag was repeated: ${flag}`);
      values.set(flag, true);
      continue;
    }
    if (!valueFlags.has(flag)) throw new Error(`Unknown Overture canary argument: ${flag}`);
    if (values.has(flag)) throw new Error(`Overture canary argument was repeated: ${flag}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Overture canary argument requires a value: ${flag}`);
    values.set(flag, value);
    index += 1;
  }
  if (values.get("--confirm-live-overture") !== true) {
    throw new Error("Live Overture canary requires --confirm-live-overture");
  }
  if (values.get("--market") !== "phoenix-canary") {
    throw new Error("Live Overture canary is restricted to --market phoenix-canary");
  }
  const maxResults = positiveInteger("Maximum results", values.get("--max-results") as string | undefined);
  const maxBytes = positiveInteger("Maximum bytes", values.get("--max-bytes") as string | undefined);
  const maxSeconds = positiveInteger("Maximum seconds", values.get("--max-seconds") as string | undefined);
  if (maxResults > OVERTURE_CANARY_HARD_LIMITS.maxCandidates ||
    maxBytes > OVERTURE_CANARY_HARD_LIMITS.maxDownloadedBytes ||
    maxSeconds * 1_000 > OVERTURE_CANARY_HARD_LIMITS.maxRuntimeMs) {
    throw new Error("Requested Overture canary budgets exceed hard canary maxima");
  }
  const databaseValue = values.get("--database");
  if (typeof databaseValue !== "string" || !path.isAbsolute(databaseValue)) {
    throw new Error("Overture canary database must be an explicit absolute path");
  }
  const databasePath = path.resolve(databaseValue);
  let databaseParent: string;
  try {
    databaseParent = realpathSync(path.dirname(databasePath));
  } catch {
    throw new Error("Overture canary database parent must already exist under the OS temp directory");
  }
  if (isPathInside(path.resolve(repositoryRoot), databasePath) ||
    !isPathInside(realpathSync(os.tmpdir()), databaseParent) ||
    path.extname(databasePath) !== ".sqlite") {
    throw new Error("Overture canary database must be a .sqlite file under the OS temp directory and outside the repository");
  }
  if (existsSync(databasePath)) {
    throw new Error("Overture canary database path must not already exist");
  }
  const releaseValue = values.get("--release");
  if (typeof releaseValue !== "string") throw new Error("Overture canary requires --release latest or a pinned release");
  const release = releaseValue === "latest" ? "latest" : validateOvertureReleaseId(releaseValue);
  return {
    confirmed: true,
    market: "phoenix-canary",
    maxResults,
    maxBytes,
    maxSeconds,
    databasePath,
    release,
    enableSecureEngine: values.get("--enable-secure-engine") === true,
  };
}

export async function runOverturePlacesCanary(input: {
  argv: ReadonlyArray<string>;
  repositoryRoot: string;
  now?: () => number;
}): Promise<OvertureCanaryReport> {
  const startedAt = (input.now ?? Date.now)();
  const args = parseOvertureCanaryArguments(input.argv, input.repositoryRoot);
  const policy = createEphemeralOvertureCanaryPolicy({
    checkedInConfigurationRoot: DEFAULT_LEAD_POLICY_ROOT,
    maxRequests: OVERTURE_CANARY_HARD_LIMITS.maxStacRequests +
      OVERTURE_CANARY_HARD_LIMITS.maxAssetRequests,
    maxBytes: args.maxBytes,
    maxDurationMs: args.maxSeconds * 1_000,
  });
  let databaseWasCreated = false;
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
    if (coverage.cells.length !== 1) throw new Error("Phoenix canary must resolve to exactly one coverage cell");
    const cell = coverage.cells[0] as (typeof coverage.cells)[number];
    const budget = new OvertureBudgetTracker({
      limits: {
        ...OVERTURE_CANARY_HARD_LIMITS,
        maxDownloadedBytes: args.maxBytes,
        maxCandidates: args.maxResults,
        maxRuntimeMs: args.maxSeconds * 1_000,
      },
      startedAtMs: startedAt,
      now: input.now,
    });
    if (args.enableSecureEngine) {
      return await runSecureOverturePlacesCanary({
        args,
        policy: policy.policy,
        cell,
        budget,
        now: input.now ?? Date.now,
      });
    }
    const snapshot = budget.snapshot();
    return {
      ran: false,
      approvedDestinationsContacted: [],
      releaseId: args.release === "latest" ? "not_resolved" : args.release,
      schemaVersion: OVERTURE_PLACES_SCHEMA_CONTRACT_VERSION,
      taxonomyMappingVersion: OVERTURE_POOL_TAXONOMY_MAPPING_VERSION,
      coverageCellSafeId: cell.coverageKey,
      requests: 0,
      bytes: 0,
      rowsConsidered: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      duplicateCount: 0,
      reviewCount: 0,
      elapsedMs: snapshot.elapsedMs,
      budgetRemaining: snapshot.remaining,
      aggregateVerdict: "blocked_secure_transport_unavailable",
      safetyWarnings: ["secure_remote_geoparquet_transport_unavailable"],
      candidateTarget: PHOENIX_CANARY_CANDIDATE_TARGET,
      rowGroupsSelected: 0,
      rowGroupsRead: 0,
      duplicateRowsSkipped: 0,
      traversalStopReason: null,
    };
  } finally {
    policy.cleanup();
    if (databaseWasCreated && existsSync(args.databasePath)) {
      rmSync(args.databasePath, { force: true });
    }
  }
}

function verdictForCode(code: string): string {
  const environment = ["cancelled", "catalog_transport_failed"];
  const dataLayout = [
    "catalog_invalid",
    "catalog_oversized",
    "release_missing",
    "release_ambiguous",
    "release_changed",
    "schema_unsupported",
    "schema_invalid",
    "asset_invalid",
    "overture_data_layout_unsupported",
    "parquet_metadata_invalid",
    "parquet_magic_invalid",
    "asset_identity_unavailable",
    "asset_identity_changed",
    "result_invalid",
    "query_invalid",
    "partition_unresolved",
  ];
  if (environment.includes(code)) return "blocked_environment";
  if (dataLayout.includes(code)) return "blocked_overture_data_layout";
  if (code === "budget_exhausted") return "blocked_budget_exhausted";
  return "blocked_canary_error";
}

/**
 * Opt-in live path. Wires the secure remote GeoParquet engine behind an explicit
 * flag and contacts only official Overture destinations. Emits aggregate counts
 * only — never a business name, phone, email, website, address, or raw row. No
 * database, cache, or export is written; the in-memory range cache is cleared by
 * the engine. If the official layout cannot support bounded reads, the adapter
 * fails closed and the verdict is blocked_overture_data_layout.
 */
async function runSecureOverturePlacesCanary(input: {
  args: OvertureCanaryArguments;
  policy: RuntimeLeadPolicy;
  cell: CoverageCell;
  budget: OvertureBudgetTracker;
  now: () => number;
}): Promise<OvertureCanaryReport> {
  const { args, policy, cell, budget, now } = input;
  const runId = "overture-phoenix-canary";
  const assessmentId = "overture-phoenix-canary-scope";
  const nowIso = (): string => new Date(now()).toISOString();
  const durationMs = args.maxSeconds * 1_000;
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), durationMs);
  const contacted = new Set<string>();

  const baseReport = (snapshot = budget.snapshot()) => ({
    approvedDestinationsContacted: [...contacted].sort(),
    schemaVersion: OVERTURE_PLACES_SCHEMA_CONTRACT_VERSION,
    taxonomyMappingVersion: OVERTURE_POOL_TAXONOMY_MAPPING_VERSION,
    coverageCellSafeId: cell.coverageKey,
    requests: snapshot.consumed.stacRequests + snapshot.consumed.assetRequests,
    bytes: snapshot.consumed.downloadedBytes,
    rowsConsidered: snapshot.consumed.rowsRead,
    elapsedMs: snapshot.elapsedMs,
    budgetRemaining: snapshot.remaining,
    candidateTarget: PHOENIX_CANARY_CANDIDATE_TARGET,
    rowGroupsSelected: 0,
    rowGroupsRead: 0,
    duplicateRowsSkipped: 0,
    traversalStopReason: null as string | null,
  });

  try {
    const authorizer = new NetworkPolicyAuthorizer(policy, { now });
    const capability = authorizer.issuePublicWebCapability({
      providerId: OVERTURE_PLACES_PROVIDER_ID,
      runId,
      assessmentId,
      operation: "discovery",
      maxRequests: OVERTURE_CANARY_HARD_LIMITS.maxStacRequests + OVERTURE_CANARY_HARD_LIMITS.maxAssetRequests,
      maxBytes: args.maxBytes,
      maxBytesPerRequest: args.maxBytes,
      maxRequestDurationMs: durationMs,
      costBudgetMicroUsd: 0,
      ttlMs: durationMs,
    });

    const catalogTransport = createOfficialOvertureCatalogTransport({
      capability,
      providerId: OVERTURE_PLACES_PROVIDER_ID,
      runId,
      assessmentId,
      maximumBytes: 512 * 1024,
      maximumDurationMs: Math.min(durationMs, 30_000),
      now: nowIso,
    });
    const resolver = new OvertureReleaseResolver({
      transport: catalogTransport,
      budget,
      clock: { now: nowIso },
    });
    contacted.add(OVERTURE_CATALOG_HOST);
    const release = await resolver.resolve({
      requestedRelease: args.release,
      bounds: cell.bounds,
      signal: controller.signal,
    });

    const plan = createOverturePlacesQueryPlan({
      releaseId: release.releaseId,
      coverageCell: cell,
      maxRows: OVERTURE_CANARY_HARD_LIMITS.maxRowsRead,
      maxAreaSquareKm: OVERTURE_CANARY_HARD_LIMITS.maxAreaSquareKm,
    });
    const rangeTransport = createOfficialOvertureRangeHttpTransport({
      capability,
      runId,
      assessmentId,
      maximumBodyBytesPerRequest: Math.max(
        1,
        Math.min(args.maxBytes - OVERTURE_RANGE_HEADER_OVERHEAD_BYTES - 1, 8 * 1024 * 1024),
      ),
      maximumDurationMs: Math.min(durationMs, 60_000),
    });
    const engine = createSecureOvertureAssetQueryEngine({
      policy,
      capability,
      runId,
      assessmentId,
      transport: rangeTransport,
      audit: { record: (event) => contacted.add(event.destinationHost) },
      now: nowIso,
      candidateTarget: PHOENIX_CANARY_CANDIDATE_TARGET,
      isCandidate: isPoolServiceCandidate,
    });
    const provider = new OverturePlacesLiveDiscoveryProvider({
      policy,
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
      correlationId: `${runId}:overture-phoenix-canary-query`,
      queryId: "overture-phoenix-canary-query",
      queryText: "overture pool service phoenix canary",
      nicheId: "pool_service",
      coverageKey: cell.coverageKey,
      observedAt: nowIso(),
      retrievedAt: nowIso(),
    };
    const batch = await provider.discover(request);
    const audit = provider.audit();
    const snapshot = budget.snapshot();
    const failureCode = audit?.failureCode ?? null;
    const failed = batch.status === "failed";
    return {
      ran: !failed,
      ...baseReport(snapshot),
      releaseId: release.releaseId,
      schemaVersion: release.schemaVersion,
      acceptedCount: audit?.acceptedCount ?? 0,
      rejectedCount: audit?.rejectedCount ?? 0,
      duplicateCount: audit?.duplicateCount ?? 0,
      reviewCount: audit?.reviewCount ?? 0,
      aggregateVerdict: failed ? verdictForCode(failureCode ?? "canary_error") : "completed",
      safetyWarnings: failureCode ? [failureCode] : [],
      rowGroupsSelected: audit?.rowGroupsSelected ?? 0,
      rowGroupsRead: audit?.rowGroupsRead ?? 0,
      duplicateRowsSkipped: audit?.duplicateRowsSkipped ?? 0,
      traversalStopReason: audit?.traversalStopReason ?? null,
    };
  } catch (error) {
    const code = error instanceof OverturePlacesError ? error.code : "canary_error";
    const verdict = error instanceof OverturePlacesError &&
      ["unavailable", "timeout", "rate_limited"].includes(error.category)
      ? "blocked_environment"
      : verdictForCode(code);
    return {
      ran: false,
      ...baseReport(),
      releaseId: args.release === "latest" ? "not_resolved" : args.release,
      acceptedCount: 0,
      rejectedCount: 0,
      duplicateCount: 0,
      reviewCount: 0,
      aggregateVerdict: verdict,
      safetyWarnings: [code],
    };
  } finally {
    clearTimeout(deadline);
  }
}

async function main(): Promise<void> {
  const repositoryRoot = path.resolve(process.cwd(), "..");
  const report = await runOverturePlacesCanary({
    argv: process.argv.slice(2),
    repositoryRoot,
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
