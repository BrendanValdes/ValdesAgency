import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
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
  GOOGLE_FOUNDATION_WATERPROOFING_QUERIES,
  GOOGLE_POOL_SERVICE_QUERIES,
  GOOGLE_PLACES_MAX_PAGE_SIZE,
  type GoogleTextSearchPage,
} from "../src/lead-engine/providers/google/types.js";
import {
  assessQualifyAndExport,
  csvCell,
  EXPORT_CSV_HEADER,
  exportCsvRow,
  resolveBatchPaths,
  type AssessmentStageResult,
  type ExportRow,
} from "./run-pool-lead-batch.js";
import type { EligibleCandidate } from "../src/lead-engine/assessment/candidate-gate.js";
import type { BoundingArea, CoverageCell, CoverageManifest } from "../src/lead-engine/geography/types.js";
import type { SupportedQualificationNiche } from "../src/lead-engine/qualification/types.js";

/**
 * Multi-market Google Places lead runner.
 *
 * WHAT THIS ADDS TO THE PILOT. The pilot answered "can one Text Search request
 * feed the pipeline?" — it can: 1 request, 20 places, 20 eligible, 6 callable in
 * Phoenix. It is hardwired to one query, one configured market, one request, so
 * it cannot fill a book of leads. This runner keeps that discovery mechanism
 * exactly and adds three things and nothing else:
 *
 *   1. markets supplied by the operator (inline or one JSON file) instead of a
 *      compiled-in list, so any city in any state works;
 *   2. the five checked-in queries per city instead of one;
 *   3. a per-state callable target, with cities searched in order until the
 *      target is met, the Google request cap is hit, or the cities run out.
 *
 * NO STATE IS SPECIAL. A "state" here is just the distinct `stateCode` values of
 * the supplied markets, in the order they were supplied. There is no per-state
 * branch, table, or default anywhere in this file.
 *
 * WHAT IS SHARED, UNCHANGED. Everything after discovery: `googlePlaceCandidates`
 * for admission, then `assessQualifyAndExport` for assessment, identity,
 * qualification, deterministic ranking, and the private CSV. No second scoring
 * model, gate, queue, or exporter exists, and nothing here relaxes a rule. The
 * Google handicap the pilot documented still applies: no provider address, phone,
 * or category, so `legitimacy.location_observed` and `niche.relevant_category`
 * stay unearned against the 65-point threshold.
 *
 * WHY THE PIPELINE RUNS ONCE PER CITY. A callable target needs callable feedback,
 * and callable status only exists after qualification and ranking. Running the
 * shared stage per city gives that feedback while keeping one queue snapshot and
 * one evaluation per business in each city's own database — a single shared
 * database would accumulate a snapshot and a re-fingerprinted evaluation per
 * city and fan out duplicate rows on export. The combined CSV is assembled here
 * from the rows that stage returns.
 *
 * TERMINATION. Three nested bounded `for` loops (states, cities in the state,
 * queries) with no `while` anywhere. Every request is preceded by a check against
 * the request cap, the candidate cap, and the wall-clock deadline. There is no
 * pagination: `nextPageToken` is counted so the decision is visible, never sent.
 *
 * Read-only discovery and bounded public HTTPS GETs only. No form, message, call,
 * booking, CRM write, import, third-party export, notification, publication, paid
 * integration, or account change exists in this path. The API key is read from
 * the environment, never logged, never persisted, never put in a report or an
 * error message.
 */

export const MULTI_MARKET_QUERY_VERSION = "multi-market-places-1.0.0" as const;
export const FOUNDATION_WATERPROOFING_QUERY_VERSION =
  "foundation-waterproofing-places-1.0.0" as const;

export const MULTI_MARKET_NICHE_IDS = Object.freeze({
  "pool-service": "pool_service",
  "foundation-waterproofing": "foundation_waterproofing",
} as const);

export function googleQueriesForNiche(
  nicheId: SupportedQualificationNiche,
): ReadonlyArray<string> {
  return nicheId === "foundation_waterproofing"
    ? GOOGLE_FOUNDATION_WATERPROOFING_QUERIES
    : GOOGLE_POOL_SERVICE_QUERIES;
}

function queryVersionForNiche(nicheId: SupportedQualificationNiche): string {
  return nicheId === "foundation_waterproofing"
    ? FOUNDATION_WATERPROOFING_QUERY_VERSION
    : MULTI_MARKET_QUERY_VERSION;
}

