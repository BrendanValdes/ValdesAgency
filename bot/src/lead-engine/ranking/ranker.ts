import { stableId } from "../shared/stable.js";
import { POOL_SERVICE_RANKING_V1 } from "./pool-service-ranking-model.js";
import type {
  CallingQueueConstraints,
  QueueCandidate,
  QueueFreshnessState,
  QueuePriorityBand,
  QueueReason,
  QueueScoreComponent,
  RankedQueueEntry,
} from "./types.js";

const DAY_MS = 86_400_000;

function canonicalTimestamp(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error(`${label} must be a canonical ISO timestamp`);
  }
  return parsed;
}

function unique(values: ReadonlyArray<string>): string[] {
  return [...new Set(values)].sort();
}

function outcome(candidate: QueueCandidate, ruleId: string) {
  return candidate.qualification.componentScores
    .flatMap((component) => component.outcomes)
    .find((item) => item.ruleId === ruleId);
}

function verifiedRuleIsCurrent(candidate: QueueCandidate, ruleId: string, generatedMs: number): boolean {
  const rule = outcome(candidate, ruleId);
  const compatible = ruleId === "contact.phone_reachability_verified"
    ? (dimension: string | null, method: string | null) => dimension === "phone_reachability" && method === "phone_reachability_check"
    : (dimension: string | null, method: string | null) => dimension === "email_deliverability" && method === "email_deliverability_check";
  return Boolean(rule && rule.points > 0 && rule.evidenceReferences.some((reference) =>
    reference.sourceClass === "external_verification_provider" &&
    reference.claimState === "externally_verified" &&
    reference.externalVerificationState === "current" &&
    reference.verificationResult === "passed" &&
    compatible(reference.verificationDimension, reference.verificationMethod) &&
    reference.observedAt !== null && Date.parse(reference.observedAt) <= generatedMs &&
    reference.freshUntil !== null && Date.parse(reference.freshUntil) > generatedMs
  ));
}

function scopeMatches(candidate: QueueCandidate, constraints: CallingQueueConstraints): boolean {
  const scope = constraints.scope;
  if (scope.kind === "coverage_keys") {
    return candidate.coverageKeys.some((key) => scope.coverageKeys.includes(key));
  }
  return candidate.geographies.some((geography) =>
    geography.countryCode === scope.countryCode &&
    (!scope.subdivisionCodes?.length || (
      geography.subdivisionCode !== null && scope.subdivisionCodes.includes(geography.subdivisionCode)
    ))
  );
}

