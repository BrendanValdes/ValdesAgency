import { planCoverage } from "../geography/coverage-planner.js";
import type { CoverageCell, GeographyTarget } from "../geography/types.js";
import type { NormalizedDiscoveryResult, ProviderEnvelope } from "../providers/contracts.js";
import {
  selectAssessableCandidates,
  type CandidateBlockReason,
  type EligibleCandidate,
} from "./candidate-gate.js";

/**
 * Phase 5A.3 bounded suburban discovery.
 *
 * Residential pool-service contractors sit in the Phoenix suburbs, not the
 * downtown core, where the only pool-tagged places are facilities and supply
 * retailers that the gate correctly holds for review. This module walks a small,
 * deterministic set of suburban coverage cells until enough STRONG-category
 * website candidates are found or a budget stops it.
 *
 * It changes nothing about admissibility: every candidate still passes the same
 * unmodified gate. A review or supporting record is never crawled to lift yield.
 */

/**
 * Suburban Phoenix-metro residential service areas. Each is a planner target of
 * the same span as the original canary cell, so every derived cell stays inside
 * the geographic area budget. The planner sorts cells by coverage key, so the
 * traversal order is a pure function of these targets.
 */
const CELL_HALF_WIDTH_DEGREES = 0.025;
const CELL_HALF_HEIGHT_DEGREES = 0.02;

const SUBURBAN_CENTERS: ReadonlyArray<{ label: string; longitude: number; latitude: number }> =
  Object.freeze([
    { label: "Mesa residential", longitude: -111.831, latitude: 33.415 },
    { label: "Chandler residential", longitude: -111.841, latitude: 33.306 },
    { label: "Gilbert residential", longitude: -111.789, latitude: 33.353 },
    { label: "Scottsdale residential", longitude: -111.926, latitude: 33.564 },
    { label: "Glendale residential", longitude: -112.186, latitude: 33.539 },
    { label: "Peoria residential", longitude: -112.238, latitude: 33.641 },
    { label: "Surprise residential", longitude: -112.368, latitude: 33.630 },
    { label: "Tempe residential", longitude: -111.936, latitude: 33.395 },
    { label: "Ahwatukee residential", longitude: -111.983, latitude: 33.323 },
    { label: "Queen Creek residential", longitude: -111.634, latitude: 33.249 },
    { label: "Goodyear residential", longitude: -112.359, latitude: 33.436 },
    { label: "Avondale residential", longitude: -112.316, latitude: 33.436 },
    { label: "Litchfield Park residential", longitude: -112.360, latitude: 33.494 },
    { label: "Sun City residential", longitude: -112.286, latitude: 33.599 },
    { label: "Cave Creek residential", longitude: -111.951, latitude: 33.798 },
    { label: "Fountain Hills residential", longitude: -111.717, latitude: 33.611 },
    { label: "Paradise Valley residential", longitude: -111.952, latitude: 33.542 },
    { label: "North Scottsdale residential", longitude: -111.892, latitude: 33.664 },
    { label: "East Mesa residential", longitude: -111.700, latitude: 33.415 },
    { label: "West Chandler residential", longitude: -111.923, latitude: 33.302 },
    { label: "Gilbert south residential", longitude: -111.760, latitude: 33.279 },
  ]);

export function suburbanPhoenixTargets(): ReadonlyArray<GeographyTarget> {
  return SUBURBAN_CENTERS.map((center) => Object.freeze({
    level: "grid_cell" as const,
    label: center.label,
    countryCode: "US",
    subdivisionCode: "AZ",
    bounds: Object.freeze({
      west: Number((center.longitude - CELL_HALF_WIDTH_DEGREES).toFixed(6)),
      south: Number((center.latitude - CELL_HALF_HEIGHT_DEGREES).toFixed(6)),
      east: Number((center.longitude + CELL_HALF_WIDTH_DEGREES).toFixed(6)),
      north: Number((center.latitude + CELL_HALF_HEIGHT_DEGREES).toFixed(6)),
    }),
    density: "dense" as const,
  }));
}

/**
 * Deterministic cell order: the planner already sorts by coverage key, so the
 * same targets always produce the same sequence. Only the first `maxCells` are
 * considered.
 */
export function planSuburbanCells(input: {
  configurationVersion: string;
  queryVersion: string;
  maxCells: number;
  /** Skip this many cells, so successive bounded passes cover distinct slices. */
  cellOffset?: number;
}): ReadonlyArray<CoverageCell> {
  if (!Number.isSafeInteger(input.maxCells) || input.maxCells < 1 || input.maxCells > 24) {
    throw new Error("Suburban cell budget must be an integer between 1 and 24");
  }
  const offset = input.cellOffset ?? 0;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 64) {
    throw new Error("Suburban cell offset must be a nonnegative integer no greater than 64");
  }
  const manifest = planCoverage({
    nicheId: "pool_service",
    configurationVersion: input.configurationVersion,
    queryVersion: input.queryVersion,
    strategy: "dense",
    targets: suburbanPhoenixTargets(),
    resultCap: 100,
    maxDepth: 0,
  });
  return Object.freeze(manifest.cells.slice(offset, offset + input.maxCells));
}

export type SuburbanStopReason =
  | "website_candidate_target_reached"
  | "accepted_candidate_budget_reached"
  | "all_cells_exhausted"
  | "cell_budget_exhausted"
  | "provider_budget_exhausted"
  | "cancelled";

