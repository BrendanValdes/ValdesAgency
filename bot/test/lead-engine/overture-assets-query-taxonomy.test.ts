import { describe, expect, it } from "vitest";
import {
  validateOvertureAsset,
  validateOvertureCatalogUrl,
} from "../../src/lead-engine/providers/overture/asset-validator.js";
import {
  assertOverturePlanMatchesCell,
  createOverturePlacesQueryPlan,
  OVERTURE_SELECTED_PLACE_COLUMNS,
} from "../../src/lead-engine/providers/overture/query.js";
import { validateOverturePlaceSchema } from "../../src/lead-engine/providers/overture/schema.js";
import {
  classifyOverturePoolCategory,
  OVERTURE_POOL_SERVICE_TAXONOMY_V1,
  OVERTURE_SUPPORTED_TAXONOMY_FIXTURE,
} from "../../src/lead-engine/providers/overture/taxonomy.js";
import {
  SYNTHETIC_OVERTURE_ASSET,
  SYNTHETIC_OVERTURE_RELEASE,
  SYNTHETIC_OVERTURE_SCHEMA,
  syntheticPhoenixCell,
  syntheticQueryPlan,
} from "./fixtures/overture/synthetic-live.js";

describe("Overture official asset validation", () => {
  it("accepts only a pinned official places/place GeoParquet asset", () => {
    expect(validateOvertureAsset(SYNTHETIC_OVERTURE_ASSET)).toEqual(SYNTHETIC_OVERTURE_ASSET);
    expect(() => validateOvertureAsset({ ...SYNTHETIC_OVERTURE_ASSET, theme: "buildings" })).toThrow("places/place");
    expect(() => validateOvertureAsset({ ...SYNTHETIC_OVERTURE_ASSET, featureType: "division" })).toThrow("places/place");
    expect(() => validateOvertureAsset({ ...SYNTHETIC_OVERTURE_ASSET, releaseId: "2026-06-17.0" })).toThrow("pinned release");
  });

  it("rejects arbitrary buckets, hosts, paths, credentials, queries, and non-HTTPS URLs", () => {
    const cases = [
      SYNTHETIC_OVERTURE_ASSET.url.replace("overturemaps-us-west-2", "arbitrary-bucket"),
      SYNTHETIC_OVERTURE_ASSET.url.replace("s3.us-west-2.amazonaws.com", "example.invalid"),
      SYNTHETIC_OVERTURE_ASSET.url.replace("theme=places", "theme=buildings"),
      SYNTHETIC_OVERTURE_ASSET.url.replace("part-synthetic.parquet", "%2e%2e%2fsecret.parquet"),
      SYNTHETIC_OVERTURE_ASSET.url.replace("https://", "http://"),
      SYNTHETIC_OVERTURE_ASSET.url.replace("https://", "https://user:password@"),
      `${SYNTHETIC_OVERTURE_ASSET.url}?signature=synthetic`,
      SYNTHETIC_OVERTURE_ASSET.url.replace("part-synthetic.parquet", "prefix/"),
    ];
    for (const url of cases) {
      expect(() => validateOvertureAsset({ ...SYNTHETIC_OVERTURE_ASSET, url })).toThrow();
    }
  });

  it("restricts catalog and redirect destinations to fixed official templates", () => {
    expect(validateOvertureCatalogUrl("https://stac.overturemaps.org/catalog.json")).toBe(
      "https://stac.overturemaps.org/catalog.json",
    );
    // The four official per-release documents, and nothing else.
    for (const path of [
      `/${SYNTHETIC_OVERTURE_RELEASE}/catalog.json`,
      `/${SYNTHETIC_OVERTURE_RELEASE}/places/catalog.json`,
      `/${SYNTHETIC_OVERTURE_RELEASE}/places/place/collection.json`,
      `/${SYNTHETIC_OVERTURE_RELEASE}/places/place/00001/00001.json`,
    ]) {
      expect(validateOvertureCatalogUrl(
        `https://stac.overturemaps.org${path}`,
        SYNTHETIC_OVERTURE_RELEASE,
      )).toBe(`https://stac.overturemaps.org${path}`);
    }
    expect(() => validateOvertureCatalogUrl("https://redirect.invalid/catalog.json")).toThrow("host");
    for (const rejected of [
      // The previously assumed collection path does not exist officially.
      `/${SYNTHETIC_OVERTURE_RELEASE}/collections/places.json`,
      // No other theme, type, or partition shape is an approved destination.
      `/${SYNTHETIC_OVERTURE_RELEASE}/buildings/catalog.json`,
      `/${SYNTHETIC_OVERTURE_RELEASE}/places/building/collection.json`,
      `/${SYNTHETIC_OVERTURE_RELEASE}/places/place/0001/0001.json`,
      `/${SYNTHETIC_OVERTURE_RELEASE}/places/place/00001/00002.json`,
      `/${SYNTHETIC_OVERTURE_RELEASE}/places/place/00001/00001.json.bak`,
      `/${SYNTHETIC_OVERTURE_RELEASE}/places/place/`,
    ]) {
      expect(() => validateOvertureCatalogUrl(
        `https://stac.overturemaps.org${rejected}`,
        SYNTHETIC_OVERTURE_RELEASE,
      )).toThrow("templates");
    }
  });
});

