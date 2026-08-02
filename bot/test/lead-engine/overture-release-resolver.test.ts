import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  OVERTURE_STAC_CATALOG_URL,
} from "../../src/lead-engine/providers/overture/asset-validator.js";
import {
  createTestOnlyOvertureCatalogTransport,
  type OvertureCatalogResponse,
} from "../../src/lead-engine/providers/overture/catalog-transport.js";
import { OvertureReleaseResolver } from "../../src/lead-engine/providers/overture/release-resolver.js";
import { OVERTURE_PLACES_SCHEMA_CONTRACT_VERSION } from "../../src/lead-engine/providers/overture/types.js";
import {
  SYNTHETIC_OVERTURE_RELEASE,
  syntheticBudget,
} from "./fixtures/overture/synthetic-live.js";

const olderRelease = "2026-06-17.0";
const HOST = "https://stac.overturemaps.org";

// The coverage cell the synthetic partition 00001 is built to cover.
const CELL = { west: -112.094, south: 33.438, east: -112.044, north: 33.478 };

function response(url: string, value: unknown): OvertureCatalogResponse {
  const body = typeof value === "string" ? value : JSON.stringify(value);
  return {
    url,
    body,
    bytes: Buffer.byteLength(body),
    checksum: createHash("sha256").update(body).digest("hex"),
  };
}

/**
 * Synthetic mirrors of the official five-level Places topology. Link hrefs are
 * document-relative exactly as the official catalog publishes them.
 */
function rootCatalog(releases = [olderRelease, SYNTHETIC_OVERTURE_RELEASE]) {
  return {
    stac_version: "1.1.0",
    type: "Catalog",
    id: "Overture Releases",
    description: "Synthetic Overture STAC root contract",
    links: [
      { rel: "root", href: "./catalog.json", type: "application/json" },
      ...releases.map((release) => ({
        rel: "child",
        href: `./${release}/catalog.json`,
        type: "application/json",
        title: release,
      })),
    ],
  };
}

function releaseCatalog(release: string, overrides: Record<string, unknown> = {}) {
  return {
    stac_version: "1.1.0",
    type: "Catalog",
    id: release,
    description: "Synthetic immutable release catalog",
    links: [
      { rel: "root", href: "../catalog.json", type: "application/json" },
      { rel: "parent", href: "../catalog.json", type: "application/json" },
      // Sibling themes must be ignored, never followed.
      { rel: "child", href: "./buildings/catalog.json", type: "application/json", title: "buildings" },
      { rel: "child", href: "./places/catalog.json", type: "application/json", title: "places" },
    ],
    ...overrides,
  };
}

function themeCatalog(overrides: Record<string, unknown> = {}) {
  return {
    stac_version: "1.1.0",
    type: "Catalog",
    id: "places",
    description: "Synthetic Overture places theme",
    title: "places",
    links: [
      { rel: "root", href: "../../catalog.json", type: "application/json" },
      { rel: "parent", href: "../catalog.json", type: "application/json" },
      // Off-host non-child links exist officially (pmtiles) and must be ignored.
      { rel: "pmtiles", href: "https://tiles.overturemaps.org/x/places.pmtiles", type: "application/vnd.pmtiles" },
      { rel: "child", href: "./place/collection.json", type: "application/json", title: "place" },
    ],
    ...overrides,
  };
}

const PARTITION_BOXES: Array<[number, number, number, number]> = [
  [-180, -84.84, -75.36, 26.93],
  [-179.11, 26.93, -77.65, 34.35],
  [-179.82, 34.35, -88.1, 81.75],
];

function placeCollection(overrides: Record<string, unknown> = {}) {
  return {
    stac_version: "1.1.0",
    type: "Collection",
    id: "place",
    title: "place",
    description: "Synthetic Overture place collection",
    license: "other",
    features: 74_223_561,
    stac_extensions: ["https://stac-extensions.github.io/table/v1.2.0/schema.json"],
    extent: { spatial: { bbox: PARTITION_BOXES } },
    links: [
      { rel: "root", href: "../../../catalog.json", type: "application/json" },
      { rel: "license", href: "https://docs.overturemaps.org/attribution/", title: "Attribution" },
      { rel: "parent", href: "../catalog.json", type: "application/json" },
      { rel: "item", href: "./00000/00000.json", type: "application/geo+json" },
      { rel: "item", href: "./00001/00001.json", type: "application/geo+json" },
      { rel: "item", href: "./00002/00002.json", type: "application/geo+json" },
    ],
    ...overrides,
  };
}