export interface SuburbanDiscoveryLimits {
  readonly maxCells: number;
  readonly targetWebsiteCandidates: number;
  readonly maxAcceptedCandidates: number;
}

export interface SuburbanCellOutcome {
  readonly coverageCellSafeId: string;
  readonly envelopes: number;
  readonly eligible: number;
}

export interface SuburbanDiscoverySummary {
  readonly cellsPlanned: number;
  readonly cellsQueried: number;
  readonly envelopesConsidered: number;
  readonly acceptedCandidates: number;
  readonly eligibleWebsiteCandidates: ReadonlyArray<EligibleCandidate>;
  readonly gateBlockedCounts: Readonly<Record<CandidateBlockReason, number>>;
  readonly perCell: ReadonlyArray<SuburbanCellOutcome>;
  readonly duplicatesAcrossCells: number;
  readonly stopReason: SuburbanStopReason;
}

function mergeCounts(
  into: Record<CandidateBlockReason, number>,
  from: Readonly<Record<CandidateBlockReason, number>>,
): void {
  for (const key of Object.keys(from) as CandidateBlockReason[]) {
    into[key] = (into[key] ?? 0) + from[key];
  }
}

/**
 * Query each planned cell in order, applying the unmodified admission gate to
 * every cell's envelopes and accumulating eligible candidates until the target
 * is met, a budget stops the run, or the cells run out.
 *
 * `queryCell` performs one bounded provider query. It throws when the shared
 * provider budget is exhausted; that is treated as a stop, not a failure.
 */
export async function discoverSuburbanWebsiteCandidates(input: {
  cells: ReadonlyArray<CoverageCell>;
  limits: SuburbanDiscoveryLimits;
  queryCell: (cell: CoverageCell) => Promise<ReadonlyArray<ProviderEnvelope<NormalizedDiscoveryResult>>>;
  isBudgetExhausted?: () => boolean;
  signal?: AbortSignal;
}): Promise<SuburbanDiscoverySummary> {
  const { limits } = input;
  if (!Number.isSafeInteger(limits.targetWebsiteCandidates) || limits.targetWebsiteCandidates < 1 ||
    !Number.isSafeInteger(limits.maxAcceptedCandidates) || limits.maxAcceptedCandidates < 1) {
    throw new Error("Suburban discovery targets must be positive integers");
  }

  const eligible: EligibleCandidate[] = [];
  const seenKeys = new Set<string>();
  const seenHosts = new Set<string>();
  const gateBlockedCounts = {} as Record<CandidateBlockReason, number>;
  const perCell: SuburbanCellOutcome[] = [];
  let envelopesConsidered = 0;
  let acceptedCandidates = 0;
  let duplicatesAcrossCells = 0;
  let cellsQueried = 0;
  let stopReason: SuburbanStopReason = "all_cells_exhausted";

  const cells = input.cells.slice(0, limits.maxCells);
  for (const cell of cells) {
    if (input.signal?.aborted) {
      stopReason = "cancelled";
      break;
    }
    if (eligible.length >= limits.targetWebsiteCandidates) {
      stopReason = "website_candidate_target_reached";
      break;
    }
    if (acceptedCandidates >= limits.maxAcceptedCandidates) {
      stopReason = "accepted_candidate_budget_reached";
      break;
    }
    if (input.isBudgetExhausted?.() === true) {
      stopReason = "provider_budget_exhausted";
      break;
    }

    let envelopes: ReadonlyArray<ProviderEnvelope<NormalizedDiscoveryResult>>;
    try {
      envelopes = await input.queryCell(cell);
    } catch {
      // A bounded provider budget stop ends the traversal cleanly; the cells
      // already processed keep their results.
      stopReason = "provider_budget_exhausted";
      break;
    }
    cellsQueried += 1;
    envelopesConsidered += envelopes.length;

    const gate = selectAssessableCandidates(envelopes);
    mergeCounts(gateBlockedCounts, gate.blockedCounts);
    let cellEligible = 0;
    for (const candidate of gate.eligible) {
      acceptedCandidates += 1;
      // Cells can overlap at their edges and a chain can appear in several
      // suburbs, so dedupe by place key and by host across the whole traversal.
      if (seenKeys.has(candidate.candidateKey) || seenHosts.has(candidate.candidateHost)) {
        duplicatesAcrossCells += 1;
        continue;
      }
      seenKeys.add(candidate.candidateKey);
      seenHosts.add(candidate.candidateHost);
      eligible.push(candidate);
      cellEligible += 1;
      if (eligible.length >= limits.targetWebsiteCandidates) break;
    }
    perCell.push({
      coverageCellSafeId: cell.coverageKey,
      envelopes: envelopes.length,
      eligible: cellEligible,
    });
  }

  if (stopReason === "all_cells_exhausted") {
    if (eligible.length >= limits.targetWebsiteCandidates) {
      stopReason = "website_candidate_target_reached";
    } else if (cellsQueried >= limits.maxCells && cellsQueried < input.cells.length) {
      stopReason = "cell_budget_exhausted";
    }
  }

  return {
    cellsPlanned: cells.length,
    cellsQueried,
    envelopesConsidered,
    acceptedCandidates,
    eligibleWebsiteCandidates: Object.freeze(eligible.slice(0, limits.targetWebsiteCandidates)),
    gateBlockedCounts: Object.freeze(gateBlockedCounts),
    perCell: Object.freeze(perCell),
    duplicatesAcrossCells,
    stopReason,
  };
}
