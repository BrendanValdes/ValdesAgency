import type {
  BusinessIdentityRecord,
  DomainIdentity,
  IdentitySignalEvidence,
  ProviderIdentity,
} from "../../../../src/lead-engine/identity/hierarchy.js";
import { normalizePhoneCandidate } from "../../../../src/lead-engine/identity/normalize.js";

export const synthetic_fixture = true;

export function observedIdentityEvidence(): IdentitySignalEvidence {
  return {
    sourceClass: "synthetic_fixture",
    claimState: "observed",
    externalVerificationState: "unassessed",
    verificationDimension: null,
    verifierId: null,
    verificationMethod: null,
    verificationResult: null,
    verifiedAt: null,
    expiresAt: null,
    normalizedValue: null,
    evidenceReference: "synthetic-identity-observation",
  };
}

export function externallyVerifiedIdentityEvidence(
  verificationDimension: "business_canonical_domain" | "phone_business_association" | "business_provider_identity",
): IdentitySignalEvidence {
  const verificationMethod = verificationDimension === "business_canonical_domain"
    ? "canonical_domain_verification"
    : verificationDimension === "phone_business_association"
      ? "phone_business_association_check"
      : "provider_business_identity_match";
  return {
    sourceClass: "external_verification_provider",
    claimState: "externally_verified",
    externalVerificationState: "current",
    verificationDimension,
    verifierId: "synthetic-verifier",
    verificationMethod,
    verificationResult: "passed",
    verifiedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2030-01-01T00:00:00.000Z",
    normalizedValue: "synthetic-normalized-identity-value",
    evidenceReference: `synthetic-verifier-reference:${verificationDimension}`,
  };
}

export function trustedProviderIdentifier(value: string, providerId = "overture"): ProviderIdentity {
  return {
    providerId,
    value,
    trusted: true,
    evidence: {
      ...observedIdentityEvidence(),
      sourceClass: "local_public_dataset",
      claimState: "source_confirmed",
      externalVerificationState: "unassessed",
      verificationDimension: "business_provider_identity",
    },
  };
}

export function verifiedDomain(value: string): DomainIdentity {
  return { value, evidence: externallyVerifiedIdentityEvidence("business_canonical_domain") };
}

export function syntheticIdentity(
  overrides: Partial<BusinessIdentityRecord> = {},
): BusinessIdentityRecord {
  return {
    entityId: "business-synthetic-a",
    locationId: "location-synthetic-a",
    groupId: null,
    displayName: "Clearwater Synthetic Pool Care",
    dbaNames: [],
    legalName: null,
    nameEvidence: observedIdentityEvidence(),
    providerIdentifiers: [],
    domains: [],
    phones: [],
    address: {
      line1: "100 Example Way",
      city: "Testville",
      region: "AZ",
      postalCode: "85000",
      countryCode: "US",
      evidence: observedIdentityEvidence(),
    },
    chainAffiliation: null,
    ...overrides,
  };
}

export const safeVerifiedPhone = normalizePhoneCandidate("202-555-0100", {
  evidence: externallyVerifiedIdentityEvidence("phone_business_association"),
  associationCertain: true,
});
