import { createHash } from "node:crypto";
import { z } from "zod";
import type { OvertureBudgetTracker } from "./budgets.js";
import {
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

const linkSchema = z.object({
  rel: z.string().trim().min(1),
  href: z.string().trim().min(1),
  type: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).optional(),
});

const catalogSchema = z.object({
  stac_version: z.enum(["1.0.0", "1.1.0"]),
  type: z.literal("Catalog"),
  id: z.string().trim().min(1),
  description: z.string(),
  links: z.array(linkSchema).max(10_000),
});

const assetSchema = z.object({
  href: z.string().trim().min(1),
  type: z.enum(["application/vnd.apache.parquet", "application/x-parquet"]),
  roles: z.array(z.string()).max(20),
  overture_theme: z.literal(OVERTURE_THEME),
  overture_type: z.literal(OVERTURE_FEATURE_TYPE),
});

const placesCollectionSchema = z.object({
  stac_version: z.enum(["1.0.0", "1.1.0"]),
  type: z.literal("Collection"),
  id: z.literal(OVERTURE_THEME),
  description: z.string().trim().min(1),
  license: z.string().trim().min(1),
  attribution: z.string().trim().min(1),
  overture_release_id: z.string().trim().min(1),
  overture_schema_version: z.string().trim().min(1),
  links: z.array(linkSchema).max(1_000),
  assets: z.record(z.string().trim().min(1), assetSchema),
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

function releaseFromLink(link: z.infer<typeof linkSchema>): string | null {
  if (link.rel !== "child") return null;
  let url: URL;
  try {
    url = new URL(link.href);
  } catch {
    return null;
  }
  const match = url.pathname.match(/^\/(\d{4}-\d{2}-\d{2}\.\d+)\/catalog\.json$/);
  return match?.[1] ?? null;
}

function chooseRelease(
  links: ReadonlyArray<z.infer<typeof linkSchema>>,
  requestedRelease: "latest" | string,
): { releaseId: string; url: string } {
  const candidates = new Map<string, string>();
  for (const link of links) {
    const releaseId = releaseFromLink(link);
    if (!releaseId) continue;
    validateOvertureReleaseId(releaseId);
    const url = validateOvertureCatalogUrl(link.href, releaseId);
    const existing = candidates.get(releaseId);
    if (existing && existing !== url) {
      throw overtureFailure("release_ambiguous", "Overture catalog contains conflicting links for one release", {
        category: "schema_validation_failed",
      });
    }
    candidates.set(releaseId, url);
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

  constructor(input: {
    transport: OvertureCatalogTransport;
    budget: OvertureBudgetTracker;
    clock: { now(): string };
    audit?: { record(event: OvertureReleaseResolutionAudit): void };
  }) {
    assertTrustedOvertureCatalogTransport(input.transport);
    this.#transport = input.transport;
    this.#budget = input.budget;
    this.#clock = input.clock;
    this.#audit = input.audit ?? { record: () => undefined };
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

    const rootResponse = await this.#get(OVERTURE_STAC_CATALOG_URL, undefined, input.signal);
    const root = catalogSchema.safeParse(strictJson(rootResponse));
    if (!root.success) {
      throw overtureFailure("catalog_invalid", "Official Overture root STAC catalog is incompatible", {
        category: "schema_validation_failed",
      });
    }
    const selected = chooseRelease(root.data.links, requestedRelease);
    const releaseResponse = await this.#get(selected.url, selected.releaseId, input.signal);
    const releaseCatalog = catalogSchema.safeParse(strictJson(releaseResponse));
    if (!releaseCatalog.success || releaseCatalog.data.id !== selected.releaseId) {
      throw overtureFailure("catalog_invalid", "Overture release catalog metadata conflicts with the selected release", {
        category: "schema_validation_failed",
      });
    }
    const collectionLinks = releaseCatalog.data.links.filter((link) =>
      link.rel === "child" && link.href.endsWith("/collections/places.json")
    );
    if (collectionLinks.length !== 1) {
      throw overtureFailure("catalog_invalid", "Overture release must contain exactly one Places collection", {
        category: "schema_validation_failed",
      });
    }
    const collectionUrl = validateOvertureCatalogUrl(
      (collectionLinks[0] as z.infer<typeof linkSchema>).href,
      selected.releaseId,
    );
    const collectionResponse = await this.#get(collectionUrl, selected.releaseId, input.signal);
    const collection = placesCollectionSchema.safeParse(strictJson(collectionResponse));
    if (!collection.success || collection.data.overture_release_id !== selected.releaseId) {
      throw overtureFailure("catalog_invalid", "Overture Places collection metadata conflicts with the release pin", {
        category: "schema_validation_failed",
      });
    }
    if (collection.data.overture_schema_version !== OVERTURE_PLACES_SCHEMA_CONTRACT_VERSION) {
      throw overtureFailure("schema_unsupported", "Overture Places collection schema is unsupported", {
        category: "schema_validation_failed",
      });
    }
    const assetEntries = Object.entries(collection.data.assets).filter(([, asset]) =>
      asset.roles.includes("data")
    );
    if (assetEntries.length < 1 || assetEntries.length > 16) {
      throw overtureFailure("asset_invalid", "Overture Places collection has a missing or unbounded data-asset set", {
        category: "schema_validation_failed",
      });
    }
    const assets = assetEntries.map(([, asset]) => validateOvertureAsset({
      url: asset.href,
      releaseId: selected.releaseId,
      theme: asset.overture_theme,
      featureType: asset.overture_type,
      mediaType: asset.type,
    }));
    const resolvedAt = this.#clock.now();
    const pin: OvertureReleasePin = Object.freeze({
      releaseId: selected.releaseId,
      schemaVersion: collection.data.overture_schema_version,
      catalogUrl: collectionUrl,
      catalogChecksum: collectionResponse.checksum,
      resolvedAt,
      assets: Object.freeze(assets),
      license: collection.data.license,
      attribution: collection.data.attribution,
    });
    this.#audit.record({
      requestedRelease: input.requestedRelease,
      releaseId: pin.releaseId,
      schemaVersion: pin.schemaVersion,
      catalogUrls: Object.freeze([rootResponse.url, releaseResponse.url, collectionResponse.url]),
      assetIds: Object.freeze(pin.assets.map((asset) => asset.assetId)),
      resolvedAt,
    });
    return pin;
  }
}
