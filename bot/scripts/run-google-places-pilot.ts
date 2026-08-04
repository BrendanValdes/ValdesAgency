import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { POOL_SERVICE_MARKETS } from "../src/lead-engine/assessment/market-windows.js";
import { DEFAULT_LEAD_POLICY_ROOT } from "../src/lead-engine/config/lead-policy.js";
import { planCoverage } from "../src/lead-engine/geography/coverage-planner.js";
import { googlePlaceCandidates } from "../src/lead-engine/providers/google/candidates.js";
import { createEphemeralGooglePlacesPolicy } from "../src/lead-engine/providers/google/policy.js";
import {
  createGooglePlacesSession,
  type GooglePlacesUsage,
} from "../src/lead-engine/providers/google/text-search.js";
import {
  GOOGLE_PLACES_ADAPTER_VERSION,
  GOOGLE_PLACES_MAX_PAGE_SIZE,
  type GoogleTextSearchPage,
} from "../src/lead-engine/providers/google/types.js";
import {
  assessQualifyAndExport,
  resolveBatchPaths,
  type PoolLeadBatchPaths,
} from "./run-pool-lead-batch.js";
import type { CoverageCell, CoverageManifest } from "../src/lead-engine/geography/types.js";

/**
 * Google Places Text Search discovery pilot — one request, one market.
 *
 * THE QUESTION THIS ANSWERS. Overture discovery yields roughly 0.08 eligible
 * candidates per 20 km² window, so a usable book of leads costs on the order of
 * 1,250 windows. If a single Text Search request over one metro rectangle can
 * feed the same pipeline and produce callable qualified leads, discovery stops
 * being the expensive stage. This run is the measurement, not a migration.
 *
 * WHAT IS SHARED. Everything after discovery. The candidates produced here enter
 * `assessQualifyAndExport` — the identical assessment, identity, qualification,
 * ranking, and export path the Overture batch runs. There is no second scoring
 * model, gate, queue, or exporter, and nothing here relaxes an existing rule.
 *
 * WHAT DIFFERS FROM THE OVERTURE BATCH, AND WHAT IT COSTS.
 * Google is asked for exactly three fields: place id, website, display name. So
 * a Google-sourced lead carries no provider address, phone, or category, and:
 *
 *   - `legitimacy.location_observed` (2 pts) cannot be awarded;
 *   - `niche.relevant_category` (5 pts) loses its provider-category basis;
 *   - identity must attach on name, host, and structured-name agreement alone.
 *
 * Against a 65-point qualified threshold that is a real handicap, and the
 * scoring model is deliberately NOT adjusted to compensate. Read the verdict as
 * qualified plus qualified-with-review, and treat the yield as a floor for what
 * this source can do rather than a like-for-like comparison with Overture.
 *
 * SCOPE LINEAGE. The queue's scope check matches a coverage key or a persisted
 * business location. With no provider address there is no location row, so the
 * coverage key is the only route into scope. It records the rectangle the search
 * was actually restricted to — where we looked, never a business claim — and no
 * qualification rule reads it.
 *
 * Read-only discovery and bounded public HTTPS GETs only. No form, message,
 * call, booking, CRM write, import, third-party export, notification,
 * publication, paid integration, or account change exists in this path. The API
 * key is read from the environment, never logged, never persisted, and never
 * included in a report or an error message.
 */

export const GOOGLE_PLACES_PILOT_QUERY_VERSION = "google-places-pilot-1.0.0" as const;

/** The one query. Fixed and versioned so a repeated run searches the same space. */
export const GOOGLE_PLACES_PILOT_QUERY = "pool cleaning service in Phoenix Arizona" as const;

export const GOOGLE_PLACES_PILOT_MARKET_ID = "phoenix_az" as const;

/**
 * Explicit budgets. Every number is a ceiling.
 *
 * Discovery is one request by design — the pilot's whole claim is that one is
 * enough — so there is no pagination and no Place Details call to budget for. The
 * assessment ceilings mirror the Overture batch: the binding rail is the
 * ephemeral website policy's request cap, and at the measured ~2.6 requests per
 * site plus robots, 16 sites per chunk needs ~50 of the 64 allowed.
 */
