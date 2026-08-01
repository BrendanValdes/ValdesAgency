import type {
  ClaimState,
  ProvenanceSourceClass,
  VerificationDimension,
  VerificationMethod,
} from "../../../src/lead-engine/domain/provenance.js";
import type {
  PoolServiceQualificationInput,
  QualificationEvidenceReference,
  QualificationFact,
} from "../../../src/lead-engine/qualification/types.js";

export const QUALIFICATION_EVALUATED_AT = "2026-01-15T12:00:00.000Z";
export const QUALIFICATION_FRESH_UNTIL = "2026-02-15T12:00:00.000Z";

export function qualificationReference(
  sourceTable: QualificationEvidenceReference["sourceTable"],
  sourceId: string,
  overrides: Partial<QualificationEvidenceReference> = {},
): QualificationEvidenceReference {
  return {
    sourceTable,
    sourceId,
    sourceClass: "synthetic_fixture",
    claimState: "observed",
    evidenceState: "found",
    verificationState: "not_checked",
    verificationDimension: null,
    externalVerificationState: "unassessed",
    verificationMethod: null,
    verificationResult: null,
    humanReviewState: "unreviewed",
    observedAt: QUALIFICATION_EVALUATED_AT,
    freshUntil: QUALIFICATION_FRESH_UNTIL,
    confidenceBasisPoints: 8_000,
    freshness: "current",
    ...overrides,
  };
}

export function qualificationFact(
  value: string,
  sourceTable: QualificationEvidenceReference["sourceTable"],
  sourceId: string,
  overrides: Partial<QualificationFact> = {},
): QualificationFact {
  return {
    value,
    state: "positive",
    references: [qualificationReference(sourceTable, sourceId)],
    ...overrides,
  };
}

export function verifiedFact(input: {
  id: string;
  entityType?: "business" | "person";
  entityId?: string;
  fieldName?: string;
  value: string;
  dimension: VerificationDimension;
  method: VerificationMethod;
  sourceClass?: ProvenanceSourceClass;
  claimState?: ClaimState;
}) {
  const sourceClass = input.sourceClass ?? "external_verification_provider";
  const claimState = input.claimState ?? "externally_verified";
  const ref = qualificationReference("evidence", input.id, {
    sourceClass,
    claimState,
    verificationState: claimState === "externally_verified" ? "externally_verified" : "not_checked",
    verificationDimension: input.dimension,
    externalVerificationState: claimState === "externally_verified" ? "current" : "unassessed",
    verificationMethod: input.method,
    verificationResult: "passed",
  });
  return {
    entityType: input.entityType ?? "business",
    entityId: input.entityId ?? "business-qualification-001",
    fieldName: input.fieldName ?? input.dimension,
    claimedValue: input.value,
    sourceClass,
    claimState,
    evidenceState: "found" as const,
    verificationState: claimState === "externally_verified" ? "externally_verified" as const : "not_checked" as const,
    decisionState: "accepted" as const,
    conflictStatus: "none" as const,
    externalVerificationState: claimState === "externally_verified" ? "current" as const : "unassessed" as const,
    humanReviewState: "unreviewed" as const,
    verificationDimension: input.dimension,
    verifierId: claimState === "externally_verified" ? "synthetic-verifier" : null,
    verificationMethod: input.method,
    verificationResult: "passed" as const,
    verifiedAt: "2026-01-14T12:00:00.000Z",
    expiresAt: QUALIFICATION_FRESH_UNTIL,
    normalizedValue: input.value,
    evidenceReference: `synthetic-proof:${input.id}`,
    humanReviewerId: null,
    humanReviewedAt: null,
    fact: { value: input.value, state: "positive" as const, references: [ref] },
  };
}

