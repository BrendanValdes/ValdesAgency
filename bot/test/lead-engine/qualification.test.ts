import { describe, expect, it } from "vitest";
import { qualifyPoolServiceLead } from "../../src/lead-engine/qualification/qualifier.js";
import {
  POOL_SERVICE_ICP_MODEL_VERSION,
  POOL_SERVICE_ICP_V1,
} from "../../src/lead-engine/qualification/pool-service-model.js";
import type {
  PoolServiceQualificationInput,
  QualificationFact,
} from "../../src/lead-engine/qualification/types.js";
import {
  makeQualificationInput,
  QUALIFICATION_EVALUATED_AT,
  QUALIFICATION_FRESH_UNTIL,
  qualificationFact,
  qualificationReference,
  verifiedFact,
} from "./helpers/qualification-fixture.js";

function qualify(input = makeQualificationInput()) {
  return qualifyPoolServiceLead(input, { modelVersion: POOL_SERVICE_ICP_MODEL_VERSION });
}

function points(result: ReturnType<typeof qualify>, ruleId: string): number {
  return result.componentScores.flatMap((component) => component.outcomes)
    .find((outcome) => outcome.ruleId === ruleId)?.points ?? -1;
}

function historicalFact(source: QualificationFact): QualificationFact {
  return {
    ...source,
    references: source.references.map((reference) => ({
      ...reference,
      sourceClass: "historical_manual_artifact" as const,
    })),
  };
}