export const GOOGLE_PLACES_PILOT_BUDGETS = Object.freeze({
  /** Text Search requests for the whole run. One. */
  maxDiscoveryRequests: 1,
  maxDiscoveryBytes: 1024 * 1024,
  maxDiscoveryRequestDurationMs: 15_000,
  /** 6000 ms honours the 10-requests-per-minute limit even at one request. */
  minimumIntervalMs: 6_000,
  discoveryCapabilityTtlSeconds: 120,
  maxRetriesPerDiscoveryRequest: 1,
  /** Assessment stage, same shape the Overture batch uses. */
  assessmentChunkSize: 16,
  maxPagesPerBusiness: 2,
  maxRequestsPerBusiness: 4,
  maxRequestsPerAssessmentChunk: 64,
  maxBytesPerAssessmentChunk: 32 * 1024 * 1024,
  maxProcessedBytesPerAssessmentChunk: 64 * 1024 * 1024,
  maxAssessmentChunkDurationMs: 110_000,
  maxRetriesPerBusiness: 1,
  /** Whole-run crawl rails. 20 places cannot need more than this. */
  maxCrawlRequests: 160,
  maxCrawlBytes: 16 * 1024 * 1024,
  maxRuntimeMs: 900_000,
});

export interface GooglePlacesPilotArguments {
  readonly dataRoot: string;
  readonly enableLivePilot: boolean;
}