function freshness(candidate: QueueCandidate, generatedMs: number): {
  state: QueueFreshnessState;
  points: number;
  reasons: QueueReason[];
} {
  const reasons: QueueReason[] = [];
  const evaluatedMs = Date.parse(candidate.qualification.evaluatedAt);
  const freshUntilMs = Date.parse(candidate.qualification.freshUntil);
  if (!Number.isFinite(evaluatedMs) || !Number.isFinite(freshUntilMs)) {
    return { state: "missing_timestamp", points: 0, reasons: [{ code: "missing_critical_timestamp", detail: "Qualification freshness timestamps are missing or invalid." }] };
  }
  if (freshUntilMs <= generatedMs) {
    return { state: "expired", points: 0, reasons: [{ code: "qualification_expired", detail: "The selected qualification evaluation has expired." }] };
  }
  const evaluationAge = (generatedMs - evaluatedMs) / DAY_MS;
  if (evaluationAge > POOL_SERVICE_RANKING_V1.freshnessPolicy.evaluationMaximumDays) {
    return { state: "stale", points: 0, reasons: [{ code: "qualification_stale", detail: "The selected qualification evaluation exceeds the maximum age." }] };
  }
  if (!candidate.assessment) {
    return { state: "missing_timestamp", points: 0, reasons: [{ code: "assessment_missing", detail: "No persisted website assessment supports this evaluation." }] };
  }
  const assessedMs = Date.parse(candidate.assessment.assessedAt);
  const assessmentFreshUntil = Date.parse(candidate.assessment.freshUntil);
  if (!Number.isFinite(assessedMs) || !Number.isFinite(assessmentFreshUntil)) {
    return { state: "missing_timestamp", points: 0, reasons: [{ code: "missing_critical_timestamp", detail: "Assessment freshness timestamps are missing or invalid." }] };
  }
  if (assessmentFreshUntil <= generatedMs) {
    return { state: "expired", points: 0, reasons: [{ code: "assessment_expired", detail: "The supporting website assessment has expired." }] };
  }
  const assessmentAge = (generatedMs - assessedMs) / DAY_MS;
  if (evaluationAge < 0 || assessmentAge < 0) {
    return { state: "missing_timestamp", points: 0, reasons: [{ code: "future_critical_timestamp", detail: "A critical persisted timestamp occurs after the queue time anchor." }] };
  }
  if (assessmentAge > POOL_SERVICE_RANKING_V1.freshnessPolicy.assessmentMaximumDays || candidate.assessment.status === "stale") {
    return { state: "stale", points: 0, reasons: [{ code: "assessment_stale", detail: "The supporting website assessment is stale." }] };
  }
  const awardedReferences = candidate.qualification.componentScores.flatMap((component) =>
    component.outcomes.filter((item) => item.points > 0).flatMap((item) => item.evidenceReferences)
  );
  if (awardedReferences.some((reference) => reference.observedAt === null || !Number.isFinite(Date.parse(reference.observedAt)))) {
    return { state: "missing_timestamp", points: 0, reasons: [{ code: "missing_supporting_timestamp", detail: "Scored evidence lacks a valid observed timestamp." }] };
  }
  if (awardedReferences.some((reference) => reference.freshUntil !== null && !Number.isFinite(Date.parse(reference.freshUntil)))) {
    return { state: "missing_timestamp", points: 0, reasons: [{ code: "invalid_supporting_expiry", detail: "Scored evidence has an invalid expiry timestamp." }] };
  }
  if (awardedReferences.some((reference) => reference.observedAt !== null && (
    Date.parse(reference.observedAt) > generatedMs ||
    (generatedMs - Date.parse(reference.observedAt)) / DAY_MS > POOL_SERVICE_RANKING_V1.freshnessPolicy.supportingEvidenceMaximumDays
  ))) {
    return { state: "stale", points: 0, reasons: [{ code: "supporting_evidence_stale", detail: "Scored supporting evidence is outside the versioned freshness window." }] };
  }
  if (awardedReferences.some((reference) => reference.freshness === "stale" || (
    reference.freshUntil !== null && Date.parse(reference.freshUntil) <= generatedMs
  ))) {
    return { state: "expired", points: 0, reasons: [{ code: "supporting_evidence_expired", detail: "Scored supporting evidence is stale or expired." }] };
  }
  const verifiedIds = ["contact.phone_reachability_verified", "contact.email_deliverability_verified"];
  const expiredReliedOn = verifiedIds.some((ruleId) => {
    const rule = outcome(candidate, ruleId);
    return Boolean(rule && rule.points > 0 && !verifiedRuleIsCurrent(candidate, ruleId, generatedMs));
  });
  if (expiredReliedOn) {
    return { state: "expired", points: 0, reasons: [{ code: "verification_expired", detail: "A verification credited by qualification is no longer current." }] };
  }
  if (evaluationAge > POOL_SERVICE_RANKING_V1.freshnessPolicy.evaluationAgingDays ||
      assessmentAge > POOL_SERVICE_RANKING_V1.freshnessPolicy.assessmentAgingDays) {
    reasons.push({ code: "evidence_aging", detail: "Current evidence is approaching its freshness limit." });
    return { state: "aging", points: 60, reasons };
  }
  return { state: "fresh", points: 100, reasons };
}

function contactReadiness(candidate: QueueCandidate, generatedMs: number): {
  score: number;
  ruleIds: string[];
  routes: Array<"phone" | "email" | "form">;
  verifiedRoutes: Array<"phone" | "email">;
} {
  let score = 0;
  const ruleIds: string[] = [];
  const routes = new Set<"phone" | "email" | "form">();
  const verifiedRoutes = new Set<"phone" | "email">();
  for (const [ruleId, maximum] of Object.entries(POOL_SERVICE_RANKING_V1.contactRules)) {
    const rule = outcome(candidate, ruleId);
    if (!rule || rule.points <= 0) continue;
    if (ruleId.endsWith("_verified") && !verifiedRuleIsCurrent(candidate, ruleId, generatedMs)) continue;
    score += maximum;
    ruleIds.push(ruleId);
    if (ruleId.includes("phone")) routes.add("phone");
    if (ruleId.includes("email")) routes.add("email");
    if (ruleId === "contact.phone_reachability_verified") verifiedRoutes.add("phone");
    if (ruleId === "contact.email_deliverability_verified") verifiedRoutes.add("email");
    if (ruleId === "contact.form_observed") routes.add("form");
  }
  return {
    score: Math.min(200, score),
    ruleIds: unique(ruleIds),
    routes: [...routes].sort(),
    verifiedRoutes: [...verifiedRoutes].sort(),
  };
}

