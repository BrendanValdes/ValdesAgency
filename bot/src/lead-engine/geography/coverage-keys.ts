import { stableId } from "../shared/stable.js";
import type { BoundingArea, GeographyTarget } from "./types.js";

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