describe("bounded typed Overture query planning", () => {
  it("creates a deterministic bbox-bound plan with only reviewed columns and no SQL surface", () => {
    const first = syntheticQueryPlan();
    const second = syntheticQueryPlan();
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.selectedColumns).toEqual(OVERTURE_SELECTED_PLACE_COLUMNS);
    expect(first).toMatchObject({ theme: "places", featureType: "place", maxRows: 100 });
    expect(first.areaSquareKm).toBeGreaterThan(0);
    expect(first.areaSquareKm).toBeLessThanOrEqual(25);
    expect(first).not.toHaveProperty("sql");
    expect(first).not.toHaveProperty("predicate");
    expect(first).not.toHaveProperty("url");
  });

  it("rejects reversed, out-of-range, nonfinite, oversized, and over-limit queries", () => {
    const cell = syntheticPhoenixCell();
    const invalidBounds = [
      { ...cell.bounds, west: cell.bounds.east },
      { ...cell.bounds, west: -181 },
      { ...cell.bounds, north: 91 },
      { ...cell.bounds, south: Number.NaN },
      { west: -113, south: 33, east: -112, north: 34 },
    ];
    for (const bounds of invalidBounds) {
      expect(() => createOverturePlacesQueryPlan({
        releaseId: SYNTHETIC_OVERTURE_RELEASE,
        coverageCell: { ...cell, bounds },
        maxRows: 100,
        maxAreaSquareKm: 25,
      })).toThrow();
    }
    expect(() => createOverturePlacesQueryPlan({
      releaseId: SYNTHETIC_OVERTURE_RELEASE,
      coverageCell: cell,
      maxRows: 2_001,
      maxAreaSquareKm: 25,
    })).toThrow("between 1 and 2000");
  });

  it("rejects plans whose derived area or fingerprint was altered after planning", () => {
    const cell = syntheticPhoenixCell();
    const plan = syntheticQueryPlan();
    expect(() => assertOverturePlanMatchesCell({
      ...plan,
      areaSquareKm: plan.areaSquareKm / 2,
    }, cell)).toThrow("does not match");
    expect(() => assertOverturePlanMatchesCell({
      ...plan,
      fingerprint: "overture_query_tampered",
    }, cell)).toThrow("does not match");
  });
});

describe("versioned Overture pool-service taxonomy", () => {
  it("contains every configured value in the supported taxonomy fixture", () => {
    const fixture = new Set<string>(OVERTURE_SUPPORTED_TAXONOMY_FIXTURE);
    const configured = [
      ...OVERTURE_POOL_SERVICE_TAXONOMY_V1.strong,
      ...OVERTURE_POOL_SERVICE_TAXONOMY_V1.supporting,
      ...OVERTURE_POOL_SERVICE_TAXONOMY_V1.review,
      ...OVERTURE_POOL_SERVICE_TAXONOMY_V1.excluded,
    ];
    expect(configured.every((value) => fixture.has(value))).toBe(true);
    expect(new Set(configured).size).toBe(configured.length);
  });

  it.each([
    ["pool_cleaning_service", "strong"],
    ["pool_and_spa_service", "supporting"],
    ["swimming_pool", "review"],
    ["swimming_pool_supply_store", "review"],
    ["water_park", "excluded"],
  ] as const)("classifies %s as %s without business-name keyword inference", (primary, expected) => {
    expect(classifyOverturePoolCategory({
      basicCategory: primary,
      taxonomy: { primary, hierarchy: [], alternates: [] },
    }).disposition).toBe(expected);
  });

  it("treats hierarchy/alternate service matches as supporting and missing taxonomy as missing", () => {
    expect(classifyOverturePoolCategory({
      basicCategory: "recreation_center",
      taxonomy: {
        primary: "recreation_center",
        hierarchy: ["pool_cleaning_service"],
        alternates: [],
      },
    })).toMatchObject({ disposition: "supporting", matchedCategories: expect.arrayContaining(["pool_cleaning_service"]) });
    expect(classifyOverturePoolCategory({
      basicCategory: null,
      taxonomy: { primary: null, hierarchy: [], alternates: [] },
    }).disposition).toBe("missing");
  });
});

describe("Overture schema-drift contract", () => {
  it("accepts the supported schema and safe additive optional fields without legacy categories", () => {
    expect(validateOverturePlaceSchema(SYNTHETIC_OVERTURE_SCHEMA)).toBe(SYNTHETIC_OVERTURE_SCHEMA);
    expect(SYNTHETIC_OVERTURE_SCHEMA.fields.some(({ name }) => name === "categories")).toBe(false);
  });

  it("fails closed on required-field removal, incompatible types, and future schema versions", () => {
    const missing = {
      ...SYNTHETIC_OVERTURE_SCHEMA,
      fields: SYNTHETIC_OVERTURE_SCHEMA.fields.filter(({ name }) => name !== "taxonomy"),
    };
    expect(() => validateOverturePlaceSchema(missing)).toThrow("taxonomy");
    const incompatible = {
      ...SYNTHETIC_OVERTURE_SCHEMA,
      fields: SYNTHETIC_OVERTURE_SCHEMA.fields.map((field) =>
        field.name === "confidence" ? { ...field, type: "string" } : field
      ),
    };
    expect(() => validateOverturePlaceSchema(incompatible)).toThrow("confidence");
    expect(() => validateOverturePlaceSchema({
      ...SYNTHETIC_OVERTURE_SCHEMA,
      schemaVersion: "2.0.0",
    })).toThrow("unsupported");
  });
});
