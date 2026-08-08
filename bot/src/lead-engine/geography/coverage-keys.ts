import { stableId } from "../shared/stable.js";
import type { BoundingArea, GeographyTarget } from "./types.js";

/**
 * `business_identifiers.scheme` used to record the coverage cell a business was
 * discovered in.
 *
 * Written by the assessment store and read by the calling-queue repository, so
 * it lives here rather than in either, keeping the ranking layer independent of
 * the assessment layer.
 *
 * The stored value is `"<coverageKey>|<businessId>"` because the table enforces
 * a global `UNIQUE (scheme, value)`; only the coverage key is scope-relevant.
 */
export const DISCOVERY_COVERAGE_SCHEME = "discovery_coverage_cell";

/** Recover the coverage key from a stored discovery-coverage identifier value. */
export function discoveryCoverageKeyOf(identifierValue: string): string | null {
  const key = identifierValue.split("|")[0] ?? "";
  return key.length > 0 ? key : null;
}

export function normalizedBounds(bounds: BoundingArea): BoundingArea {
  const rounded = (value: number) => Number(value.toFixed(6));
  if (![bounds.west, bounds.south, bounds.east, bounds.north].every(Number.isFinite)) {
    throw new Error("Coverage bounds must be finite");
  }
  if (bounds.west >= bounds.east || bounds.south >= bounds.north) {
    throw new Error("Coverage bounds must have positive width and height");
  }
  return {
    west: rounded(bounds.west),
    south: rounded(bounds.south),
    east: rounded(bounds.east),
    north: rounded(bounds.north),
  };
}

export function coverageKey(input: {
  target: GeographyTarget;
  nicheId: string;
  configurationVersion: string;
  queryVersion: string;
  depth: number;
  parentCoverageKey?: string | null;
}): string {
  return stableId("coverage", {
    level: input.target.level,
    countryCode: input.target.countryCode.toUpperCase(),
    subdivisionCode: input.target.subdivisionCode?.toUpperCase() ?? null,
    bounds: normalizedBounds(input.target.bounds),
    nicheId: input.nicheId,
    configurationVersion: input.configurationVersion,
    queryVersion: input.queryVersion,
    depth: input.depth,
    parentCoverageKey: input.parentCoverageKey ?? null,
  });
}
