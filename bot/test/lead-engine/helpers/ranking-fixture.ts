import type { SqliteDatabase } from "../../../src/lead-engine/db/database.js";
import type { IcpQualificationResult, PoolServiceQualificationResult, QualificationRuleOutcome } from "../../../src/lead-engine/qualification/types.js";
import { POOL_SERVICE_ICP_MODEL_VERSION } from "../../../src/lead-engine/qualification/pool-service-model.js";
import type { CallingQueueConstraints } from "../../../src/lead-engine/ranking/types.js";
import type { CallingQueueGenerationResult, CallingQueueSnapshot } from "../../../src/lead-engine/ranking/types.js";
import { POOL_SERVICE_RANKING_V1 } from "../../../src/lead-engine/ranking/pool-service-ranking-model.js";
import { DEFAULT_QUEUE_STABLE_IDENTIFIERS } from "../../../src/lead-engine/ranking/queue-repository.js";
import type { CallingQueueDependencies } from "../../../src/lead-engine/ranking/internal-calling-queue.js";
import { createTestDatabase } from "../fixtures/synthetic.js";

export const QUEUE_TIME = "2026-01-20T12:00:00.000Z";
const ASSESSED_AT = "2026-01-18T12:00:00.000Z";
const FRESH_UNTIL = "2026-02-17T12:00:00.000Z";

const baseReference = {
  sourceTable: "website_assessments" as const,
  sourceId: "assessment-placeholder",
  sourceClass: "synthetic_fixture" as const,
  claimState: "observed" as const,
  evidenceState: "found" as const,
  verificationState: "not_checked" as const,
  verificationDimension: null,
  externalVerificationState: "unassessed" as const,
  verificationMethod: null,
  verificationResult: null,
  humanReviewState: "unreviewed" as const,
  observedAt: ASSESSED_AT,
  freshUntil: FRESH_UNTIL,
  confidenceBasisPoints: 8000,
  freshness: "current" as const,
};

function scoreTier(score: number): PoolServiceQualificationResult["priorityTier"] {
  return score >= 80 ? "high_priority" : score >= 65 ? "qualified" : score >= 50 ? "moderate" : "low";
}

export interface SeedLeadOptions {
  readonly id: string;
  readonly score?: number;
  readonly result?: IcpQualificationResult;
  readonly evaluatedAt?: string;
  readonly evaluationFreshUntil?: string;
  readonly assessmentAt?: string;
  readonly assessmentFreshUntil?: string;
  readonly assessmentStatus?: "complete" | "partial" | "blocked" | "failed" | "stale";
  readonly businessState?: "unknown" | "found" | "stale" | "conflicting" | "rejected" | "human_review" | "accepted";
  readonly opportunityPoints?: number;
  readonly publicPhone?: boolean;
  readonly verifiedPhone?: "current" | "expired" | false;
  readonly publicEmail?: boolean;
  readonly verifiedEmail?: "current" | "expired" | false;
  readonly form?: boolean;
  /**
   * Emit the niche/legitimacy rule outcomes the callable-evidence gate requires.
   * Defaults to true so existing "this lead should be callable" fixtures keep
   * meaning that; set false to exercise the gate's rejection paths.
   */
  readonly callableEvidence?: boolean;
  /** Persisted qualification identity state; defaults to the result's own. */
  readonly identityReviewState?: "required" | "clear" | "resolved" | "unavailable";
  /** Assessed website-to-business identity agreement; defaults to "agrees". */
  readonly assessmentIdentityState?: "agrees" | "conflicts" | "ambiguous" | "unavailable";
  readonly coverageKey?: string;
  readonly countryCode?: string;
  readonly subdivisionCode?: string;
  readonly supersedesEvaluationId?: string | null;
  readonly modelVersion?: string;
}

/**
 * A public contact value seen on the assessed website itself.
 *
 * The callable-evidence gate requires this lineage for a phone route, so the
 * fixture has to reproduce it rather than pointing every contact rule at the
 * generic assessment reference.
 */
const websiteObservationReference = {
  ...baseReference,
  sourceTable: "website_contact_observations" as const,
  sourceId: "website-contact-observation",
  sourceClass: "public_business_website" as const,
  claimState: "public_unverified_candidate" as const,
};

