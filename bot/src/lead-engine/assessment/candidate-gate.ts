import type { NormalizedDiscoveryResult, ProviderEnvelope } from "../providers/contracts.js";
import { normalizeWebUrl, UrlSafetyError } from "../crawl/url-safety.js";

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

export interface EligibleCandidate {
  /** Stable key derived from the provider place id, used for dedupe and ids. */
  readonly candidateKey: string;
  readonly expectedBusinessName: string;
  /** Observed, public-unverified candidate URL. Not a verified domain. */
  readonly candidateUrl: string;
  readonly candidateHost: string;
  readonly providerPlaceId: string | null;
  readonly releaseId: string;
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
 */
function safeCandidateUrl(observed: string): URL | null {
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
    });
  }

  return {
    eligible: Object.freeze(eligible),
    blockedCounts: Object.freeze(blockedCounts),
    consideredCount: envelopes.length,
  };
}