/** Every number is a ceiling, never a target. */
export const MULTI_MARKET_BUDGETS = Object.freeze({
  /** Hard ceiling on `--max-google-requests`, whatever the operator passes. */
  maxGoogleRequestsCeiling: 600,
  maxDiscoveryBytesPerRequest: 1024 * 1024,
  maxDiscoveryRequestDurationMs: 15_000,
  /** 6000 ms honours the 10-requests-per-minute Text Search limit. */
  minimumIntervalMs: 6_000,
  discoveryCapabilityTtlSeconds: 300,
  maxRetriesPerDiscoveryRequest: 1,
  /** Assessment ceilings, identical in shape to the pilot and the Overture batch. */
  assessmentChunkSize: 16,
  maxPagesPerBusiness: 2,
  maxRequestsPerBusiness: 4,
  maxRequestsPerAssessmentChunk: 64,
  maxBytesPerAssessmentChunk: 32 * 1024 * 1024,
  maxProcessedBytesPerAssessmentChunk: 64 * 1024 * 1024,
  maxAssessmentChunkDurationMs: 110_000,
  maxRetriesPerBusiness: 1,
  /** Per-city crawl rails. */
  maxCrawlRequests: 700,
  maxCrawlBytes: 48 * 1024 * 1024,
  /** Whole-run wall clock. */
  maxRuntimeMs: 5_400_000,
});

export interface MultiMarket {
  /** `<city_slug>_<st>`, e.g. `chandler_az`. Also the per-city artifact folder. */
  readonly id: string;
  readonly city: string;
  readonly stateCode: string;
  readonly countryCode: string;
  readonly bounds: BoundingArea;
}

export interface MultiMarketArguments {
  readonly dataRoot: string;
  readonly markets: ReadonlyArray<MultiMarket>;
  readonly targetCallablePerState: number;
  readonly maxGoogleRequests: number;
  readonly maxAssessedCandidates: number;
  readonly queriesPerCity: number;
  readonly enableLiveRun: boolean;
  readonly nicheId: SupportedQualificationNiche;
}

const CITY_SLUG = /[^a-z0-9]+/g;

function marketId(city: string, stateCode: string): string {
  const slug = city.toLocaleLowerCase("en-US").replace(CITY_SLUG, "_").replace(/^_|_$/g, "");
  if (!slug) throw new Error("Market city must contain at least one alphanumeric character");
  return `${slug}_${stateCode.toLocaleLowerCase("en-US")}`;
}

