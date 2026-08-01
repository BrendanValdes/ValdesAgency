import { describe, expect, it } from "vitest";
import { evaluatePersonName } from "../../src/lead-engine/domain/person-quality.js";

describe("person and contact placeholder rejection", () => {
  it.each(["", "   ", "unknown", "n/a", "na", "not available", "owner", "manager"])(
    "rejects the placeholder name %j",
    (name) => {
      expect(evaluatePersonName(name, ["Clearwater Synthetic Pool Care"])).toMatchObject({ accepted: false });
    },
  );

  it.each(["hello@example.test", "+1 (202) 555-0100", "2025550100"])(
    "rejects contact values placed in the person-name field",
    (name) => {
      expect(evaluatePersonName(name, ["Clearwater Synthetic Pool Care"])).toMatchObject({ accepted: false });
    },
  );

  it("rejects an exact business-name fallback", () => {
    expect(evaluatePersonName("Clearwater Synthetic Pool Care", ["Clearwater Synthetic Pool Care"]))
      .toMatchObject({ accepted: false, reason: "business_name_as_person" });
  });

  it("allows absence to remain absence", () => {
    expect(evaluatePersonName(null, ["Clearwater Synthetic Pool Care"]))
      .toEqual({ accepted: true, normalizedName: null, reason: null });
  });

  it.each(["Na Li", "O'Neil Smith", "Manager Surname", "Ownerby Example"])(
    "accepts the legitimate edge-case name %j without substring rejection",
    (name) => {
      expect(evaluatePersonName(name, ["Clearwater Synthetic Pool Care"]).accepted).toBe(true);
    },
  );
});
