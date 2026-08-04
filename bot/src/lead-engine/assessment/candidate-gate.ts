import type { NormalizedDiscoveryResult, ProviderEnvelope } from "../providers/contracts.js";
import { normalizeWebUrl, UrlSafetyError } from "../crawl/url-safety.js";
import type { ProvenanceSourceClass } from "../domain/provenance.js";

/**
 * Phase 5B admission gate.
 *
 * Only an accepted, conflict-free discovery candidate with a usable observed
 * website URL may enter the live crawl. Review, rejected, stale, ambiguous, and
 * duplicate candidates are excluded here rather than being filtered later, so a
 * blocked candidate is never handed to a fetcher at all.
 *
 * An Overture website value is an OBSERVED candidate URL, never a verified
 * domain. The gate only decides whether it is safe and in-scope to look at.
 */

export type CandidateBlockReason =
  | "not_accepted"
  | "review_disposition"
  | "supporting_disposition"
  | "not_operating"
  | "no_observed_website"
  | "unsafe_candidate_url"
  | "duplicate_candidate";

/**
 * A provider-observed postal location, exactly as the discovery provider stated
 * it. Every field is required by the normalized discovery schema, so this is
 * only ever populated from a value the provider actually supplied — an absent or
 * unparsable address yields `null` rather than a guessed locality.
 */
export interface ProviderObservedLocation {
  readonly line1: string | null;
  readonly city: string;
  readonly region: string;
  readonly postalCode: string | null;
  /** ISO 3166-1 alpha-2, uppercased. */
  readonly countryCode: string;
}

export interface EligibleCandidate {
  /** Stable key derived from the provider place id, used for dedupe and ids. */
  readonly candidateKey: string;
  readonly expectedBusinessName: string;
  /** Observed, public-unverified candidate URL. Not a verified domain. */
  readonly candidateUrl: string;
  readonly candidateHost: string;
  readonly providerPlaceId: string | null;
  readonly releaseId: string;
  /** Provider-observed locality, used only for identity corroboration. */
  readonly expectedLocality: string | null;
  /** Provider-observed public phones, used only for identity corroboration. */
  readonly expectedPhones: ReadonlyArray<string>;
  /**
   * Coverage cell this candidate was actually discovered in, when discovery
   * traversed cells. Pure scope lineage: it records *where we looked*, never a
   * business claim, and no qualification rule reads it.
   */
  readonly discoveredCoverageKey?: string | null;
  /**
   * Provider-observed category identifiers for this place, carried verbatim.
   *
   * Discovery already reads these to decide admissibility; the assessment stage
   * needs them too so the unchanged service-fit rules can see a
   * `provider_category` basis. They are an OBSERVATION from the discovery
   * provider, never a verification and never a website claim.
   */
  readonly providerCategories?: ReadonlyArray<string>;
  /**
   * Provenance of the provider observations above and of `providerLocation`.
   * Taken from the discovery envelope, so a fixture stays a fixture and a public
   * dataset stays a public dataset.
   */
  readonly providerSourceClass?: ProvenanceSourceClass;
  /** Provider-observed postal location, or null when the provider gave none. */
  readonly providerLocation?: ProviderObservedLocation | null;
}

export interface CandidateGateOutcome {
  readonly eligible: ReadonlyArray<EligibleCandidate>;
  /** Aggregate counts only — never a blocked business name or URL. */
  readonly blockedCounts: Readonly<Record<CandidateBlockReason, number>>;
  readonly consideredCount: number;
}

function emptyCounts(): Record<CandidateBlockReason, number> {
  return {
    not_accepted: 0,
    review_disposition: 0,
    supporting_disposition: 0,
    not_operating: 0,
    no_observed_website: 0,
    unsafe_candidate_url: 0,
    duplicate_candidate: 0,
  };
}

/**
 * Resolve an observed domain string to a safe absolute https URL, or null.
 * Reuses the crawler's own URL safety rules so the gate cannot admit anything
 * the fetcher would refuse.
 *
 * Exported so a discovery source that does not produce provider envelopes still
 * admits candidate URLs through these exact rules rather than its own copy of
 * them. A second implementation is how the two paths would eventually disagree
 * about what is safe to fetch.
 */
