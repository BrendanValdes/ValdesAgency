import { planCoverage } from "../geography/coverage-planner.js";
import { boundingAreaSquareKm } from "../providers/overture/query.js";
import type { BoundingArea, CoverageManifest, GeographyTarget } from "../geography/types.js";

/**
 * Pool-service market windows.
 *
 * WHY THIS SIZE — measured, after getting it wrong once.
 *
 * The first attempt enlarged windows to ~50 km², reasoning from a funnel that
 * showed 59% of decoded rows falling outside a 20.6 km² cell. A live pass proved
 * that wrong: 17 of 20 passes threw before reading a single row. The official
 * partition is finely spatially ordered, so roughly six row groups already
 * intersect a 20.6 km² cell; a 50 km² window intersects more than the row-group
 * pruner's fail-closed ceiling of 16 and the traversal correctly refuses to run.
 *
 * So cell geometry is pinned back to the size the provider demonstrably serves,
 * and volume comes from the only lever that is actually free: MORE cells. The
 * provider caps a plan at OVERTURE_MAX_PLAN_ROWS (2,000) rows per cell, so
 * candidates scale with cells, not with cell area. Tiling several configured
 * markets supplies the cell count; the per-pass asset session stops each cell
 * from re-paying for bytes a previous cell in the same pass already fetched.
 *
 * COVERAGE SIZING. A calibration run measured the real density: 20 eligible
 * candidates from 251 windows, i.e. ~0.08 eligible per 20 km² window, or one
 * usable lead per ~258 km² of metro. Reaching 100 assessed candidates therefore
 * needs on the order of 1,250 windows, which is why five metro rings are tiled
 * at full extent rather than a handful of hand-picked suburbs.
 *
 * Nothing about admissibility changes. These are ordinary planner cells with real
 * bounds, every decoded row is still point-in-bounds filtered against its own
 * cell, and the category, operating-status, identity, robots, and geography gates
 * are untouched. Each window stays far inside the 100 km² geographic-area ceiling
 * and well inside the row-group fail-closed rail.
 */

/**
 * Half-extents matching the cell geometry the provider serves without tripping
 * the row-group fail-closed rail: ~20 km² per window across these latitudes.
 */
const WINDOW_HALF_WIDTH_DEGREES = 0.025;
const WINDOW_HALF_HEIGHT_DEGREES = 0.02;

export const POOL_SERVICE_MARKET_WINDOW_VERSION = "pool-service-market-windows-1.1.0" as const;

/**
 * Residential metro areas for the pool-service niche, in the order the business
 * actually targets them. Each bounding box covers the suburban ring where
 * owner-operated pool-service contractors work, not the downtown core.
 */
export interface PoolServiceMarket {
  readonly id: string;
  readonly label: string;
  readonly countryCode: string;
  readonly subdivisionCode: string;
  readonly bounds: BoundingArea;
}

export const POOL_SERVICE_MARKETS: ReadonlyArray<PoolServiceMarket> = Object.freeze([
  Object.freeze({
    id: "las_vegas_nv", label: "Las Vegas metro", countryCode: "US", subdivisionCode: "NV",
    bounds: Object.freeze({ west: -115.42, south: 35.90, east: -114.88, north: 36.36 }),
  }),
  Object.freeze({
    id: "phoenix_az", label: "Phoenix metro", countryCode: "US", subdivisionCode: "AZ",
    bounds: Object.freeze({ west: -112.72, south: 33.16, east: -111.50, north: 33.88 }),
  }),
  Object.freeze({
    id: "tucson_az", label: "Tucson metro", countryCode: "US", subdivisionCode: "AZ",
    bounds: Object.freeze({ west: -111.18, south: 32.00, east: -110.66, north: 32.46 }),
  }),
  Object.freeze({
    id: "san_diego_ca", label: "San Diego metro", countryCode: "US", subdivisionCode: "CA",
    bounds: Object.freeze({ west: -117.32, south: 32.54, east: -116.78, north: 33.28 }),
  }),
  Object.freeze({
    id: "inland_empire_ca", label: "Inland Empire metro", countryCode: "US", subdivisionCode: "CA",
    bounds: Object.freeze({ west: -117.62, south: 33.72, east: -116.86, north: 34.20 }),
  }),
]);

