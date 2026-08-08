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

export const OVERTURE_POOL_SERVICE_CALIBRATION_VERSION =
  "overture_pool_service_category_calibration_v1" as const;

/**
 * Why each admissible Overture identifier does or does not earn service-fit
 * credit.
 *
 * Discovery admissibility (`OVERTURE_POOL_SERVICE_TAXONOMY_V1`) and service-fit
 * credit are deliberately different questions. An identifier can be worth
 * crawling while still being too ambiguous to assert "this is a pool-service
 * operator" on the strength of a dataset field alone. This table records that
 * second decision explicitly, so the configured category vocabulary is derived
 * from a reviewable rationale rather than hand-maintained in two places.
 *
 * `serviceFit: false` never blocks discovery: the candidate is still crawled and
 * its own website can supply service evidence through the normal extraction path.
 */
export const OVERTURE_POOL_SERVICE_CATEGORY_CALIBRATION: ReadonlyArray<Readonly<{
  identifier: string;
  disposition: "strong" | "supporting" | "review" | "excluded";
  serviceFit: boolean;
  rationale: string;
}>> = Object.freeze([
  Object.freeze({
    identifier: "pool_cleaning", disposition: "strong", serviceFit: true,
    rationale: "The identifier official Overture data actually uses for a recurring pool cleaning service. Confirmed against release 2026-07-22.0 over 30,000 decoded Phoenix-metro rows.",
  }),
  Object.freeze({
    identifier: "pool_cleaning_service", disposition: "strong", serviceFit: true,
    rationale: "Unambiguous cleaning-service identifier; same semantics as pool_cleaning with an explicit service suffix.",
  }),
  Object.freeze({
    identifier: "pool_maintenance_service", disposition: "strong", serviceFit: true,
    rationale: "Unambiguous recurring maintenance identifier.",
  }),
  Object.freeze({
    identifier: "swimming_pool_repair_service", disposition: "strong", serviceFit: true,
    rationale: "Unambiguous repair-service identifier; already carried by the v1 vocabulary.",
  }),
  Object.freeze({
    identifier: "swimming_pool_contractor", disposition: "strong", serviceFit: false,
    rationale: "Ambiguous between a new-pool builder and a service contractor. Still crawled, but earns no category credit without service evidence from the business's own site.",
  }),
  Object.freeze({
    identifier: "pool_and_spa_service", disposition: "supporting", serviceFit: false,
    rationale: "Spa-adjacent and supporting-tier; not a strong pool-service assertion on its own.",
  }),
  Object.freeze({
    identifier: "hot_tub_repair_service", disposition: "supporting", serviceFit: false,
    rationale: "Hot-tub work is adjacent, not pool service.",
  }),
  Object.freeze({
    identifier: "hot_tub_and_pool_store", disposition: "review", serviceFit: false,
    rationale: "Retail. Never a contractor.",
  }),
  Object.freeze({
    identifier: "swimming_pool_supply_store", disposition: "review", serviceFit: false,
    rationale: "Retail. Never a contractor.",
  }),
  Object.freeze({
    identifier: "swimming_pool", disposition: "review", serviceFit: false,
    rationale: "A pool as a place, not a business that services pools.",
  }),
  Object.freeze({
    identifier: "public_swimming_pool", disposition: "review", serviceFit: false,
    rationale: "A municipal or public facility, not a business that services pools.",
  }),
  Object.freeze({
    identifier: "recreation_center", disposition: "review", serviceFit: false,
    rationale: "Generic recreation business.",
  }),
  Object.freeze({
    identifier: "water_park", disposition: "excluded", serviceFit: false,
    rationale: "Facility, already excluded from discovery.",
  }),
  Object.freeze({
    identifier: "fountain_contractor", disposition: "excluded", serviceFit: false,
    rationale: "Different trade, already excluded from discovery.",
  }),
  Object.freeze({
    identifier: "pond_contractor", disposition: "excluded", serviceFit: false,
    rationale: "Different trade, already excluded from discovery.",
  }),
]);

/**
 * Identifiers that may earn service-fit credit, sorted and deduplicated.
 *
 * This is the single source the pool-service niche configuration and the ICP
 * category vocabulary are checked against, so the two can never silently drift
 * apart again — which is exactly the defect that made every live lead read
 * `missing:niche.relevant_category`.
 */
export function poolServiceFitCategories(): ReadonlyArray<string> {
  return Object.freeze([...new Set(OVERTURE_POOL_SERVICE_CATEGORY_CALIBRATION
    .filter((entry) => entry.serviceFit)
    .map((entry) => entry.identifier))].sort());
}

/** Admissible-but-not-service-fit identifiers, for exclusion assertions. */
export function poolServiceExcludedFromServiceFit(): ReadonlyArray<string> {
  return Object.freeze([...new Set(OVERTURE_POOL_SERVICE_CATEGORY_CALIBRATION
    .filter((entry) => !entry.serviceFit)
    .map((entry) => entry.identifier))].sort());
}

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
