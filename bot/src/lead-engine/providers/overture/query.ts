import type { BoundingArea, CoverageCell } from "../../geography/types.js";
import { stableId } from "../../shared/stable.js";
import { overtureFailure } from "./errors.js";
import {
  OVERTURE_FEATURE_TYPE,
  OVERTURE_POOL_TAXONOMY_MAPPING_VERSION,
  OVERTURE_THEME,
  type OverturePlacesQueryPlan,
} from "./types.js";
import { validateOvertureReleaseId } from "./asset-validator.js";

export const OVERTURE_MAX_PLAN_ROWS = 2_000;

export const OVERTURE_SELECTED_PLACE_COLUMNS = Object.freeze([
  "id",
  "version",
  "sources",
  "names",
  "basic_category",
  "taxonomy",
  "confidence",
  "operating_status",
  "websites",
  "emails",
  "phones",
  "addresses",
  "geometry",
] as const);

function checkedBounds(bounds: BoundingArea): BoundingArea {
  const coordinates = [bounds.west, bounds.south, bounds.east, bounds.north];
  if (!coordinates.every(Number.isFinite)) {
    throw overtureFailure("query_invalid", "Overture bounding-box coordinates must be finite", {
      category: "policy_blocked",
    });
  }
  if (bounds.west < -180 || bounds.east > 180 || bounds.south < -90 || bounds.north > 90 ||
    bounds.west >= bounds.east || bounds.south >= bounds.north) {
    throw overtureFailure("query_invalid", "Overture bounding box is reversed or outside longitude/latitude bounds", {
      category: "policy_blocked",
    });
  }
  return Object.freeze({ ...bounds });
}

export function boundingAreaSquareKm(bounds: BoundingArea): number {
  const checked = checkedBounds(bounds);
  const middleLatitudeRadians = ((checked.south + checked.north) / 2) * Math.PI / 180;
  const widthKm = (checked.east - checked.west) * 111.32 * Math.cos(middleLatitudeRadians);
  const heightKm = (checked.north - checked.south) * 110.574;
  return Number((widthKm * heightKm).toFixed(6));
}

export function createOverturePlacesQueryPlan(input: {
  releaseId: string;
  coverageCell: CoverageCell;
  maxRows: number;
  maxAreaSquareKm: number;
}): OverturePlacesQueryPlan {
  const releaseId = validateOvertureReleaseId(input.releaseId);
  const bounds = checkedBounds(input.coverageCell.bounds);
  if (!input.coverageCell.coverageKey.trim()) {
    throw overtureFailure("query_invalid", "Overture query requires an explicit coverage-cell key", {
      category: "policy_blocked",
    });
  }
  // Phase 5A.2 calibration bound: a bounded candidate-yield traversal crosses
  // several row groups, so the plan admits up to OVERTURE_MAX_PLAN_ROWS decoded
  // rows. Still a hard ceiling — the traversal also stops on candidate target,
  // byte, request, runtime, and cancellation limits.
  if (!Number.isSafeInteger(input.maxRows) || input.maxRows < 1 || input.maxRows > OVERTURE_MAX_PLAN_ROWS) {
    throw overtureFailure("query_invalid", `Overture row limit must be between 1 and ${OVERTURE_MAX_PLAN_ROWS}`, {
      category: "policy_blocked",
    });
  }
  const areaSquareKm = boundingAreaSquareKm(bounds);
  if (!Number.isFinite(input.maxAreaSquareKm) || input.maxAreaSquareKm <= 0 ||
    areaSquareKm > input.maxAreaSquareKm) {
    throw overtureFailure("query_invalid", "Overture coverage cell exceeds the geographic-area limit", {
      category: "budget_blocked",
    });
  }
  const fingerprintInput = {
    version: "overture-places-query-1.0.0",
    releaseId,
    theme: OVERTURE_THEME,
    featureType: OVERTURE_FEATURE_TYPE,
    coverageKey: input.coverageCell.coverageKey,
    bounds,
    selectedColumns: OVERTURE_SELECTED_PLACE_COLUMNS,
    taxonomyMappingVersion: OVERTURE_POOL_TAXONOMY_MAPPING_VERSION,
    maxRows: input.maxRows,
  } as const;
  return Object.freeze({
    ...fingerprintInput,
    areaSquareKm,
    fingerprint: stableId("overture_query", fingerprintInput),
  });
}

export function assertOverturePlanMatchesCell(
  plan: OverturePlacesQueryPlan,
  cell: CoverageCell,
): void {
  const canonical = createOverturePlacesQueryPlan({
    releaseId: plan.releaseId,
    coverageCell: cell,
    maxRows: plan.maxRows,
    maxAreaSquareKm: 100,
  });
  if (plan.version !== canonical.version ||
    plan.coverageKey !== canonical.coverageKey ||
    JSON.stringify(plan.bounds) !== JSON.stringify(canonical.bounds) ||
    plan.areaSquareKm !== canonical.areaSquareKm ||
    plan.theme !== canonical.theme || plan.featureType !== canonical.featureType ||
    plan.taxonomyMappingVersion !== canonical.taxonomyMappingVersion ||
    plan.selectedColumns.join("\u0000") !== canonical.selectedColumns.join("\u0000") ||
    plan.fingerprint !== canonical.fingerprint) {
    throw overtureFailure("query_invalid", "Overture query plan does not match its approved coverage cell", {
      category: "policy_blocked",
    });
  }
}
