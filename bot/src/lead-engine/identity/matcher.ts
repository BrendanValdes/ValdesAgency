import { stableId } from "../shared/stable.js";
import {
  isCurrentExternalVerification,
  type VerificationDimension,
} from "../domain/provenance.js";
import type {
  BusinessIdentityRecord,
  IdentityMatchDecision,
  IdentityMatchReason,
} from "./hierarchy.js";
import { IDENTITY_POLICY_VERSION } from "./hierarchy.js";
import {
  identityConflicts,
  locationsAreDistinct,
  phoneMayAutoMerge,
  providerIdentifierMayAutoMerge,
} from "./merge-policy.js";
import {
  normalizeAddress,
  normalizeBusinessName,
  normalizeDomain,
  normalizeProviderIdentifier,
} from "./normalize.js";

function intersection<T>(left: Set<T>, right: Set<T>): T[] {
  return [...left].filter((value) => right.has(value));
}

function names(record: BusinessIdentityRecord): Set<string> {
  return new Set(
    [record.displayName, ...record.dbaNames, record.legalName ?? ""]
      .map(normalizeBusinessName)
      .filter(Boolean),
  );
}

function tokenSimilarity(left: string, right: string): number {
  const tokens = (value: string) => normalizeBusinessName(value)
    .split(" ")
    .filter((token) => token && !["llc", "inc", "corp", "corporation"].includes(token))
    .map((token) => token.length > 4 && token.endsWith("s") ? token.slice(0, -1) : token);
  const leftTokens = new Set(tokens(left));
  const rightTokens = new Set(tokens(right));
  const union = new Set([...leftTokens, ...rightTokens]);
  return union.size === 0 ? 0 : intersection(leftTokens, rightTokens).length / union.size;
}

function decision(
  left: BusinessIdentityRecord,
  right: BusinessIdentityRecord,
  action: IdentityMatchDecision["action"],
  reason: IdentityMatchReason,
  matchScore: number,
  supportingSignals: ReadonlyArray<string> = [],
  conflictingSignals: ReadonlyArray<string> = [],
  verificationDimensions: ReadonlyArray<VerificationDimension> = [],
  reviewReason: string | null = null,
): IdentityMatchDecision {
  const ordered = [left.entityId, right.entityId].sort();
  return {
    decisionId: stableId("identity_decision", {
      ordered,
      action,
      reason,
      matchScore,
      policyVersion: IDENTITY_POLICY_VERSION,
      supportingSignals,
      conflictingSignals,
      verificationDimensions,
      reviewReason,
    }),
    leftEntityId: ordered[0] as string,
    rightEntityId: ordered[1] as string,
    action,
    reason,
    matchScore,
    confidenceBasisPoints: matchScore,
    policyVersion: IDENTITY_POLICY_VERSION,
    conflicts: [...conflictingSignals],
    supportingSignals: [...supportingSignals].sort(),
    conflictingSignals: [...conflictingSignals].sort(),
    verificationDimensions: [...new Set(verificationDimensions)].sort(),
    reviewReason,
  };
}

function trustedProviderKeys(record: BusinessIdentityRecord, currentAt: string): Set<string> {
  return new Set(record.providerIdentifiers
    .filter((identifier) => providerIdentifierMayAutoMerge(identifier, currentAt))
    .map(normalizeProviderIdentifier));
}

function verifiedDomains(record: BusinessIdentityRecord, currentAt: string): Set<string> {
  return new Set(record.domains
    .filter((entry) => isCurrentExternalVerification(entry.evidence, "business_canonical_domain", currentAt))
    .map((entry) => normalizeDomain(entry.value))
    .filter((entry): entry is string => Boolean(entry)));
}

