import { createHash } from "node:crypto";
import { overtureFailure } from "./errors.js";
import {
  OVERTURE_FEATURE_TYPE,
  OVERTURE_THEME,
  type ValidatedOvertureAsset,
} from "./types.js";

export const OVERTURE_STAC_CATALOG_URL = "https://stac.overturemaps.org/catalog.json";
export const OVERTURE_CATALOG_HOST = "stac.overturemaps.org";
export const OVERTURE_ASSET_HOSTS = Object.freeze([
  "overturemaps-us-west-2.s3.us-west-2.amazonaws.com",
  "overturemapswestus2.blob.core.windows.net",
] as const);

export const OVERTURE_RELEASE_ID_PATTERN = /^\d{4}-\d{2}-\d{2}\.(?:0|[1-9]\d*)$/;

export function validateOvertureReleaseId(value: unknown): string {
  if (typeof value !== "string" || value.length > 32 || !OVERTURE_RELEASE_ID_PATTERN.test(value)) {
    throw overtureFailure("release_invalid", "Overture release identifier is malformed", {
      category: "schema_validation_failed",
    });
  }
  const [date] = value.split(".");
  const revision = Number(value.slice(11));
  const parsed = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== date ||
    !Number.isSafeInteger(revision)) {
    throw overtureFailure("release_invalid", "Overture release identifier contains an invalid date", {
      category: "schema_validation_failed",
    });
  }
  return value;
}

function strictHttpsUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw overtureFailure("asset_invalid", "Overture URL is malformed", {
      category: "authorization_failed",
    });
  }
  if (url.protocol !== "https:" || url.port || url.username || url.password || url.hash || url.search) {
    throw overtureFailure("asset_invalid", "Overture URLs require credential-free HTTPS with no query or fragment", {
      category: "authorization_failed",
    });
  }
  if (/%(?:2e|2f|5c)/i.test(url.pathname) || url.pathname.includes("\\")) {
    throw overtureFailure("asset_invalid", "Overture URL path contains an ambiguous escape", {
      category: "authorization_failed",
    });
  }
  return url;
}

export function validateOvertureCatalogUrl(input: string, releaseId?: string): string {
  const url = strictHttpsUrl(input);
  if (url.hostname !== OVERTURE_CATALOG_HOST) {
    throw overtureFailure("asset_invalid", "Overture catalog URL host is not approved", {
      category: "authorization_failed",
    });
  }
  // Fixed templates only — no wildcards, no arbitrary themes, no caller-supplied
  // paths, no generic STAC traversal. Theme is pinned to OVERTURE_THEME and type
  // to OVERTURE_FEATURE_TYPE, so no other Overture theme is ever an approved
  // destination. These are the only four official documents the resolver reads.
  const allowedPaths = releaseId
    ? new Set([
        `/${validateOvertureReleaseId(releaseId)}/catalog.json`,
        `/${releaseId}/${OVERTURE_THEME}/catalog.json`,
        `/${releaseId}/${OVERTURE_THEME}/${OVERTURE_FEATURE_TYPE}/collection.json`,
      ])
    : new Set(["/catalog.json"]);
  if (allowedPaths.has(url.pathname)) return url.href;
  if (releaseId && OVERTURE_PLACES_ITEM_PATH(releaseId).test(url.pathname)) return url.href;
  throw overtureFailure("asset_invalid", "Overture catalog URL path is outside the fixed catalog templates", {
    category: "authorization_failed",
  });
}

/**
 * Official Places STAC Items live at a fixed zero-padded partition template under
 * the pinned release/theme/type prefix, where the directory and the document
 * share the same 5-digit partition id. This is a fixed shape with a bounded
 * numeric segment — not a wildcard and not generic traversal.
 */
export function OVERTURE_PLACES_ITEM_PATH(releaseId: string): RegExp {
  return new RegExp(
    `^/${validateOvertureReleaseId(releaseId)}/${OVERTURE_THEME}/${OVERTURE_FEATURE_TYPE}/(\\d{5})/\\1\\.json$`,
  );
}

export function validateOvertureAsset(input: {
  url: string;
  releaseId: string;
  theme: string;
  featureType: string;
  mediaType: string;
}): ValidatedOvertureAsset {
  const releaseId = validateOvertureReleaseId(input.releaseId);
  if (input.theme !== OVERTURE_THEME || input.featureType !== OVERTURE_FEATURE_TYPE) {
    throw overtureFailure("asset_invalid", "Only Overture places/place assets are allowed", {
      category: "authorization_failed",
    });
  }
  if (input.mediaType !== "application/vnd.apache.parquet" &&
    input.mediaType !== "application/x-parquet") {
    throw overtureFailure("asset_invalid", "Overture asset is not declared as Parquet", {
      category: "schema_validation_failed",
    });
  }
  const url = strictHttpsUrl(input.url);
  if (!(OVERTURE_ASSET_HOSTS as ReadonlyArray<string>).includes(url.hostname)) {
    throw overtureFailure("asset_invalid", "Overture asset host is not approved", {
      category: "authorization_failed",
    });
  }
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    throw overtureFailure("asset_invalid", "Overture asset path contains malformed encoding", {
      category: "authorization_failed",
    });
  }
  const prefix = `/release/${releaseId}/theme=${OVERTURE_THEME}/type=${OVERTURE_FEATURE_TYPE}/`;
  if (!decodedPath.startsWith(prefix)) {
    throw overtureFailure("asset_invalid", "Overture asset path does not match the pinned release/theme/type", {
      category: "authorization_failed",
    });
  }
  const filename = decodedPath.slice(prefix.length);
  if (!/^[A-Za-z0-9][A-Za-z0-9._=-]{0,180}\.parquet$/.test(filename) || filename.includes("..")) {
    throw overtureFailure("asset_invalid", "Overture asset must identify one bounded GeoParquet file", {
      category: "authorization_failed",
    });
  }
  return Object.freeze({
    assetId: createHash("sha256").update(url.href).digest("hex"),
    url: url.href,
    releaseId,
    theme: OVERTURE_THEME,
    featureType: OVERTURE_FEATURE_TYPE,
    mediaType: input.mediaType,
  });
}
