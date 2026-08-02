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
  SYNTHETIC_OVERTURE_RELEASE_PIN,
  syntheticBudget,
} from "./fixtures/overture/synthetic-live.js";

const olderRelease = "2026-06-17.0";

function response(url: string, value: unknown): OvertureCatalogResponse {
  const body = typeof value === "string" ? value : JSON.stringify(value);
  return {
    url,
    body,
    bytes: Buffer.byteLength(body),
    checksum: createHash("sha256").update(body).digest("hex"),
  };
}

function rootCatalog(releases = [olderRelease, SYNTHETIC_OVERTURE_RELEASE]) {
  return {
    stac_version: "1.0.0",
    type: "Catalog",
    id: "overturemaps",
    description: "Synthetic Overture STAC root contract",
    links: releases.map((release) => ({
      rel: "child",
      href: `https://stac.overturemaps.org/${release}/catalog.json`,
      title: release,
    })),
  };
}

function releaseCatalog(release: string, id = release) {
  return {
    stac_version: "1.0.0",
    type: "Catalog",
    id,
    description: "Synthetic immutable release catalog",
    links: [{
      rel: "child",
      href: `https://stac.overturemaps.org/${release}/collections/places.json`,
      title: "places",
    }],
  };
}

function placesCollection(release: string, overrides: Record<string, unknown> = {}) {
  return {
    stac_version: "1.0.0",
    type: "Collection",
    id: "places",
    description: "Synthetic Places collection contract",
    license: "CDLA-Permissive-2.0",
    attribution: "Synthetic Overture Maps Foundation attribution metadata",
    overture_release_id: release,
    overture_schema_version: OVERTURE_PLACES_SCHEMA_CONTRACT_VERSION,
    links: [],
    assets: {
      synthetic: {
        href: `https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/release/${release}/theme=places/type=place/part-synthetic.parquet`,
        type: "application/vnd.apache.parquet",
        roles: ["data"],
        overture_theme: "places",
        overture_type: "place",
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
  return new Map([
    [OVERTURE_STAC_CATALOG_URL, rootCatalog()],
    [`https://stac.overturemaps.org/${release}/catalog.json`, releaseCatalog(release)],
    [`https://stac.overturemaps.org/${release}/collections/places.json`, placesCollection(release)],
  ]);
}

describe("Overture official STAC release resolver", () => {
  it("resolves latest to one immutable release and resolves an explicit pin", async () => {
    const latest = await resolverFor(validRoutes()).resolve({
      requestedRelease: "latest",
      signal: new AbortController().signal,
    });
    expect(latest).toMatchObject({
      releaseId: SYNTHETIC_OVERTURE_RELEASE,
      schemaVersion: OVERTURE_PLACES_SCHEMA_CONTRACT_VERSION,
      license: "CDLA-Permissive-2.0",
    });
    expect(latest.assets).toHaveLength(1);

    const routes = validRoutes(olderRelease);
    routes.set(OVERTURE_STAC_CATALOG_URL, rootCatalog());
    const explicit = await resolverFor(routes).resolve({
      requestedRelease: olderRelease,
      signal: new AbortController().signal,
    });
    expect(explicit.releaseId).toBe(olderRelease);
  });

  it("resolves relative STAC link hrefs against their containing document", async () => {
    // The official root catalog publishes child links as document-relative
    // hrefs. Treating them as absolute drops every release candidate and the
    // resolver reports release_missing against a perfectly valid catalog.
    const release = SYNTHETIC_OVERTURE_RELEASE;
    const routes = new Map<string, unknown>([
      [OVERTURE_STAC_CATALOG_URL, {
        ...rootCatalog([release]),
        links: [{ rel: "child", href: `./${release}/catalog.json`, title: release }],
      }],
      [`https://stac.overturemaps.org/${release}/catalog.json`, {
        ...releaseCatalog(release),
        links: [{ rel: "child", href: "./collections/places.json", title: "places" }],
      }],
      [`https://stac.overturemaps.org/${release}/collections/places.json`, placesCollection(release)],
    ]);
    await expect(resolverFor(routes).resolve({
      requestedRelease: "latest",
      signal: new AbortController().signal,
    })).resolves.toMatchObject({ releaseId: release });
  });

  it("rejects a relative child link that resolves off the approved catalog host", async () => {
    // Resolution must not widen the destination set: a protocol-relative href
    // still has to clear the host and path-template checks.
    const release = SYNTHETIC_OVERTURE_RELEASE;
    const routes = new Map<string, unknown>([
      [OVERTURE_STAC_CATALOG_URL, {
        ...rootCatalog([release]),
        links: [{ rel: "child", href: `//stac.evil.example/${release}/catalog.json`, title: release }],
      }],
    ]);
    await expect(resolverFor(routes).resolve({
      requestedRelease: "latest",
      signal: new AbortController().signal,
    })).rejects.toMatchObject({ code: "asset_invalid" });
  });

  it("orders same-day release revisions numerically and rejects noncanonical revisions", async () => {
    const ninth = "2026-07-23.9";
    const tenth = "2026-07-23.10";
    const routes = new Map<string, unknown>([
      [OVERTURE_STAC_CATALOG_URL, rootCatalog([ninth, tenth])],
      [`https://stac.overturemaps.org/${tenth}/catalog.json`, releaseCatalog(tenth)],
      [`https://stac.overturemaps.org/${tenth}/collections/places.json`, placesCollection(tenth)],
    ]);
    await expect(resolverFor(routes).resolve({
      requestedRelease: "latest",
      signal: new AbortController().signal,
    })).resolves.toMatchObject({ releaseId: tenth });
    await expect(resolverFor(new Map()).resolve({
      requestedRelease: "2026-07-23.010",
      signal: new AbortController().signal,
    })).rejects.toMatchObject({ code: "release_invalid" });
  });

  it("rejects malformed and oversized catalog JSON", async () => {
    const malformed = new Map<string, unknown>([[OVERTURE_STAC_CATALOG_URL, "{"]]);
    await expect(resolverFor(malformed).resolve({
      requestedRelease: "latest",
      signal: new AbortController().signal,
    })).rejects.toMatchObject({ code: "catalog_invalid", retryable: false });

    const oversizedBody = " ".repeat(512 * 1024 + 1);
    const transport = createTestOnlyOvertureCatalogTransport(async (request) =>
      response(request.url, oversizedBody)
    );
    const oversized = new OvertureReleaseResolver({
      transport,
      budget: syntheticBudget({ maxDownloadedBytes: 2 * 1024 * 1024 }),
      clock: { now: () => "2026-08-01T12:00:00.000Z" },
    });
    await expect(oversized.resolve({
      requestedRelease: "latest",
      signal: new AbortController().signal,
    })).rejects.toMatchObject({ code: "catalog_oversized" });
  });

  it("rejects unapproved catalog links before a second destination is contacted", async () => {
    const calls: string[] = [];
    const maliciousRoot = rootCatalog();
    maliciousRoot.links[1]!.href = `https://unapproved.example/${SYNTHETIC_OVERTURE_RELEASE}/catalog.json`;
    await expect(resolverFor(new Map([[OVERTURE_STAC_CATALOG_URL, maliciousRoot]]), calls).resolve({
      requestedRelease: "latest",
      signal: new AbortController().signal,
    })).rejects.toMatchObject({ code: "asset_invalid", category: "authorization_failed" });
    expect(calls).toEqual([OVERTURE_STAC_CATALOG_URL]);
  });

  it("fails closed on unsupported schemas, missing assets, and conflicting release metadata", async () => {
    const unsupported = validRoutes();
    unsupported.set(
      `https://stac.overturemaps.org/${SYNTHETIC_OVERTURE_RELEASE}/collections/places.json`,
      placesCollection(SYNTHETIC_OVERTURE_RELEASE, { overture_schema_version: "2.0.0" }),
    );
    await expect(resolverFor(unsupported).resolve({
      requestedRelease: "latest",
      signal: new AbortController().signal,
    })).rejects.toMatchObject({ code: "schema_unsupported" });

    const missing = validRoutes();
    missing.set(
      `https://stac.overturemaps.org/${SYNTHETIC_OVERTURE_RELEASE}/collections/places.json`,
      placesCollection(SYNTHETIC_OVERTURE_RELEASE, { assets: {} }),
    );
    await expect(resolverFor(missing).resolve({
      requestedRelease: "latest",
      signal: new AbortController().signal,
    })).rejects.toMatchObject({ code: "asset_invalid" });

    const conflict = validRoutes();
    conflict.set(
      `https://stac.overturemaps.org/${SYNTHETIC_OVERTURE_RELEASE}/catalog.json`,
      releaseCatalog(SYNTHETIC_OVERTURE_RELEASE, olderRelease),
    );
    await expect(resolverFor(conflict).resolve({
      requestedRelease: "latest",
      signal: new AbortController().signal,
    })).rejects.toMatchObject({ code: "catalog_invalid" });
  });

  it("reuses a persisted pin without silently resolving latest again", async () => {
    const calls: string[] = [];
    const resolver = resolverFor(new Map(), calls);
    const resumed = await resolver.resolve({
      requestedRelease: "latest",
      existingPin: SYNTHETIC_OVERTURE_RELEASE_PIN,
      signal: new AbortController().signal,
    });
    expect(resumed).toBe(SYNTHETIC_OVERTURE_RELEASE_PIN);
    expect(calls).toEqual([]);
    await expect(resolver.resolve({
      requestedRelease: olderRelease,
      existingPin: SYNTHETIC_OVERTURE_RELEASE_PIN,
      signal: new AbortController().signal,
    })).rejects.toMatchObject({ code: "release_changed" });
  });

  it("rejects cancellation and untrusted transports", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(resolverFor(new Map()).resolve({
      requestedRelease: "latest",
      signal: controller.signal,
    })).rejects.toMatchObject({ code: "cancelled" });
    expect(() => new OvertureReleaseResolver({
      transport: { get: async () => response(OVERTURE_STAC_CATALOG_URL, {}) },
      budget: syntheticBudget(),
      clock: { now: () => "2026-08-01T12:00:00.000Z" },
    })).toThrow("not trusted");
  });
});