describe("pool-service ICP qualification v1", () => {
  it("uses explicit integer weights that sum to 100 and produces the typed output contract", () => {
    const result = qualify();
    expect(POOL_SERVICE_ICP_V1.version).toBe("pool_service_icp_v1");
    expect(Object.values(POOL_SERVICE_ICP_V1.componentWeights).reduce((sum, value) => sum + value, 0)).toBe(100);
    expect(result).toMatchObject({
      modelVersion: "pool_service_icp_v1",
      niche: "pool_service",
      icpResult: "qualified",
      overallScore: 69,
      priorityTier: "qualified",
      identityReviewState: "clear",
      reviewRequirements: { required: false, reasons: [] },
      confidence: { usedAsVerification: false },
    });
    expect(result.componentScores.map(({ component, maximumPoints }) => [component, maximumPoints]))
      .toEqual(Object.entries(POOL_SERVICE_ICP_V1.componentWeights));
    expect(result.hardDisqualifiers).toEqual([]);
    expect(result.missingInformationFlags).toContain("suppression_state_unavailable");
  });

  it("hard-disqualifies a business only when current evidence explicitly says it is closed", () => {
    const base = makeQualificationInput();
    const result = qualify({
      ...base,
      operations: [...base.operations, {
        kind: "closed",
        status: "negative",
        detail: "The page explicitly states that the business is closed",
        fact: qualificationFact("closed:explicit", "evidence", "operation-closed-001", { state: "negative" }),
      }],
    });
    expect(result.icpResult).toBe("disqualified");
    expect(result.hardDisqualifiers.map(({ ruleId }) => ruleId)).toEqual(["hard.confirmed_closed"]);
    expect(result.overallScore).toBeGreaterThan(0);
  });

  it("hard-disqualifies an evidence-backed excluded operator without pool-service evidence", () => {
    const base = makeQualificationInput();
    const result = qualify({
      ...base,
      services: [{
        state: "negative",
        term: "manufacturer",
        basis: "service_description",
        fact: qualificationFact("manufacturer", "service_evidence", "service-manufacturer-001", { state: "negative" }),
      }],
    });
    expect(result.icpResult).toBe("disqualified");
    expect(result.hardDisqualifiers.map(({ ruleId }) => ruleId)).toEqual(["hard.excluded_service_operator"]);
  });

  it("hard-disqualifies a persisted location outside every selected market", () => {
    const base = makeQualificationInput();
    const result = qualify({
      ...base,
      geography: {
        ...base.geography,
        locations: [qualificationFact(
          "country:US|subdivision:US-NV",
          "business_locations",
          "location-nevada-001",
        )],
      },
    });
    expect(result.icpResult).toBe("disqualified");
    expect(result.hardDisqualifiers.map(({ ruleId }) => ruleId)).toEqual(["hard.outside_selected_geography"]);
  });

  it("hard-disqualifies historical-only material evidence without current corroboration", () => {
    const base = makeQualificationInput();
    const assessment = base.assessment as NonNullable<typeof base.assessment>;
    const result = qualify({
      ...base,
      assessment: {
        ...assessment,
        sourceClass: "legacy_unclassified",
        reference: { ...assessment.reference, sourceClass: "legacy_unclassified" },
      },
      services: base.services.map((entry) => ({ ...entry, fact: historicalFact(entry.fact) })),
      operations: base.operations.map((entry) => ({ ...entry, fact: historicalFact(entry.fact) })),
      conversions: base.conversions.map((entry) => ({ ...entry, fact: historicalFact(entry.fact) })),
      contacts: base.contacts.map((entry) => ({ ...entry, fact: historicalFact(entry.fact) })),
      people: base.people.map((entry) => ({ ...entry, fact: historicalFact(entry.fact) })),
    });
    expect(result.icpResult).toBe("disqualified");
    expect(result.hardDisqualifiers.map(({ ruleId }) => ruleId)).toEqual(["hard.historical_only_evidence"]);
  });

  it("never converts missing evidence into a hard disqualifier", () => {
    const base = makeQualificationInput();
    const result = qualify({
      ...base,
      assessment: null,
      geography: { locations: [], selectedMarkets: [] },
      services: [],
      operations: [],
      conversions: [],
      contacts: [],
      people: [],
      verifications: [],
      identityReview: { state: "unavailable", reasons: [], references: [] },
      structuredBusinessData: [],
    });
    expect(result.hardDisqualifiers).toEqual([]);
    expect(result.icpResult).toBe("not_evaluated");
    expect(result.missingInformationFlags).toEqual(expect.arrayContaining([
      "service_fit_unknown",
      "phone_missing",
      "email_missing",
      "decision_maker_unknown",
      "website_assessment_missing",
    ]));
  });

  it("routes unresolved identity to a non-boolean identity-review result regardless of score", () => {
    const base = makeQualificationInput();
    const result = qualify({
      ...base,
      business: { ...base.business, state: "human_review" },
      identityReview: {
        state: "required",
        reasons: ["strong_identifier_conflict"],
        references: [qualificationReference("identity_decision_audits", "identity-review-001", {
          sourceClass: null,
          claimState: null,
          freshness: "unknown",
          freshUntil: null,
        })],
      },
    });
    expect(result.overallScore).toBeGreaterThanOrEqual(50);
    expect(result.icpResult).toBe("identity_review_required");
    expect(result.reviewRequirements).toEqual({ required: true, reasons: ["strong_identifier_conflict"] });
  });

  it("flags stale evidence distinctly and does not treat it as false or disqualified", () => {
    const base = makeQualificationInput();
    const assessment = base.assessment as NonNullable<typeof base.assessment>;
    const staleAssessment = {
      ...assessment,
      freshUntil: "2026-01-14T12:00:00.000Z",
      reference: {
        ...assessment.reference,
        freshUntil: "2026-01-14T12:00:00.000Z",
        freshness: "stale" as const,
      },
    };
    const result = qualify({ ...base, assessment: staleAssessment });
    expect(result.icpResult).toBe("stale_evidence");
    expect(result.hardDisqualifiers).toEqual([]);
    expect(result.freshnessWarnings).toContain("website_assessment_stale");
    expect(result.reviewRequirements.reasons).toContain("fresh_evidence_required");
  });
});

