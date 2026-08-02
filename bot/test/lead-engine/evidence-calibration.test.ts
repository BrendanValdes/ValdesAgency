import { describe, expect, it } from "vitest";
import {
  assertNonGenericRules,
  calibrateServiceLanguage,
  evaluateServiceLanguage,
  CANDIDATE_SERVICE_LANGUAGE_RULES,
  GENERIC_SERVICE_TERMS,
  MINIMUM_INDEPENDENT_SITES,
  SERVICE_LANGUAGE_RULESET_VERSION,
} from "../../src/lead-engine/qualification/service-language.js";
import {
  assessIdentityCorroboration,
  IDENTITY_CORROBORATION_VERSION,
  MINIMUM_COMPATIBLE_DIMENSIONS,
  type IdentityObservation,
} from "../../src/lead-engine/identity/corroboration.js";
import { POOL_SERVICE_ICP_MODEL_VERSION } from "../../src/lead-engine/qualification/pool-service-model.js";

function observation(overrides: Partial<IdentityObservation> = {}): IdentityObservation {
  return {
    expectedName: "Sunset Pool Care",
    candidateHost: "example-host.invalid",
    expectedLocality: "Mesa",
    expectedPhones: [],
    observedNames: [],
    structuredOrganizationNames: [],
    observedPhones: [],
    observedLocalities: [],
    observedServiceAreas: [],
    ...overrides,
  };
}

describe("Phase 5D service-language rules", () => {
  it("never matches on a generic word alone", () => {
    expect(() => assertNonGenericRules()).not.toThrow();
    for (const generic of GENERIC_SERVICE_TERMS) {
      expect(evaluateServiceLanguage(generic).state).toBe("missing");
      // Even a sentence built only from generic words yields nothing.
      expect(evaluateServiceLanguage(`We provide ${generic} for you.`).state).toBe("missing");
    }
  });

  it("recognises real multi-word service language as strong evidence", () => {
    const strong = evaluateServiceLanguage("We offer weekly pool cleaning and pool equipment repair.");
    expect(strong.state).toBe("strong");
    expect(strong.hits.map((hit) => hit.ruleId)).toContain("psl_cleaning_service");
    expect(strong.facilityOrRetail).toBe(false);
  });

  it("treats supporting-only language as supporting, not strong", () => {
    const supporting = evaluateServiceLanguage("We balance water chemistry for backyard pools.");
    expect(supporting.state).toBe("supporting");
    expect(supporting.hits.every((hit) => hit.strength === "supporting")).toBe(true);
  });

  it("holds facility and retail wording ambiguous even when a service phrase matches", () => {
    for (const text of [
      "Pool cleaning products — shop chemicals and visit our pool supply store.",
      "Open swim and day passes; our hotel pool is cleaned daily with pool cleaning staff.",
      "New pool construction and pool builder services, plus pool maintenance.",
      "Swim lessons and membership rates; pool maintenance included.",
    ]) {
      const evaluation = evaluateServiceLanguage(text);
      expect(evaluation.hits.length).toBeGreaterThan(0);
      expect(evaluation.facilityOrRetail).toBe(true);
      expect(evaluation.state).toBe("ambiguous");
    }
  });

  it("reports missing evidence when nothing matches", () => {
    expect(evaluateServiceLanguage("We are a dental clinic in Mesa.").state).toBe("missing");
  });

  it("promotes a phrase observed on several independent sites", () => {
    const calibration = calibrateServiceLanguage({
      observationsBySite: [
        ["psl_cleaning_service", "psl_recurring_service"],
        ["psl_cleaning_service"],
        ["psl_cleaning_service", "psl_repair_service"],
      ],
    });
    const promoted = calibration.promoted.map((rule) => rule.ruleId);
    expect(promoted).toContain("psl_cleaning_service");
    const cleaning = calibration.promoted.find((rule) => rule.ruleId === "psl_cleaning_service");
    expect(cleaning?.independentSites).toBe(3);
    // Every promoted rule records its identity, strength, evidence type, and risk.
    for (const rule of calibration.promoted) {
      expect(rule.ruleId).toMatch(/^psl_/);
      expect(["strong", "supporting"]).toContain(rule.strength);
      expect(rule.evidenceType).toBe("service_language");
      expect(["low", "medium", "high"]).toContain(rule.falsePositiveRisk);
    }
  });

  it("does not promote a one-off phrase seen on a single site", () => {
    const calibration = calibrateServiceLanguage({
      observationsBySite: [["psl_commercial_pools"], ["psl_cleaning_service"], ["psl_cleaning_service"]],
    });
    expect(calibration.promoted.map((rule) => rule.ruleId)).not.toContain("psl_commercial_pools");
    const rejected = calibration.rejected.find((rule) => rule.ruleId === "psl_commercial_pools");
    expect(rejected?.independentSites).toBe(1);
    expect(calibration.minimumIndependentSites).toBe(MINIMUM_INDEPENDENT_SITES);
  });

  it("counts one site once no matter how many pages repeat the phrase", () => {
    const calibration = calibrateServiceLanguage({
      observationsBySite: [["psl_cleaning_service", "psl_cleaning_service", "psl_cleaning_service"]],
    });
    expect(calibration.promoted).toHaveLength(0);
    expect(calibration.rejected.find((rule) => rule.ruleId === "psl_cleaning_service")?.independentSites).toBe(1);
  });

  it("calibrates deterministically and versions the rule set", () => {
    const sites = [["psl_cleaning_service"], ["psl_cleaning_service"], ["psl_repair_service"]];
    const first = calibrateServiceLanguage({ observationsBySite: sites });
    const second = calibrateServiceLanguage({ observationsBySite: sites });
    expect(second).toEqual(first);
    expect(first.rulesetVersion).toBe(SERVICE_LANGUAGE_RULESET_VERSION);
    expect(first.rulesetVersion).not.toBe(POOL_SERVICE_ICP_MODEL_VERSION);
    // Ordering is stable regardless of catalogue iteration order.
    expect(first.promoted.map((rule) => rule.ruleId))
      .toEqual([...first.promoted.map((rule) => rule.ruleId)].sort());
  });

  it("emits aggregate identifiers only, never matched text", () => {
    const text = "Weekly pool cleaning for Sunset Pool Care at 100 Main Street, call 602-555-0142.";
    const evaluation = evaluateServiceLanguage(text);
    const serialized = JSON.stringify(evaluation).toLowerCase();
    for (const forbidden of ["sunset", "main street", "0142", "weekly pool cleaning for"]) {
      expect(serialized).not.toContain(forbidden);
    }
    const calibration = calibrateServiceLanguage({
      observationsBySite: [evaluation.hits.map((hit) => hit.ruleId)],
    });
    expect(JSON.stringify(calibration).toLowerCase()).not.toContain("sunset");
  });

  it("keeps every catalogue rule reviewable and uniquely identified", () => {
    const ids = CANDIDATE_SERVICE_LANGUAGE_RULES.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const rule of CANDIDATE_SERVICE_LANGUAGE_RULES) {
      expect(rule.falsePositiveNotes.length).toBeGreaterThan(20);
    }
  });
});

