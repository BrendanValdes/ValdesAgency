import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ruleStatesFromComponentScores,
  SALES_FIT_BAND_FLOORS,
  SALES_FIT_MAXIMUM_SCORE,
  SALES_FIT_UNAVAILABLE_SIGNALS,
  salesFitFromComponentScores,
  scoreSalesFit,
} from "../../src/lead-engine/ranking/sales-fit.js";

/**
 * Sales fit — score math, parsing edge cases, and the non-gate invariant.
 *
 * Nothing here touches the network, a database, or the qualifier. The score
 * function takes a plain rule-state map and returns a plain object, so every
 * case below is a direct input/output assertion.
 */

function states(entries: ReadonlyArray<[string, string]>): ReadonlyMap<string, string> {
  return new Map(entries);
}

describe("scoreSalesFit", () => {
  it("scores nothing and reports no_positive_signals for an empty rule state map", () => {
    expect(scoreSalesFit(states([]))).toEqual({
      score: 0,
      band: "minimal",
      reasons: ["no_positive_signals"],
    });
  });

  it("never scores a negative or missing rule state", () => {
    const result = scoreSalesFit(
      states([
        ["niche.recurring_service_observed", "negative"],
        ["opportunity.booking_absent", "missing"],
      ]),
    );
    expect(result.score).toBe(0);
    expect(result.reasons).toEqual(["no_positive_signals"]);
  });

  it("awards recurring maintenance revenue language", () => {
    const result = scoreSalesFit(states([["niche.recurring_service_observed", "positive"]]));
    expect(result).toEqual({ score: 3, band: "light", reasons: ["recurring_service_language"] });
  });

  it("awards the no-online-booking gap", () => {
    const result = scoreSalesFit(states([["opportunity.booking_absent", "positive"]]));
    expect(result).toEqual({ score: 3, band: "light", reasons: ["no_online_booking"] });
  });

  it("caps the weak-capture signal group at three points even with all three fired", () => {
    const result = scoreSalesFit(
      states([
        ["opportunity.contact_form_absent", "positive"],
        ["opportunity.estimate_request_absent", "positive"],
        ["opportunity.primary_cta_absent", "positive"],
      ]),
    );
    expect(result.score).toBe(3);
    expect(result.reasons).toEqual(
      ["contact_form_absent", "estimate_request_absent", "primary_cta_absent"].sort(),
    );
  });

  it("prefers the strong phone-only-dependency signal over the weak public-phone proxy", () => {
    const strong = scoreSalesFit(
      states([
        ["opportunity.phone_only_dependency", "positive"],
        ["contact.public_phone_observed", "positive"],
      ]),
    );
    expect(strong.score).toBe(2);
    expect(strong.reasons).toEqual(["phone_first_contact"]);
  });

  it("awards the weak public-phone proxy only when no form was observed", () => {
    const weak = scoreSalesFit(states([["contact.public_phone_observed", "positive"]]));
    expect(weak).toEqual({ score: 1, band: "minimal", reasons: ["phone_first_contact"] });

    const suppressed = scoreSalesFit(
      states([
        ["contact.public_phone_observed", "positive"],
        ["contact.form_observed", "positive"],
      ]),
    );
    expect(suppressed).toEqual({ score: 0, band: "minimal", reasons: ["no_positive_signals"] });
  });

  it("awards owner evidence only from a verified owner relationship, never inferred", () => {
    const verified = scoreSalesFit(states([["person.owner_relationship_verified", "positive"]]));
    expect(verified).toEqual({ score: 2, band: "minimal", reasons: ["owner_operated_evidence"] });
  });

  it("falls back to the weaker named-operator signal when owner is not verified", () => {
    const named = scoreSalesFit(
      states([
        ["person.name_observed", "positive"],
        ["person.title_observed", "positive"],
      ]),
    );
    expect(named).toEqual({ score: 1, band: "minimal", reasons: ["named_operator_evidence"] });
  });

  it("does not stack owner evidence with the named-operator fallback", () => {
    const result = scoreSalesFit(
      states([
        ["person.owner_relationship_verified", "positive"],
        ["person.name_observed", "positive"],
        ["person.title_observed", "positive"],
      ]),
    );
    expect(result.score).toBe(2);
    expect(result.reasons).toEqual(["owner_operated_evidence"]);
  });

  it("awards the weak independence proxy from identity agreement", () => {
    const result = scoreSalesFit(states([["legitimacy.identity_agrees", "positive"]]));
    expect(result).toEqual({ score: 1, band: "minimal", reasons: ["independent_site_identity"] });
  });

  it("reaches the documented maximum score with every signal fired and lands in the strong band", () => {
    const result = scoreSalesFit(
      states([
        ["niche.recurring_service_observed", "positive"],
        ["opportunity.booking_absent", "positive"],
        ["opportunity.contact_form_absent", "positive"],
        ["opportunity.estimate_request_absent", "positive"],
        ["opportunity.primary_cta_absent", "positive"],
        ["opportunity.phone_only_dependency", "positive"],
        ["person.owner_relationship_verified", "positive"],
        ["legitimacy.identity_agrees", "positive"],
      ]),
    );
    expect(result.score).toBe(SALES_FIT_MAXIMUM_SCORE);
    expect(result.band).toBe("strong");
  });

  it.each([
    [SALES_FIT_BAND_FLOORS.strong, "strong"],
    [SALES_FIT_BAND_FLOORS.moderate, "moderate"],
    [SALES_FIT_BAND_FLOORS.light, "light"],
    [SALES_FIT_BAND_FLOORS.minimal, "minimal"],
  ])("treats score %i as the %s band floor", (score, band) => {
    // recurring (3) + booking (3) + capture group capped (3) reaches 9 (strong);
    // drop signals to land exactly on each documented floor.
    const bySignal: Record<number, ReadonlyArray<[string, string]>> = {
      9: [
        ["niche.recurring_service_observed", "positive"],
        ["opportunity.booking_absent", "positive"],
        ["opportunity.contact_form_absent", "positive"],
        ["opportunity.estimate_request_absent", "positive"],
        ["opportunity.primary_cta_absent", "positive"],
      ],
      6: [
        ["niche.recurring_service_observed", "positive"],
        ["opportunity.booking_absent", "positive"],
      ],
      3: [["niche.recurring_service_observed", "positive"]],
      0: [],
    };
    const result = scoreSalesFit(states(bySignal[score] ?? []));
    expect(result.score).toBe(score);
    expect(result.band).toBe(band);
  });

  it("sorts reasons deterministically regardless of signal evaluation order", () => {
    const result = scoreSalesFit(
      states([
        ["legitimacy.identity_agrees", "positive"],
        ["niche.recurring_service_observed", "positive"],
      ]),
    );
    expect(result.reasons).toEqual([...result.reasons].sort());
  });
});