describe("verification-aware scoring", () => {
  it("gives observed phone, email, person, and title only candidate-level credit", () => {
    const result = qualify();
    expect(points(result, "contact.public_phone_observed")).toBe(4);
    expect(points(result, "contact.phone_reachability_verified")).toBe(0);
    expect(points(result, "contact.public_email_observed")).toBe(2);
    expect(points(result, "contact.email_deliverability_verified")).toBe(0);
    expect(points(result, "person.name_observed")).toBe(2);
    expect(points(result, "person.title_observed")).toBe(2);
    expect(points(result, "person.owner_relationship_verified")).toBe(0);
    expect(points(result, "person.decision_authority_verified")).toBe(0);
  });

  it("awards only compatible dimension-specific external verification points", () => {
    const base = makeQualificationInput();
    const result = qualify({
      ...base,
      verifications: [
        verifiedFact({ id: "verify-phone-001", value: "+12025550100", dimension: "phone_reachability", method: "phone_reachability_check" }),
        verifiedFact({ id: "verify-email-001", value: "hello@example.test", dimension: "email_deliverability", method: "email_deliverability_check" }),
        verifiedFact({ id: "verify-owner-001", entityType: "person", entityId: "person-qualification-001", value: "Avery Example", dimension: "person_owner_relationship", method: "owner_relationship_verification" }),
      ],
    });
    expect(points(result, "contact.phone_reachability_verified")).toBe(2);
    expect(points(result, "contact.email_deliverability_verified")).toBe(2);
    expect(points(result, "person.owner_relationship_verified")).toBe(3);
    expect(points(result, "person.decision_authority_verified")).toBe(0);
  });

  it("does not turn high confidence or an incompatible verification dimension into verified credit", () => {
    const base = makeQualificationInput();
    const result = qualify({
      ...base,
      verifications: [verifiedFact({
        id: "verify-phone-syntax-001",
        value: "+12025550100",
        dimension: "phone_syntax",
        method: "phone_syntax_normalization",
      })],
    });
    expect(result.confidence.observedMaximumBasisPoints).toBe(8_000);
    expect(result.confidence.usedAsVerification).toBe(false);
    expect(points(result, "contact.phone_reachability_verified")).toBe(0);
  });

  it("labels accepted human confirmation separately from external owner verification", () => {
    const base = makeQualificationInput();
    const human = {
      ...verifiedFact({
        id: "human-owner-001",
        entityType: "person",
        entityId: "person-qualification-001",
        value: "Avery Example",
        dimension: "person_owner_relationship",
        method: "owner_relationship_verification",
        sourceClass: "human_review",
        claimState: "human_confirmed",
      }),
      verificationState: "not_checked" as const,
      externalVerificationState: "unassessed" as const,
      verifierId: null,
      verificationMethod: null,
      verificationResult: null,
      verifiedAt: null,
      expiresAt: null,
      humanReviewState: "accepted" as const,
      humanReviewerId: "reviewer-synthetic-001",
      humanReviewedAt: QUALIFICATION_EVALUATED_AT,
      fact: {
        value: "Avery Example",
        state: "positive" as const,
        references: [qualificationReference("evidence", "human-owner-001", {
          sourceClass: "human_review",
          claimState: "human_confirmed",
          verificationDimension: "person_owner_relationship",
          humanReviewState: "accepted",
        })],
      },
    };
    const result = qualify({ ...base, verifications: [human] });
    expect(points(result, "person.human_confirmation")).toBe(1);
    expect(points(result, "person.owner_relationship_verified")).toBe(0);
  });
});