function finiteNumber(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Market ${label} must be a finite number`);
  return parsed;
}

/**
 * Validate one market's rectangle.
 *
 * Fails closed on an inverted, empty, or absurd box: a rectangle wider than two
 * degrees on a side is almost always a typo, and a wrong box silently searches
 * the wrong place while still producing a coverage key that claims otherwise.
 */
function validateBounds(bounds: BoundingArea): BoundingArea {
  const west = finiteNumber(bounds.west, "west");
  const south = finiteNumber(bounds.south, "south");
  const east = finiteNumber(bounds.east, "east");
  const north = finiteNumber(bounds.north, "north");
  if (Math.abs(west) > 180 || Math.abs(east) > 180) throw new Error("Market longitude must be within +/-180");
  if (Math.abs(south) > 90 || Math.abs(north) > 90) throw new Error("Market latitude must be within +/-90");
  if (east <= west || north <= south) throw new Error("Market bounds must be ordered west<east and south<north");
  if (east - west > 2 || north - south > 2) throw new Error("Market bounds exceed two degrees on a side");
  return Object.freeze({ west, south, east, north });
}

function validateStateCode(value: string): string {
  const code = value.trim().toLocaleUpperCase("en-US");
  if (!/^[A-Z]{2}$/.test(code)) throw new Error(`Market state code must be two letters: ${value}`);
  return code;
}

/** `City,ST,west,south,east,north` — one inline market. */
export function parseMarketSpec(spec: string): MultiMarket {
  const parts = spec.split(",").map((part) => part.trim());
  if (parts.length !== 6) {
    throw new Error("Inline market must be City,ST,west,south,east,north");
  }
  const [city, stateCode, west, south, east, north] = parts as [string, string, string, string, string, string];
  if (!city) throw new Error("Inline market requires a city");
  const code = validateStateCode(stateCode);
  return Object.freeze({
    id: marketId(city, code),
    city,
    stateCode: code,
    countryCode: "US",
    bounds: validateBounds({
      west: finiteNumber(west, "west"), south: finiteNumber(south, "south"),
      east: finiteNumber(east, "east"), north: finiteNumber(north, "north"),
    }),
  });
}

/** `{ "markets": [{ city, stateCode, countryCode?, bounds: {…} }] }` */
export function parseMarketsFile(contents: string): ReadonlyArray<MultiMarket> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new Error("Markets file is not valid JSON");
  }
  const markets = (parsed as { markets?: unknown }).markets;
  if (!Array.isArray(markets) || markets.length === 0) {
    throw new Error("Markets file must hold a non-empty markets array");
  }
  return Object.freeze(markets.map((entry) => {
    if (typeof entry !== "object" || entry === null) throw new Error("Market entry must be an object");
    const record = entry as Record<string, unknown>;
    const city = typeof record.city === "string" ? record.city.trim() : "";
    if (!city) throw new Error("Market entry requires a city");
    const code = validateStateCode(String(record.stateCode ?? ""));
    const bounds = record.bounds as BoundingArea | undefined;
    if (!bounds || typeof bounds !== "object") throw new Error(`Market ${city} requires bounds`);
    const countryCode = typeof record.countryCode === "string" && record.countryCode.trim()
      ? record.countryCode.trim().toLocaleUpperCase("en-US") : "US";
    if (!/^[A-Z]{2}$/.test(countryCode)) throw new Error(`Market ${city} country code must be two letters`);
    return Object.freeze({ id: marketId(city, code), city, stateCode: code, countryCode, bounds: validateBounds(bounds) });
  }));
}

export function parseMultiMarketArguments(
  argv: ReadonlyArray<string>,
  readFile: (filePath: string) => string = (filePath) => readFileSync(filePath, "utf8"),
): MultiMarketArguments {
  let dataRoot: string | null = null;
  let enableLiveRun = false;
  let confirmed = false;
  let targetCallablePerState = 50;
  let maxGoogleRequests: number | null = null;
  let maxAssessedCandidates = 400;
  let queriesPerCity: number | null = null;
  let nicheId: SupportedQualificationNiche = "pool_service";
  const markets: MultiMarket[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index] as string;
    if (flag === "--confirm-live-run") { confirmed = true; continue; }
    if (flag === "--enable-live-run") { enableLiveRun = true; continue; }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Runner argument ${flag} requires a value`);
    index += 1;
    if (flag === "--data-root") { dataRoot = value; continue; }
    if (flag === "--niche") {
      const resolved = MULTI_MARKET_NICHE_IDS[value as keyof typeof MULTI_MARKET_NICHE_IDS];
      if (!resolved) throw new Error(`Unsupported niche: ${value}`);
      nicheId = resolved;
      continue;
    }
    if (flag === "--market") { markets.push(parseMarketSpec(value)); continue; }
    if (flag === "--markets-file") {
      if (!path.isAbsolute(value)) throw new Error("Markets file must be an absolute path");
      markets.push(...parseMarketsFile(readFile(value)));
      continue;
    }
    if (flag === "--target-callable-per-state") { targetCallablePerState = Number(value); continue; }
    if (flag === "--max-google-requests") { maxGoogleRequests = Number(value); continue; }
    if (flag === "--max-assessed-candidates") { maxAssessedCandidates = Number(value); continue; }
    if (flag === "--queries") { queriesPerCity = Number(value); continue; }
    throw new Error(`Unknown runner argument: ${flag}`);
  }

  if (!confirmed) throw new Error("Live multi-market run requires --confirm-live-run");
  if (dataRoot === null) throw new Error("Multi-market run requires --data-root");
  if (markets.length === 0) throw new Error("Multi-market run requires at least one --market or --markets-file");
  const ids = new Set<string>();
  for (const market of markets) {
    if (ids.has(market.id)) throw new Error(`Duplicate market: ${market.id}`);
    ids.add(market.id);
  }
  if (!Number.isSafeInteger(targetCallablePerState) || targetCallablePerState < 1 || targetCallablePerState > 500) {
    throw new Error("Callable target per state must be an integer between 1 and 500");
  }
  if (maxGoogleRequests === null) throw new Error("Multi-market run requires --max-google-requests");
  if (!Number.isSafeInteger(maxGoogleRequests) || maxGoogleRequests < 1 ||
    maxGoogleRequests > MULTI_MARKET_BUDGETS.maxGoogleRequestsCeiling) {
    throw new Error("Google request cap must be an integer between 1 and the run ceiling");
  }
  if (!Number.isSafeInteger(maxAssessedCandidates) || maxAssessedCandidates < 1 || maxAssessedCandidates > 2_000) {
    throw new Error("Candidate cap must be an integer between 1 and 2000");
  }
  const maximumQueries = googleQueriesForNiche(nicheId).length;
  const selectedQueries = queriesPerCity ?? maximumQueries;
  if (!Number.isSafeInteger(selectedQueries) || selectedQueries < 1 ||
    selectedQueries > maximumQueries) {
    throw new Error(`Queries per city must be an integer between 1 and ${maximumQueries}`);
  }
  return Object.freeze({
    dataRoot,
    markets: Object.freeze([...markets]),
    targetCallablePerState,
    maxGoogleRequests,
    maxAssessedCandidates,
    queriesPerCity: selectedQueries,
    enableLiveRun,
    nicheId,
  });
}

/**
 * One coverage cell per city: the operator's rectangle, planned at city level
 * with no subdivision.
 *
 * The same bounds become the request's `locationRestriction.rectangle`, so the
 * cell records exactly the area the provider was asked about. It is scope
 * lineage — where we looked — never a business claim, and it is the only route a
 * Google-sourced lead has into the calling queue's scope, since no provider
 * address means no persisted location row.
 */