export function safeCandidateUrl(observed: string): URL | null {
  const trimmed = observed.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    // http:// candidates are upgraded to https and revalidated; cleartext is
    // never admitted. normalizeWebUrl still applies the crawler's hostname, IP,
    // port, credential, and length rules.
    const parsed = new URL(withScheme);
    if (parsed.protocol !== "https:") parsed.protocol = "https:";
    const normalized = new URL(normalizeWebUrl(parsed.href));
    if (normalized.protocol !== "https:") return null;
    return normalized;
  } catch (error) {
    if (error instanceof UrlSafetyError || error instanceof TypeError) return null;
    throw error;
  }
}

/**
 * The provider's own postal location, or null.
 *
 * Returns null unless the provider supplied a non-empty locality, region, and a
 * two-letter country code. Nothing is inferred from the coverage cell, the
 * candidate host, or the expected market: a place the provider left blank stays
 * blank, and is later scored as a missing location rather than an in-scope one.
 */
export function providerObservedLocation(
  address: NormalizedDiscoveryResult["address"],
): ProviderObservedLocation | null {
  const city = address.city.trim();
  const region = address.region.trim();
  const countryCode = address.countryCode.trim().toUpperCase();
  if (!city || !region || countryCode.length !== 2) return null;
  return Object.freeze({
    line1: address.line1?.trim() || null,
    city,
    region,
    postalCode: address.postalCode?.trim() || null,
    countryCode,
  });
}

export function selectAssessableCandidates(
  envelopes: ReadonlyArray<ProviderEnvelope<NormalizedDiscoveryResult>>,
): CandidateGateOutcome {
  const blockedCounts = emptyCounts();
  const eligible: EligibleCandidate[] = [];
  const seenHosts = new Set<string>();
  const seenKeys = new Set<string>();

  for (const envelope of envelopes) {
    const result = envelope.normalizedResult;
    if (envelope.validation.status !== "accepted" || result === null || envelope.error !== null) {
      blockedCounts.not_accepted += 1;
      continue;
    }
    const observation = result.providerObservation;
    if (!observation) {
      blockedCounts.not_accepted += 1;
      continue;
    }
    // Only a strong pool-service classification is admissible. "review" stays
    // queued for a human; "supporting" is an adjacent signal, not a contractor.
    // Neither is ever crawled to increase yield.
    if (observation.categoryDisposition === "review") {
      blockedCounts.review_disposition += 1;
      continue;
    }
    if (observation.categoryDisposition !== "strong") {
      blockedCounts.supporting_disposition += 1;
      continue;
    }
    // Closed or unknown-status places are stale for outreach purposes.
    if (observation.operatingStatus !== "open") {
      blockedCounts.not_operating += 1;
      continue;
    }
    if (result.domains.length === 0) {
      blockedCounts.no_observed_website += 1;
      continue;
    }
    const url = safeCandidateUrl(result.domains[0] as string);
    if (!url) {
      blockedCounts.unsafe_candidate_url += 1;
      continue;
    }
    const candidateKey = result.providerPlaceId ?? `${observation.releaseId}:${url.hostname}`;
    // One assessment per business and one per host, so mirrored listings and
    // repeated placements never produce duplicate crawls.
    if (seenKeys.has(candidateKey) || seenHosts.has(url.hostname)) {
      blockedCounts.duplicate_candidate += 1;
      continue;
    }
    seenKeys.add(candidateKey);
    seenHosts.add(url.hostname);
    eligible.push({
      candidateKey,
      expectedBusinessName: result.name,
      candidateUrl: url.href,
      candidateHost: url.hostname,
      providerPlaceId: result.providerPlaceId,
      releaseId: observation.releaseId,
      expectedLocality: result.address.city,
      expectedPhones: Object.freeze([...result.phones]),
      // Provider observations carried forward unchanged, with the envelope's own
      // provenance. Discovery already read these; dropping them here is what
      // left the assessment stage with no provider-category or location evidence.
      providerCategories: Object.freeze([...new Set(
        result.categories.map((category) => category.trim()).filter(Boolean),
      )].sort()),
      providerSourceClass: envelope.sourceClass,
      providerLocation: providerObservedLocation(result.address),
    });
  }

  return {
    eligible: Object.freeze(eligible),
    blockedCounts: Object.freeze(blockedCounts),
    consideredCount: envelopes.length,
  };
}
