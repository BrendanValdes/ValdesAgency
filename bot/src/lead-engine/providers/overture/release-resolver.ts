import { createHash } from "node:crypto";
import { z } from "zod";
import type { BoundingArea } from "../../geography/types.js";
import type { OvertureBudgetTracker } from "./budgets.js";
import {
  OVERTURE_ASSET_HOSTS,
  OVERTURE_PLACES_ITEM_PATH,
  OVERTURE_STAC_CATALOG_URL,
  validateOvertureAsset,
  validateOvertureCatalogUrl,
  validateOvertureReleaseId,
} from "./asset-validator.js";
import {
  assertTrustedOvertureCatalogTransport,
  type OvertureCatalogResponse,
  type OvertureCatalogTransport,
} from "./catalog-transport.js";
import { overtureFailure } from "./errors.js";
import {
  OVERTURE_FEATURE_TYPE,
  OVERTURE_PLACES_SCHEMA_CONTRACT_VERSION,
  OVERTURE_THEME,
  type OvertureReleasePin,
} from "./types.js";

const MAX_CATALOG_BYTES = 512 * 1024;

/**
 * Official Overture Places STAC topology, as published (verified against the
 * live catalog, release 2026-07-22.0):
 *
 *   /catalog.json                                   Catalog, lists releases
 *   /<release>/catalog.json                         Catalog, lists themes
 *   /<release>/places/catalog.json                  Catalog id="places"
 *   /<release>/places/place/collection.json         Collection id="place"
 *   /<release>/places/place/<NNNNN>/<NNNNN>.json    Item, one GeoParquet partition
 *
 * The collection carries `extent.spatial.bbox` as one bbox per partition, in the
 * same order as its `item` links, so the partition covering a coverage cell is
 * chosen from the collection alone. Only the intersecting item is then fetched,
 * which keeps a full resolution at four metadata reads plus one item read.
 *
 * The official documents do NOT carry overture_release_id, overture_schema_version,
 * asset `roles`, `overture_theme`, or `overture_type`. Release, theme, and type
 * identity are therefore derived from the pinned release context and the validated
 * URL templates, never from self-declared document fields.
 */

// STAC versions this reader is known to be compatible with. Anything else fails
// closed rather than being parsed on optimistic assumptions.
const SUPPORTED_STAC_VERSIONS = ["1.0.0", "1.1.0"] as const;

const linkSchema = z.object({
  rel: z.string().trim().min(1),
  href: z.string().trim().min(1),
  type: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).optional(),
});

const catalogSchema = z.object({
  stac_version: z.enum(SUPPORTED_STAC_VERSIONS),
  type: z.literal("Catalog"),
  id: z.string().trim().min(1),
  description: z.string(),
  links: z.array(linkSchema).max(10_000),
});

const bboxSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);

const placesCollectionSchema = z.object({
  stac_version: z.enum(SUPPORTED_STAC_VERSIONS),
  type: z.literal("Collection"),
  id: z.literal(OVERTURE_FEATURE_TYPE),
  description: z.string().trim().min(1),
  license: z.string().trim().min(1),
  links: z.array(linkSchema).max(10_000),
  extent: z.object({
    spatial: z.object({ bbox: z.array(bboxSchema).min(1).max(4_096) }),
  }),
});

// Assets as actually published: an href and a declared media type. No roles and
// no overture_* discriminators exist on the official documents, so none are
// required here; theme and type are enforced through the asset URL template.
const itemAssetSchema = z.object({
  href: z.string().trim().min(1),
  type: z.string().trim().min(1),
});

const placesItemSchema = z.object({
  stac_version: z.enum(SUPPORTED_STAC_VERSIONS),
  type: z.literal("Feature"),
  id: z.string().trim().min(1),
  collection: z.literal(OVERTURE_FEATURE_TYPE),
  bbox: bboxSchema,
  assets: z.record(z.string().trim().min(1), itemAssetSchema),
});