describe("missing data, determinism, and explainability", () => {
  it("distinguishes missing phone/email/owner from failed verification", () => {
    const base = makeQualificationInput();
    const missing = qualify({ ...base, contacts: [], people: [], verifications: [] });
    const failedVerification = {
      ...verifiedFact({
        id: "failed-phone-001",
        value: "+12025550100",
        dimension: "phone_syntax",
        method: "phone_syntax_normalization",
      }),
      externalVerificationState: "failed" as const,
      verificationResult: "failed" as const,
    };
    const failed = qualify({ ...base, contacts: [], people: [], verifications: [failedVerification] });
    expect(missing.missingInformationFlags).toContain("phone_missing");
    expect(missing.verificationLimitations).not.toContain("verification_failed:phone_syntax");
    expect(failed.verificationLimitations).toContain("verification_failed:phone_syntax");
    expect(failed.missingInformationFlags).toContain("phone_missing");
  });

  it.each([
    ["phone", "phone_syntax", "phone_syntax_normalization", "phone_missing"],
    ["email", "email_deliverability", "email_deliverability_check", "email_missing"],
    ["owner", "person_owner_relationship", "owner_relationship_verification", "owner_relationship_not_verified"],
  ] as const)("distinguishes missing %s evidence from an explicit failed check", (
    _label,
    dimension,
    method,
    missingFlag,
  ) => {
    const base = makeQualificationInput();
    const withoutCandidate = {
      ...base,
      contacts: dimension === "phone_syntax"
        ? base.contacts.filter(({ kind }) => kind !== "phone")
        : dimension === "email_deliverability"
          ? base.contacts.filter(({ kind }) => kind !== "email")
          : base.contacts,
      people: dimension === "person_owner_relationship" ? [] : base.people,
      verifications: [],
    } satisfies PoolServiceQualificationInput;
    const missing = qualify(withoutCandidate);
    const failedCheck = {
      ...verifiedFact({
        id: `failed-${dimension}-001`,
        entityType: dimension === "person_owner_relationship" ? "person" as const : "business" as const,
        entityId: dimension === "person_owner_relationship" ? "person-qualification-001" : "business-qualification-001",
        value: dimension === "email_deliverability" ? "hello@example.test"
          : dimension === "person_owner_relationship" ? "Avery Example" : "+12025550100",
        dimension,
        method,
      }),
      externalVerificationState: "failed" as const,
      verificationResult: "failed" as const,
      fact: qualificationFact(`failed:${dimension}`, "evidence", `failed-${dimension}-001`, {
        state: "negative",
        verificationDimension: dimension,
      }),
    };
    const failed = qualify({ ...withoutCandidate, verifications: [failedCheck] });
    expect(missing.missingInformationFlags).toContain(missingFlag);
    expect(missing.verificationLimitations).not.toContain(`verification_failed:${dimension}`);
    expect(failed.missingInformationFlags).toContain(missingFlag);
    expect(failed.verificationLimitations).toContain(`verification_failed:${dimension}`);
  });

  it("distinguishes a failed crawl from observed website weakness", () => {
    const base = makeQualificationInput();
    const failedAssessment = base.assessment as NonNullable<typeof base.assessment>;
    const failed = qualify({
      ...base,
      assessment: { ...failedAssessment, status: "failed" },
      conversions: base.conversions.map((entry) => ({
        ...entry,
        status: "unavailable" as const,
        fact: { ...entry.fact, state: "missing" as const },
      })),
    });
    const weak = qualify({
      ...base,
      conversions: base.conversions.map((entry) => ({
        ...entry,
        status: entry.feature === "contact_route" ? "present" as const : "absent_after_successful_inspection" as const,
      })),
    });
    expect(failed.componentScores.find(({ component }) => component === "opportunity_signals")?.points).toBe(0);
    expect(failed.missingInformationFlags).toContain("booking_assessment_unknown");
    expect(weak.componentScores.find(({ component }) => component === "opportunity_signals")?.points).toBe(20);
    expect(weak.positiveSignals.map(({ ruleId }) => ruleId)).toContain("opportunity.booking_absent");
  });

  it("produces identical scores, fingerprints, explanations, and ordering for identical input and clock", () => {
    const input = makeQualificationInput();
    const first = qualify(input);
    const second = qualify(input);
    expect(second).toEqual(first);
    expect(first.finalExplanation).toContain("Components: niche_service_fit 25/25");
    expect(first.componentScores.map(({ component }) => component)).toEqual([
      "niche_service_fit",
      "business_legitimacy",
      "opportunity_signals",
      "contactability",
      "decision_maker_evidence",
      "outreach_readiness",
      "evidence_quality_freshness",
    ]);
  });

  it("makes every contribution traceable or explicitly missing with deterministic language", () => {
    const result = qualify();
    for (const outcome of result.componentScores.flatMap((component) => component.outcomes)) {
      expect(outcome.ruleId).toMatch(/^[a-z]+\.[a-z_]+$/);
      expect(outcome.explanation).not.toMatch(/good business|high potential|looks promising/i);
      expect(outcome.explanation.trim().length).toBeGreaterThan(10);
      if (outcome.points > 0) expect(outcome.evidenceReferences.length).toBeGreaterThan(0);
      if (outcome.state === "missing" && outcome.evidenceReferences.length === 0) {
        expect(outcome.missingFlag).not.toBeNull();
      }
    }
    expect(result.evidenceReferences.every(({ sourceId, sourceTable }) => Boolean(sourceId && sourceTable))).toBe(true);
  });

  it("rejects unsupported model versions and non-pool niches", () => {
    expect(() => qualifyPoolServiceLead(makeQualificationInput(), { modelVersion: "pool_service_icp_v2" }))
      .toThrow("Unsupported");
    const base = makeQualificationInput();
    const nonPool = {
      ...base,
      business: { ...base.business, nicheId: "landscaping" },
    } satisfies PoolServiceQualificationInput;
    expect(() => qualify(nonPool)).toThrow("only pool_service");
  });
});
