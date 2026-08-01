import { existsSync, realpathSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULT_LEAD_POLICY_ROOT } from "../src/lead-engine/config/lead-policy.js";
import { isPathInside } from "../src/lead-engine/config/loader.js";
import { planCoverage } from "../src/lead-engine/geography/coverage-planner.js";
import type { GeographyTarget } from "../src/lead-engine/geography/types.js";
import { createUnavailableOvertureAssetQueryEngine } from "../src/lead-engine/providers/overture/asset-query-engine.js";
import {
  OVERTURE_CANARY_HARD_LIMITS,
  OvertureBudgetTracker,
} from "../src/lead-engine/providers/overture/budgets.js";
import { createEphemeralOvertureCanaryPolicy } from "../src/lead-engine/providers/overture/canary-policy.js";
import { validateOvertureReleaseId } from "../src/lead-engine/providers/overture/asset-validator.js";
import {
  OVERTURE_PLACES_SCHEMA_CONTRACT_VERSION,
  OVERTURE_POOL_TAXONOMY_MAPPING_VERSION,
} from "../src/lead-engine/providers/overture/types.js";

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
    if (flag === "--confirm-live-overture") {
      if (values.has(flag)) throw new Error("Live Overture confirmation flag was repeated");
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
    const queryEngine = createUnavailableOvertureAssetQueryEngine();
    if (!queryEngine.available) {
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
      };
    }
    throw new Error("A secure remote GeoParquet engine exists but the controlled canary execution path is not implemented");
  } finally {
    policy.cleanup();
    if (databaseWasCreated && existsSync(args.databasePath)) {
      rmSync(args.databasePath, { force: true });
    }
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
