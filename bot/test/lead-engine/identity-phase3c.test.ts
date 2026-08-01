import { describe, expect, it } from "vitest";
import type {
  AddressIdentity,
  BusinessIdentityRecord,
  DomainIdentity,
  IdentitySignalEvidence,
  PhoneIdentity,
  ProviderIdentity,
} from "../../src/lead-engine/identity/hierarchy.js";
import { matchBusinessIdentity } from "../../src/lead-engine/identity/matcher.js";
import { normalizePhoneCandidate } from "../../src/lead-engine/identity/normalize.js";

const currentAt = "2026-01-15T12:00:00.000Z";

function observedEvidence(): IdentitySignalEvidence {
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
    evidenceReference: "synthetic-observation-ref",
  };
}

function externallyVerified(
  dimension: "business_canonical_domain" | "phone_business_association" | "business_provider_identity",
): IdentitySignalEvidence {
  const method = dimension === "business_canonical_domain"
    ? "canonical_domain_verification"
    : dimension === "phone_business_association"
      ? "phone_business_association_check"
      : "provider_business_identity_match";
  return {
    sourceClass: "external_verification_provider",
    claimState: "externally_verified",
    externalVerificationState: "current",
    verificationDimension: dimension,
    verifierId: "synthetic-verifier",
    verificationMethod: method,
    verificationResult: "passed",
    verifiedAt: "2026-01-15T11:00:00.000Z",
    expiresAt: "2026-02-15T11:00:00.000Z",
    normalizedValue: "synthetic-normalized-identity-value",
    evidenceReference: `synthetic-verifier-ref:${dimension}`,
  };
}

function address(line1 = "100 Example Way", city = "Testville"): AddressIdentity {
  return {
    line1,
    city,
    region: "AZ",
    postalCode: "85000",
    countryCode: "US",
    evidence: observedEvidence(),
  };
}

function record(overrides: Partial<BusinessIdentityRecord> = {}): BusinessIdentityRecord {
  return {
    entityId: "business-synthetic-a",
    locationId: "location-synthetic-a",
    groupId: null,
    displayName: "Clearwater Synthetic Pool Care",
    dbaNames: [],
    legalName: null,
    nameEvidence: observedEvidence(),
    providerIdentifiers: [],
    domains: [],
    phones: [],
    address: address(),
    chainAffiliation: null,
    ...overrides,
  };
}

function trustedProvider(value: string): ProviderIdentity {
  return {
    providerId: "overture",
    value,
    trusted: true,
    evidence: {
      ...observedEvidence(),
      sourceClass: "local_public_dataset",
      claimState: "source_confirmed",
      externalVerificationState: "unassessed",
      verificationDimension: "business_provider_identity",
    },
  };
}

function verifiedDomain(value: string): DomainIdentity {
  return { value, evidence: externallyVerified("business_canonical_domain") };
}

function phone(value: string, verified: boolean): PhoneIdentity {
  return normalizePhoneCandidate(value, {
    shared: false,
    callCenter: false,
    multipleLocations: false,
    associationCertain: true,
    evidence: verified ? externallyVerified("phone_business_association") : observedEvidence(),
  });
}

function decide(left: BusinessIdentityRecord, right: BusinessIdentityRecord) {
  return matchBusinessIdentity(left, right, { currentAt });
}