export function planMarketCell(
  market: MultiMarket,
  nicheId: SupportedQualificationNiche = "pool_service",
): { manifest: CoverageManifest; cell: CoverageCell } {
  const manifest = planCoverage({
    nicheId,
    configurationVersion: "1.0.0",
    queryVersion: queryVersionForNiche(nicheId),
    strategy: "dense",
    targets: [{
      level: "city",
      label: `${market.city}, ${market.stateCode}`,
      countryCode: market.countryCode,
      subdivisionCode: market.stateCode,
      bounds: market.bounds,
      density: "dense",
    }],
    resultCap: GOOGLE_PLACES_MAX_PAGE_SIZE,
    maxDepth: 0,
  });
  const cell = manifest.cells[0];
  if (!cell || manifest.cells.length !== 1) {
    throw new Error(`Market ${market.id} must plan exactly one coverage cell`);
  }
  return { manifest, cell };
}

/** The text query for one city. Query text is fixed and versioned; only the place varies. */
export function marketQuery(query: string, market: MultiMarket): string {
  return `${query} in ${market.city}, ${market.stateCode}`;
}

export interface DedupeState {
  readonly placeIds: Set<string>;
  readonly hosts: Set<string>;
}

export function newDedupeState(): DedupeState {
  return { placeIds: new Set<string>(), hosts: new Set<string>() };
}

/**
 * Global dedupe across every query, city, and state.
 *
 * `googlePlaceCandidates` already dedupes inside one response. This is the
 * cross-query layer: the five queries in one city overlap heavily, and
 * neighbouring city rectangles overlap at their edges, so without this the same
 * business would be crawled and assessed several times. Both keys the gate uses
 * are honoured — provider place id and candidate host.
 */
export function selectNewCandidates(input: {
  readonly candidates: ReadonlyArray<EligibleCandidate>;
  readonly seen: DedupeState;
  readonly remainingCapacity: number;
}): { readonly accepted: ReadonlyArray<EligibleCandidate>; readonly duplicates: number; readonly capacityBlocked: number } {
  const accepted: EligibleCandidate[] = [];
  let duplicates = 0;
  let capacityBlocked = 0;
  for (const candidate of input.candidates) {
    if (input.seen.placeIds.has(candidate.candidateKey) || input.seen.hosts.has(candidate.candidateHost)) {
      duplicates += 1;
      continue;
    }
    if (accepted.length >= input.remainingCapacity) {
      capacityBlocked += 1;
      continue;
    }
    input.seen.placeIds.add(candidate.candidateKey);
    input.seen.hosts.add(candidate.candidateHost);
    accepted.push(candidate);
  }
  return { accepted: Object.freeze(accepted), duplicates, capacityBlocked };
}

export interface StateTotal {
  readonly stateCode: string;
  readonly cities: number;
  readonly citiesSearched: number;
  readonly googleRequests: number;
  readonly placesReturned: number;
  readonly newCandidates: number;
  readonly duplicatesDropped: number;
  readonly assessed: number;
  readonly qualified: number;
  readonly callable: number;
  readonly review: number;
  readonly rows: number;
  readonly salesFitBands: Readonly<Record<string, number>>;
  readonly targetMet: boolean;
  readonly stopReason: string;
}

/** Distinct state codes in the order the operator supplied their markets. */
export function orderedStateCodes(markets: ReadonlyArray<MultiMarket>): ReadonlyArray<string> {
  const codes: string[] = [];
  for (const market of markets) if (!codes.includes(market.stateCode)) codes.push(market.stateCode);
  return Object.freeze(codes);
}

export function salesFitHistogram(rows: ReadonlyArray<ExportRow>): Readonly<Record<string, number>> {
  const bands: Record<string, number> = {};
  for (const row of rows) bands[row.salesFitBand] = (bands[row.salesFitBand] ?? 0) + 1;
  return Object.freeze(bands);
}

/**
 * Combined private CSV.
 *
 * One header, every market's rows, `state_code` appended so a state total can be
 * re-derived from the file itself. Deduped by lead id as a belt-and-braces check
 * on the discovery-level dedupe, and sorted by priority so the call list reads
 * top-down.
 */
