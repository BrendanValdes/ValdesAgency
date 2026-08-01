import { describe, expect, it } from "vitest";
import { deduplicateIdentityCandidates } from "../../src/lead-engine/identity/grouping.js";
import { matchBusinessIdentity } from "../../src/lead-engine/identity/matcher.js";
import { normalizePhoneCandidate } from "../../src/lead-engine/identity/normalize.js";
import { syntheticIdentity } from "./fixtures/identity/synthetic.js";

describe("fail-closed hierarchical deduplication", () => {
  it("does not collapse separate chain locations that share a call center", () => {
    const phone = normalizePhoneCandidate("202-555-0150", {
      verified: true,
      shared: true,
      callCenter: true,
      multipleLocations: true,
      associationCertain: true,
    });
    const records = [
      syntheticIdentity({ displayName: "Synthetic Chain North", phones: [phone] }),
      syntheticIdentity({
        entityId: "business-synthetic-b",
        locationId: "location-synthetic-b",
        displayName: "Synthetic Chain South",
        phones: [phone],
        address: { line1: "900 Other Road", city: "Sample City", region: "NV", postalCode: "89000", countryCode: "US" },
      }),
    ];
    expect(deduplicateIdentityCandidates(records, matchBusinessIdentity)[0]?.action).not.toBe("auto_merge");
  });

  it("returns one stable decision per unordered candidate pair", () => {
    const records = [
      syntheticIdentity({ entityId: "business-c", displayName: "Synthetic C", address: null }),
      syntheticIdentity({ entityId: "business-a", displayName: "Synthetic A", address: null }),
      syntheticIdentity({ entityId: "business-b", displayName: "Synthetic B", address: null }),
    ];
    const decisions = deduplicateIdentityCandidates(records, matchBusinessIdentity);
    expect(decisions).toHaveLength(3);
    expect(new Set(decisions.map((entry) => entry.decisionId)).size).toBe(3);
    expect(decisions).toEqual(deduplicateIdentityCandidates([...records].reverse(), matchBusinessIdentity));
  });
});