function strictJson(response: OvertureCatalogResponse): unknown {
  if (response.bytes !== Buffer.byteLength(response.body, "utf8") ||
    response.checksum !== createHash("sha256").update(response.body).digest("hex")) {
    throw overtureFailure("catalog_invalid", "Overture catalog transport metadata is inconsistent", {
      category: "schema_validation_failed",
    });
  }
  try {
    return JSON.parse(response.body) as unknown;
  } catch {
    throw overtureFailure("catalog_invalid", "Overture catalog response is malformed JSON", {
      category: "schema_validation_failed",
    });
  }
}

/**
 * STAC link hrefs are routinely relative to the document that contains them, so
 * they must be resolved against that document's URL before matching or
 * validating. Resolution cannot widen the approved destination set:
 * validateOvertureCatalogUrl still pins the host and the exact path templates,
 * so a protocol-relative or traversal href is rejected downstream.
 */
function resolveLinkHref(href: string, baseUrl: string): URL | null {
  try {
    return new URL(href, baseUrl);
  } catch {
    return null;
  }
}

function releaseFromLink(
  link: z.infer<typeof linkSchema>,
  baseUrl: string,
): { releaseId: string; href: string } | null {
  if (link.rel !== "child") return null;
  const url = resolveLinkHref(link.href, baseUrl);
  if (!url) return null;
  const match = url.pathname.match(/^\/(\d{4}-\d{2}-\d{2}\.\d+)\/catalog\.json$/);
  return match ? { releaseId: match[1] as string, href: url.href } : null;
}

function chooseRelease(
  links: ReadonlyArray<z.infer<typeof linkSchema>>,
  requestedRelease: "latest" | string,
  baseUrl: string,
): { releaseId: string; url: string } {
  const candidates = new Map<string, string>();
  for (const link of links) {
    const resolved = releaseFromLink(link, baseUrl);
    if (!resolved) continue;
    validateOvertureReleaseId(resolved.releaseId);
    const url = validateOvertureCatalogUrl(resolved.href, resolved.releaseId);
    const existing = candidates.get(resolved.releaseId);
    if (existing && existing !== url) {
      throw overtureFailure("release_ambiguous", "Overture catalog contains conflicting links for one release", {
        category: "schema_validation_failed",
      });
    }
    candidates.set(resolved.releaseId, url);
  }
  const releaseId = requestedRelease === "latest"
    ? [...candidates.keys()].sort((left, right) => {
        const [leftDate, leftRevision] = left.split(".") as [string, string];
        const [rightDate, rightRevision] = right.split(".") as [string, string];
        return leftDate.localeCompare(rightDate) || Number(leftRevision) - Number(rightRevision);
      }).at(-1)
    : validateOvertureReleaseId(requestedRelease);
  if (!releaseId || !candidates.has(releaseId)) {
    throw overtureFailure("release_missing", "Requested Overture release is not present in the official catalog", {
      category: "schema_validation_failed",
    });
  }
  return { releaseId, url: candidates.get(releaseId) as string };
}

/**
 * Select the single child link that matches one exact expected pathname. Any
 * other count is ambiguous and fails closed rather than picking a winner.
 */
function soleChildLinkTo(
  links: ReadonlyArray<z.infer<typeof linkSchema>>,
  baseUrl: string,
  expectedPathname: string,
  detail: string,
): URL {
  const matches = links
    .filter((link) => link.rel === "child")
    .map((link) => resolveLinkHref(link.href, baseUrl))
    .filter((url): url is URL => url !== null && url.pathname === expectedPathname);
  if (matches.length !== 1) {
    throw overtureFailure("catalog_invalid", detail, { category: "schema_validation_failed" });
  }
  return matches[0] as URL;
}

function intersects(bbox: readonly [number, number, number, number], bounds: BoundingArea): boolean {
  const [west, south, east, north] = bbox;
  if (![west, south, east, north].every((value) => Number.isFinite(value))) return false;
  if (west > east || south > north) return false;
  return !(east < bounds.west || west > bounds.east || north < bounds.south || south > bounds.north);
}