export function combinedCsv(
  rows: ReadonlyArray<ExportRow>,
  stateByMarket: ReadonlyMap<string, string>,
): { readonly csv: string; readonly rowCount: number; readonly duplicateRowsDropped: number } {
  const byLead = new Map<string, ExportRow>();
  let duplicateRowsDropped = 0;
  for (const row of rows) {
    if (byLead.has(row.leadId)) { duplicateRowsDropped += 1; continue; }
    byLead.set(row.leadId, row);
  }
  const ordered = [...byLead.values()].sort((left, right) => {
    const leftScore = left.priorityScore ?? -1;
    const rightScore = right.priorityScore ?? -1;
    if (leftScore !== rightScore) return rightScore - leftScore;
    return left.leadId.localeCompare(right.leadId);
  });
  const csv = [
    `${EXPORT_CSV_HEADER},state_code`,
    ...ordered.map((row) => `${exportCsvRow(row)},${csvCell(stateByMarket.get(row.market) ?? "")}`),
  ].join("\n");
  return { csv, rowCount: ordered.length, duplicateRowsDropped };
}

export interface MultiMarketReport {
  readonly ran: boolean;
  readonly niche: keyof typeof MULTI_MARKET_NICHE_IDS;
  readonly adapterVersion: string;
  readonly queryVersion: string;
  readonly queries: ReadonlyArray<string>;
  readonly markets: ReadonlyArray<string>;
  readonly perCity: ReadonlyArray<Readonly<Record<string, unknown>>>;
  readonly perState: ReadonlyArray<StateTotal>;
  readonly discovery: Readonly<Record<string, unknown>>;
  readonly usage: Readonly<Record<string, number>>;
  readonly budgets: Readonly<Record<string, number>>;
  readonly artifacts: Readonly<Record<string, string>>;
  readonly stopReason: string;
  readonly aggregateVerdict: string;
  readonly safetyWarnings: ReadonlyArray<string>;
}

/** One bounded Text Search request. Test seam: `discoverImpl` replaces the network. */
export type DiscoverOnce = (input: {
  readonly textQuery: string;
  readonly cell: CoverageCell;
}) => Promise<{ page: GoogleTextSearchPage; usage: GooglePlacesUsage }>;

export type AssessMarket = (input: {
  readonly candidates: ReadonlyArray<EligibleCandidate>;
  readonly market: MultiMarket;
  readonly manifest: CoverageManifest;
  readonly cell: CoverageCell;
  readonly dataRoot: string;
  readonly deadlineAt: number;
  readonly nicheId: SupportedQualificationNiche;
}) => Promise<AssessmentStageResult>;

function assessmentLimits() {
  return {
    assessmentChunkSize: MULTI_MARKET_BUDGETS.assessmentChunkSize,
    maxPagesPerBusiness: MULTI_MARKET_BUDGETS.maxPagesPerBusiness,
    maxRequestsPerBusiness: MULTI_MARKET_BUDGETS.maxRequestsPerBusiness,
    maxRequestsPerAssessmentChunk: MULTI_MARKET_BUDGETS.maxRequestsPerAssessmentChunk,
    maxBytesPerAssessmentChunk: MULTI_MARKET_BUDGETS.maxBytesPerAssessmentChunk,
    maxProcessedBytesPerAssessmentChunk: MULTI_MARKET_BUDGETS.maxProcessedBytesPerAssessmentChunk,
    maxAssessmentChunkDurationMs: MULTI_MARKET_BUDGETS.maxAssessmentChunkDurationMs,
    maxRetriesPerBusiness: MULTI_MARKET_BUDGETS.maxRetriesPerBusiness,
    maxCrawlRequests: MULTI_MARKET_BUDGETS.maxCrawlRequests,
    maxCrawlBytes: MULTI_MARKET_BUDGETS.maxCrawlBytes,
  };
}

/**
 * One city's discovery session.
 *
 * The ephemeral policy is created per city and torn down in `finally` whether the
 * requests succeeded, failed, or were refused, so the activated `search` provider
 * never outlives the city. The session's own budget is the smaller of the city's
 * query count and what is left of the whole-run cap, so a city can never spend
 * requests the run does not have.
 */
function citySession(input: { apiKey: string; runId: string; scopeId: string; maxRequests: number }) {
  const policy = createEphemeralGooglePlacesPolicy({
    checkedInConfigurationRoot: DEFAULT_LEAD_POLICY_ROOT,
    maxRequests: input.maxRequests,
    // Total budget for the whole city session, not one request's worth: the
    // pilot's `maxBytes` and `maxBytesPerRequest` share one constant only
    // because the pilot never issues more than one request. Here the session
    // can issue up to `maxRequests`, so the total must scale with it — bounded
    // by that same cap, never unlimited.
    maxBytes: MULTI_MARKET_BUDGETS.maxDiscoveryBytesPerRequest * input.maxRequests,
    maxRequestDurationMs: MULTI_MARKET_BUDGETS.maxDiscoveryRequestDurationMs,
    capabilityTtlSeconds: MULTI_MARKET_BUDGETS.discoveryCapabilityTtlSeconds,
  });
  try {
    const session = createGooglePlacesSession({
      policy: policy.policy,
      apiKey: input.apiKey,
      runId: input.runId,
      scopeId: input.scopeId,
      maxRequests: input.maxRequests,
      minimumIntervalMs: MULTI_MARKET_BUDGETS.minimumIntervalMs,
      maxBytesPerRequest: MULTI_MARKET_BUDGETS.maxDiscoveryBytesPerRequest,
      maxRequestDurationMs: MULTI_MARKET_BUDGETS.maxDiscoveryRequestDurationMs,
      capabilityTtlMs: MULTI_MARKET_BUDGETS.discoveryCapabilityTtlSeconds * 1_000,
      requestsPerLease: input.maxRequests,
      maxRetriesPerRequest: MULTI_MARKET_BUDGETS.maxRetriesPerDiscoveryRequest,
    });
    return { session, cleanup: policy.cleanup };
  } catch (error) {
    policy.cleanup();
    throw error;
  }
}

