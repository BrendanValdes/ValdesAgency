import type { NormalizedDiscoveryResult } from "../../../../src/lead-engine/providers/contracts.js";

export const synthetic_fixture = true;

export const syntheticDiscoveryRecords: ReadonlyArray<NormalizedDiscoveryResult> = [
  {
    providerPlaceId: "fixture-place-001",
    name: "Clearwater Synthetic Pool Care",
    categories: ["pool_service"],
    address: {
      line1: "100 Example Way",
      city: "Testville",
      region: "AZ",
      postalCode: "85000",
      countryCode: "US",
    },
    domains: ["clearwater.example"],
    phones: ["+1 202-555-0100"],
    brandName: null,
    groupHint: null,
  },
  {
    providerPlaceId: "fixture-place-002",
    name: "Blue Mesa Synthetic Pools",
    categories: ["pool_service"],
    address: {
      line1: "200 Fixture Road",
      city: "Sample City",
      region: "NV",
      postalCode: "89000",
      countryCode: "US",
    },
    domains: [],
    phones: [],
    brandName: "Blue Mesa Synthetic",
    groupHint: "blue-mesa-synthetic-group",
  },
];

