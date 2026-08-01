export const GEOGRAPHY_LEVELS = [
  "country",
  "state",
  "county",
  "metro",
  "city",
  "bounding_area",
  "grid_cell",
] as const;

export type GeographyLevel = (typeof GEOGRAPHY_LEVELS)[number];
export type CoverageStatus =
  | "completed"
  | "partial"
  | "blocked"
  | "failed"
  | "pending";

export interface BoundingArea {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface GeographyTarget {
  level: GeographyLevel;
  label: string;
  countryCode: string;
  subdivisionCode?: string | null;
  bounds: BoundingArea;
  density?: "dense" | "rural";
}

export interface CoverageCell {
  coverageKey: string;
  parentCoverageKey: string | null;
  level: GeographyLevel;
  label: string;
  countryCode: string;
  subdivisionCode: string | null;
  bounds: BoundingArea;
  depth: number;
  strategy: "dense" | "rural" | "adaptive";
  nicheId: string;
  configurationVersion: string;
  queryVersion: string;
  status: CoverageStatus;
  stopReason: "maximum_depth" | "minimum_span" | null;
}

export interface CoverageManifest {
  manifestId: string;
  nicheId: string;
  configurationVersion: string;
  queryVersion: string;
  strategy: "dense" | "rural" | "adaptive";
  resultCap: number;
  maxDepth: number;
  minimumSpan: number;
  cells: ReadonlyArray<CoverageCell>;
  overlaps: ReadonlyArray<{ left: string; right: string }>;
}

