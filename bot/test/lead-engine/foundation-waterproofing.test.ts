import { describe, expect, it } from "vitest";
import {
  FOUNDATION_WATERPROOFING_ICP_V1,
  FOUNDATION_WATERPROOFING_ICP_MODEL_VERSION,
} from "../../src/lead-engine/qualification/qualification-model.js";
import { qualifyLead, qualifyPoolServiceLead } from "../../src/lead-engine/qualification/qualifier.js";
import { POOL_SERVICE_ICP_MODEL_VERSION } from "../../src/lead-engine/qualification/pool-service-model.js";
import { rankQueueCandidate } from "../../src/lead-engine/ranking/ranker.js";
import { salesFitFromComponentScores } from "../../src/lead-engine/ranking/sales-fit.js";
import {
  makeQualificationInput,
  qualificationFact,
  qualificationReference,
} from "./helpers/qualification-fixture.js";

function foundationInput(services: ReturnType<typeof makeQualificationInput>["services"]) {
  const base = makeQualificationInput();
  return {
    ...base,
    business: {
      ...base.business,
      canonicalName: "Local Foundation Specialists",
      nicheId: "foundation_waterproofing",
    },
    services,
    contacts: base.contacts.filter((entry) => entry.kind === "phone").map((entry) => ({
      ...entry,
      fact: qualificationFact(
        entry.fact.value,
        "website_contact_observations",
        "foundation-phone",
        { references: [qualificationReference(
          "website_contact_observations",
          "foundation-phone",
          {
            sourceClass: "public_business_website",
            claimState: "public_unverified_candidate",
          },
        )] },
      ),
    })),
    people: [],
    structuredBusinessData: [],
  };
}

function positiveService(term: string, index: number) {
  return {
    state: "positive" as const,
    term,
    basis: "heading" as const,
    fact: qualificationFact(term, "service_evidence", `foundation-service-${index}`, {
      references: [qualificationReference(
        "service_evidence",
        `foundation-service-${index}`,
        { sourceClass: "public_business_website" },
      )],
    }),
  };
}

function negativeService(term: string, index: number) {
  return {
    state: "negative" as const,
    term,
    basis: "service_description" as const,
    fact: qualificationFact(term, "service_evidence", `foundation-negative-${index}`, {
      state: "negative",
    }),
  };
}