function band(score: number): QueuePriorityBand {
  return score >= 800 ? "top" : score >= 650 ? "high" : score >= 500 ? "standard" : "low";
}

export function validateCallingQueueConstraints(constraints: CallingQueueConstraints): void {
  canonicalTimestamp(constraints.generatedAt, "Queue generatedAt");
  if (constraints.niche !== "pool_service") throw new Error("Calling queue supports only the pool_service niche");
  if (constraints.queueVersion !== "calling_queue_v1" || constraints.rankingModelVersion !== POOL_SERVICE_RANKING_V1.version) {
    throw new Error("Unsupported calling queue or ranking model version");
  }
  if (constraints.qualificationModelVersion !== "pool_service_icp_v1") {
    throw new Error("Only completed pool_service_icp_v1 evaluations are supported");
  }
  if (constraints.freshnessPolicyVersion !== POOL_SERVICE_RANKING_V1.freshnessPolicy.version) {
    throw new Error("Unsupported queue freshness policy version");
  }
  for (const [label, value, maximum] of [
    ["maximumCallable", constraints.maximumCallable, 10_000],
    ["maximumReview", constraints.maximumReview, 10_000],
    ["minimumQualificationScore", constraints.minimumQualificationScore, 100],
    ["minimumPriorityScore", constraints.minimumPriorityScore, 1000],
  ] as const) {
    if (!Number.isInteger(value) || value < 0 || value > maximum) throw new Error(`${label} is outside its bounded range`);
  }
  if (!constraints.qualificationModelVersion.trim()) throw new Error("Qualification model version is required");
  const requiredSets: Array<[string, ReadonlyArray<string>]> = [
    ["accepted qualification result", constraints.acceptedQualificationResults],
    ["included contact route", constraints.includedContactRoutes],
  ];
  for (const [label, values] of requiredSets) {
    if (values.length === 0 || values.some((value) => !value.trim()) || new Set(values).size !== values.length) {
      throw new Error(`${label} values must be non-empty and unique`);
    }
  }
  const allowedResults = new Set(["qualified", "qualified_with_review", "insufficient_evidence", "disqualified", "identity_review_required", "stale_evidence", "not_evaluated"]);
  const allowedRoutes = new Set(["phone", "email", "form"]);
  if (constraints.acceptedQualificationResults.some((value) => !allowedResults.has(value)) ||
      constraints.includedContactRoutes.some((value) => !allowedRoutes.has(value))) {
    throw new Error("Queue constraints contain an unsupported result or contact route");
  }
  const scopeValues = constraints.scope.kind === "coverage_keys"
    ? constraints.scope.coverageKeys : constraints.scope.subdivisionCodes ?? [constraints.scope.countryCode];
  if (!constraints.scope.kind || scopeValues.length === 0 || scopeValues.some((value) => !value.trim()) ||
      new Set(scopeValues).size !== scopeValues.length) throw new Error("Queue scope must be explicit, non-empty, and unique");
  if (constraints.scope.kind === "geography" && !/^[A-Z]{2}$/.test(constraints.scope.countryCode)) {
    throw new Error("Geography country code must be uppercase ISO alpha-2");
  }
  const geographyScope = constraints.scope.kind === "geography" ? constraints.scope : null;
  if (geographyScope?.subdivisionCodes?.some((code) =>
    !new RegExp(`^${geographyScope.countryCode}-[A-Z0-9]{1,3}$`).test(code)
  )) throw new Error("Subdivision codes must match the selected country");
}