function partitionItem(release: string, part: string, overrides: Record<string, unknown> = {}) {
  const file = `part-${part}-synthetic-c000.zstd.parquet`;
  return {
    stac_version: "1.1.0",
    type: "Feature",
    id: part,
    collection: "place",
    bbox: PARTITION_BOXES[Number(part)] ?? PARTITION_BOXES[0],
    geometry: null,
    properties: { datetime: "2026-07-22T00:00:00Z", num_rows: 4_639_635, num_row_groups: 512 },
    links: [{ rel: "collection", href: "../collection.json", type: "application/json" }],
    assets: {
      // Officially there are no roles and no overture_* discriminators here.
      aws: {
        href: `https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/release/${release}/theme=places/type=place/${file}`,
        type: "application/vnd.apache.parquet",
      },
      azure: {
        href: `https://overturemapswestus2.blob.core.windows.net/release/${release}/theme=places/type=place/${file}`,
        type: "application/vnd.apache.parquet",
      },
    },
    ...overrides,
  };
}

function resolverFor(routes: ReadonlyMap<string, unknown>, calls: string[] = []) {
  const transport = createTestOnlyOvertureCatalogTransport(async (request) => {
    calls.push(request.url);
    if (!routes.has(request.url)) throw new Error("Unexpected synthetic catalog route");
    return response(request.url, routes.get(request.url));
  });
  return new OvertureReleaseResolver({
    transport,
    budget: syntheticBudget(),
    clock: { now: () => "2026-08-01T12:00:00.000Z" },
  });
}

function validRoutes(release = SYNTHETIC_OVERTURE_RELEASE): Map<string, unknown> {
  return new Map<string, unknown>([
    [OVERTURE_STAC_CATALOG_URL, rootCatalog()],
    [`${HOST}/${release}/catalog.json`, releaseCatalog(release)],
    [`${HOST}/${release}/places/catalog.json`, themeCatalog()],
    [`${HOST}/${release}/places/place/collection.json`, placeCollection()],
    [`${HOST}/${release}/places/place/00001/00001.json`, partitionItem(release, "00001")],
  ]);
}

const resolveArgs = { requestedRelease: "latest" as const, bounds: CELL, signal: new AbortController().signal };

describe("Overture official five-level Places STAC topology", () => {
  it("resolves the real topology through relative links and pins one partition asset", async () => {
    const calls: string[] = [];
    const release = SYNTHETIC_OVERTURE_RELEASE;
    const pin = await resolverFor(validRoutes(), calls).resolve(resolveArgs);

    // Exactly the five official documents, in order, and nothing else.
    expect(calls).toEqual([
      OVERTURE_STAC_CATALOG_URL,
      `${HOST}/${release}/catalog.json`,
      `${HOST}/${release}/places/catalog.json`,
      `${HOST}/${release}/places/place/collection.json`,
      `${HOST}/${release}/places/place/00001/00001.json`,
    ]);
    expect(pin).toMatchObject({
      releaseId: release,
      schemaVersion: OVERTURE_PLACES_SCHEMA_CONTRACT_VERSION,
      license: "other",
      attribution: "https://docs.overturemaps.org/attribution/",
    });
    // Both mirrors describe one partition file; only one is kept.
    expect(pin.assets).toHaveLength(1);
    expect(pin.assets[0]?.url).toContain("overturemaps-us-west-2.s3.us-west-2.amazonaws.com");
    expect(pin.assets[0]?.theme).toBe("places");
    expect(pin.assets[0]?.featureType).toBe("place");
  });

  it("selects only the partition whose extent covers the cell", async () => {
    const calls: string[] = [];
    const release = SYNTHETIC_OVERTURE_RELEASE;
    const routes = validRoutes();
    routes.set(`${HOST}/${release}/places/place/00002/00002.json`, partitionItem(release, "00002"));
    await resolverFor(routes, calls).resolve(resolveArgs);
    expect(calls.filter((url) => url.includes("/place/00"))).toEqual([
      `${HOST}/${release}/places/place/00001/00001.json`,
    ]);
  });

  it("orders same-day release revisions numerically and rejects noncanonical revisions", async () => {
    await expect(resolverFor(new Map()).resolve({
      ...resolveArgs,
      requestedRelease: "2026-07-23.010",
    })).rejects.toMatchObject({ code: "release_invalid" });
  });

  it("keeps an existing pin unchanged across retries without any network call", async () => {
    const calls: string[] = [];
    const first = await resolverFor(validRoutes(), calls).resolve(resolveArgs);
    const callsAfterFirst = calls.length;
    const again = await resolverFor(validRoutes(), calls).resolve({ ...resolveArgs, existingPin: first });
    expect(again).toEqual(first);
    expect(calls.length).toBe(callsAfterFirst);
    await expect(resolverFor(validRoutes()).resolve({
      ...resolveArgs,
      requestedRelease: olderRelease,
      existingPin: first,
    })).rejects.toMatchObject({ code: "release_changed" });
  });

  it("accepts a collection that omits every nonstandard Overture field", async () => {
    const release = SYNTHETIC_OVERTURE_RELEASE;
    const routes = validRoutes();
    const bare = placeCollection();
    // No overture_release_id, no overture_schema_version, no attribution field.
    expect(Object.keys(bare)).not.toContain("overture_release_id");
    expect(Object.keys(bare)).not.toContain("overture_schema_version");
    expect(Object.keys(bare)).not.toContain("attribution");
    routes.set(`${HOST}/${release}/places/place/collection.json`, bare);
    await expect(resolverFor(routes).resolve(resolveArgs)).resolves.toMatchObject({
      schemaVersion: OVERTURE_PLACES_SCHEMA_CONTRACT_VERSION,
    });
  });
});