export function makeQualificationInput(
  overrides: Partial<PoolServiceQualificationInput> = {},
): PoolServiceQualificationInput {
  const assessmentRef = qualificationReference("website_assessments", "assessment-qualification-001");
  const base: PoolServiceQualificationInput = {
    evaluatedAt: QUALIFICATION_EVALUATED_AT,
    runId: "run-qualification-001",
    business: {
      id: "business-qualification-001",
      canonicalName: "Synthetic Pool Service",
      nicheId: "pool_service",
      state: "found",
      updatedAt: QUALIFICATION_EVALUATED_AT,
      reference: qualificationReference("businesses", "business-qualification-001", {
        sourceClass: null,
        claimState: null,
        freshness: "unknown",
        freshUntil: null,
      }),
    },
    assessment: {
      id: "assessment-qualification-001",
      sourceWebsiteUrl: "https://synthetic-pool.example/",
      canonicalHomepageUrl: "https://synthetic-pool.example/",
      status: "complete",
      identityState: "agrees",
      reviewRequired: false,
      assessedAt: QUALIFICATION_EVALUATED_AT,
      freshUntil: QUALIFICATION_FRESH_UNTIL,
      sourceClass: "synthetic_fixture",
      reference: assessmentRef,
    },
    geography: {
      locations: [qualificationFact(
        "country:US|subdivision:US-AZ",
        "business_locations",
        "location-qualification-001",
      )],
      selectedMarkets: [qualificationFact(
        "country:US|subdivision:US-AZ",
        "coverage_cells",
        "market-qualification-001",
        { references: [qualificationReference("coverage_cells", "market-qualification-001", {
          sourceClass: null,
          claimState: null,
          freshness: "unknown",
          freshUntil: null,
        })] },
      )],
    },
    services: [
      {
        state: "positive",
        term: "pool_service",
        basis: "provider_category",
        fact: qualificationFact("pool_service", "service_evidence", "service-category-001"),
      },
      {
        state: "positive",
        term: "pool maintenance",
        basis: "service_description",
        fact: qualificationFact("pool maintenance", "service_evidence", "service-maintenance-001"),
      },
      {
        state: "positive",
        term: "pool repair",
        basis: "heading",
        fact: qualificationFact("pool repair", "service_evidence", "service-repair-001"),
      },
    ],
    operations: [
      { kind: "homepage_usable", status: "positive", detail: "successful", fact: qualificationFact("homepage:successful", "evidence", "operation-homepage-001") },
      { kind: "https_works", status: "positive", detail: "https", fact: qualificationFact("https:works", "evidence", "operation-https-001") },
      { kind: "identity_agreement", status: "positive", detail: "agrees", fact: qualificationFact("identity:agrees", "evidence", "operation-identity-001") },
    ],
    conversions: [
      { feature: "booking", status: "present", fact: qualificationFact("booking:present", "conversion_feature_observations", "conversion-booking-001") },
      { feature: "contact_form", status: "present", fact: qualificationFact("contact_form:present", "conversion_feature_observations", "conversion-form-001") },
      { feature: "estimate_request", status: "present", fact: qualificationFact("estimate_request:present", "conversion_feature_observations", "conversion-estimate-001") },
      { feature: "primary_cta", status: "present", fact: qualificationFact("primary_cta:present", "conversion_feature_observations", "conversion-cta-001") },
      { feature: "contact_route", status: "present", fact: qualificationFact("contact_route:present", "conversion_feature_observations", "conversion-route-001") },
    ],
    contacts: [
      { kind: "phone", displayedValue: "+1 202-555-0100", fact: qualificationFact("phone:+12025550100", "website_contact_observations", "contact-phone-001") },
      { kind: "email", displayedValue: "hello@example.test", fact: qualificationFact("email:hello@example.test", "website_contact_observations", "contact-email-001") },
    ],
    people: [{
      id: "person-qualification-001",
      displayedName: "Avery Example",
      displayedTitle: "Owner",
      ambiguityState: "none",
      fact: qualificationFact("person:Avery Example", "person_evidence_candidates", "person-qualification-001"),
    }],
    verifications: [],
    identityReview: {
      state: "clear",
      reasons: [],
      references: [assessmentRef],
    },
    structuredBusinessData: [qualificationFact(
      "schema_type:LocalBusiness",
      "structured_data_observations",
      "structured-qualification-001",
    )],
  };
  return { ...base, ...overrides };
}