describe("Phase 5D identity corroboration", () => {
  it("attaches only when at least two independent dimensions agree", () => {
    const twoDimensions = assessIdentityCorroboration(observation({
      observedNames: ["Sunset Pool Care"],
      observedPhones: ["602-555-0142"],
      expectedPhones: ["+16025550142"],
    }));
    expect(twoDimensions.compatibleCount).toBeGreaterThanOrEqual(MINIMUM_COMPATIBLE_DIMENSIONS);
    expect(twoDimensions.decision).toBe("attach");
    expect(twoDimensions.version).toBe(IDENTITY_CORROBORATION_VERSION);
  });

  it("never attaches on name similarity alone", () => {
    const nameOnly = assessIdentityCorroboration(observation({
      observedNames: ["Sunset Pool Care"],
      candidateHost: "unrelated-host.invalid",
    }));
    expect(nameOnly.compatibleCount).toBe(1);
    expect(nameOnly.decision).toBe("review_required");
    expect(nameOnly.reasonCodes).toContain("name_similarity_only");
  });

  it("corroborates through a matching public phone", () => {
    const byPhone = assessIdentityCorroboration(observation({
      expectedPhones: ["+16025550142"],
      observedPhones: ["602-555-0142"],
      observedNames: ["Sunset Pool Care"],
    }));
    expect(byPhone.dimensions.find((entry) => entry.dimension === "phone")?.state).toBe("compatible");
    expect(byPhone.decision).toBe("attach");
  });

  it("corroborates through locality and service-area wording", () => {
    const byLocality = assessIdentityCorroboration(observation({
      observedNames: ["Sunset Pool Care"],
      observedLocalities: ["Mesa"],
      observedServiceAreas: ["Mesa"],
    }));
    expect(byLocality.dimensions.find((entry) => entry.dimension === "locality")?.state).toBe("compatible");
    expect(byLocality.dimensions.find((entry) => entry.dimension === "service_area")?.state).toBe("compatible");
    expect(byLocality.decision).toBe("attach");
  });

  it("corroborates through structured organization data", () => {
    const byStructured = assessIdentityCorroboration(observation({
      structuredOrganizationNames: ["Sunset Pool Care LLC"],
      candidateHost: "sunset-pools.invalid",
    }));
    expect(byStructured.dimensions
      .find((entry) => entry.dimension === "structured_organization_name")?.state).toBe("compatible");
    expect(byStructured.dimensions.find((entry) => entry.dimension === "domain")?.state).toBe("compatible");
    expect(byStructured.decision).toBe("attach");
  });

  it("keeps a conflicting dimension in review even when others agree", () => {
    const conflicted = assessIdentityCorroboration(observation({
      observedNames: ["Sunset Pool Care"],
      observedLocalities: ["Mesa"],
      observedServiceAreas: ["Mesa"],
      expectedPhones: ["+16025550142"],
      // A different published phone actively contradicts the pairing.
      observedPhones: ["+16025550188"],
    }));
    expect(conflicted.conflictingCount).toBeGreaterThan(0);
    expect(conflicted.decision).toBe("conflict");
    expect(conflicted.reasonCodes).toContain("conflicting_phone");
  });

  it("treats a wholly different published name as a conflict", () => {
    const mismatch = assessIdentityCorroboration(observation({
      observedNames: ["Complete Roofing Contractors"],
      candidateHost: "roofing-contractors.invalid",
    }));
    expect(mismatch.decision).toBe("conflict");
    expect(mismatch.reasonCodes).toContain("conflicting_normalized_name");
  });

  it("requires review when nothing corroborates", () => {
    const bare = assessIdentityCorroboration(observation({ candidateHost: "unrelated.invalid" }));
    expect(bare.compatibleCount).toBe(0);
    expect(bare.decision).toBe("review_required");
    expect(bare.reasonCodes).toContain("no_compatible_dimension");
  });

  it("is deterministic and promotes nothing to verified", () => {
    const input = observation({
      observedNames: ["Sunset Pool Care"], observedLocalities: ["Mesa"],
    });
    expect(assessIdentityCorroboration(input)).toEqual(assessIdentityCorroboration(input));
    const serialized = JSON.stringify(assessIdentityCorroboration(input)).toLowerCase();
    // No verification vocabulary and no raw identity values are emitted.
    for (const forbidden of ["verified", "sunset", "mesa", "invalid"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
