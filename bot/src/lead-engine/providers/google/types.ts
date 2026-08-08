/**
 * Google Places API (New) Text Search discovery — shared constants.
 *
 * Discovery is TRANSIENT here. Google supplies exactly three things and nothing
 * else ever enters the durable record:
 *
 *   1. `places.id`         — the place id, kept only as a dedupe key;
 *   2. `places.websiteUri` — the official website to hand to the existing crawler;
 *   3. `places.displayName`— the expected business name, used transiently to
 *                            attach the website and corroborate identity.
 *
 * The field mask below is the enforcement mechanism, not a convention: the
 * response literally cannot contain a phone number, a formatted address, a
 * category, a rating, or a business status, because we never ask for them. A
 * later reader cannot accidentally promote a Google fact into evidence, since no
 * Google fact beyond the three above is ever received.
 *
 * Every durable qualification fact — service fit, geography, identity, phone,
 * email, conversion gaps — comes from the crawled official website through the
 * unchanged assessment, extraction, and qualification stages.
 */

/**
 * Policy provider slot used for Google Places discovery.
 *
 * `search` is the checked-in, disabled-by-default public-web discovery provider.
 * It is activated only inside a throwaway policy tree for one bounded run.
 */
export const GOOGLE_PLACES_PROVIDER_ID = "search";

export const GOOGLE_PLACES_TEXT_SEARCH_URL =
  "https://places.googleapis.com/v1/places:searchText";

export const GOOGLE_PLACES_HOST = "places.googleapis.com";

/**
 * The minimal field mask. Adding a field here is a policy change, not a tweak:
 * it widens what Google data the pipeline can physically see.
 */
export const GOOGLE_PLACES_FIELD_MASK =
  "places.id,places.websiteUri,places.displayName,nextPageToken";

export const GOOGLE_PLACES_ADAPTER_VERSION = "google-places-text-search-1.0.0";

/** Google returns at most 20 results per page and at most 3 pages per query. */
export const GOOGLE_PLACES_MAX_PAGE_SIZE = 20;
export const GOOGLE_PLACES_MAX_PAGES_PER_QUERY = 3;

/**
 * The five discovery queries. Fixed and versioned so a resumed or repeated run
 * searches exactly the same space.
 */
export const GOOGLE_POOL_SERVICE_QUERIES: ReadonlyArray<string> = Object.freeze([
  "pool cleaning service",
  "pool service",
  "pool maintenance",
  "swimming pool service",
  "pool repair",
]);

/** Foundation/waterproofing discovery vocabulary; no generic drainage query. */
export const GOOGLE_FOUNDATION_WATERPROOFING_QUERIES: ReadonlyArray<string> = Object.freeze([
  "foundation repair",
  "basement waterproofing",
  "crawl space repair",
  "foundation contractor",
  "structural foundation repair",
  "foundation waterproofing",
]);

/**
 * One transient place observation. Deliberately narrow: there is no field on
 * this type that could carry a Google phone, address, category, or rating.
 */
export interface GooglePlaceObservation {
  /** Provider place id — dedupe key only. */
  readonly placeId: string;
  /** Official website URI as published by the provider, or null. */
  readonly websiteUri: string | null;
  /** Display name, transient: used to attach and corroborate, never persisted as a fact. */
  readonly displayName: string | null;
}

export interface GoogleTextSearchPage {
  readonly places: ReadonlyArray<GooglePlaceObservation>;
  readonly nextPageToken: string | null;
  readonly downloadedBytes: number;
}
