import type { IcpScoreComponent } from "./types.js";

export const POOL_SERVICE_ICP_MODEL_VERSION = "pool_service_icp_v1";

export const POOL_SERVICE_ICP_V1 = Object.freeze({
  version: POOL_SERVICE_ICP_MODEL_VERSION,
  niche: "pool_service" as const,
  scoreScale: Object.freeze({ minimum: 0, maximum: 100 }),
  componentWeights: Object.freeze({
    niche_service_fit: 25,
    business_legitimacy: 15,
    opportunity_signals: 20,
    contactability: 15,
    decision_maker_evidence: 10,
    outreach_readiness: 10,
    evidence_quality_freshness: 5,
  }) satisfies Readonly<Record<IcpScoreComponent, number>>,
  thresholds: Object.freeze({
    highPriorityMinimum: 80,
    qualifiedMinimum: 65,
    qualifiedWithReviewMinimum: 50,
  }),
  serviceTerms: Object.freeze([
    "pool cleaning",
    "pool maintenance",
    "pool repair",
    "pool service",
    "pool technician",
    "swimming pool service",
    "recurring pool maintenance",
    "pool equipment service",
    "equipment installation",
    "pool remodeling",
    "pool resurfacing",
    "leak detection",
    "commercial pool service",
    "residential pool service",
  ]),
  recurringServiceTerms: Object.freeze([
    "pool cleaning",
    "pool maintenance",
    "pool service",
    "recurring pool maintenance",
  ]),
  /**
   * Provider-category vocabulary, calibrated 2026-08-03 against the identifiers
   * official Overture data actually publishes.
   *
   * VOCABULARY ONLY. No weight, threshold, score floor, rule id, component, or
   * maximum changed with this list. The v1 list named `pool_service`, which
   * Overture never emits, so `niche.relevant_category` read `missing` on every
   * real lead while the pipeline was structurally unable to award its 5 points.
   *
   * Membership is governed by OVERTURE_POOL_SERVICE_CATEGORY_CALIBRATION, which
   * holds the per-identifier rationale. Retail, facility, recreation,
   * spa-adjacent, and builder-ambiguous identifiers are excluded on purpose.
   * `pool_service` is retained as the canonical term from v1.
   */
  relevantCategories: Object.freeze([
    "pool_service",
    "pool_cleaning",
    "pool_cleaning_service",
    "pool_maintenance_service",
    "swimming_pool_repair_service",
  ]),
  excludedOperatorTerms: Object.freeze([
    "manufacturer",
    "supply only",
    "wholesale",
  ]),
  historicalOnlySourceClasses: Object.freeze([
    "historical_manual_artifact",
    "legacy_unclassified",
  ]),
  scoreRules: Object.freeze([
    Object.freeze({ id: "niche.relevant_category", component: "niche_service_fit", maximumPoints: 5 }),
    Object.freeze({ id: "niche.core_service_observed", component: "niche_service_fit", maximumPoints: 10 }),
    Object.freeze({ id: "niche.multiple_services_observed", component: "niche_service_fit", maximumPoints: 5 }),
    Object.freeze({ id: "niche.recurring_service_observed", component: "niche_service_fit", maximumPoints: 5 }),
    Object.freeze({ id: "legitimacy.homepage_usable", component: "business_legitimacy", maximumPoints: 5 }),
    Object.freeze({ id: "legitimacy.https_observed", component: "business_legitimacy", maximumPoints: 2 }),
    Object.freeze({ id: "legitimacy.identity_agrees", component: "business_legitimacy", maximumPoints: 4 }),
    Object.freeze({ id: "legitimacy.location_observed", component: "business_legitimacy", maximumPoints: 2 }),
    Object.freeze({ id: "legitimacy.structured_business_data", component: "business_legitimacy", maximumPoints: 2 }),
    Object.freeze({ id: "opportunity.booking_absent", component: "opportunity_signals", maximumPoints: 5 }),
    Object.freeze({ id: "opportunity.contact_form_absent", component: "opportunity_signals", maximumPoints: 5 }),
    Object.freeze({ id: "opportunity.estimate_request_absent", component: "opportunity_signals", maximumPoints: 4 }),
    Object.freeze({ id: "opportunity.primary_cta_absent", component: "opportunity_signals", maximumPoints: 3 }),
    Object.freeze({ id: "opportunity.phone_only_dependency", component: "opportunity_signals", maximumPoints: 3 }),
    Object.freeze({ id: "contact.domain_observed", component: "contactability", maximumPoints: 3 }),
    Object.freeze({ id: "contact.public_phone_observed", component: "contactability", maximumPoints: 4 }),
    Object.freeze({ id: "contact.phone_reachability_verified", component: "contactability", maximumPoints: 2 }),
    Object.freeze({ id: "contact.public_email_observed", component: "contactability", maximumPoints: 2 }),
    Object.freeze({ id: "contact.email_deliverability_verified", component: "contactability", maximumPoints: 2 }),
    Object.freeze({ id: "contact.form_observed", component: "contactability", maximumPoints: 1 }),
    Object.freeze({ id: "contact.multiple_channels", component: "contactability", maximumPoints: 1 }),
    Object.freeze({ id: "person.name_observed", component: "decision_maker_evidence", maximumPoints: 2 }),
    Object.freeze({ id: "person.title_observed", component: "decision_maker_evidence", maximumPoints: 2 }),
    Object.freeze({ id: "person.employment_verified", component: "decision_maker_evidence", maximumPoints: 1 }),
    Object.freeze({ id: "person.owner_relationship_verified", component: "decision_maker_evidence", maximumPoints: 3 }),
    Object.freeze({ id: "person.decision_authority_verified", component: "decision_maker_evidence", maximumPoints: 1 }),
    Object.freeze({ id: "person.human_confirmation", component: "decision_maker_evidence", maximumPoints: 1 }),
    Object.freeze({ id: "readiness.identity_resolved", component: "outreach_readiness", maximumPoints: 3 }),
    Object.freeze({ id: "readiness.assessment_complete", component: "outreach_readiness", maximumPoints: 2 }),
    Object.freeze({ id: "readiness.contact_route", component: "outreach_readiness", maximumPoints: 2 }),
    Object.freeze({ id: "readiness.current_evidence", component: "outreach_readiness", maximumPoints: 2 }),
    Object.freeze({ id: "readiness.business_record_usable", component: "outreach_readiness", maximumPoints: 1 }),
    Object.freeze({ id: "quality.current_assessment", component: "evidence_quality_freshness", maximumPoints: 2 }),
    Object.freeze({ id: "quality.auditable_lineage", component: "evidence_quality_freshness", maximumPoints: 1 }),
    Object.freeze({ id: "quality.explicit_provenance", component: "evidence_quality_freshness", maximumPoints: 1 }),
    Object.freeze({ id: "quality.corroborated_sources", component: "evidence_quality_freshness", maximumPoints: 1 }),
  ] as const),
  hardGateRules: Object.freeze([
    "hard.confirmed_closed",
    "hard.outside_selected_geography",
    "hard.excluded_service_operator",
    "hard.historical_only_evidence",
  ]),
});

const configuredWeight = Object.values(POOL_SERVICE_ICP_V1.componentWeights)
  .reduce((total, weight) => total + weight, 0);

if (configuredWeight !== POOL_SERVICE_ICP_V1.scoreScale.maximum) {
  throw new Error("Pool-service ICP v1 component weights must sum to 100");
}

for (const [component, weight] of Object.entries(POOL_SERVICE_ICP_V1.componentWeights)) {
  const ruleMaximum = POOL_SERVICE_ICP_V1.scoreRules
    .filter((rule) => rule.component === component)
    .reduce((total, rule) => total + rule.maximumPoints, 0);
  if (ruleMaximum !== weight) {
    throw new Error(`Pool-service ICP v1 rule maxima do not match ${component}`);
  }
}
