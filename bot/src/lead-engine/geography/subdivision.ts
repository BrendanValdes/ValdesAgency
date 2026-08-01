import { coverageKey, normalizedBounds } from "./coverage-keys.js";
import type { CoverageCell, GeographyTarget } from "./types.js";

export function boundsOverlap(left: CoverageCell, right: CoverageCell): boolean {
  return (
    Math.min(left.bounds.east, right.bounds.east) > Math.max(left.bounds.west, right.bounds.west) &&
    Math.min(left.bounds.north, right.bounds.north) > Math.max(left.bounds.south, right.bounds.south)
  );
}

export function subdivideCell(
  parent: CoverageCell,
  minimumSpan: number,
): CoverageCell[] {
  const width = parent.bounds.east - parent.bounds.west;
  const height = parent.bounds.north - parent.bounds.south;
  if (width / 2 < minimumSpan || height / 2 < minimumSpan) return [];
  const midX = Number(((parent.bounds.west + parent.bounds.east) / 2).toFixed(6));
  const midY = Number(((parent.bounds.south + parent.bounds.north) / 2).toFixed(6));
  const quadrants = [
    { suffix: "sw", bounds: { west: parent.bounds.west, south: parent.bounds.south, east: midX, north: midY } },
    { suffix: "se", bounds: { west: midX, south: parent.bounds.south, east: parent.bounds.east, north: midY } },
    { suffix: "nw", bounds: { west: parent.bounds.west, south: midY, east: midX, north: parent.bounds.north } },
    { suffix: "ne", bounds: { west: midX, south: midY, east: parent.bounds.east, north: parent.bounds.north } },
  ] as const;
  return quadrants.map(({ suffix, bounds }) => {
    const target: GeographyTarget = {
      level: "grid_cell",
      label: `${parent.label} ${suffix}`,
      countryCode: parent.countryCode,
      subdivisionCode: parent.subdivisionCode,
      bounds: normalizedBounds(bounds),
    };
    return {
      coverageKey: coverageKey({
        target,
        nicheId: parent.nicheId,
        configurationVersion: parent.configurationVersion,
        queryVersion: parent.queryVersion,
        depth: parent.depth + 1,
        parentCoverageKey: parent.coverageKey,
      }),
      parentCoverageKey: parent.coverageKey,
      level: target.level,
      label: target.label,
      countryCode: target.countryCode,
      subdivisionCode: target.subdivisionCode ?? null,
      bounds: target.bounds,
      depth: parent.depth + 1,
      strategy: parent.strategy,
      nicheId: parent.nicheId,
      configurationVersion: parent.configurationVersion,
      queryVersion: parent.queryVersion,
      status: "pending",
      stopReason: null,
    };
  });
}

