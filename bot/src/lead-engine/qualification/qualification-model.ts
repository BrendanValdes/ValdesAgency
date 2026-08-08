import type { IcpScoreComponent, SupportedQualificationNiche } from "./types.js";
import { POOL_SERVICE_ICP_V1 } from "./pool-service-model.js";

export const FOUNDATION_WATERPROOFING_ICP_MODEL_VERSION =
  "foundation_waterproofing_icp_v1" as const;

export interface QualificationModel {
  readonly version: string;
  readonly niche: SupportedQualificationNiche;
  readonly serviceLabel: string;
  readonly scoreScale: Readonly<{ minimum: number; maximum: number }>;
  readonly componentWeights: Readonly<Record<IcpScoreComponent, number>>;
  readonly thresholds: Readonly<{
    highPriorityMinimum: number;
    qualifiedMinimum: number;
    qualifiedWithReviewMinimum: number;
  }>;
  readonly serviceTerms: ReadonlyArray<string>;
  readonly recurringServiceTerms: ReadonlyArray<string>;
  readonly relevantCategories: ReadonlyArray<string>;
  readonly excludedOperatorTerms: ReadonlyArray<string>;
  readonly historicalOnlySourceClasses: ReadonlyArray<string>;
  readonly scoreRules: ReadonlyArray<Readonly<{
    id: string;
    component: IcpScoreComponent;
    maximumPoints: number;
  }>>;
  readonly hardGateRules: ReadonlyArray<string>;
}

export const POOL_SERVICE_QUALIFICATION_MODEL: QualificationModel = Object.freeze({
  ...POOL_SERVICE_ICP_V1,
  serviceLabel: "pool-service",
});

const FOUNDATION_SCORE_RULE_MAXIMUMS: Readonly<Partial<Record<
  (typeof POOL_SERVICE_ICP_V1.scoreRules)[number]["id"],
  number
>>> = Object.freeze({
  "niche.core_service_observed": 25,
  "niche.recurring_service_observed": 0,
  "opportunity.booking_absent": 3,
  "opportunity.contact_form_absent": 2,
  "opportunity.estimate_request_absent": 2,
  "opportunity.primary_cta_absent": 2,
  "opportunity.phone_only_dependency": 1,
});

const FOUNDATION_SCORE_RULES: QualificationModel["scoreRules"] = Object.freeze(
  POOL_SERVICE_ICP_V1.scoreRules.map((rule) => Object.freeze({
    ...rule,
    maximumPoints: FOUNDATION_SCORE_RULE_MAXIMUMS[rule.id] ?? rule.maximumPoints,
  })),
);

/**
 * Foundation repair and waterproofing keeps the existing 0-100 scale and
 * thresholds while weighting core project-service proof more heavily than
 * conversion-system weakness. Sump-pump, drainage, concrete, and generic
 * "foundation" language never score alone.
 */
export const FOUNDATION_WATERPROOFING_ICP_V1: QualificationModel = Object.freeze({
  version: FOUNDATION_WATERPROOFING_ICP_MODEL_VERSION,
  niche: "foundation_waterproofing",
  serviceLabel: "foundation repair or waterproofing",
  scoreScale: POOL_SERVICE_ICP_V1.scoreScale,
  componentWeights: Object.freeze({
    niche_service_fit: 35,
    business_legitimacy: 15,
    opportunity_signals: 10,
    contactability: 15,
    decision_maker_evidence: 10,
    outreach_readiness: 10,
    evidence_quality_freshness: 5,
  }),
  thresholds: POOL_SERVICE_ICP_V1.thresholds,
  serviceTerms: Object.freeze([
    "foundation repair",
    "foundation stabilization",
    "basement waterproofing",
    "crawl space repair",
    "crawl space encapsulation",
    "structural foundation repair",
    "foundation crack repair",
    "foundation wall repair",
    "bowed foundation wall repair",
    "cracked foundation wall repair",
    "piering",
    "underpinning",
    "waterproofing drainage system",
  ]),
  // High-ticket project work is not recurring maintenance. The matching rule
  // remains visible as not applicable but has no qualification weight.
  recurringServiceTerms: Object.freeze([]),
  relevantCategories: Object.freeze([
    "foundation_contractor",
    "foundation_repair",
    "waterproofing_service",
    "basement_waterproofing",
  ]),
  excludedOperatorTerms: Object.freeze([
    "general contractor",
    "plumbing company",
    "plumber",
    "roofing company",
    "roofer",
    "landscaping company",
    "landscaper",
    "drainage contractor",
    "mold remediation",
    "concrete flatwork",
    "concrete contractor",
    "home builder",
    "roof waterproofing",
    "deck waterproofing",
  ]),
  historicalOnlySourceClasses: POOL_SERVICE_ICP_V1.historicalOnlySourceClasses,
  scoreRules: FOUNDATION_SCORE_RULES,
  hardGateRules: POOL_SERVICE_ICP_V1.hardGateRules,
});

const MODELS: ReadonlyArray<QualificationModel> = Object.freeze([
  POOL_SERVICE_QUALIFICATION_MODEL,
  FOUNDATION_WATERPROOFING_ICP_V1,
]);

export function qualificationModelForNiche(niche: SupportedQualificationNiche): QualificationModel {
  const model = MODELS.find((entry) => entry.niche === niche);
  if (!model) throw new Error(`Unsupported qualification niche: ${niche}`);
  return model;
}

export function qualificationModelForVersion(version: string): QualificationModel {
  const model = MODELS.find((entry) => entry.version === version);
  if (!model) throw new Error(`Unsupported qualification model version: ${version}`);
  return model;
}