function round(value: number): number {
  return Number(value.toFixed(6));
}

/**
 * Tile one market into non-overlapping windows.
 *
 * Windows are laid out from the market's south-west corner and clipped to the
 * market bounds, so no window can extend past the market it belongs to. A clipped
 * edge window smaller than a third of a full window is dropped rather than
 * queried: a sliver costs a full 2,000-row plan for very little area.
 */
export function marketWindows(market: PoolServiceMarket): ReadonlyArray<GeographyTarget> {
  const width = WINDOW_HALF_WIDTH_DEGREES * 2;
  const height = WINDOW_HALF_HEIGHT_DEGREES * 2;
  const targets: GeographyTarget[] = [];
  const columns = Math.ceil((market.bounds.east - market.bounds.west) / width);
  const rows = Math.ceil((market.bounds.north - market.bounds.south) / height);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const west = round(market.bounds.west + column * width);
      const south = round(market.bounds.south + row * height);
      const east = round(Math.min(west + width, market.bounds.east));
      const north = round(Math.min(south + height, market.bounds.north));
      if (east <= west || north <= south) continue;
      if ((east - west) < width / 3 || (north - south) < height / 3) continue;
      const bounds = Object.freeze({ west, south, east, north });
      // Fail closed rather than plan a window the provider would refuse.
      if (boundingAreaSquareKm(bounds) > 25) {
        throw new Error(`Market window for ${market.id} exceeds the served cell geometry`);
      }
      targets.push(Object.freeze({
        level: "grid_cell" as const,
        label: `${market.label} ${row}-${column}`,
        countryCode: market.countryCode,
        subdivisionCode: market.subdivisionCode,
        bounds,
        density: "dense" as const,
      }));
    }
  }
  return Object.freeze(targets);
}

export function poolServiceMarketTargets(
  marketIds?: ReadonlyArray<string>,
): ReadonlyArray<GeographyTarget> {
  const selected = marketIds
    ? POOL_SERVICE_MARKETS.filter((market) => marketIds.includes(market.id))
    : POOL_SERVICE_MARKETS;
  if (selected.length === 0) throw new Error("At least one configured pool-service market is required");
  if (marketIds && selected.length !== new Set(marketIds).size) {
    throw new Error("Unknown pool-service market id");
  }
  return Object.freeze(selected.flatMap((market) => marketWindows(market)));
}

/**
 * Plan the market coverage manifest.
 *
 * `maxDepth: 0` keeps every window exactly as tiled: the planner never subdivides
 * a window into something smaller than the read window it was sized for. The
 * planner sorts by coverage key, which is a hash, so successive bounded passes
 * naturally interleave markets instead of draining one metro first.
 */
export function planPoolServiceMarketCoverage(input: {
  configurationVersion: string;
  queryVersion: string;
  marketIds?: ReadonlyArray<string>;
  maxWindows?: number;
  windowOffset?: number;
}): CoverageManifest {
  const manifest = planCoverage({
    nicheId: "pool_service",
    configurationVersion: input.configurationVersion,
    queryVersion: input.queryVersion,
    strategy: "dense",
    targets: poolServiceMarketTargets(input.marketIds),
    resultCap: 100,
    maxDepth: 0,
  });
  const offset = input.windowOffset ?? 0;
  const limit = input.maxWindows ?? manifest.cells.length;
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new Error("Market window offset must be a nonnegative integer");
  }
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new Error("Market window budget must be a positive integer");
  }
  return Object.freeze({
    ...manifest,
    cells: Object.freeze(manifest.cells.slice(offset, offset + limit)),
  });
}

/** Which market a planned window belongs to, for market-level reporting. */
export function marketIdForLabel(label: string): string {
  const market = POOL_SERVICE_MARKETS.find((entry) => label.startsWith(entry.label));
  return market?.id ?? "unknown_market";
}
