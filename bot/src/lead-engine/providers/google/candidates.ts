import {
  safeCandidateUrl,
  type EligibleCandidate,
} from "../../assessment/candidate-gate.js";
import type { CoverageCell } from "../../geography/types.js";
import { GOOGLE_PLACES_ADAPTER_VERSION, type GooglePlaceObservation } from "./types.js";

/**
 * Turn transient Google Places observations into assessable candidates.
 *
 * WHY THIS DOES NOT GO THROUGH THE PROVIDER ENVELOPE. The normalized discovery
 * contract requires a name, categories, a city/region/country address, and an
 * Overture-shaped `providerObservation` (feature version, taxonomy mapping
 * version, sha256 asset ids). A three-field Google result can only satisfy that
 * schema by inventing values. So this maps straight to `EligibleCandidate` — the
 * same struct `selectAssessableCandidates` hands to the assessment stage — and
 * every admissibility rule after that point is the unchanged one.
 *
 * WHAT A GOOGLE CANDIDATE DELIBERATELY LACKS:
 *
 *   - `providerLocation` — no address is requested, so no location row is
 *     written and `legitimacy.location_observed` cannot be awarded. A business
 *     with no stated location is scored as location-missing rather than silently
 *     placed inside the searched market. The geography hard gate only fires when
 *     a persisted location exists, so this costs points and disqualifies nobody.
 *   - `providerCategories` — no category is requested, so service fit is decided
 *     purely by what the crawled website says.
 *   - `providerSourceClass` — with no location and no categories there is
 *     nothing for it to label, so it is omitted rather than set to a class that
 *     misdescribes a live web API.
 *   - `expectedPhones` / `expectedLocality` — absent, so the phone and locality
 *     identity dimensions read `unavailable`. `phoneState` returns `unavailable`
 *     rather than `conflicting` on an empty expected set, so this can never
 *     manufacture an identity conflict; it only means identity must attach on
 *     name, host, and structured-name agreement.
 *
 * WHAT IT MUST CARRY: `discoveredCoverageKey`. The calling queue's scope check
 * matches either a coverage key or a persisted business location. A Google
 * candidate has no location, so the coverage key is its only route into scope —
 * without it every lead is classified outside the queue scope before contact
 * routes are ever evaluated. The key records the rectangle the search was
 * actually restricted to. It is scope lineage, never a business claim, and no
 * qualification rule reads it.
 */

export type GoogleCandidateBlockReason =
  | "no_observed_website"
  | "no_provider_name"
  | "unsafe_candidate_url"
  | "duplicate_candidate";

export interface GoogleCandidateOutcome {
  readonly eligible: ReadonlyArray<EligibleCandidate>;
  /** Aggregate counts only — never a blocked business name or URL. */
  readonly blockedCounts: Readonly<Record<GoogleCandidateBlockReason, number>>;
  readonly consideredCount: number;
}

export function googlePlaceCandidates(input: {
  readonly places: ReadonlyArray<GooglePlaceObservation>;
  /** The coverage cell whose rectangle restricted this search. */
  readonly cell: CoverageCell;
}): GoogleCandidateOutcome {
  const blockedCounts: Record<GoogleCandidateBlockReason, number> = {
    no_observed_website: 0,
    no_provider_name: 0,
    unsafe_candidate_url: 0,
    duplicate_candidate: 0,
  };
  const eligible: EligibleCandidate[] = [];
  const seenKeys = new Set<string>();
  const seenHosts = new Set<string>();

  for (const place of input.places) {
    if (!place.websiteUri) {
      // The pipeline assesses websites. A place with no published site has
      // nothing to crawl, so it is not a candidate at all.
      blockedCounts.no_observed_website += 1;
      continue;
    }
    // A candidate with no provider name is not assessable, and must NOT fall
    // back to the hostname. With locality and phone already unavailable,
    // identity attaches on name plus domain — and a hostname-derived "expected
    // name" makes the domain dimension corroborate itself, so two dimensions
    // would agree on the strength of nothing and the pairing would auto-attach.
    if (!place.displayName) {
      blockedCounts.no_provider_name += 1;
      continue;
    }
    // The gate's own rules, imported rather than reimplemented: hostname, IP,
    // port, credential, scheme, and length checks the fetcher would apply.
    const url = safeCandidateUrl(place.websiteUri);
    if (!url) {
      blockedCounts.unsafe_candidate_url += 1;
      continue;
    }
    // One assessment per place and one per host, matching the envelope gate, so
    // two listings sharing a site never produce two crawls of it.
    if (seenKeys.has(place.placeId) || seenHosts.has(url.hostname)) {
      blockedCounts.duplicate_candidate += 1;
      continue;
    }
    seenKeys.add(place.placeId);
    seenHosts.add(url.hostname);
    eligible.push(Object.freeze({
      candidateKey: place.placeId,
      // The provider's display name is the expected name to corroborate the
      // site against. Transient: it is never persisted as a business fact, and
      // the canonical name comes from the assessed website.
      expectedBusinessName: place.displayName,
      candidateUrl: url.href,
      candidateHost: url.hostname,
      providerPlaceId: place.placeId,
      // No dataset release backs a live API call, so the adapter version is the
      // honest lineage token. Nothing downstream reads it as a release.
      releaseId: GOOGLE_PLACES_ADAPTER_VERSION,
      expectedLocality: null,
      expectedPhones: Object.freeze([]),
      discoveredCoverageKey: input.cell.coverageKey,
    }));
  }

  return Object.freeze({
    eligible: Object.freeze(eligible),
    blockedCounts: Object.freeze(blockedCounts),
    consideredCount: input.places.length,
  });
}
