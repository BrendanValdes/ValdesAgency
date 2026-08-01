import type { BusinessIdentityRecord, PhoneIdentity, ProviderIdentity } from "./hierarchy.js";
import { isCurrentExternalVerification } from "../domain/provenance.js";
import { normalizeAddress, normalizeDomain } from "./normalize.js";

export function phoneMayAutoMerge(phone: PhoneIdentity, currentAt: string): boolean {
  return Boolean(
    isCurrentExternalVerification(phone.evidence, "phone_business_association", currentAt) &&
      phone.e164 &&
      !phone.shared &&
      !phone.tollFree &&
      !phone.callCenter &&
      !phone.multipleLocations &&
      phone.associationCertain,
  );
}

export function providerIdentifierMayAutoMerge(
  identifier: ProviderIdentity,
  currentAt: string,
): boolean {
  if (
    !identifier.trusted ||
    identifier.evidence.verificationDimension !== "business_provider_identity" ||
    !identifier.evidence.evidenceReference
  ) {
    return false;
  }
  if (
    identifier.evidence.sourceClass === "local_public_dataset" &&
    identifier.evidence.claimState === "source_confirmed"
  ) {
    return true;
  }
  return isCurrentExternalVerification(
    identifier.evidence,
    "business_provider_identity",
    currentAt,
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
  currentAt: string,
): string[] {
  const conflicts: string[] = [];
  const leftDomains = new Set(
    left.domains.filter((domain) => isCurrentExternalVerification(domain.evidence, "business_canonical_domain", currentAt)).map((domain) => normalizeDomain(domain.value)).filter(Boolean),
  );
  const rightDomains = new Set(
    right.domains.filter((domain) => isCurrentExternalVerification(domain.evidence, "business_canonical_domain", currentAt)).map((domain) => normalizeDomain(domain.value)).filter(Boolean),
  );
  if (leftDomains.size > 0 && rightDomains.size > 0 && ![...leftDomains].some((domain) => rightDomains.has(domain))) {
    conflicts.push("verified_domain_conflict");
  }
  const byProvider = (record: BusinessIdentityRecord) => new Map(
    record.providerIdentifiers
      .filter((identifier) => providerIdentifierMayAutoMerge(identifier, currentAt))
      .map((identifier) => [identifier.providerId, identifier.value]),
  );
  const leftProviders = byProvider(left);
  const rightProviders = byProvider(right);
  for (const [provider, value] of leftProviders) {
    const other = rightProviders.get(provider);
    if (other !== undefined && other !== value) {
      conflicts.push(`trusted_provider_identifier_conflict:${provider}`);
    }
  }
  const verifiedPhones = (record: BusinessIdentityRecord) => new Set(
    record.phones
      .filter((phone) => phoneMayAutoMerge(phone, currentAt))
      .map((phone) => phone.e164)
      .filter((phone): phone is string => Boolean(phone)),
  );
  const leftPhones = verifiedPhones(left);
  const rightPhones = verifiedPhones(right);
  if (leftPhones.size > 0 && rightPhones.size > 0 && ![...leftPhones].some((phone) => rightPhones.has(phone))) {
    conflicts.push("verified_phone_conflict");
  }
  return conflicts.sort();
}