export function rankQueueCandidate(
  candidate: QueueCandidate,
  constraints: CallingQueueConstraints,
  stableIdentifiers: Readonly<{ id(prefix: string, value: unknown): string }> = { id: stableId },
): RankedQueueEntry {
  validateCallingQueueConstraints(constraints);
  const generatedMs = canonicalTimestamp(constraints.generatedAt, "Queue generatedAt");
  const qualification = candidate.qualification;
  const reasons: QueueReason[] = [];
  const resultBonus = qualification.icpResult === "qualified" ? 50
    : qualification.icpResult === "qualified_with_review" ? 25 : 0;
  const qualificationStrength = Math.min(350, qualification.overallScore * 3 + resultBonus);
  const opportunity = qualification.componentScores.find((item) => item.component === "opportunity_signals");
  const opportunityUrgency = Math.min(200, (opportunity?.points ?? 0) * 10);
  const contacts = contactReadiness(candidate, generatedMs);
  const freshnessResult = freshness(candidate, generatedMs);
  reasons.push(...freshnessResult.reasons);
  const inScope = scopeMatches(candidate, constraints);
  const identityReview = candidate.identityReviewReasons.length > 0 || candidate.businessState === "human_review" ||
    candidate.businessState === "conflicting" || qualification.identityReviewState === "required";
  const identitySafety = identityReview ? 0 : 100;
  const quality = qualification.componentScores.find((item) => item.component === "evidence_quality_freshness");
  const evidenceQuality = Math.min(25, (quality?.points ?? 0) * 5);
  const evaluationReference = [{
    sourceTable: "icp_qualification_evaluations" as const,
    sourceId: qualification.evaluationId,
  }];
  const contribution = (
    component: QueueScoreComponent["component"],
    points: number,
    maximumPoints: number,
    ruleIds: string[],
    explanation: string,
  ): QueueScoreComponent => ({
    component,
    points,
    maximumPoints,
    ruleIds,
    evidenceReferences: ruleIds.length > 0 ? evaluationReference : [],
    missingReason: ruleIds.length > 0 ? null : `No persisted ${component} rule awarded points.`,
    explanation,
  });
  const components: QueueScoreComponent[] = [
    contribution("qualification_strength", qualificationStrength, 350, ["ranking.qualification_score", `ranking.result.${qualification.icpResult}`], "Qualification score and persisted result strength."),
    contribution("opportunity_urgency", opportunityUrgency, 200, unique(opportunity?.outcomes.filter((item) => item.points > 0).map((item) => item.ruleId) ?? []), "Persisted opportunity-gap signals."),
    contribution("contact_readiness", contacts.score, 200, contacts.ruleIds, "Public candidate routes are distinct from current external verification."),
    contribution("identity_safety", identitySafety, 100, [identityReview ? "identity.review_required" : "identity.clear"], identityReview ? "Identity evidence requires review." : "No unresolved identity conflict is persisted."),
    contribution("freshness", freshnessResult.points, 100, [`freshness.${freshnessResult.state}`], "Versioned evaluation, assessment, and verification freshness."),
    contribution("market_fit", inScope ? 25 : 0, 25, [inScope ? "market.in_scope" : "market.out_of_scope"], "Explicit coverage or geography scope match."),
    contribution("evidence_quality", evidenceQuality, 25, unique(quality?.outcomes.filter((item) => item.points > 0).map((item) => item.ruleId) ?? []), "Persisted Phase 4A evidence quality, rescaled without changing qualification."),
  ];
  const priorityScore = components.reduce((sum, component) => sum + component.points, 0);
  if (!Number.isInteger(priorityScore) || priorityScore < 0 || priorityScore > 1000) {
    throw new Error("Queue priority score is outside the 0-1000 model bounds");
  }

  let disposition: RankedQueueEntry["disposition"] = "callable";
  let identityState: RankedQueueEntry["identityState"] = candidate.canonicalBusinessId === candidate.businessId ? "clear" : "safe_duplicate";
  if (candidate.duplicateOfEvaluationId) {
    disposition = "duplicate_excluded";
    identityState = "duplicate_excluded";
    reasons.push({ code: "safe_duplicate_excluded", detail: `Safe automatic merge retained evaluation ${candidate.duplicateOfEvaluationId}.` });
  } else if (qualification.icpResult === "disqualified" || qualification.hardDisqualifiers.length > 0) {
    disposition = "disqualified";
    reasons.push({ code: "hard_disqualified", detail: "Phase 4A persisted a hard disqualifier." });
  } else if (identityReview || qualification.icpResult === "qualified_with_review" || qualification.icpResult === "identity_review_required") {
    disposition = "review_required";
    identityState = "review_required";
    reasons.push({ code: "human_review_required", detail: unique([...candidate.identityReviewReasons, ...qualification.reviewRequirements.reasons]).join("; ") || "Qualification requires review." });
  } else if (qualification.icpResult === "stale_evidence" || candidate.businessState === "stale" || freshnessResult.state === "stale" || freshnessResult.state === "expired") {
    disposition = "stale";
  } else if (qualification.icpResult === "insufficient_evidence" || qualification.icpResult === "not_evaluated" ||
      freshnessResult.state === "missing_timestamp" || !candidate.assessment ||
      candidate.assessment.status === "blocked" || candidate.assessment.status === "failed") {
    disposition = "insufficient_evidence";
    reasons.push({ code: "insufficient_evidence", detail: "Critical qualification or assessment evidence is unavailable." });
  } else if (candidate.businessState === "rejected") {
    disposition = "not_eligible";
    reasons.push({ code: "business_record_rejected", detail: "The current persisted business record is rejected." });
  } else if (!inScope) {
    disposition = "not_eligible";
    reasons.push({ code: "outside_queue_scope", detail: "The lead does not match the explicit queue scope." });
  } else if (!constraints.acceptedQualificationResults.includes(qualification.icpResult)) {
    disposition = "not_eligible";
    reasons.push({ code: "qualification_result_not_accepted", detail: "The qualification result is not accepted by this queue request." });
  } else if (qualification.overallScore < constraints.minimumQualificationScore || priorityScore < constraints.minimumPriorityScore) {
    disposition = "not_eligible";
    reasons.push({ code: "minimum_score_not_met", detail: "The lead does not meet the queue's explicit score thresholds." });
  } else {
    const allowedRoutes = contacts.routes.filter((route) => constraints.includedContactRoutes.includes(route));
    if (constraints.contactPolicy === "require_route" && allowedRoutes.length === 0) {
      disposition = "not_eligible";
      reasons.push({ code: "contact_route_unavailable", detail: "No included public contact route is supported by persisted evidence." });
    }
  }
  if (disposition === "callable") reasons.push({ code: "callable", detail: "All explicit eligibility, identity, freshness, market, and contact gates passed." });
  const explanation = `${disposition}: priority ${priorityScore}/1000 from qualification ${qualification.overallScore}/100; ${reasons.map((reason) => reason.detail).join(" ")}`;
  return {
    entryId: stableIdentifiers.id("queue-entry", { evaluationId: qualification.evaluationId, generatedAt: constraints.generatedAt }),
    sourceBusinessId: candidate.businessId,
    canonicalBusinessId: candidate.canonicalBusinessId,
    evaluationId: qualification.evaluationId,
    position: null,
    disposition,
    priorityScore,
    priorityBand: band(priorityScore),
    qualificationScore: qualification.overallScore,
    qualificationResult: qualification.icpResult,
    evaluatedAt: qualification.evaluatedAt,
    assessmentAt: candidate.assessment?.assessedAt ?? null,
    contactReadinessScore: contacts.score,
    contactRouteSummary: { candidateRoutes: contacts.routes, verifiedRoutes: contacts.verifiedRoutes },
    freshnessState: freshnessResult.state,
    identityState,
    components,
    evidenceReferences: [{
      sourceTable: "icp_qualification_evaluations",
      sourceId: qualification.evaluationId,
      ruleIds: unique(components.flatMap((component) => component.ruleIds)),
    }],
    verificationLimitations: qualification.verificationLimitations,
    reasons,
    explanation,
  };
}

export function compareRankedQueueEntries(left: RankedQueueEntry, right: RankedQueueEntry): number {
  const resultStrength = { qualified: 7, qualified_with_review: 6, insufficient_evidence: 5, stale_evidence: 4, identity_review_required: 3, not_evaluated: 2, disqualified: 1 } as const;
  return right.priorityScore - left.priorityScore ||
    resultStrength[right.qualificationResult] - resultStrength[left.qualificationResult] ||
    right.qualificationScore - left.qualificationScore ||
    right.evaluatedAt.localeCompare(left.evaluatedAt) ||
    (right.assessmentAt ?? "").localeCompare(left.assessmentAt ?? "") ||
    right.contactReadinessScore - left.contactReadinessScore ||
    left.canonicalBusinessId.localeCompare(right.canonicalBusinessId) ||
    left.evaluationId.localeCompare(right.evaluationId);
}