export async function runMultiMarketPlaces(input: {
  argv: ReadonlyArray<string>;
  repositoryRoot: string;
  /** Test seams. Both default to the real, bounded implementations. */
  discoverImpl?: DiscoverOnce;
  assessImpl?: AssessMarket;
}): Promise<MultiMarketReport> {
  const args = parseMultiMarketArguments(input.argv);
  const parent = resolveBatchPaths(args.dataRoot, input.repositoryRoot);
  const startedAt = Date.now();
  const deadlineAt = startedAt + MULTI_MARKET_BUDGETS.maxRuntimeMs;
  const queries = googleQueriesForNiche(args.nicheId).slice(0, args.queriesPerCity);
  const combinedCsvPath = path.join(parent.dataRoot, "multi-market-leads.csv");
  const summaryPath = path.join(parent.dataRoot, "multi-market-summary.json");
  const stateByMarket = new Map(args.markets.map((market) => [market.id, market.stateCode]));

  const empty = {
    ran: false,
    niche: (Object.entries(MULTI_MARKET_NICHE_IDS)
      .find(([, id]) => id === args.nicheId)?.[0] ?? "pool-service") as keyof typeof MULTI_MARKET_NICHE_IDS,
    adapterVersion: GOOGLE_PLACES_ADAPTER_VERSION,
    queryVersion: queryVersionForNiche(args.nicheId),
    queries,
    markets: args.markets.map((market) => market.id),
    perCity: [], perState: [],
    discovery: {}, usage: {},
    budgets: { ...MULTI_MARKET_BUDGETS },
    artifacts: {},
    stopReason: "not_started",
    aggregateVerdict: "blocked_live_run_disabled",
    safetyWarnings: ["live_run_disabled_by_default"],
  } satisfies MultiMarketReport;
  if (!args.enableLiveRun) return empty;

  // Fail closed on a missing key, and never echo the value or its length.
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim() ?? "";
  if (!apiKey && input.discoverImpl === undefined) {
    return {
      ...empty,
      aggregateVerdict: "blocked_missing_api_key",
      safetyWarnings: ["google_places_api_key_absent_from_environment"],
    };
  }

  mkdirSync(parent.dataRoot, { recursive: true, mode: 0o700 });
  chmodSync(parent.dataRoot, 0o700);

  const assess: AssessMarket = input.assessImpl ?? (async (stage) => assessQualifyAndExport({
    candidates: stage.candidates,
    coverage: stage.manifest,
    // The one cell that scopes both the geography hard rule and the queue.
    coverageKeys: [stage.cell.coverageKey],
    marketByKey: new Map(stage.candidates.map((candidate) => [candidate.candidateKey, stage.market.id])),
    paths: resolveBatchPaths(stage.dataRoot, input.repositoryRoot),
    repositoryRoot: input.repositoryRoot,
    runId: `multi-market-${stage.market.id}`,
    limits: assessmentLimits(),
    deadlineAt: stage.deadlineAt,
    now: () => new Date(),
    nicheId: stage.nicheId,
  }));

  const seen = newDedupeState();
  const perCity: Array<Record<string, unknown>> = [];
  const perState: StateTotal[] = [];
  const allRows: ExportRow[] = [];
  const safetyWarnings: string[] = [];
  const blockedCounts: Record<string, number> = {};
  let googleRequests = 0;
  let googleBytes = 0;
  let googleRetries = 0;
  let placesReturned = 0;
  let acceptedCandidates = 0;
  let duplicatesDropped = 0;
  let furtherPagesAvailable = 0;
  let crawlRequests = 0;
  let crawlBytes = 0;
  let runStop = "cities_exhausted";

  /** True when a whole-run rail is spent; every loop consults this before spending. */
  const runExhausted = (): string | null => {
    if (googleRequests >= args.maxGoogleRequests) return "request_cap_reached";
    if (acceptedCandidates >= args.maxAssessedCandidates) return "candidate_cap_reached";
    if (Date.now() >= deadlineAt) return "runtime_budget_exhausted";
    return null;
  };

  states: for (const stateCode of orderedStateCodes(args.markets)) {
    const cities = args.markets.filter((market) => market.stateCode === stateCode);
    const stateTotals = {
      citiesSearched: 0, googleRequests: 0, placesReturned: 0, newCandidates: 0,
      duplicatesDropped: 0, assessed: 0, qualified: 0, callable: 0, review: 0,
    };
    const stateRows: ExportRow[] = [];
    let stateStop = "cities_exhausted";

    for (const market of cities) {
      const exhausted = runExhausted();
      if (exhausted !== null) { stateStop = exhausted; runStop = exhausted; break states; }

      const { manifest, cell } = planMarketCell(market, args.nicheId);
      const cityCandidates: EligibleCandidate[] = [];
      let cityRequests = 0;
      let cityPlaces = 0;
      let cityDuplicates = 0;
      let cityStop = "queries_exhausted";

      const budget = Math.min(queries.length, args.maxGoogleRequests - googleRequests);
      const opened = input.discoverImpl
        ? { session: null, cleanup: () => undefined }
        : citySession({
            apiKey,
            runId: `multi-market-${market.id}`,
            scopeId: `multi-market-${market.id}`,
            maxRequests: budget,
          });
      try {
        for (const query of queries) {
          const stop = runExhausted();
          if (stop !== null) { cityStop = stop; break; }
          const textQuery = marketQuery(query, market);
          let page: GoogleTextSearchPage;
          try {
            if (input.discoverImpl) {
              const outcome = await input.discoverImpl({ textQuery, cell });
              page = outcome.page;
              googleBytes += outcome.usage.downloadedBytes;
              googleRetries += outcome.usage.retries;
            } else {
              // One request. `pageToken` is never sent: no pagination, and no
              // Place Details call exists anywhere in this path.
              page = await opened.session!.searchText({ textQuery, rectangle: cell.bounds });
            }
          } catch (error) {
            // A refused or failed query is a bounded stop for that query, not a
            // run failure. Error codes are safe: they never carry the URL, the
            // headers, or the key.
            googleRequests += 1;
            cityRequests += 1;
            safetyWarnings.push(
              `${market.id}: ${error instanceof Error ? `${error.name}: ${error.message}` : "unknown_discovery_error"}`,
            );
            cityStop = "discovery_failed";
            break;
          }
          googleRequests += 1;
          cityRequests += 1;
          cityPlaces += page.places.length;
          if (page.nextPageToken !== null) furtherPagesAvailable += 1;

          const mapped = googlePlaceCandidates({ places: page.places, cell });
          for (const [key, count] of Object.entries(mapped.blockedCounts)) {
            blockedCounts[key] = (blockedCounts[key] ?? 0) + count;
          }
          const selected = selectNewCandidates({
            candidates: mapped.eligible,
            seen,
            remainingCapacity: args.maxAssessedCandidates - acceptedCandidates - cityCandidates.length,
          });
          cityCandidates.push(...selected.accepted);
          cityDuplicates += selected.duplicates;
          if (selected.capacityBlocked > 0) {
            blockedCounts.candidate_cap_reached =
              (blockedCounts.candidate_cap_reached ?? 0) + selected.capacityBlocked;
          }
        }
      } finally {
        if (!input.discoverImpl) {
          const usage = opened.session?.usage();
          if (usage) { googleBytes += usage.downloadedBytes; googleRetries += usage.retries; }
        }
        opened.cleanup();
      }

      acceptedCandidates += cityCandidates.length;
      placesReturned += cityPlaces;
      duplicatesDropped += cityDuplicates;
      stateTotals.citiesSearched += 1;
      stateTotals.googleRequests += cityRequests;
      stateTotals.placesReturned += cityPlaces;
      stateTotals.newCandidates += cityCandidates.length;
      stateTotals.duplicatesDropped += cityDuplicates;

      let stages: AssessmentStageResult | null = null;
      if (cityCandidates.length > 0) {
        try {
          stages = await assess({
            candidates: cityCandidates,
            market, manifest, cell,
            dataRoot: path.join(parent.dataRoot, market.id),
            deadlineAt,
            nicheId: args.nicheId,
          });
        } catch (error) {
          // A city whose assessment stage refuses is recorded and skipped; the
          // run continues with the next city rather than losing the whole book.
          safetyWarnings.push(
            `${market.id}: ${error instanceof Error ? `${error.name}: ${error.message}` : "unknown_assessment_error"}`,
          );
          perCity.push({
            marketId: market.id, stateCode, status: "assessment_failed",
            coverageKey: cell.coverageKey, googleRequests: cityRequests,
            placesReturned: cityPlaces, newCandidates: cityCandidates.length,
            duplicatesDropped: cityDuplicates, stopReason: cityStop,
          });
          continue;
        }
      }

      const callable = stages?.queue.callableQueueSize ?? 0;
      const qualified = Number(stages?.qualification.qualified ?? 0);
      const review = stages?.queue.reviewQueueSize ?? 0;
      const assessed = Number(stages?.assessment.assessedComplete ?? 0);
      stateTotals.callable += callable;
      stateTotals.qualified += qualified;
      stateTotals.review += review;
      stateTotals.assessed += assessed;
      crawlRequests += stages?.crawl.requests ?? 0;
      crawlBytes += stages?.crawl.downloadedBytes ?? 0;
      for (const row of stages?.rows ?? []) { allRows.push(row); stateRows.push(row); }

      perCity.push({
        marketId: market.id, stateCode,
        status: stages === null ? "no_candidates" : "complete",
        coverageKey: cell.coverageKey,
        googleRequests: cityRequests,
        placesReturned: cityPlaces,
        newCandidates: cityCandidates.length,
        duplicatesDropped: cityDuplicates,
        assessed, qualified, callable, review,
        rows: stages?.rowCount ?? 0,
        stopReason: cityStop,
      });

      if (stateTotals.callable >= args.targetCallablePerState) {
        stateStop = "state_target_reached";
        break;
      }
      const afterCity = runExhausted();
      if (afterCity !== null) { stateStop = afterCity; runStop = afterCity; break states; }
    }

    perState.push(Object.freeze({
      stateCode,
      cities: cities.length,
      ...stateTotals,
      rows: stateRows.length,
      salesFitBands: salesFitHistogram(stateRows),
      targetMet: stateTotals.callable >= args.targetCallablePerState,
      stopReason: stateStop,
    }));
  }

  // Whatever the loop did, the state row for a state it never entered is still
  // reported, so a truncated run reads as truncated instead of as absent demand.
  for (const stateCode of orderedStateCodes(args.markets)) {
    if (perState.some((entry) => entry.stateCode === stateCode)) continue;
    perState.push(Object.freeze({
      stateCode,
      cities: args.markets.filter((market) => market.stateCode === stateCode).length,
      citiesSearched: 0, googleRequests: 0, placesReturned: 0, newCandidates: 0,
      duplicatesDropped: 0, assessed: 0, qualified: 0, callable: 0, review: 0, rows: 0,
      salesFitBands: Object.freeze({}), targetMet: false, stopReason: runStop,
    }));
  }

  const combined = combinedCsv(allRows, stateByMarket);
  writeFileSync(combinedCsvPath, `${combined.csv}\n`, { mode: 0o600 });
  chmodSync(combinedCsvPath, 0o600);

  const report: MultiMarketReport = {
    ran: true,
    niche: empty.niche,
    adapterVersion: GOOGLE_PLACES_ADAPTER_VERSION,
    queryVersion: queryVersionForNiche(args.nicheId),
    queries,
    markets: args.markets.map((market) => market.id),
    perCity: Object.freeze(perCity.map((entry) => Object.freeze(entry))),
    perState: Object.freeze(perState),
    discovery: Object.freeze({
      placesReturned,
      newCandidates: acceptedCandidates,
      duplicatesDropped,
      duplicateRowsDropped: combined.duplicateRowsDropped,
      blockedCounts: Object.freeze({ ...blockedCounts }),
      // Recorded so the "no pagination" decision stays visible rather than
      // implied. The tokens themselves are never printed or stored.
      furtherPagesAvailable,
      paginationRequested: false,
      placeDetailsRequests: 0,
      salesFitBands: salesFitHistogram(allRows),
    }),
    usage: Object.freeze({
      googleRequests,
      googleRequestCap: args.maxGoogleRequests,
      googleBytes,
      googleRetries,
      crawlRequests,
      crawlBytes,
      totalRequests: googleRequests + crawlRequests,
      combinedRows: combined.rowCount,
      elapsedMs: Date.now() - startedAt,
    }),
    budgets: { ...MULTI_MARKET_BUDGETS },
    artifacts: Object.freeze({
      dataRoot: parent.dataRoot,
      combinedCsvPath,
      summaryPath,
    }),
    stopReason: runStop,
    // A run that produced no callable lead completed honestly; it just did not
    // clear the bar. The verdict says which, and never rounds up.
    aggregateVerdict: perState.every((entry) => entry.targetMet)
      ? "completed_all_state_targets_met"
      : perState.some((entry) => entry.callable > 0)
        ? "completed_below_state_targets"
        : "completed_without_callable_leads",
    safetyWarnings: Object.freeze(safetyWarnings),
  };
  writeFileSync(summaryPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  chmodSync(summaryPath, 0o600);
  return report;
}

async function main(): Promise<void> {
  const report = await runMultiMarketPlaces({
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
      aggregateVerdict: "run_rejected",
      safetyWarnings: [error instanceof Error ? error.message : "unknown_run_error"],
    }));
    process.exitCode = 1;
  });
}