describe("foundation-waterproofing ICP qualification", () => {
  it("keeps the existing pool-service qualifier unchanged", () => {
    const result = qualifyPoolServiceLead(makeQualificationInput(), {
      modelVersion: POOL_SERVICE_ICP_MODEL_VERSION,
    });
    expect(result.niche).toBe("pool_service");
    expect(result.modelVersion).toBe("pool_service_icp_v1");
    expect(result.icpResult).toBe("qualified");
    expect(result.overallScore).toBe(69);
    expect(result.componentScores.map(({ component, points, maximumPoints }) => ({
      component,
      points,
      maximumPoints,
    }))).toEqual([
      { component: "niche_service_fit", points: 25, maximumPoints: 25 },
      { component: "business_legitimacy", points: 15, maximumPoints: 15 },
      { component: "opportunity_signals", points: 0, maximumPoints: 20 },
      { component: "contactability", points: 11, maximumPoints: 15 },
      { component: "decision_maker_evidence", points: 4, maximumPoints: 10 },
      { component: "outreach_readiness", points: 10, maximumPoints: 10 },
      { component: "evidence_quality_freshness", points: 4, maximumPoints: 5 },
    ]);
  });

  it("qualifies a legitimate callable contractor despite booking, form, estimate, and CTA features", () => {
    const result = qualifyLead(foundationInput([
      positiveService("foundation repair", 1),
    ]), { modelVersion: FOUNDATION_WATERPROOFING_ICP_MODEL_VERSION });

    expect(result.niche).toBe("foundation_waterproofing");
    expect(result.icpResult).toBe("qualified");
    expect(result.overallScore).toBe(72);
    const outcomes = result.componentScores.flatMap((component) => component.outcomes);
    const category = outcomes.find((outcome) => outcome.ruleId === "niche.relevant_category");
    const breadth = outcomes.find((outcome) => outcome.ruleId === "niche.multiple_services_observed");
    const recurring = outcomes.find((outcome) => outcome.ruleId === "niche.recurring_service_observed");
    expect(category).toMatchObject({ state: "positive", points: category?.maximumPoints });
    expect(breadth).toMatchObject({ state: "positive", points: breadth?.maximumPoints });
    expect(recurring).toMatchObject({ state: "not_applicable", points: 0, maximumPoints: 0 });
    expect(outcomes.filter((outcome) => outcome.component === "opportunity_signals"))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ ruleId: "opportunity.booking_absent", state: "negative", points: 0 }),
        expect.objectContaining({ ruleId: "opportunity.contact_form_absent", state: "negative", points: 0 }),
        expect.objectContaining({ ruleId: "opportunity.estimate_request_absent", state: "negative", points: 0 }),
        expect.objectContaining({ ruleId: "opportunity.primary_cta_absent", state: "negative", points: 0 }),
      ]));
  });

  it("keeps foundation component and rule maximums at exactly 100", () => {
    expect(Object.values(FOUNDATION_WATERPROOFING_ICP_V1.componentWeights)
      .reduce((total, maximum) => total + maximum, 0)).toBe(100);
    expect(FOUNDATION_WATERPROOFING_ICP_V1.scoreRules
      .reduce((total, rule) => total + rule.maximumPoints, 0)).toBe(100);
    for (const [component, maximum] of Object.entries(
      FOUNDATION_WATERPROOFING_ICP_V1.componentWeights,
    )) {
      expect(FOUNDATION_WATERPROOFING_ICP_V1.scoreRules
        .filter((rule) => rule.component === component)
        .reduce((total, rule) => total + rule.maximumPoints, 0)).toBe(maximum);
    }
  });

  it("reaches the existing callable and sales-fit ranking framework", () => {
    const qualification = qualifyLead(foundationInput([
      positiveService("foundation repair", 30),
      positiveService("basement waterproofing", 31),
    ]), { modelVersion: FOUNDATION_WATERPROOFING_ICP_MODEL_VERSION });
    const ranked = rankQueueCandidate({
      businessId: qualification.businessId,
      canonicalBusinessId: qualification.businessId,
      businessState: "found",
      businessUpdatedAt: qualification.evaluatedAt,
      assessment: {
        id: "assessment-qualification-001",
        status: "complete",
        assessedAt: qualification.evaluatedAt,
        freshUntil: qualification.freshUntil,
        reviewRequired: false,
        identityState: "agrees",
      },
      qualification,
      coverageKeys: ["coverage:foundation-test"],
      geographies: [{ countryCode: "US", subdivisionCode: "US-AZ" }],
      identityReviewReasons: [],
      duplicateOfEvaluationId: null,
    }, {
      queueVersion: "calling_queue_v1",
      rankingModelVersion: "pool_service_ranking_v1",
      niche: "foundation_waterproofing",
      scope: { kind: "coverage_keys", coverageKeys: ["coverage:foundation-test"] },
      maximumCallable: 10,
      maximumReview: 10,
      minimumQualificationScore: 0,
      minimumPriorityScore: 0,
      acceptedQualificationResults: ["qualified"],
      qualificationModelVersion: FOUNDATION_WATERPROOFING_ICP_MODEL_VERSION,
      freshnessPolicyVersion: "pool_service_queue_freshness_v1",
      includedContactRoutes: ["phone", "email", "form"],
      contactPolicy: "require_route",
      generatedAt: "2026-01-20T12:00:00.000Z",
    });

    expect(ranked.disposition).toBe("callable");
    const salesFit = salesFitFromComponentScores(JSON.stringify(qualification.componentScores));
    expect(salesFit.band).not.toBe("unscored");
    expect(salesFit.reasons).not.toContain("recurring_service_language");
  });

  it.each([
    ["general contractor", "foundation inspection"],
    ["plumber", "sump pump installation"],
    ["roofing company", "waterproofing"],
    ["landscaping company", "yard drainage"],
    ["mold remediation", "basement moisture"],
    ["concrete flatwork", "foundation slab"],
    ["home builder", "new foundations"],
    ["deck waterproofing", "waterproof coatings"],
  ])("rejects an adjacent %s business with only weak overlap", (excluded, weakOverlap) => {
    const result = qualifyLead(foundationInput([
      positiveService(weakOverlap, 10),
      negativeService(excluded, 11),
    ]), { modelVersion: FOUNDATION_WATERPROOFING_ICP_MODEL_VERSION });
    expect(result.icpResult).toBe("disqualified");
    expect(result.hardDisqualifiers.map((entry) => entry.ruleId))
      .toContain("hard.excluded_service_operator");
  });

  it("does not treat a standalone sump-pump mention as foundation service evidence", () => {
    const result = qualifyLead(foundationInput([
      positiveService("sump pump installation", 20),
    ]), { modelVersion: FOUNDATION_WATERPROOFING_ICP_MODEL_VERSION });
    expect(result.icpResult).toBe("insufficient_evidence");
    expect(result.positiveSignals.map((entry) => entry.ruleId))
      .not.toContain("niche.core_service_observed");
  });
});
