import type { BusinessIdentityRecord, PhoneIdentity } from "./hierarchy.js";
import { normalizeAddress, normalizeDomain } from "./normalize.js";

export function phoneMayAutoMerge(phone: PhoneIdentity): boolean {
  return Boolean(
    phone.verified &&
      phone.e164 &&
      !phone.shared &&
      !phone.tollFree &&
      !phone.callCenter &&
      !phone.multipleLocations &&
      phone.associationCertain,
  );
}

export function locationsAreDistinct(
  left: BusinessIdentityRecord,
  right: BusinessIdentityRecord,
): boolean {
  if (left.locationId !== right.locationId && left.address && right.address) {
    return normalizeAddress(left.address) !== normalizeAddress(right.address);
  }
  return false;
}

export function identityConflicts(
  left: BusinessIdentityRecord,
  right: BusinessIdentityRecord,
): string[] {
  const conflicts: string[] = [];
  const leftDomains = new Set(
    left.domains.filter((domain) => domain.verified).map((domain) => normalizeDomain(domain.value)).filter(Boolean),
  );
  const rightDomains = new Set(
    right.domains.filter((domain) => domain.verified).map((domain) => normalizeDomain(domain.value)).filter(Boolean),
  );
  if (leftDomains.size > 0 && rightDomains.size > 0 && ![...leftDomains].some((domain) => rightDomains.has(domain))) {
    conflicts.push("verified_domain_conflict");
  }
  const byProvider = (record: BusinessIdentityRecord) => new Map(
    record.providerIdentifiers.map((identifier) => [identifier.providerId, identifier.value]),
  );
  const leftProviders = byProvider(left);
  const rightProviders = byProvider(right);
  for (const [provider, value] of leftProviders) {
    const other = rightProviders.get(provider);
    if (other !== undefined && other !== value && !locationsAreDistinct(left, right)) {
      conflicts.push(`provider_identifier_conflict:${provider}`);
    }
  }
  return conflicts.sort();
}
