import { stableId } from "../shared/stable.js";
import type {
  BusinessIdentityRecord,
  IdentityMatchDecision,
  IdentityMatchReason,
} from "./hierarchy.js";
import { IDENTITY_POLICY_VERSION } from "./hierarchy.js";
import { identityConflicts, locationsAreDistinct, phoneMayAutoMerge } from "./merge-policy.js";
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
  conflicts: ReadonlyArray<string> = [],
): IdentityMatchDecision {
  const ordered = [left.entityId, right.entityId].sort();
  return {
    decisionId: stableId("identity_decision", {
      ordered,
      action,
      reason,
      matchScore,
      policyVersion: IDENTITY_POLICY_VERSION,
      conflicts,
    }),
    leftEntityId: ordered[0] as string,
    rightEntityId: ordered[1] as string,
    action,
    reason,
    matchScore,
    policyVersion: IDENTITY_POLICY_VERSION,
    conflicts,
  };
}

export function matchBusinessIdentity(
  left: BusinessIdentityRecord,
  right: BusinessIdentityRecord,
): IdentityMatchDecision {
  const conflicts = identityConflicts(left, right);
  const providerMatch = intersection(
    new Set(left.providerIdentifiers.map(normalizeProviderIdentifier)),
    new Set(right.providerIdentifiers.map(normalizeProviderIdentifier)),
  ).length > 0;
  if (providerMatch) {
    if (conflicts.length > 0) return decision(left, right, "human_review", "conflicting_identifiers", 10000, conflicts);
    return decision(left, right, "auto_merge", "stable_provider_identifier", 10000);
  }

  const domainMatch = intersection(
    new Set(left.domains.filter((entry) => entry.verified).map((entry) => normalizeDomain(entry.value)).filter((entry): entry is string => Boolean(entry))),
    new Set(right.domains.filter((entry) => entry.verified).map((entry) => normalizeDomain(entry.value)).filter((entry): entry is string => Boolean(entry))),
  ).length > 0;
  if (domainMatch) {
    if (conflicts.length > 0) return decision(left, right, "human_review", "conflicting_identifiers", 9500, conflicts);
    if (locationsAreDistinct(left, right)) return decision(left, right, "group_link", "verified_domain_group", 9500);
    return decision(left, right, "auto_merge", "verified_domain", 9500);
  }

  const eligibleLeftPhones = new Set(left.phones.filter(phoneMayAutoMerge).map((phone) => phone.e164));
  const eligibleRightPhones = new Set(right.phones.filter(phoneMayAutoMerge).map((phone) => phone.e164));
  if (intersection(eligibleLeftPhones, eligibleRightPhones).length > 0) {
    return decision(left, right, "auto_merge", "verified_e164_phone", 9000);
  }

  const exactAddress = left.address && right.address && normalizeAddress(left.address) === normalizeAddress(right.address);
  if (exactAddress) return decision(left, right, "auto_merge", "exact_normalized_address", 8800);

  const nameMatch = intersection(names(left), names(right)).length > 0;
  const cityMatch = Boolean(left.address && right.address && normalizeBusinessName(left.address.city) === normalizeBusinessName(right.address.city));
  const postalMatch = Boolean(left.address && right.address && left.address.postalCode.replace(/\s/g, "") === right.address.postalCode.replace(/\s/g, ""));
  const anyPhoneMatch = intersection(
    new Set(left.phones.map((phone) => phone.e164).filter(Boolean)),
    new Set(right.phones.map((phone) => phone.e164).filter(Boolean)),
  ).length > 0;
  if (nameMatch && [cityMatch, postalMatch, anyPhoneMatch].filter(Boolean).length >= 2) {
    if (conflicts.length > 0) return decision(left, right, "human_review", "conflicting_identifiers", 8500, conflicts);
    return decision(left, right, "auto_merge", "strong_multi_field", 8500);
  }

  const similarity = Math.max(
    ...[left.displayName, ...left.dbaNames].flatMap((leftName) =>
      [right.displayName, ...right.dbaNames].map((rightName) => tokenSimilarity(leftName, rightName)),
    ),
  );
  if (similarity >= 0.6) {
    return decision(left, right, "human_review", "fuzzy_candidate", Math.round(similarity * 7000), conflicts);
  }
  return decision(left, right, "no_match", "insufficient_evidence", 0, conflicts);
}
