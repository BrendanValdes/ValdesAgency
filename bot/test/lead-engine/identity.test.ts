import { describe, expect, it } from "vitest";
import {
  deduplicateIdentityCandidates,
  groupBusinessLocations,
} from "../../src/lead-engine/identity/grouping.js";
import { matchBusinessIdentity } from "../../src/lead-engine/identity/matcher.js";
import {
  normalizeBusinessName,
  normalizePhoneCandidate,
} from "../../src/lead-engine/identity/normalize.js";
import {
  safeVerifiedPhone,
  syntheticIdentity,
} from "./fixtures/identity/synthetic.js";

describe("hierarchical business identity and deduplication", () => {
  it("matches stable provider/place identifiers first", () => {
    const left = syntheticIdentity({ providerIdentifiers: [{ providerId: "overture", value: "place-1" }] });
    const right = syntheticIdentity({ entityId: "business-synthetic-b", providerIdentifiers: [{ providerId: "overture", value: "place-1" }] });
    expect(matchBusinessIdentity(left, right)).toMatchObject({ action: "auto_merge", reason: "stable_provider_identifier", matchScore: 10000 });
  });

  it("matches verified domains when locations are not distinct", () => {
    const left = syntheticIdentity({ domains: [{ value: "https://clearwater.example", verified: true }], address: null });
    const right = syntheticIdentity({ entityId: "business-synthetic-b", locationId: "location-synthetic-a", domains: [{ value: "www.clearwater.example", verified: true }], address: null });
    expect(matchBusinessIdentity(left, right)).toMatchObject({ action: "auto_merge", reason: "verified_domain" });
  });

  it("matches a safe verified E.164 business phone", () => {
    const left = syntheticIdentity({ phones: [safeVerifiedPhone], address: null });
    const right = syntheticIdentity({ entityId: "business-synthetic-b", phones: [{ ...safeVerifiedPhone, value: "+1 202 555 0100" }], address: null });
    expect(matchBusinessIdentity(left, right)).toMatchObject({ action: "auto_merge", reason: "verified_e164_phone" });
  });

  it("matches exact conservative normalized addresses", () => {
    const left = syntheticIdentity();
    const right = syntheticIdentity({
      entityId: "business-synthetic-b",
      address: { line1: "100  EXAMPLE WAY", city: "Testville", region: "az", postalCode: "85000", countryCode: "US" },
    });
    expect(matchBusinessIdentity(left, right)).toMatchObject({ action: "auto_merge", reason: "exact_normalized_address" });
  });

  it("requires multiple corroborating fields for a strong match", () => {
    const sharedCandidate = normalizePhoneCandidate("202-555-0199", { shared: true });
    const left = syntheticIdentity({ phones: [sharedCandidate] });
    const right = syntheticIdentity({
      entityId: "business-synthetic-b",
      locationId: "location-synthetic-b",
      phones: [sharedCandidate],
      address: { line1: "101 Different Way", city: "Testville", region: "AZ", postalCode: "85000", countryCode: "US" },
    });
    expect(matchBusinessIdentity(left, right)).toMatchObject({ action: "auto_merge", reason: "strong_multi_field" });
  });

  it("routes fuzzy name candidates to human review and never auto-merges them", () => {
    const left = syntheticIdentity({ displayName: "Phoenix Pool Service", address: null });
    const right = syntheticIdentity({ entityId: "business-synthetic-b", displayName: "Phoenix Pool Services LLC", address: null });
    expect(matchBusinessIdentity(left, right)).toMatchObject({ action: "human_review", reason: "fuzzy_candidate" });
  });

  it.each([
    { shared: true },
    { callCenter: true },
    { multipleLocations: true },
    { associationCertain: false },
  ])("does not merge on unsafe phone metadata %#", (metadata) => {
    const phone = normalizePhoneCandidate("202-555-0123", { verified: true, associationCertain: true, ...metadata });
    const left = syntheticIdentity({ displayName: "Synthetic Alpha", phones: [phone], address: null });
    const right = syntheticIdentity({ entityId: "business-synthetic-b", displayName: "Synthetic Omega", phones: [phone], address: null });
    expect(matchBusinessIdentity(left, right).action).not.toBe("auto_merge");
  });

  it("does not merge on toll-free phone alone", () => {
    const phone = normalizePhoneCandidate("800-555-0100", { verified: true, associationCertain: true });
    const decision = matchBusinessIdentity(
      syntheticIdentity({ displayName: "Synthetic Alpha", phones: [phone], address: null }),
      syntheticIdentity({ entityId: "business-synthetic-b", displayName: "Synthetic Omega", phones: [phone], address: null }),
    );
    expect(decision.action).toBe("no_match");
  });

  it("keeps chain locations distinct while linking their business group", () => {
    const chain = { brandName: "Synthetic Pool Network", franchise: true, verified: true };
    const left = syntheticIdentity({ groupId: "group-synthetic-chain", chainAffiliation: chain, domains: [{ value: "network.example", verified: true }] });
    const right = syntheticIdentity({
      entityId: "business-synthetic-b",
      locationId: "location-synthetic-b",
      groupId: "group-synthetic-chain",
      chainAffiliation: chain,
      domains: [{ value: "network.example", verified: true }],
      address: { line1: "900 Other Road", city: "Sample City", region: "NV", postalCode: "89000", countryCode: "US" },
    });
    const match = matchBusinessIdentity(left, right);
    expect(match).toMatchObject({ action: "group_link", reason: "verified_domain_group" });
    const groups = groupBusinessLocations([left, right], [match]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.locationIds).toEqual(["location-synthetic-a", "location-synthetic-b"]);
  });

  it("retains DBA, display, and legal names as typed aliases", () => {
    const record = syntheticIdentity({
      displayName: "Clearwater Pools",
      dbaNames: ["Clearwater Pool Care"],
      legalName: "Clearwater Synthetic Services LLC",
    });
    const group = groupBusinessLocations([record])[0]!;
    expect(group.legalName).toBe("Clearwater Synthetic Services LLC");
    expect(group.aliases.map((alias) => alias.kind).sort()).toEqual(["dba", "display", "legal"]);
  });

  it("routes conflicting strong identifiers to review", () => {
    const left = syntheticIdentity({
      providerIdentifiers: [{ providerId: "overture", value: "place-1" }],
      domains: [{ value: "alpha.example", verified: true }],
    });
    const right = syntheticIdentity({
      entityId: "business-synthetic-b",
      providerIdentifiers: [{ providerId: "overture", value: "place-1" }],
      domains: [{ value: "omega.example", verified: true }],
    });
    expect(matchBusinessIdentity(left, right)).toMatchObject({ action: "human_review", reason: "conflicting_identifiers" });
  });

  it("is idempotent across repeated ordered deduplication runs", () => {
    const records = [
      syntheticIdentity({ providerIdentifiers: [{ providerId: "fixture", value: "same" }] }),
      syntheticIdentity({ entityId: "business-synthetic-b", providerIdentifiers: [{ providerId: "fixture", value: "same" }] }),
    ];
    expect(deduplicateIdentityCandidates(records, matchBusinessIdentity)).toEqual(
      deduplicateIdentityCandidates([...records].reverse(), matchBusinessIdentity),
    );
  });

  it("preserves industry terms and creates no false automatic merge among adjacent names", () => {
    const names = [
      "Pool Service of Phoenix",
      "Phoenix Pool Service",
      "Phoenix Pool Supply",
      "Phoenix Pool Builders",
    ];
    expect(new Set(names.map(normalizeBusinessName)).size).toBe(4);
    const records = names.map((displayName, index) =>
      syntheticIdentity({ entityId: `business-synthetic-${index}`, locationId: `location-synthetic-${index}`, displayName, address: null }),
    );
    expect(deduplicateIdentityCandidates(records, matchBusinessIdentity).some((entry) => entry.action === "auto_merge")).toBe(false);
  });
});