describe("Overture Places topology containment", () => {
  const release = SYNTHETIC_OVERTURE_RELEASE;

  it("rejects a wrong-theme child link instead of following it", async () => {
    const routes = validRoutes();
    routes.set(`${HOST}/${release}/catalog.json`, releaseCatalog(release, {
      links: [{ rel: "child", href: "./buildings/catalog.json", type: "application/json" }],
    }));
    await expect(resolverFor(routes).resolve(resolveArgs)).rejects.toMatchObject({ code: "catalog_invalid" });
  });

  it("rejects a theme catalog that self-identifies as another theme", async () => {
    const routes = validRoutes();
    routes.set(`${HOST}/${release}/places/catalog.json`, themeCatalog({ id: "buildings" }));
    await expect(resolverFor(routes).resolve(resolveArgs)).rejects.toMatchObject({ code: "catalog_invalid" });
  });

  it("rejects a collection whose type is not the pinned place type", async () => {
    const routes = validRoutes();
    routes.set(`${HOST}/${release}/places/place/collection.json`, placeCollection({ id: "building" }));
    await expect(resolverFor(routes).resolve(resolveArgs)).rejects.toMatchObject({ code: "catalog_invalid" });
  });

  it("rejects a release catalog that conflicts with the selected release", async () => {
    const routes = validRoutes();
    routes.set(`${HOST}/${release}/catalog.json`, releaseCatalog(release, { id: olderRelease }));
    await expect(resolverFor(routes).resolve(resolveArgs)).rejects.toMatchObject({ code: "catalog_invalid" });
  });

  it("rejects an item whose identifier conflicts with its partition URL", async () => {
    const routes = validRoutes();
    routes.set(`${HOST}/${release}/places/place/00001/00001.json`, partitionItem(release, "00001", { id: "00002" }));
    await expect(resolverFor(routes).resolve(resolveArgs)).rejects.toMatchObject({ code: "catalog_invalid" });
  });

  it("rejects an asset that points at another release", async () => {
    const routes = validRoutes();
    routes.set(`${HOST}/${release}/places/place/00001/00001.json`, partitionItem(release, "00001", {
      assets: {
        aws: {
          href: `https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/release/${olderRelease}/theme=places/type=place/part-00001-x.parquet`,
          type: "application/vnd.apache.parquet",
        },
      },
    }));
    await expect(resolverFor(routes).resolve(resolveArgs)).rejects.toMatchObject({ code: "asset_invalid" });
  });

  it("rejects an asset served from an unapproved host", async () => {
    const routes = validRoutes();
    routes.set(`${HOST}/${release}/places/place/00001/00001.json`, partitionItem(release, "00001", {
      assets: {
        aws: {
          href: `https://cdn.evil.example/release/${release}/theme=places/type=place/part-00001-x.parquet`,
          type: "application/vnd.apache.parquet",
        },
      },
    }));
    await expect(resolverFor(routes).resolve(resolveArgs)).rejects.toMatchObject({ code: "asset_invalid" });
  });

  it("rejects an asset that is not declared as Parquet", async () => {
    const routes = validRoutes();
    routes.set(`${HOST}/${release}/places/place/00001/00001.json`, partitionItem(release, "00001", {
      assets: {
        aws: {
          href: `https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/release/${release}/theme=places/type=place/part-00001-x.parquet`,
          type: "application/geo+json",
        },
      },
    }));
    await expect(resolverFor(routes).resolve(resolveArgs)).rejects.toMatchObject({ code: "asset_invalid" });
  });

  it("rejects a protocol-relative child link that resolves off the approved host", async () => {
    const routes = validRoutes();
    routes.set(OVERTURE_STAC_CATALOG_URL, {
      ...rootCatalog(),
      links: [{ rel: "child", href: `//stac.evil.example/${release}/catalog.json`, title: release }],
    });
    await expect(resolverFor(routes).resolve(resolveArgs)).rejects.toMatchObject({ code: "asset_invalid" });
  });

  it("rejects a traversal href that climbs outside the pinned release prefix", async () => {
    const routes = validRoutes();
    routes.set(`${HOST}/${release}/places/catalog.json`, themeCatalog({
      links: [{ rel: "child", href: `../../${olderRelease}/places/place/collection.json`, type: "application/json" }],
    }));
    await expect(resolverFor(routes).resolve(resolveArgs)).rejects.toMatchObject({ code: "catalog_invalid" });
  });

  it("rejects an encoded-traversal item href", async () => {
    const routes = validRoutes();
    routes.set(`${HOST}/${release}/places/place/collection.json`, placeCollection({
      links: [
        { rel: "license", href: "https://docs.overturemaps.org/attribution/" },
        { rel: "item", href: "./00000/00000.json" },
        { rel: "item", href: "./%2e%2e/%2e%2e/00001/00001.json" },
        { rel: "item", href: "./00002/00002.json" },
      ],
    }));
    await expect(resolverFor(routes).resolve(resolveArgs)).rejects.toMatchObject({ code: "partition_unresolved" });
  });

  it("rejects a malformed catalog document", async () => {
    const routes = validRoutes();
    routes.set(OVERTURE_STAC_CATALOG_URL, "{not json");
    await expect(resolverFor(routes).resolve(resolveArgs)).rejects.toMatchObject({ code: "catalog_invalid" });
  });

  it("rejects an incompatible STAC version rather than parsing it optimistically", async () => {
    const routes = validRoutes();
    routes.set(`${HOST}/${release}/places/place/collection.json`, placeCollection({ stac_version: "0.9.0" }));
    await expect(resolverFor(routes).resolve(resolveArgs)).rejects.toMatchObject({ code: "catalog_invalid" });
  });

  it("rejects a persisted pin whose schema contract no longer matches", async () => {
    const first = await resolverFor(validRoutes()).resolve(resolveArgs);
    await expect(resolverFor(validRoutes()).resolve({
      ...resolveArgs,
      existingPin: { ...first, schemaVersion: "0.0.1-unsupported" },
    })).rejects.toMatchObject({ code: "schema_unsupported" });
  });

  it("fails closed when partition extents do not pair one-to-one with item links", async () => {
    const routes = validRoutes();
    routes.set(`${HOST}/${release}/places/place/collection.json`, placeCollection({
      extent: { spatial: { bbox: [PARTITION_BOXES[0], PARTITION_BOXES[1]] } },
    }));
    await expect(resolverFor(routes).resolve(resolveArgs)).rejects.toMatchObject({ code: "partition_unresolved" });
  });

  it("fails closed when no partition covers the cell, and when too many do", async () => {
    await expect(resolverFor(validRoutes()).resolve({
      ...resolveArgs,
      bounds: { west: 100, south: 10, east: 101, north: 11 },
    })).rejects.toMatchObject({ code: "partition_unresolved" });

    await expect(resolverFor(validRoutes()).resolve({
      ...resolveArgs,
      bounds: { west: -179, south: -80, east: -80, north: 80 },
    })).rejects.toMatchObject({ code: "partition_unresolved" });
  });

  it("does not widen the approved destination set beyond the five official documents", async () => {
    const calls: string[] = [];
    await resolverFor(validRoutes(), calls).resolve(resolveArgs);
    const allowed = new Set([
      OVERTURE_STAC_CATALOG_URL,
      `${HOST}/${release}/catalog.json`,
      `${HOST}/${release}/places/catalog.json`,
      `${HOST}/${release}/places/place/collection.json`,
      `${HOST}/${release}/places/place/00001/00001.json`,
    ]);
    for (const call of calls) {
      expect(allowed.has(call)).toBe(true);
      expect(new URL(call).hostname).toBe("stac.overturemaps.org");
    }
    // The off-host pmtiles link and sibling theme catalogs are never contacted.
    expect(calls.some((url) => url.includes("tiles.overturemaps.org"))).toBe(false);
    expect(calls.some((url) => url.includes("/buildings/"))).toBe(false);
  });
});
