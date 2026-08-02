import type {
  OvertureCategoryInput,
  OverturePoolCategoryDecision,
} from "./types.js";
import {
  OVERTURE_POOL_TAXONOMY_MAPPING_VERSION,
  OVERTURE_TAXONOMY_ARTIFACT_VERSION,
} from "./types.js";

/**
 * v2 adds the identifiers the official Overture places taxonomy actually
 * publishes, verified against release 2026-07-22.0 over 30,000 decoded rows in
 * the Phoenix metro: the service category is `pool_cleaning` and the retailer is
 * `hot_tub_and_pool_store`. The v1 values were assumed rather than observed and
 * never matched a single record. They are retained because other regions and
 * releases may still use them, and dropping a mapped value would silently
 * reclassify anything that does.
 */
export const OVERTURE_SUPPORTED_TAXONOMY_FIXTURE = Object.freeze([
  "pool_cleaning",
  "hot_tub_and_pool_store",
  "pool_cleaning_service",
  "pool_maintenance_service",
  "swimming_pool_contractor",
  "swimming_pool_repair_service",
  "pool_and_spa_service",
  "hot_tub_repair_service",
  "swimming_pool_supply_store",
  "swimming_pool",
  "public_swimming_pool",
  "recreation_center",
  "water_park",
  "fountain_contractor",
  "pond_contractor",
] as const);

export const OVERTURE_POOL_SERVICE_TAXONOMY_V1 = Object.freeze({
  version: OVERTURE_POOL_TAXONOMY_MAPPING_VERSION,
  taxonomyArtifactVersion: OVERTURE_TAXONOMY_ARTIFACT_VERSION,
  strong: Object.freeze([
    // Observed identifier for a pool cleaning service in official Overture data.
    "pool_cleaning",
    "pool_cleaning_service",
    "pool_maintenance_service",
    "swimming_pool_contractor",
    "swimming_pool_repair_service",
  ]),
  supporting: Object.freeze([
    "pool_and_spa_service",
    "hot_tub_repair_service",
  ]),
  review: Object.freeze([
    // Observed identifier for a pool/spa supply retailer — retail, not a
    // contractor, so it stays in review exactly like the assumed value did.
    "hot_tub_and_pool_store",
    "swimming_pool_supply_store",
    "swimming_pool",
    "public_swimming_pool",
    "recreation_center",
  ]),
  excluded: Object.freeze([
    "water_park",
    "fountain_contractor",
    "pond_contractor",
  ]),
});

function normalized(values: ReadonlyArray<string | null>): string[] {
  return [...new Set(values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim().toLocaleLowerCase("en-US"))
    .filter(Boolean))].sort();
}

function intersection(values: ReadonlyArray<string>, configured: ReadonlyArray<string>): string[] {
  const allowed = new Set(configured);
  return values.filter((value) => allowed.has(value));
}

export function classifyOverturePoolCategory(
  input: OvertureCategoryInput,
): OverturePoolCategoryDecision {
  const authoritative = normalized([input.basicCategory, input.taxonomy.primary]);
  const contextual = normalized([
    ...input.taxonomy.hierarchy,
    ...input.taxonomy.alternates,
  ]);
  const all = normalized([...authoritative, ...contextual]);
  const excluded = intersection(all, OVERTURE_POOL_SERVICE_TAXONOMY_V1.excluded);
  const strong = intersection(authoritative, OVERTURE_POOL_SERVICE_TAXONOMY_V1.strong);
  const supporting = intersection(authoritative, OVERTURE_POOL_SERVICE_TAXONOMY_V1.supporting);
  const review = intersection(all, OVERTURE_POOL_SERVICE_TAXONOMY_V1.review);
  const contextualService = intersection(
    contextual,
    [...OVERTURE_POOL_SERVICE_TAXONOMY_V1.strong, ...OVERTURE_POOL_SERVICE_TAXONOMY_V1.supporting],
  );
  const disposition = excluded.length > 0
    ? "excluded"
    : strong.length > 0
      ? "strong"
      : supporting.length > 0 || contextualService.length > 0
        ? "supporting"
        : review.length > 0
          ? "review"
          : all.length === 0 ? "missing" : "review";
  return Object.freeze({
    disposition,
    matchedCategories: Object.freeze(normalized([
      ...excluded,
      ...strong,
      ...supporting,
      ...contextualService,
      ...review,
    ])),
    mappingVersion: OVERTURE_POOL_TAXONOMY_MAPPING_VERSION,
    taxonomyArtifactVersion: OVERTURE_TAXONOMY_ARTIFACT_VERSION,
  });
}