describe("Phase 3C safe business identity matching", () => {
  it.each([
    ["commercial building", record(), record({ entityId: "business-b", displayName: "Different Business LLC" })],
    ["virtual office", record({ address: address("1 Virtual Office Plaza") }), record({ entityId: "business-b", displayName: "Unrelated Company", address: address("1 Virtual Office Plaza") })],
  ])("routes exact address alone in a %s to review", (_scenario, left, right) => {
    expect(decide(left, right)).toMatchObject({
      action: "human_review",
      reason: "exact_address_review",
      reviewReason: "exact_address_is_not_identity_proof",
    });
  });

  it("keeps franchise locations separate when they share a parent domain", () => {
    const chain = {
      brandName: "Synthetic Pool Network",
      franchise: true,
      evidence: externallyVerified("business_canonical_domain"),
    };
    const result = decide(
      record({ domains: [verifiedDomain("network.example")], chainAffiliation: chain }),
      record({
        entityId: "business-b",
        locationId: "location-b",
        domains: [verifiedDomain("network.example")],
        address: address("900 Other Road", "Sample City"),
        chainAffiliation: chain,
      }),
    );
    expect(result).toMatchObject({ action: "group_link", reason: "verified_domain_group" });
  });

  it("auto-merges an exact trusted provider business ID with no conflicts", () => {
    const result = decide(
      record({ providerIdentifiers: [trustedProvider("place-1")] }),
      record({ entityId: "business-b", providerIdentifiers: [trustedProvider("place-1")] }),
    );
    expect(result).toMatchObject({ action: "auto_merge", reason: "stable_provider_identifier" });
    expect(result.supportingSignals).toContain("trusted_provider_id:overture:place-1");
    expect(result.conflictingSignals).toEqual([]);
  });

  it("does not treat a synthetic trusted flag as provider identity proof", () => {
    const unproven = {
      providerId: "fixture",
      value: "place-1",
      trusted: true,
      evidence: observedEvidence(),
    };
    expect(decide(
      record({ address: null, providerIdentifiers: [unproven] }),
      record({ entityId: "business-b", displayName: "Different Business", address: null, providerIdentifiers: [unproven] }),
    )).toMatchObject({ action: "no_match", reason: "insufficient_evidence" });
  });

  it("auto-merges an exact current verified canonical domain with no conflicts", () => {
    expect(decide(
      record({ address: null, domains: [verifiedDomain("clearwater.example")] }),
      record({ entityId: "business-b", address: null, domains: [verifiedDomain("www.clearwater.example")] }),
    )).toMatchObject({ action: "auto_merge", reason: "verified_canonical_domain" });
  });

  it("requires a verified phone plus a compatible second strong signal", () => {
    const sharedPhone = phone("202-555-0100", true);
    expect(decide(
      record({ phones: [sharedPhone] }),
      record({ entityId: "business-b", phones: [phone("+1 202 555 0100", true)] }),
    )).toMatchObject({ action: "auto_merge", reason: "verified_phone_with_address" });

    expect(decide(
      record({ address: null, phones: [sharedPhone] }),
      record({ entityId: "business-c", address: null, phones: [phone("+1 202 555 0100", true)] }),
    ).action).not.toBe("auto_merge");
  });

  it("never auto-merges an unverified phone alone", () => {
    expect(decide(
      record({ displayName: "Synthetic Alpha", address: null, phones: [phone("202-555-0100", false)] }),
      record({ entityId: "business-b", displayName: "Synthetic Omega", address: null, phones: [phone("202-555-0100", false)] }),
    )).toMatchObject({ action: "no_match", reason: "insufficient_evidence" });
  });

  it("keeps fuzzy name and address similarity review-only", () => {
    expect(decide(
      record({ displayName: "Phoenix Pool Service", address: address("100 Example Way") }),
      record({ entityId: "business-b", displayName: "Phoenix Pool Services LLC", address: address("102 Example Way") }),
    )).toMatchObject({ action: "human_review", reason: "fuzzy_candidate" });
  });

  it.each([
    [
      "same name with different verified domains",
      record({ domains: [verifiedDomain("alpha.example")] }),
      record({ entityId: "business-b", domains: [verifiedDomain("omega.example")] }),
      "verified_domain_conflict",
    ],
    [
      "same domain with conflicting trusted provider IDs",
      record({ domains: [verifiedDomain("shared.example")], providerIdentifiers: [trustedProvider("place-1")] }),
      record({ entityId: "business-b", domains: [verifiedDomain("shared.example")], providerIdentifiers: [trustedProvider("place-2")] }),
      "trusted_provider_identifier_conflict:overture",
    ],
    [
      "conflicting verified phones",
      record({ phones: [phone("202-555-0100", true)] }),
      record({ entityId: "business-b", phones: [phone("202-555-0199", true)] }),
      "verified_phone_conflict",
    ],
  ] as const)("blocks automatic merging for %s", (_scenario, left, right, conflict) => {
    const result = decide(left, right);
    expect(result.action).toBe("human_review");
    expect(result.reason).toBe("conflicting_identifiers");
    expect(result.conflictingSignals).toContain(conflict);
    expect(result.reviewReason).toBe("strong_identifier_conflict");
  });

  it("returns confidence separately from verification dimensions and evidence", () => {
    const result = decide(
      record({ providerIdentifiers: [trustedProvider("place-1")] }),
      record({ entityId: "business-b", providerIdentifiers: [trustedProvider("place-1")] }),
    );
    expect(result.confidenceBasisPoints).toBe(10_000);
    expect(result.verificationDimensions).toContain("business_provider_identity");
    expect(result).not.toHaveProperty("verified");
  });
});