export function matchBusinessIdentity(
  left: BusinessIdentityRecord,
  right: BusinessIdentityRecord,
  options: { currentAt?: string } = {},
): IdentityMatchDecision {
  const currentAt = options.currentAt ?? new Date().toISOString();
  const conflicts = identityConflicts(left, right, currentAt);
  if (conflicts.length > 0) {
    return decision(
      left,
      right,
      "human_review",
      "conflicting_identifiers",
      10_000,
      [],
      conflicts,
      [],
      "strong_identifier_conflict",
    );
  }
  const providerMatch = intersection(
    trustedProviderKeys(left, currentAt),
    trustedProviderKeys(right, currentAt),
  );
  if (providerMatch.length > 0) {
    return decision(
      left,
      right,
      "auto_merge",
      "stable_provider_identifier",
      10_000,
      providerMatch.map((value) => `trusted_provider_id:${value}`),
      [],
      ["business_provider_identity"],
    );
  }

  const domainMatch = intersection(
    verifiedDomains(left, currentAt),
    verifiedDomains(right, currentAt),
  );
  if (domainMatch.length > 0) {
    const supporting = domainMatch.map((value) => `verified_canonical_domain:${value}`);
    if (locationsAreDistinct(left, right)) {
      return decision(left, right, "group_link", "verified_domain_group", 9_500, supporting, [], ["business_canonical_domain"]);
    }
    return decision(left, right, "auto_merge", "verified_canonical_domain", 9_500, supporting, [], ["business_canonical_domain"]);
  }

  const eligibleLeftPhones = new Set(left.phones.filter((phone) => phoneMayAutoMerge(phone, currentAt)).map((phone) => phone.e164));
  const eligibleRightPhones = new Set(right.phones.filter((phone) => phoneMayAutoMerge(phone, currentAt)).map((phone) => phone.e164));
  const phoneMatch = intersection(eligibleLeftPhones, eligibleRightPhones).filter((value): value is string => Boolean(value));
  const exactAddress = Boolean(left.address && right.address && normalizeAddress(left.address) === normalizeAddress(right.address));
  if (phoneMatch.length > 0 && exactAddress) {
    return decision(
      left,
      right,
      "auto_merge",
      "verified_phone_with_address",
      9_200,
      [`verified_business_phone:${phoneMatch[0]}`, `exact_address:${normalizeAddress(left.address as NonNullable<typeof left.address>)}`],
      [],
      ["phone_business_association"],
    );
  }
  if (phoneMatch.length > 0) {
    const addressConflict = left.address && right.address && locationsAreDistinct(left, right)
      ? ["address_conflict_for_verified_phone"]
      : [];
    return decision(
      left,
      right,
      "human_review",
      addressConflict.length > 0 ? "conflicting_identifiers" : "verified_phone_requires_corroboration",
      8_500,
      [`verified_business_phone:${phoneMatch[0]}`],
      addressConflict,
      ["phone_business_association"],
      addressConflict.length > 0 ? "strong_identifier_conflict" : "verified_phone_requires_second_strong_signal",
    );
  }

  if (exactAddress) {
    return decision(
      left,
      right,
      "human_review",
      "exact_address_review",
      6_500,
      [`exact_address:${normalizeAddress(left.address as NonNullable<typeof left.address>)}`],
      [],
      [],
      "exact_address_is_not_identity_proof",
    );
  }

  const nameMatch = intersection(names(left), names(right)).length > 0;
  const cityMatch = Boolean(left.address && right.address && normalizeBusinessName(left.address.city) === normalizeBusinessName(right.address.city));
  const postalMatch = Boolean(left.address && right.address && left.address.postalCode.replace(/\s/g, "") === right.address.postalCode.replace(/\s/g, ""));
  const anyPhoneMatch = intersection(
    new Set(left.phones.map((phone) => phone.e164).filter(Boolean)),
    new Set(right.phones.map((phone) => phone.e164).filter(Boolean)),
  ).length > 0;
  if (nameMatch && [cityMatch, postalMatch, anyPhoneMatch].filter(Boolean).length >= 2) {
    return decision(
      left,
      right,
      "human_review",
      "fuzzy_candidate",
      7_500,
      ["exact_normalized_name", cityMatch ? "same_city" : "", postalMatch ? "same_postal_code" : "", anyPhoneMatch ? "unverified_phone_match" : ""].filter(Boolean),
      [],
      [],
      "multiple_unverified_signals_require_review",
    );
  }

  const similarity = Math.max(
    ...[left.displayName, ...left.dbaNames].flatMap((leftName) =>
      [right.displayName, ...right.dbaNames].map((rightName) => tokenSimilarity(leftName, rightName)),
    ),
  );
  if (similarity >= 0.6) {
    return decision(left, right, "human_review", "fuzzy_candidate", Math.round(similarity * 7_000), ["fuzzy_name_similarity"], [], [], "fuzzy_matching_is_review_only");
  }
  return decision(left, right, "no_match", "insufficient_evidence", 0, [], [], [], "approved_merge_evidence_missing");
}