export interface OvertureReleaseResolutionAudit {
  readonly requestedRelease: string;
  readonly releaseId: string;
  readonly schemaVersion: string;
  readonly catalogUrls: ReadonlyArray<string>;
  readonly assetIds: ReadonlyArray<string>;
  readonly resolvedAt: string;
}

export class OvertureReleaseResolver {
  readonly #transport: OvertureCatalogTransport;
  readonly #budget: OvertureBudgetTracker;
  readonly #clock: { now(): string };
  readonly #audit: { record(event: OvertureReleaseResolutionAudit): void };
  readonly #maxPartitions: number;

  constructor(input: {
    transport: OvertureCatalogTransport;
    budget: OvertureBudgetTracker;
    clock: { now(): string };
    audit?: { record(event: OvertureReleaseResolutionAudit): void };
    maxPartitions?: number;
  }) {
    assertTrustedOvertureCatalogTransport(input.transport);
    this.#transport = input.transport;
    this.#budget = input.budget;
    this.#clock = input.clock;
    this.#audit = input.audit ?? { record: () => undefined };
    const maxPartitions = input.maxPartitions ?? 1;
    if (!Number.isSafeInteger(maxPartitions) || maxPartitions < 1 || maxPartitions > 4) {
      throw new Error("Overture partition fetch limit must be an integer between 1 and 4");
    }
    this.#maxPartitions = maxPartitions;
  }

