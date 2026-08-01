export const POOL_SERVICE_RANKING_MODEL_VERSION = "pool_service_ranking_v1" as const;
export const CALLING_QUEUE_VERSION = "calling_queue_v1" as const;
export const POOL_SERVICE_QUEUE_FRESHNESS_POLICY_VERSION = "pool_service_queue_freshness_v1" as const;

export const POOL_SERVICE_RANKING_V1 = Object.freeze({
  version: POOL_SERVICE_RANKING_MODEL_VERSION,
  queueVersion: CALLING_QUEUE_VERSION,
  freshnessPolicy: Object.freeze({
    version: POOL_SERVICE_QUEUE_FRESHNESS_POLICY_VERSION,
    evaluationAgingDays: 14,
    evaluationMaximumDays: 30,
    assessmentAgingDays: 15,
    assessmentMaximumDays: 30,
    supportingEvidenceMaximumDays: 30,
  }),
  componentMaximums: Object.freeze({
    qualification_strength: 350,
    opportunity_urgency: 200,
    contact_readiness: 200,
    identity_safety: 100,
    freshness: 100,
    market_fit: 25,
    evidence_quality: 25,
  }),
  priorityBands: Object.freeze({ top: 800, high: 650, standard: 500 }),
  contactRules: Object.freeze({
    "contact.domain_observed": 20,
    "contact.public_phone_observed": 40,
    "contact.phone_reachability_verified": 30,
    "contact.public_email_observed": 20,
    "contact.email_deliverability_verified": 30,
    "contact.form_observed": 20,
    "contact.multiple_channels": 20,
    "readiness.contact_route": 20,
  }),
});

const total = Object.values(POOL_SERVICE_RANKING_V1.componentMaximums)
  .reduce((sum, maximum) => sum + maximum, 0);
if (total !== 1000) throw new Error("Pool-service ranking component maxima must sum to 1000");