/** Rule outcomes a genuinely human-callable synthetic lead must carry. */
function callableEvidenceOutcomes(enabled: boolean): QualificationRuleOutcome[] {
  if (!enabled) return [];
  const build = (
    component: QualificationRuleOutcome["component"],
    ruleId: string,
    maximumPoints: number,
  ): QualificationRuleOutcome => ({
    component,
    ruleId,
    state: "positive",
    points: maximumPoints,
    maximumPoints,
    evidenceReferences: [baseReference],
    explanation: `${ruleId} supported by synthetic persisted evidence.`,
    missingFlag: null,
    conflictFlag: null,
  });
  return [
    build("niche_service_fit", "niche.relevant_category", 5),
    build("niche_service_fit", "niche.core_service_observed", 10),
    build("business_legitimacy", "legitimacy.homepage_usable", 5),
    build("business_legitimacy", "legitimacy.https_observed", 2),
    build("business_legitimacy", "legitimacy.identity_agrees", 4),
  ];
}

function contactOutcome(
  ruleId: string,
  enabled: boolean,
  maximumPoints: number,
  verification: "current" | "expired" | null = null,
): QualificationRuleOutcome {
  const reference = verification ? {
    ...baseReference,
    sourceTable: "evidence" as const,
    sourceId: `evidence-${ruleId}`,
    sourceClass: "external_verification_provider" as const,
    claimState: "externally_verified" as const,
    verificationState: "externally_verified" as const,
    verificationDimension: ruleId.includes("phone") ? "phone_reachability" as const : "email_deliverability" as const,
    externalVerificationState: verification,
    verificationMethod: ruleId.includes("phone") ? "phone_reachability_check" as const : "email_deliverability_check" as const,
    verificationResult: "passed" as const,
    freshUntil: verification === "current" ? FRESH_UNTIL : "2026-01-19T12:00:00.000Z",
  } : ruleId === "contact.public_phone_observed" || ruleId === "contact.public_email_observed"
    ? websiteObservationReference
    : baseReference;
  return {
    component: ruleId.startsWith("readiness") ? "outreach_readiness" : "contactability",
    ruleId,
    state: enabled ? "positive" : "missing",
    points: enabled ? maximumPoints : 0,
    maximumPoints,
    evidenceReferences: enabled ? [reference] : [],
    explanation: enabled ? `${ruleId} supported by synthetic persisted evidence.` : `${ruleId} is unavailable.`,
    missingFlag: enabled ? null : `${ruleId}_missing`,
    conflictFlag: null,
  };
}