  async #get(url: string, releaseId: string | undefined, signal: AbortSignal): Promise<OvertureCatalogResponse> {
    this.#budget.reserveRequest("stac", MAX_CATALOG_BYTES);
    const response = await this.#transport.get({
      url,
      releaseId,
      maximumBytes: MAX_CATALOG_BYTES,
      signal,
    });
    if (response.bytes > MAX_CATALOG_BYTES) {
      throw overtureFailure("catalog_oversized", "Official Overture catalog response exceeds the hard metadata limit", {
        category: "budget_blocked",
      });
    }
    this.#budget.recordDownload(response.bytes);
    return response;
  }

  async resolve(input: {
    requestedRelease: "latest" | string;
    bounds: BoundingArea;
    existingPin?: OvertureReleasePin | null;
    signal: AbortSignal;
  }): Promise<OvertureReleasePin> {
    const requestedRelease = input.requestedRelease === "latest"
      ? "latest"
      : validateOvertureReleaseId(input.requestedRelease);
    if (input.signal.aborted) {
      throw overtureFailure("cancelled", "Overture release resolution was cancelled", {
        category: "cancelled",
      });
    }
    if (input.existingPin) {
      const pinned = validateOvertureReleaseId(input.existingPin.releaseId);
      if (requestedRelease !== "latest" && requestedRelease !== pinned) {
        throw overtureFailure("release_changed", "A resumed Overture run cannot change its pinned release", {
          category: "policy_blocked",
        });
      }
      if (input.existingPin.schemaVersion !== OVERTURE_PLACES_SCHEMA_CONTRACT_VERSION) {
        throw overtureFailure("schema_unsupported", "Persisted Overture release pin uses an unsupported schema", {
          category: "schema_validation_failed",
        });
      }
      for (const asset of input.existingPin.assets) validateOvertureAsset(asset);
      return input.existingPin;
    }

    // Hop 1 — root catalog: choose the immutable release.
    const rootResponse = await this.#get(OVERTURE_STAC_CATALOG_URL, undefined, input.signal);
    const root = catalogSchema.safeParse(strictJson(rootResponse));
    if (!root.success) {
      throw overtureFailure("catalog_invalid", "Official Overture root STAC catalog is incompatible", {
        category: "schema_validation_failed",
      });
    }
    const selected = chooseRelease(root.data.links, requestedRelease, rootResponse.url);

    // Hop 2 — release catalog: the document must self-identify as that release.
    const releaseResponse = await this.#get(selected.url, selected.releaseId, input.signal);
    const releaseCatalog = catalogSchema.safeParse(strictJson(releaseResponse));
    if (!releaseCatalog.success || releaseCatalog.data.id !== selected.releaseId) {
      throw overtureFailure("catalog_invalid", "Overture release catalog metadata conflicts with the selected release", {
        category: "schema_validation_failed",
      });
    }

    // Hop 3 — places theme catalog, at the one approved theme path.
    const themeUrl = validateOvertureCatalogUrl(
      soleChildLinkTo(
        releaseCatalog.data.links,
        releaseResponse.url,
        `/${selected.releaseId}/${OVERTURE_THEME}/catalog.json`,
        "Overture release must contain exactly one Places theme catalog",
      ).href,
      selected.releaseId,
    );
    const themeResponse = await this.#get(themeUrl, selected.releaseId, input.signal);
    const themeCatalog = catalogSchema.safeParse(strictJson(themeResponse));
    if (!themeCatalog.success || themeCatalog.data.id !== OVERTURE_THEME) {
      throw overtureFailure("catalog_invalid", "Overture Places theme catalog metadata is incompatible", {
        category: "schema_validation_failed",
      });
    }

    // Hop 4 — place collection, at the one approved type path.
    const collectionUrl = validateOvertureCatalogUrl(
      soleChildLinkTo(
        themeCatalog.data.links,
        themeResponse.url,
        `/${selected.releaseId}/${OVERTURE_THEME}/${OVERTURE_FEATURE_TYPE}/collection.json`,
        "Overture Places theme must contain exactly one place collection",
      ).href,
      selected.releaseId,
    );
    const collectionResponse = await this.#get(collectionUrl, selected.releaseId, input.signal);
    const collection = placesCollectionSchema.safeParse(strictJson(collectionResponse));
    if (!collection.success) {
      throw overtureFailure("catalog_invalid", "Overture place collection metadata is incompatible", {
        category: "schema_validation_failed",
      });
    }

    // The official attribution pointer is a real link on the collection. It is
    // recorded for lineage and never fetched.
    const attributionLink = collection.data.links.find((link) => link.rel === "license");
    const attribution = attributionLink
      ? resolveLinkHref(attributionLink.href, collectionResponse.url)
      : null;
    if (!attribution || attribution.protocol !== "https:" || attribution.username || attribution.password) {
      throw overtureFailure("catalog_invalid", "Overture place collection is missing a usable attribution link", {
        category: "schema_validation_failed",
      });
    }

    const itemUrls = collection.data.links
      .filter((link) => link.rel === "item")
      .map((link) => resolveLinkHref(link.href, collectionResponse.url));
    const partitionBoxes = collection.data.extent.spatial.bbox;
    // Strict 1:1 pairing: one bbox per partition, in item-link order. Any other
    // shape is ambiguous and must not be paired on assumption.
    if (itemUrls.length === 0 || itemUrls.length !== partitionBoxes.length) {
      throw overtureFailure(
        "partition_unresolved",
        "Overture place collection does not pair one spatial extent with each partition",
        { category: "schema_validation_failed" },
      );
    }

    const itemPath = OVERTURE_PLACES_ITEM_PATH(selected.releaseId);
    const selectedItems: URL[] = [];
    for (const [index, itemUrl] of itemUrls.entries()) {
      if (!intersects(partitionBoxes[index] as [number, number, number, number], input.bounds)) continue;
      if (itemUrl === null || itemUrl.hostname !== new URL(collectionResponse.url).hostname ||
        !itemPath.test(itemUrl.pathname)) {
        throw overtureFailure("partition_unresolved", "Overture partition item link is outside the approved template", {
          category: "authorization_failed",
        });
      }
      selectedItems.push(itemUrl);
    }
    if (selectedItems.length === 0) {
      throw overtureFailure("partition_unresolved", "No Overture place partition covers the requested coverage cell", {
        category: "schema_validation_failed",
      });
    }
    if (selectedItems.length > this.#maxPartitions) {
      throw overtureFailure(
        "partition_unresolved",
        "The requested coverage cell spans more Overture partitions than the bounded canary may read",
        { category: "budget_blocked" },
      );
    }

    // Hop 5 — the intersecting partition item(s). Only now are asset URLs known,
    // and no asset host is contacted here: assets are validated as metadata only.
    const assets: ReturnType<typeof validateOvertureAsset>[] = [];
    const itemUrlsRead: string[] = [];
    for (const itemUrl of selectedItems) {
      const validatedItemUrl = validateOvertureCatalogUrl(itemUrl.href, selected.releaseId);
      const itemResponse = await this.#get(validatedItemUrl, selected.releaseId, input.signal);
      itemUrlsRead.push(itemResponse.url);
      const item = placesItemSchema.safeParse(strictJson(itemResponse));
      if (!item.success || !itemPath.test(new URL(itemResponse.url).pathname)) {
        throw overtureFailure("catalog_invalid", "Overture place partition item metadata is incompatible", {
          category: "schema_validation_failed",
        });
      }
      const expectedPartition = new URL(itemResponse.url).pathname.match(itemPath)?.[1];
      if (item.data.id !== expectedPartition) {
        throw overtureFailure("catalog_invalid", "Overture partition item identifier conflicts with its URL", {
          category: "schema_validation_failed",
        });
      }
      // One partition is mirrored across approved asset hosts. Keep a single
      // mirror per partition file so the reader never downloads it twice.
      const byFile = new Map<string, ReturnType<typeof validateOvertureAsset>>();
      for (const [, asset] of Object.entries(item.data.assets)) {
        const resolvedAsset = resolveLinkHref(asset.href, itemResponse.url);
        if (!resolvedAsset) continue;
        const validated = validateOvertureAsset({
          url: resolvedAsset.href,
          releaseId: selected.releaseId,
          // Theme and type come from the pinned context, never from the document.
          theme: OVERTURE_THEME,
          featureType: OVERTURE_FEATURE_TYPE,
          mediaType: asset.type,
        });
        const fileName = new URL(validated.url).pathname.split("/").pop() as string;
        const incumbent = byFile.get(fileName);
        if (!incumbent) {
          byFile.set(fileName, validated);
          continue;
        }
        const rank = (candidate: string): number => {
          const position = (OVERTURE_ASSET_HOSTS as ReadonlyArray<string>).indexOf(new URL(candidate).hostname);
          return position === -1 ? Number.MAX_SAFE_INTEGER : position;
        };
        if (rank(validated.url) < rank(incumbent.url)) byFile.set(fileName, validated);
      }
      assets.push(...byFile.values());
    }
    if (assets.length < 1 || assets.length > 16) {
      throw overtureFailure("asset_invalid", "Overture partition has a missing or unbounded data-asset set", {
        category: "schema_validation_failed",
      });
    }

    const resolvedAt = this.#clock.now();
    const pin: OvertureReleasePin = Object.freeze({
      releaseId: selected.releaseId,
      // The official documents publish no schema version, so the pin records the
      // contract version this reader implements and validates against.
      schemaVersion: OVERTURE_PLACES_SCHEMA_CONTRACT_VERSION,
      catalogUrl: collectionUrl,
      catalogChecksum: collectionResponse.checksum,
      resolvedAt,
      assets: Object.freeze(assets),
      license: collection.data.license,
      attribution: attribution.href,
    });
    this.#audit.record({
      requestedRelease: input.requestedRelease,
      releaseId: pin.releaseId,
      schemaVersion: pin.schemaVersion,
      catalogUrls: Object.freeze([
        rootResponse.url,
        releaseResponse.url,
        themeResponse.url,
        collectionResponse.url,
        ...itemUrlsRead,
      ]),
      assetIds: Object.freeze(pin.assets.map((asset) => asset.assetId)),
      resolvedAt,
    });
    return pin;
  }
}