export function parseGooglePlacesPilotArguments(
  argv: ReadonlyArray<string>,
): GooglePlacesPilotArguments {
  let dataRoot: string | null = null;
  let enableLivePilot = false;
  let confirmed = false;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index] as string;
    if (flag === "--confirm-live-pilot") { confirmed = true; continue; }
    if (flag === "--enable-live-pilot") { enableLivePilot = true; continue; }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Pilot argument ${flag} requires a value`);
    index += 1;
    if (flag === "--data-root") { dataRoot = value; continue; }
    throw new Error(`Unknown pilot argument: ${flag}`);
  }
  if (!confirmed) throw new Error("Live Google Places pilot requires --confirm-live-pilot");
  if (dataRoot === null) throw new Error("Google Places pilot requires --data-root");
  return Object.freeze({ dataRoot, enableLivePilot });
}

/**
 * The single coverage cell this pilot searches: the configured Phoenix market
 * rectangle, planned at metro level with no subdivision.
 *
 * The same bounds become the request's `locationRestriction.rectangle`, so the
 * cell describes exactly the area the provider was asked about. `maxDepth: 0`
 * keeps it one cell — the Overture row-group rails that force 20 km² windows do
 * not apply to a text search.
 */
export function planPilotCoverage(): CoverageManifest {
  const market = POOL_SERVICE_MARKETS.find((entry) => entry.id === GOOGLE_PLACES_PILOT_MARKET_ID);
  if (!market) throw new Error("Google Places pilot requires the configured Phoenix market");
  return planCoverage({
    nicheId: "pool_service",
    configurationVersion: "1.0.0",
    queryVersion: GOOGLE_PLACES_PILOT_QUERY_VERSION,
    strategy: "dense",
    targets: [{
      level: "metro",
      label: market.label,
      countryCode: market.countryCode,
      subdivisionCode: market.subdivisionCode,
      bounds: market.bounds,
      density: "dense",
    }],
    resultCap: GOOGLE_PLACES_MAX_PAGE_SIZE,
    maxDepth: 0,
  });
}

export interface GooglePlacesPilotReport {
  readonly ran: boolean;
  readonly adapterVersion: string;
  readonly query: string;
  readonly market: string;
  readonly coverageKey: string | null;
  readonly discovery: Readonly<Record<string, unknown>>;
  readonly assessment: Readonly<Record<string, unknown>>;
  readonly evidence: Readonly<Record<string, number>>;
  readonly qualification: Readonly<Record<string, number>>;
  readonly queue: Readonly<Record<string, unknown>>;
  readonly usage: Readonly<Record<string, number>>;
  readonly budgets: Readonly<Record<string, number>>;
  readonly artifacts: Readonly<Record<string, string>>;
  readonly aggregateVerdict: string;
  readonly safetyWarnings: ReadonlyArray<string>;
}

/**
 * One bounded Text Search request.
 *
 * The ephemeral policy is torn down in `finally` whether the request succeeded,
 * failed, or was refused, so the activated `search` provider never outlives the
 * call. Usage is read from the session afterwards so a failed request still
 * reports the bytes and attempts it actually cost.
 */
async function discoverOnce(input: {
  readonly apiKey: string;
  readonly cell: CoverageCell;
}): Promise<{ page: GoogleTextSearchPage; usage: GooglePlacesUsage }> {
  const policy = createEphemeralGooglePlacesPolicy({
    checkedInConfigurationRoot: DEFAULT_LEAD_POLICY_ROOT,
    maxRequests: GOOGLE_PLACES_PILOT_BUDGETS.maxDiscoveryRequests,
    maxBytes: GOOGLE_PLACES_PILOT_BUDGETS.maxDiscoveryBytes,
    maxRequestDurationMs: GOOGLE_PLACES_PILOT_BUDGETS.maxDiscoveryRequestDurationMs,
    capabilityTtlSeconds: GOOGLE_PLACES_PILOT_BUDGETS.discoveryCapabilityTtlSeconds,
  });
  try {
    const session = createGooglePlacesSession({
      policy: policy.policy,
      apiKey: input.apiKey,
      runId: "google-places-pilot",
      scopeId: "google-places-pilot-phoenix",
      maxRequests: GOOGLE_PLACES_PILOT_BUDGETS.maxDiscoveryRequests,
      minimumIntervalMs: GOOGLE_PLACES_PILOT_BUDGETS.minimumIntervalMs,
      maxBytesPerRequest: GOOGLE_PLACES_PILOT_BUDGETS.maxDiscoveryBytes,
      maxRequestDurationMs: GOOGLE_PLACES_PILOT_BUDGETS.maxDiscoveryRequestDurationMs,
      capabilityTtlMs: GOOGLE_PLACES_PILOT_BUDGETS.discoveryCapabilityTtlSeconds * 1_000,
      requestsPerLease: GOOGLE_PLACES_PILOT_BUDGETS.maxDiscoveryRequests,
      maxRetriesPerRequest: GOOGLE_PLACES_PILOT_BUDGETS.maxRetriesPerDiscoveryRequest,
    });
    try {
      // One request. `nextPageToken` is deliberately ignored: no pagination, and
      // no Place Details call exists anywhere in this path.
      const page = await session.searchText({
        textQuery: GOOGLE_PLACES_PILOT_QUERY,
        rectangle: input.cell.bounds,
      });
      return { page, usage: session.usage() };
    } catch (error) {
      // Re-thrown with the session's own usage attached to the caller's report
      // rather than swallowed, so a failed run still accounts for its cost.
      throw Object.assign(error instanceof Error ? error : new Error("unknown_discovery_error"), {
        googleUsage: session.usage(),
      });
    }
  } finally {
    policy.cleanup();
  }
}

export async function runGooglePlacesPilot(input: {
  argv: ReadonlyArray<string>;
  repositoryRoot: string;
}): Promise<GooglePlacesPilotReport> {
  const args = parseGooglePlacesPilotArguments(input.argv);
  const paths: PoolLeadBatchPaths = resolveBatchPaths(args.dataRoot, input.repositoryRoot);
  const startedAt = Date.now();
  const now = (): Date => new Date();
  const coverage = planPilotCoverage();
  const cell = coverage.cells[0];
  if (!cell || coverage.cells.length !== 1) {
    throw new Error("Google Places pilot requires exactly one planned coverage cell");
  }

  const empty = {
    ran: false,
    adapterVersion: GOOGLE_PLACES_ADAPTER_VERSION,
    query: GOOGLE_PLACES_PILOT_QUERY,
    market: GOOGLE_PLACES_PILOT_MARKET_ID,
    coverageKey: cell.coverageKey,
    discovery: {}, assessment: {}, evidence: {}, qualification: {}, queue: {},
    usage: {}, budgets: { ...GOOGLE_PLACES_PILOT_BUDGETS }, artifacts: {},
    aggregateVerdict: "blocked_live_pilot_disabled",
    safetyWarnings: ["live_pilot_disabled_by_default"],
  } satisfies GooglePlacesPilotReport;
  if (!args.enableLivePilot) return empty;

  // Fail closed on a missing key, and never echo the value or its length.
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim() ?? "";
  if (!apiKey) {
    return {
      ...empty,
      aggregateVerdict: "blocked_missing_api_key",
      safetyWarnings: ["google_places_api_key_absent_from_environment"],
    };
  }

  mkdirSync(paths.dataRoot, { recursive: true, mode: 0o700 });
  chmodSync(paths.dataRoot, 0o700);

  // Stage 1 — one bounded, read-only discovery request.
  let page: GoogleTextSearchPage;
  let googleUsage: GooglePlacesUsage;
  try {
    const outcome = await discoverOnce({ apiKey, cell });
    page = outcome.page;
    googleUsage = outcome.usage;
  } catch (error) {
    const attached = (error as { googleUsage?: GooglePlacesUsage }).googleUsage;
    return {
      ...empty,
      ran: false,
      aggregateVerdict: "blocked_discovery_failed",
      // The session's error codes are safe to surface: they never carry the URL,
      // the headers, or the key.
      safetyWarnings: [error instanceof Error ? `${error.name}: ${error.message}` : "unknown_discovery_error"],
      discovery: attached ? { requests: attached.requests, retries: attached.retries, failures: attached.failures } : {},
      usage: { elapsedMs: Date.now() - startedAt },
      artifacts: { dataRoot: paths.dataRoot },
    };
  }

  const mapped = googlePlaceCandidates({ places: page.places, cell });

  try {
    // Stages 2 through 4 — the shared live path, unchanged.
    const stages = await assessQualifyAndExport({
      candidates: mapped.eligible,
      coverage,
      // The one cell that scopes both the geography hard rule and the queue.
      coverageKeys: [cell.coverageKey],
      marketByKey: new Map(mapped.eligible.map((candidate) =>
        [candidate.candidateKey, GOOGLE_PLACES_PILOT_MARKET_ID])),
      paths,
      repositoryRoot: input.repositoryRoot,
      runId: "google-places-pilot",
      limits: GOOGLE_PLACES_PILOT_BUDGETS,
      deadlineAt: startedAt + GOOGLE_PLACES_PILOT_BUDGETS.maxRuntimeMs,
      now,
    });
    const report: GooglePlacesPilotReport = {
      ran: true,
      adapterVersion: GOOGLE_PLACES_ADAPTER_VERSION,
      query: GOOGLE_PLACES_PILOT_QUERY,
      market: GOOGLE_PLACES_PILOT_MARKET_ID,
      coverageKey: cell.coverageKey,
      discovery: {
        placesReturned: mapped.consideredCount,
        eligibleCandidates: mapped.eligible.length,
        blockedCounts: mapped.blockedCounts,
        // Recorded so the "no pagination" decision is visible rather than
        // implied. The token itself is never printed or stored.
        furtherPagesAvailable: page.nextPageToken !== null,
        paginationRequested: false,
        placeDetailsRequests: 0,
        requests: googleUsage.requests,
        retries: googleUsage.retries,
        failures: googleUsage.failures,
      },
      assessment: stages.assessment,
      evidence: stages.evidence,
      qualification: stages.qualification,
      queue: stages.queue,
      usage: {
        discoveryRequests: googleUsage.requests,
        discoveryBytes: googleUsage.downloadedBytes,
        crawlRequests: stages.crawl.requests,
        crawlBytes: stages.crawl.downloadedBytes,
        crawlProcessedBytes: stages.crawl.processedBytes,
        totalRequests: googleUsage.requests + stages.crawl.requests,
        elapsedMs: Date.now() - startedAt,
      },
      budgets: { ...GOOGLE_PLACES_PILOT_BUDGETS },
      artifacts: {
        dataRoot: paths.dataRoot,
        databasePath: paths.databasePath,
        csvPath: paths.csvPath,
        summaryPath: paths.summaryPath,
      },
      // A pilot that produces no callable lead completed honestly; it just did
      // not clear the bar. The verdict says which, and never rounds up.
      aggregateVerdict: stages.queue.callableQueueSize > 0
        ? "completed_with_callable_leads" : "completed_without_callable_leads",
      safetyWarnings: [],
    };
    writeFileSync(paths.summaryPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    chmodSync(paths.summaryPath, 0o600);
    return report;
  } catch (error) {
    return {
      ...empty,
      ran: false,
      aggregateVerdict: "blocked_pilot_policy",
      safetyWarnings: [error instanceof Error ? `${error.name}: ${error.message}` : "unknown_pilot_error"],
      discovery: {
        placesReturned: mapped.consideredCount,
        eligibleCandidates: mapped.eligible.length,
        blockedCounts: mapped.blockedCounts,
        requests: googleUsage.requests,
      },
      usage: { elapsedMs: Date.now() - startedAt },
      artifacts: { dataRoot: paths.dataRoot, databasePath: paths.databasePath },
    };
  }
}

async function main(): Promise<void> {
  const report = await runGooglePlacesPilot({
    argv: process.argv.slice(2),
    repositoryRoot: path.resolve(process.cwd(), ".."),
  });
  // Aggregate-only: counts, budgets, and artifact paths. No lead value, and no
  // credential, is ever printed.
  console.log(JSON.stringify(report));
  if (!report.ran) process.exitCode = 2;
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (entry === import.meta.url) {
  void main().catch((error: unknown) => {
    console.error(JSON.stringify({
      aggregateVerdict: "pilot_rejected",
      safetyWarnings: [error instanceof Error ? error.message : "unknown_pilot_error"],
    }));
    process.exitCode = 1;
  });
}
