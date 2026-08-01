import type { BusinessIdentityRecord } from "../../../../src/lead-engine/identity/hierarchy.js";
import { normalizePhoneCandidate } from "../../../../src/lead-engine/identity/normalize.js";

export const synthetic_fixture = true;

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
    providerIdentifiers: [],
    domains: [],
    phones: [],
    address: {
      line1: "100 Example Way",
      city: "Testville",
      region: "AZ",
      postalCode: "85000",
      countryCode: "US",
    },
    chainAffiliation: null,
    ...overrides,
  };
}

export const safeVerifiedPhone = normalizePhoneCandidate("202-555-0100", {
  verified: true,
  associationCertain: true,
});