describe("ruleStatesFromComponentScores", () => {
  it("returns null for a null or blank column", () => {
    expect(ruleStatesFromComponentScores(null)).toBeNull();
    expect(ruleStatesFromComponentScores("")).toBeNull();
    expect(ruleStatesFromComponentScores("   ")).toBeNull();
  });

  it("returns null for unparseable JSON", () => {
    expect(ruleStatesFromComponentScores("{not json")).toBeNull();
  });

  it("returns null when the parsed value is not an array", () => {
    expect(ruleStatesFromComponentScores(JSON.stringify({ outcomes: [] }))).toBeNull();
  });

  it("returns null when no component carries a readable outcome", () => {
    const json = JSON.stringify([{ outcomes: "not-an-array" }, { notOutcomes: [] }]);
    expect(ruleStatesFromComponentScores(json)).toBeNull();
  });

  it("flattens outcomes across components and skips malformed entries", () => {
    const json = JSON.stringify([
      {
        outcomes: [
          { ruleId: "opportunity.booking_absent", state: "positive" },
          { ruleId: "", state: "positive" },
          { ruleId: "missing.state" },
          { ruleId: 5, state: "positive" },
        ],
      },
      { outcomes: [{ ruleId: "niche.recurring_service_observed", state: "positive" }] },
    ]);
    const result = ruleStatesFromComponentScores(json);
    expect(result).not.toBeNull();
    expect(result?.get("opportunity.booking_absent")).toBe("positive");
    expect(result?.get("niche.recurring_service_observed")).toBe("positive");
    expect(result?.size).toBe(2);
  });
});

describe("salesFitFromComponentScores", () => {
  it("reports unscored, not minimal, when qualification was never evaluated", () => {
    expect(salesFitFromComponentScores(null)).toEqual({
      score: 0,
      band: "unscored",
      reasons: ["qualification_not_evaluated"],
    });
  });

  it("delegates to scoreSalesFit once rule states parse", () => {
    const json = JSON.stringify([
      { outcomes: [{ ruleId: "opportunity.booking_absent", state: "positive" }] },
    ]);
    expect(salesFitFromComponentScores(json)).toEqual({
      score: 3,
      band: "light",
      reasons: ["no_online_booking"],
    });
  });
});

describe("documented constants", () => {
  it("names exactly the two signals that are absent on purpose", () => {
    expect(SALES_FIT_UNAVAILABLE_SIGNALS).toEqual([
      "website_chat_absent",
      "franchise_or_multi_location_evidence",
    ]);
  });
});

describe("sales fit is not wired into any gate", () => {
  it.each([
    "src/lead-engine/qualification/qualifier.ts",
    "src/lead-engine/ranking/ranker.ts",
    "src/lead-engine/ranking/queue-repository.ts",
  ])("is never imported by %s", (relativePath) => {
    const source = readFileSync(path.join(process.cwd(), relativePath), "utf8");
    expect(source).not.toMatch(/sales-fit/);
  });
});