export function seedRankedLead(database: SqliteDatabase, options: SeedLeadOptions): PoolServiceQualificationResult {
  const score = options.score ?? 75;
  const resultState = options.result ?? "qualified";
  const businessId = `business-${options.id}`;
  const assessmentId = `assessment-${options.id}`;
  const evaluationId = `evaluation-${options.id}`;
  const evaluatedAt = options.evaluatedAt ?? ASSESSED_AT;
  const evaluationFreshUntil = options.evaluationFreshUntil ?? FRESH_UNTIL;
  const assessmentAt = options.assessmentAt ?? ASSESSED_AT;
  const assessmentFreshUntil = options.assessmentFreshUntil ?? FRESH_UNTIL;
  const reviewRequired = !["qualified", "disqualified"].includes(resultState);
  const identityRequired = resultState === "identity_review_required";
  const hardDisqualifiers = resultState === "disqualified" ? [{ ruleId: "hard.confirmed_closed", reason: "Confirmed closed in synthetic evidence.", evidenceReferences: [baseReference] }] : [];
  const opportunityPoints = options.opportunityPoints ?? 10;
  const contactOutcomes = [
    contactOutcome("contact.domain_observed", true, 3),
    contactOutcome("contact.public_phone_observed", options.publicPhone ?? true, 4),
    contactOutcome("contact.phone_reachability_verified", Boolean(options.verifiedPhone), 2, options.verifiedPhone || null),
    contactOutcome("contact.public_email_observed", options.publicEmail ?? false, 2),
    contactOutcome("contact.email_deliverability_verified", Boolean(options.verifiedEmail), 2, options.verifiedEmail || null),
    contactOutcome("contact.form_observed", options.form ?? false, 1),
    contactOutcome("contact.multiple_channels", Boolean((options.publicPhone ?? true) && (options.publicEmail || options.form)), 1),
  ];
  const readiness = contactOutcome(
    "readiness.contact_route",
    Boolean((options.publicPhone ?? true) || options.publicEmail || options.form),
    2,
  );
  let remainingPoints = score - opportunityPoints - 15 - 5;
  const nichePoints = Math.max(0, Math.min(25, remainingPoints));
  remainingPoints -= nichePoints;
  const legitimacyPoints = Math.max(0, Math.min(15, remainingPoints));
  remainingPoints -= legitimacyPoints;
  const personPoints = Math.max(0, Math.min(10, remainingPoints));
  remainingPoints -= personPoints;
  const outreachPoints = Math.max(0, Math.min(10, remainingPoints));
  const callableOutcomes = callableEvidenceOutcomes(options.callableEvidence ?? true);
  const outcomesFor = (component: QualificationRuleOutcome["component"]) =>
    callableOutcomes.filter((item) => item.component === component);
  const componentScores: PoolServiceQualificationResult["componentScores"] = [
    { component: "niche_service_fit", points: nichePoints, maximumPoints: 25, outcomes: outcomesFor("niche_service_fit") },
    { component: "business_legitimacy", points: legitimacyPoints, maximumPoints: 15, outcomes: outcomesFor("business_legitimacy") },
    { component: "opportunity_signals", points: opportunityPoints, maximumPoints: 20, outcomes: [{ component: "opportunity_signals", ruleId: "opportunity.booking_absent", state: opportunityPoints ? "positive" : "negative", points: opportunityPoints, maximumPoints: 20, evidenceReferences: [baseReference], explanation: "Synthetic observed opportunity signal.", missingFlag: null, conflictFlag: null }] },
    { component: "contactability", points: 15, maximumPoints: 15, outcomes: contactOutcomes },
    { component: "decision_maker_evidence", points: personPoints, maximumPoints: 10, outcomes: [] },
    { component: "outreach_readiness", points: outreachPoints, maximumPoints: 10, outcomes: [readiness] },
    { component: "evidence_quality_freshness", points: 5, maximumPoints: 5, outcomes: [{ component: "evidence_quality_freshness", ruleId: "quality.current_assessment", state: "positive", points: 5, maximumPoints: 5, evidenceReferences: [baseReference], explanation: "Synthetic current evidence.", missingFlag: null, conflictFlag: null }] },
  ];
  const qualification: PoolServiceQualificationResult = {
    evaluationId,
    supersedesEvaluationId: options.supersedesEvaluationId ?? null,
    modelVersion: options.modelVersion ?? POOL_SERVICE_ICP_MODEL_VERSION,
    niche: "pool_service",
    businessId,
    runId: null,
    evaluatedAt,
    freshUntil: evaluationFreshUntil,
    inputFingerprint: options.id.padEnd(64, "a").slice(0, 64).replace(/[^a-f0-9]/g, "a"),
    icpResult: resultState,
    overallScore: score,
    priorityTier: scoreTier(score),
    componentScores,
    hardDisqualifiers,
    positiveSignals: [],
    negativeSignals: [],
    missingInformationFlags: [],
    evidenceReferences: [baseReference],
    freshnessWarnings: [],
    verificationLimitations: ["Synthetic fixture; candidate contacts are not verified unless explicitly marked."],
    identityReviewState: options.identityReviewState ?? (identityRequired ? "required" : "clear"),
    reviewRequirements: { required: reviewRequired, reasons: reviewRequired ? ["synthetic_review_required"] : [] },
    confidence: { observedMinimumBasisPoints: 8000, observedMaximumBasisPoints: 8000, usedAsVerification: false },
    evidenceQuality: { currentReferences: 1, staleReferences: 0, unknownFreshnessReferences: 0, conflictingReferences: 0, sourceClasses: ["synthetic_fixture"] },
    finalExplanation: "Synthetic persisted Phase 4A evaluation for ranking tests.",
  };
  database.prepare(`
    INSERT INTO businesses (id, canonical_name, state, niche_id, created_at, updated_at)
    VALUES (?, ?, ?, 'pool_service', ?, ?)
  `).run(businessId, `Synthetic Pool ${options.id}`, options.businessState ?? "accepted", assessmentAt, assessmentAt);
  const subdivision = options.subdivisionCode ?? "US-AZ";
  database.prepare(`
    INSERT INTO business_locations (
      id, business_id, line1, city, region, postal_code, country_code,
      evidence_state, created_at, updated_at, source_class, claim_state
    ) VALUES (?, ?, NULL, 'Fixtureville', ?, NULL, ?, 'found', ?, ?, 'synthetic_fixture', 'observed')
  `).run(`location-${options.id}`, businessId, subdivision.split("-")[1] ?? "AZ", options.countryCode ?? "US", assessmentAt, assessmentAt);
  database.prepare(`
    INSERT INTO website_assessments (
      id, business_id, source_website_url, canonical_homepage_url, status,
      started_at, assessed_at, fresh_until, crawl_policy_version, extraction_policy_version,
      browser_status, identity_state, review_required, source_class
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'fixture-crawl-v1', 'fixture-extract-v1',
              'not_checked', ?, ?, 'synthetic_fixture')
  `).run(assessmentId, businessId, `https://${options.id}.example.test/`, `https://${options.id}.example.test/`, options.assessmentStatus ?? "complete", assessmentAt, assessmentAt, assessmentFreshUntil, options.assessmentIdentityState ?? "agrees", reviewRequired ? 1 : 0);
  database.prepare(`
    INSERT INTO icp_qualification_evaluations (
      id, run_id, business_id, assessment_id, model_version, niche_id, input_fingerprint,
      evaluated_at, fresh_until, icp_result, total_score, score_tier,
      hard_disqualifiers_json, component_scores_json, positive_signals_json,
      negative_signals_json, missing_information_json, evidence_references_json,
      freshness_warnings_json, verification_limitations_json, identity_review_state,
      review_required, review_reasons_json, confidence_json, evidence_quality_json,
      final_explanation, result_json, supersedes_evaluation_id, created_at
    ) VALUES (?, NULL, ?, ?, ?, 'pool_service', ?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]', '[]', ?, '[]', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    evaluationId, businessId, assessmentId, qualification.modelVersion, qualification.inputFingerprint,
    evaluatedAt, evaluationFreshUntil, resultState, score, qualification.priorityTier,
    JSON.stringify(hardDisqualifiers), JSON.stringify(componentScores), JSON.stringify(qualification.evidenceReferences),
    JSON.stringify(qualification.verificationLimitations), qualification.identityReviewState,
    reviewRequired ? 1 : 0, JSON.stringify(qualification.reviewRequirements.reasons),
    JSON.stringify(qualification.confidence), JSON.stringify(qualification.evidenceQuality),
    qualification.finalExplanation, JSON.stringify(qualification), qualification.supersedesEvaluationId, evaluatedAt,
  );
  database.prepare(`
    INSERT INTO icp_qualification_evidence_references (
      evaluation_id, ordinal, source_table, source_id, source_class, claim_state,
      verification_dimension, freshness, rule_ids_json
    ) VALUES (?, 0, 'coverage_cells', ?, 'synthetic_fixture', 'observed', NULL, 'current', '["hard.outside_selected_geography"]')
  `).run(evaluationId, options.coverageKey ?? "coverage:us-az");
  return qualification;
}

export function defaultQueueConstraints(overrides: Partial<CallingQueueConstraints> = {}): CallingQueueConstraints {
  return {
    queueVersion: "calling_queue_v1",
    rankingModelVersion: "pool_service_ranking_v1",
    niche: "pool_service",
    scope: { kind: "coverage_keys", coverageKeys: ["coverage:us-az"] },
    maximumCallable: 50,
    maximumReview: 50,
    minimumQualificationScore: 0,
    minimumPriorityScore: 0,
    acceptedQualificationResults: ["qualified"],
    qualificationModelVersion: POOL_SERVICE_ICP_MODEL_VERSION,
    freshnessPolicyVersion: "pool_service_queue_freshness_v1",
    includedContactRoutes: ["phone", "email", "form"],
    contactPolicy: "require_route",
    generatedAt: QUEUE_TIME,
    ...overrides,
  };
}

export function createRankingFixture() {
  return createTestDatabase();
}

export function completedQueue(result: CallingQueueGenerationResult): CallingQueueSnapshot {
  if (result.state !== "completed") throw new Error("Expected completed synthetic queue generation");
  return result.snapshot;
}

export function queueDependencies(
  database: SqliteDatabase,
  overrides: Partial<CallingQueueDependencies> = {},
): CallingQueueDependencies {
  return {
    database,
    rankingModel: POOL_SERVICE_RANKING_V1,
    stableIdentifiers: DEFAULT_QUEUE_STABLE_IDENTIFIERS,
    clock: { now: () => QUEUE_TIME },
    signal: new AbortController().signal,
    onEvent: () => undefined,
    ...overrides,
  };
}
