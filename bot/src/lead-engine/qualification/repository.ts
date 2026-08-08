import type { SqliteDatabase } from "../db/database.js";
import { withTransaction } from "../db/transaction.js";
import type {
  ClaimState,
  ExternalVerificationState,
  HumanReviewState,
  ProvenanceSourceClass,
  VerificationDimension,
  VerificationMethod,
  VerificationResult,
} from "../domain/provenance.js";
import type { DecisionState, EvidenceState, LeadState, VerificationState } from "../domain/states.js";
import type {
  PoolServiceQualificationInput,
  PoolServiceQualificationResult,
  QualificationEvidenceReference,
  QualificationFact,
  QualificationFreshness,
  QualificationSourceTable,
} from "./types.js";

const SOURCE_TABLES = new Set<QualificationSourceTable>([
  "businesses",
  "business_locations",
  "coverage_cells",
  "website_assessments",
  "website_pages",
  "structured_data_observations",
  "service_evidence",
  "conversion_feature_observations",
  "website_contact_observations",
  "person_evidence_candidates",
  "contacts",
  "evidence",
  "identity_decision_audits",
  "website_identity_conflicts",
]);

interface BusinessRow {
  id: string;
  canonical_name: string;
  niche_id: string;
  state: LeadState;
  updated_at: string;
}

interface AssessmentRow {
  id: string;
  business_id: string;
  source_website_url: string;
  canonical_homepage_url: string | null;
  status: PoolServiceQualificationInput["assessment"] extends infer T
    ? T extends { status: infer S } ? S : never
    : never;
  identity_state: "agrees" | "conflicts" | "ambiguous" | "unavailable";
  review_required: 0 | 1;
  assessed_at: string;
  fresh_until: string;
  source_class: ProvenanceSourceClass;
}

interface EvidenceRow {
  id: string;
  entity_type: "business" | "person";
  entity_id: string;
  field_name: string;
  claimed_value: string | null;
  observed_at: string;
  confidence_basis_points: number;
  conflict_status: "none" | "potential" | "confirmed" | "resolved";
  evidence_state: EvidenceState;
  verification_state: VerificationState;
  decision_state: DecisionState;
  source_class: ProvenanceSourceClass;
  claim_state: ClaimState;
  external_verification_state: ExternalVerificationState;
  human_review_state: HumanReviewState;
  verification_dimension: VerificationDimension | null;
  verifier_id: string | null;
  verification_method: VerificationMethod | null;
  verification_result: VerificationResult | null;
  verified_at: string | null;
  expires_at: string | null;
  normalized_value: string | null;
  evidence_reference: string | null;
  human_reviewer_id: string | null;
  human_reviewed_at: string | null;
}

function freshness(input: {
  evaluatedAt: string;
  observedAt?: string | null;
  freshUntil?: string | null;
  claimState?: ClaimState | null;
  evidenceState?: EvidenceState | null;
  externalVerificationState?: ExternalVerificationState | null;
}): QualificationFreshness {
  const now = Date.parse(input.evaluatedAt);
  if (!Number.isFinite(now)) throw new Error("Qualification evaluation time must be a valid ISO timestamp");
  if (
    input.claimState === "stale" || input.evidenceState === "stale" ||
    input.externalVerificationState === "expired"
  ) return "stale";
  if (input.freshUntil) {
    const expires = Date.parse(input.freshUntil);
    return Number.isFinite(expires) && expires > now ? "current" : "stale";
  }
  return "unknown";
}

function reference(input: {
  sourceTable: QualificationSourceTable;
  sourceId: string;
  evaluatedAt: string;
  sourceClass?: ProvenanceSourceClass | null;
  claimState?: ClaimState | null;
  evidenceState?: EvidenceState | null;
  verificationState?: VerificationState | null;
  verificationDimension?: VerificationDimension | null;
  externalVerificationState?: ExternalVerificationState | null;
  verificationMethod?: VerificationMethod | null;
  verificationResult?: VerificationResult | null;
  humanReviewState?: HumanReviewState | null;
  observedAt?: string | null;
  freshUntil?: string | null;
  confidenceBasisPoints?: number | null;
}): QualificationEvidenceReference {
  return {
    sourceTable: input.sourceTable,
    sourceId: input.sourceId,
    sourceClass: input.sourceClass ?? null,
    claimState: input.claimState ?? null,
    evidenceState: input.evidenceState ?? null,
    verificationState: input.verificationState ?? null,
    verificationDimension: input.verificationDimension ?? null,
    externalVerificationState: input.externalVerificationState ?? null,
    verificationMethod: input.verificationMethod ?? null,
    verificationResult: input.verificationResult ?? null,
    humanReviewState: input.humanReviewState ?? null,
    observedAt: input.observedAt ?? null,
    freshUntil: input.freshUntil ?? null,
    confidenceBasisPoints: input.confidenceBasisPoints ?? null,
    freshness: freshness(input),
  };
}

function evidenceReference(
  row: EvidenceRow,
  evaluatedAt: string,
  assessmentFreshUntil: string | null,
): QualificationEvidenceReference {
  return reference({
    sourceTable: "evidence",
    sourceId: row.id,
    evaluatedAt,
    sourceClass: row.source_class,
    claimState: row.claim_state,
    evidenceState: row.evidence_state,
    verificationState: row.verification_state,
    verificationDimension: row.verification_dimension,
    externalVerificationState: row.external_verification_state,
    verificationMethod: row.verification_method,
    verificationResult: row.verification_result,
    humanReviewState: row.human_review_state,
    observedAt: row.observed_at,
    freshUntil: row.expires_at ?? assessmentFreshUntil,
    confidenceBasisPoints: row.confidence_basis_points,
  });
}

function fact(
  value: string,
  state: QualificationFact["state"],
  references: ReadonlyArray<QualificationEvidenceReference>,
): QualificationFact {
  const byKey = new Map(references.map((item) => [`${item.sourceTable}:${item.sourceId}`, item]));
  const ordered = [...byKey.values()].sort((left, right) =>
    `${left.sourceTable}:${left.sourceId}`.localeCompare(`${right.sourceTable}:${right.sourceId}`)
  );
  const effectiveState = ordered.some((item) =>
    item.claimState === "conflicting" || item.evidenceState === "conflicting"
  ) ? "conflicting" : ordered.length > 0 && ordered.every((item) => item.freshness === "stale")
    ? "stale" : state;
  return { value, state: effectiveState, references: ordered };
}

/**
 * Canonical geography value for a selected market.
 *
 * A persisted business location is always rendered as
 * `subdivision:<country>-<region>`, while a coverage cell may carry either a bare
 * subdivision code ("AZ") or an already-qualified one ("US-AZ"). Qualifying the
 * bare form here — rather than in the comparison — keeps both sides of
 * `hard.outside_selected_geography` in one shape, so an in-market business is not
 * disqualified purely because its market was recorded in the short form. A blank
 * subdivision still means "anywhere in this country".
 */
function marketGeographyValue(countryCode: string, subdivisionCode: string | null): string {
  const country = countryCode.trim().toUpperCase();
  const subdivision = subdivisionCode?.trim().toUpperCase() ?? "";
  const qualified = !subdivision ? ""
    : subdivision.includes("-") ? subdivision : `${country}-${subdivision}`;
  return `country:${country}|subdivision:${qualified}`;
}

function assessmentRow(
  database: SqliteDatabase,
  businessId: string,
  assessmentId?: string | null,
): AssessmentRow | null {
  if (assessmentId) {
    return database.prepare(`
      SELECT * FROM website_assessments WHERE id = ? AND business_id = ?
    `).get(assessmentId, businessId) as AssessmentRow | undefined ?? null;
  }
  return database.prepare(`
    SELECT * FROM website_assessments WHERE business_id = ?
    ORDER BY assessed_at DESC, id DESC LIMIT 1
  `).get(businessId) as AssessmentRow | undefined ?? null;
}

function resultFromJson(row: { result_json: string } | undefined): PoolServiceQualificationResult | null {
  return row ? JSON.parse(row.result_json) as PoolServiceQualificationResult : null;
}

function assertResult(result: PoolServiceQualificationResult): void {
  if (!Number.isInteger(result.overallScore) || result.overallScore < 0 || result.overallScore > 100) {
    throw new Error("Qualification score must be an integer between 0 and 100");
  }
  const expectedTier = result.overallScore >= 80 ? "high_priority"
    : result.overallScore >= 65 ? "qualified"
    : result.overallScore >= 50 ? "moderate" : "low";
  if (result.priorityTier !== expectedTier) throw new Error("Qualification score tier does not match score");
  if (result.icpResult === "qualified" && result.overallScore < 65) {
    throw new Error("Qualified results must meet the qualified score threshold");
  }
  if (result.icpResult === "qualified_with_review" &&
    (result.overallScore < 50 || result.overallScore >= 65)) {
    throw new Error("Qualified-with-review results must be within the moderate score band");
  }
  if ((result.icpResult === "disqualified") !== (result.hardDisqualifiers.length > 0)) {
    throw new Error("Disqualified qualification results require hard-disqualifier reasons");
  }
  if (result.icpResult === "identity_review_required" && (
    result.identityReviewState !== "required" ||
    !result.reviewRequirements.required || result.reviewRequirements.reasons.length === 0
  )) {
    throw new Error("Identity-review qualification results require review context");
  }
  const componentMaximum = result.componentScores.reduce((total, component) => total + component.maximumPoints, 0);
  const componentPoints = result.componentScores.reduce((total, component) => total + component.points, 0);
  if (componentMaximum !== 100 || componentPoints !== result.overallScore) {
    throw new Error("Qualification component totals do not match the bounded overall score");
  }
  for (const component of result.componentScores) {
    if (!Number.isInteger(component.points) || component.points < 0 || component.points > component.maximumPoints) {
      throw new Error("Qualification component score is outside its bounded range");
    }
    for (const outcome of component.outcomes) {
      if (!outcome.ruleId.trim() || !outcome.explanation.trim()) {
        throw new Error("Qualification rule outcomes require deterministic IDs and explanations");
      }
      if (outcome.points < 0 || outcome.points > outcome.maximumPoints) {
        throw new Error("Qualification rule points are outside their bounded range");
      }
      if (outcome.points > 0 && outcome.evidenceReferences.length === 0) {
        throw new Error("Awarded qualification points require evidence lineage");
      }
      if (outcome.points === 0 && outcome.evidenceReferences.length === 0 &&
        !outcome.missingFlag && outcome.state === "missing") {
        throw new Error("Missing qualification outcomes require a missing-information reason");
      }
    }
  }
}

export interface QualificationRepository {
  loadPoolServiceInput(input: {
    businessId: string;
    runId?: string | null;
    assessmentId?: string | null;
    evaluatedAt: string;
    /**
     * Coverage cells this evaluation's batch actually searched, for callers that
     * traverse cells without an orchestrated run. Each key must already exist as
     * a persisted coverage cell; unknown keys are ignored rather than invented.
     */
    coverageKeys?: ReadonlyArray<string>;
  }): PoolServiceQualificationInput;
  save(result: PoolServiceQualificationResult, assessmentId?: string | null): PoolServiceQualificationResult;
  getById(id: string): PoolServiceQualificationResult | null;
  getByFingerprint(
    businessId: string,
    modelVersion: string,
    inputFingerprint: string,
  ): PoolServiceQualificationResult | null;
  getLatestForBusiness(businessId: string): PoolServiceQualificationResult | null;
  listForBusiness(businessId: string): PoolServiceQualificationResult[];
  isStale(evaluationId: string, currentAt: string): boolean;
}

export function createQualificationRepository(database: SqliteDatabase): QualificationRepository {
  const repository: QualificationRepository = {
    loadPoolServiceInput({ businessId, runId = null, assessmentId = null, evaluatedAt, coverageKeys = [] }) {
      const evaluatedMs = Date.parse(evaluatedAt);
      if (!Number.isFinite(evaluatedMs) || new Date(evaluatedMs).toISOString() !== evaluatedAt) {
        throw new Error("Qualification evaluation time must be a canonical ISO timestamp");
      }
      const business = database.prepare("SELECT * FROM businesses WHERE id = ?").get(businessId) as BusinessRow | undefined;
      if (!business) throw new Error(`Qualification business was not found: ${businessId}`);
      const assessment = assessmentRow(database, businessId, assessmentId);
      const assessmentFreshUntil = assessment?.fresh_until ?? null;
      const assessmentReference = assessment ? reference({
        sourceTable: "website_assessments",
        sourceId: assessment.id,
        evaluatedAt,
        sourceClass: assessment.source_class,
        observedAt: assessment.assessed_at,
        freshUntil: assessment.fresh_until,
      }) : null;

      const evidenceRows = database.prepare(`
        SELECT e.* FROM evidence e
        WHERE (e.entity_type = 'business' AND e.entity_id = ?)
           OR (e.entity_type = 'person' AND e.entity_id IN (
             SELECT id FROM contacts WHERE business_id = ?
           ))
        ORDER BY e.observed_at, e.id
      `).all(businessId, businessId) as EvidenceRow[];
      const evidenceById = new Map(evidenceRows.map((row) => [row.id, row]));
      const linked = (evidenceId: string | null): QualificationEvidenceReference[] => {
        const row = evidenceId ? evidenceById.get(evidenceId) : null;
        return row ? [evidenceReference(row, evaluatedAt, assessmentFreshUntil)] : [];
      };

      const locations = (database.prepare(`
        SELECT * FROM business_locations WHERE business_id = ? ORDER BY id
      `).all(businessId) as Array<{
        id: string; country_code: string; region: string; source_class: ProvenanceSourceClass;
        claim_state: ClaimState; evidence_state: EvidenceState; updated_at: string;
      }>).map((row) => fact(
        `country:${row.country_code.toUpperCase()}|subdivision:${row.country_code.toUpperCase()}-${row.region.toUpperCase()}`,
        row.evidence_state === "conflicting" ? "conflicting" : row.evidence_state === "stale" ? "stale" : "positive",
        [reference({
          sourceTable: "business_locations", sourceId: row.id, evaluatedAt,
          sourceClass: row.source_class, claimState: row.claim_state,
          evidenceState: row.evidence_state, observedAt: row.updated_at,
        })],
      ));
      // Selected markets have two persisted sources and both are honoured.
      //
      // An orchestrated run reaches its cells through the discovery lineage. A
      // bounded batch that traverses cells directly has no provider_calls row to
      // join through, so it names the coverage keys it actually searched; those
      // rows must already exist as coverage cells, which is what makes them
      // citable. Neither source defaults anything in: a caller with no run and no
      // coverage keys yields no market, and the geography hard rule then does not
      // fire at all rather than rejecting or admitting on a guess.
      const marketRows = new Map<string, {
        coverage_key: string; country_code: string; subdivision_code: string | null; updated_at: string;
      }>();
      if (runId) {
        for (const row of database.prepare(`
          SELECT DISTINCT cc.coverage_key, cc.country_code, cc.subdivision_code, cc.updated_at
          FROM provider_calls pc
          JOIN discovery_observations observation ON observation.provider_call_id = pc.id
          JOIN discovery_queries query ON query.id = observation.query_id
          JOIN coverage_cells cc ON cc.coverage_key = query.coverage_key
          WHERE pc.run_id = ?
          ORDER BY cc.coverage_key
        `).all(runId) as Array<{
          coverage_key: string; country_code: string; subdivision_code: string | null; updated_at: string;
        }>) marketRows.set(row.coverage_key, row);
      }
      for (const coverageKey of new Set(coverageKeys)) {
        const row = database.prepare(`
          SELECT coverage_key, country_code, subdivision_code, updated_at
          FROM coverage_cells WHERE coverage_key = ?
        `).get(coverageKey) as {
          coverage_key: string; country_code: string; subdivision_code: string | null; updated_at: string;
        } | undefined;
        if (row) marketRows.set(row.coverage_key, row);
      }
      const selectedMarkets = [...marketRows.values()]
        .sort((left, right) => left.coverage_key.localeCompare(right.coverage_key))
        .map((row) => fact(
          marketGeographyValue(row.country_code, row.subdivision_code),
          "positive",
          [reference({
            sourceTable: "coverage_cells", sourceId: row.coverage_key,
            evaluatedAt, observedAt: row.updated_at,
          })],
        ));

      const serviceRows = assessment ? database.prepare(`
        SELECT * FROM service_evidence WHERE assessment_id = ? ORDER BY id
      `).all(assessment.id) as Array<{
        id: string; evidence_id: string | null; evidence_state: "positive" | "negative" | "ambiguous" | "unavailable";
        term: string | null; basis: PoolServiceQualificationInput["services"][number]["basis"];
        observed_at: string; source_class: ProvenanceSourceClass; claim_state: ClaimState;
      }> : [];
      const services = serviceRows.map((row) => ({
        state: row.evidence_state,
        term: row.term,
        basis: row.basis,
        fact: fact(row.term ?? row.basis,
          row.evidence_state === "positive" ? "positive" : row.evidence_state === "negative" ? "negative"
            : row.evidence_state === "ambiguous" ? "conflicting" : "missing",
          [reference({
            sourceTable: "service_evidence", sourceId: row.id, evaluatedAt,
            sourceClass: row.source_class, claimState: row.claim_state,
            observedAt: row.observed_at, freshUntil: assessmentFreshUntil,
          }), ...linked(row.evidence_id)],
        ),
      }));

      const operationRows = evidenceRows.filter((row) => row.entity_type === "business" && row.field_name.startsWith("operational:"));
      const operations = operationRows.map((row) => {
        const kind = row.field_name.slice("operational:".length);
        const detail = row.claimed_value ?? "not observed";
        const normalizedDetail = detail.toLocaleLowerCase("en-US");
        const status = ["closed", "parked", "different_business_redirect"].includes(kind) ? "negative" as const
          : normalizedDetail.includes("unavailable") || normalizedDetail.includes("not_checked") ? "unavailable" as const
          : normalizedDetail.includes("ambiguous") ? "ambiguous" as const
          : kind === "identity_agreement" && normalizedDetail.includes("conflict") ? "negative" as const
          : "positive" as const;
        return {
          kind,
          status,
          detail,
          fact: fact(`${kind}:${detail}`,
            status === "positive" ? "positive" : status === "negative" ? "negative"
              : status === "ambiguous" ? "conflicting" : "missing",
            [evidenceReference(row, evaluatedAt, assessmentFreshUntil)],
          ),
        };
      });

      const conversionRows = assessment ? database.prepare(`
        SELECT * FROM conversion_feature_observations WHERE assessment_id = ? ORDER BY feature, id
      `).all(assessment.id) as Array<{
        id: string; evidence_id: string | null; feature: string;
        status: PoolServiceQualificationInput["conversions"][number]["status"];
        observed_at: string; fresh_until: string; source_class: ProvenanceSourceClass; claim_state: ClaimState;
      }> : [];
      const conversions = conversionRows.map((row) => ({
        feature: row.feature,
        status: row.status,
        fact: fact(`${row.feature}:${row.status}`,
          ["present", "absent_after_successful_inspection"].includes(row.status) ? "positive"
            : row.status === "stale" ? "stale" : row.status === "ambiguous" ? "conflicting" : "missing",
          [reference({
            sourceTable: "conversion_feature_observations", sourceId: row.id, evaluatedAt,
            sourceClass: row.source_class, claimState: row.claim_state,
            observedAt: row.observed_at, freshUntil: row.fresh_until,
          }), ...linked(row.evidence_id)],
        ),
      }));

      const contactRows = assessment ? database.prepare(`
        SELECT * FROM website_contact_observations
        WHERE assessment_id = ? ORDER BY contact_kind, id
      `).all(assessment.id) as Array<{
        id: string; evidence_id: string | null; contact_kind: "phone" | "email" | "address";
        displayed_value: string; observed_at: string; source_class: ProvenanceSourceClass; claim_state: ClaimState;
      }> : [];
      const contacts = contactRows.map((row) => ({
        kind: row.contact_kind,
        displayedValue: row.displayed_value,
        fact: fact(`${row.contact_kind}:${row.displayed_value}`, "positive", [
          reference({
            sourceTable: "website_contact_observations", sourceId: row.id, evaluatedAt,
            sourceClass: row.source_class, claimState: row.claim_state,
            observedAt: row.observed_at, freshUntil: assessmentFreshUntil,
          }),
          ...linked(row.evidence_id),
        ]),
      }));

      const personRows = assessment ? database.prepare(`
        SELECT * FROM person_evidence_candidates WHERE assessment_id = ? ORDER BY displayed_name, id
      `).all(assessment.id) as Array<{
        id: string; evidence_id: string | null; displayed_name: string; displayed_title: string | null;
        ambiguity_state: "none" | "ambiguous" | "conflicting"; observed_at: string;
        source_class: ProvenanceSourceClass; claim_state: ClaimState;
      }> : [];
      const people = personRows.map((row) => ({
        id: row.id,
        displayedName: row.displayed_name,
        displayedTitle: row.displayed_title,
        ambiguityState: row.ambiguity_state,
        fact: fact(`person:${row.displayed_name}`, row.ambiguity_state === "conflicting" ? "conflicting" : "positive", [
          reference({
            sourceTable: "person_evidence_candidates", sourceId: row.id, evaluatedAt,
            sourceClass: row.source_class, claimState: row.claim_state,
            observedAt: row.observed_at, freshUntil: assessmentFreshUntil,
          }),
          ...linked(row.evidence_id),
        ]),
      }));

      const verifications = evidenceRows.map((row) => ({
        entityType: row.entity_type,
        entityId: row.entity_id,
        fieldName: row.field_name,
        claimedValue: row.claimed_value,
        sourceClass: row.source_class,
        claimState: row.claim_state,
        evidenceState: row.evidence_state,
        verificationState: row.verification_state,
        decisionState: row.decision_state,
        conflictStatus: row.conflict_status,
        externalVerificationState: row.external_verification_state,
        humanReviewState: row.human_review_state,
        verificationDimension: row.verification_dimension,
        verifierId: row.verifier_id,
        verificationMethod: row.verification_method,
        verificationResult: row.verification_result,
        verifiedAt: row.verified_at,
        expiresAt: row.expires_at,
        normalizedValue: row.normalized_value,
        evidenceReference: row.evidence_reference,
        humanReviewerId: row.human_reviewer_id,
        humanReviewedAt: row.human_reviewed_at,
        fact: fact(`${row.field_name}:${row.claimed_value ?? "missing"}`,
          row.conflict_status === "confirmed" || row.claim_state === "conflicting" ? "conflicting"
            : row.verification_result === "failed" || row.external_verification_state === "failed" ? "negative"
            : row.claimed_value === null ? "missing" : "positive",
          [evidenceReference(row, evaluatedAt, assessmentFreshUntil)],
        ),
      }));

      const identityRows = database.prepare(`
        SELECT * FROM identity_decision_audits
        WHERE left_entity_id = ? OR right_entity_id = ? ORDER BY decided_at, id
      `).all(businessId, businessId) as Array<{
        id: string; action: "auto_merge" | "group_link" | "human_review" | "no_match";
        review_reason: string | null; rule: string; decided_at: string;
      }>;
      const conflictRows = assessment ? database.prepare(`
        SELECT * FROM website_identity_conflicts
        WHERE business_id = ? AND assessment_id = ? ORDER BY id
      `).all(businessId, assessment.id) as Array<{
        id: string; review_state: "pending" | "resolved" | "rejected"; observed_at: string;
        source_class: ProvenanceSourceClass; claim_state: ClaimState; conflict_type: string;
      }> : [];
      const identityReferences = [
        ...identityRows.map((row) => reference({
          sourceTable: "identity_decision_audits", sourceId: row.id, evaluatedAt,
          observedAt: row.decided_at,
        })),
        ...conflictRows.map((row) => reference({
          sourceTable: "website_identity_conflicts", sourceId: row.id, evaluatedAt,
          sourceClass: row.source_class, claimState: row.claim_state,
          observedAt: row.observed_at, freshUntil: assessmentFreshUntil,
        })),
        ...(assessmentReference ? [assessmentReference] : []),
      ];
      const identityReasons = [
        ...identityRows.filter((row) => row.action === "human_review")
          .map((row) => row.review_reason ?? row.rule),
        ...conflictRows.filter((row) => row.review_state === "pending")
          .map((row) => `website_identity_${row.conflict_type}`),
        ...(assessment?.review_required ? [`website_identity_${assessment.identity_state}`] : []),
        ...(business.state === "human_review" ? ["business_identity_review_state"] : []),
      ];
      const pendingIdentity = identityReasons.length > 0;
      const resolvedIdentity = !pendingIdentity && conflictRows.some((row) => row.review_state === "resolved");
      const identityState = pendingIdentity ? "required" as const : resolvedIdentity ? "resolved" as const
        : assessment?.identity_state === "agrees" || business.state !== "unknown" ? "clear" as const : "unavailable" as const;

      const structuredRows = assessment ? database.prepare(`
        SELECT observation.* FROM structured_data_observations observation
        JOIN website_pages page ON page.id = observation.page_id
        WHERE page.assessment_id = ?
          AND observation.field_name IN ('schema_type', 'organization_name', 'address', 'contact_point')
        ORDER BY observation.id
      `).all(assessment.id) as Array<{
        id: string; field_name: string; claimed_value: string | null; observed_at: string;
        source_class: ProvenanceSourceClass; claim_state: ClaimState;
      }> : [];
      const structuredBusinessData = structuredRows.map((row) => fact(
        `${row.field_name}:${row.claimed_value ?? "observed"}`,
        row.claim_state === "conflicting" ? "conflicting" : row.claim_state === "stale" ? "stale" : "positive",
        [reference({
          sourceTable: "structured_data_observations", sourceId: row.id, evaluatedAt,
          sourceClass: row.source_class, claimState: row.claim_state,
          observedAt: row.observed_at, freshUntil: assessmentFreshUntil,
        })],
      ));

      return {
        evaluatedAt,
        runId,
        business: {
          id: business.id,
          canonicalName: business.canonical_name,
          nicheId: business.niche_id,
          state: business.state,
          updatedAt: business.updated_at,
          reference: reference({
            sourceTable: "businesses", sourceId: business.id,
            evaluatedAt, observedAt: business.updated_at,
          }),
        },
        assessment: assessment && assessmentReference ? {
          id: assessment.id,
          sourceWebsiteUrl: assessment.source_website_url,
          canonicalHomepageUrl: assessment.canonical_homepage_url,
          status: assessment.status,
          identityState: assessment.identity_state,
          reviewRequired: assessment.review_required === 1,
          assessedAt: assessment.assessed_at,
          freshUntil: assessment.fresh_until,
          sourceClass: assessment.source_class,
          reference: assessmentReference,
        } : null,
        geography: { locations, selectedMarkets },
        services,
        operations,
        conversions,
        contacts,
        people,
        verifications,
        identityReview: {
          state: identityState,
          reasons: [...new Set(identityReasons)].sort(),
          references: identityReferences,
        },
        structuredBusinessData,
      };
    },

    save(result, assessmentId = null) {
      assertResult(result);
      const existing = repository.getByFingerprint(
        result.businessId,
        result.modelVersion,
        result.inputFingerprint,
      );
      if (existing) return existing;
      if (result.supersedesEvaluationId) {
        const superseded = repository.getById(result.supersedesEvaluationId);
        if (!superseded || superseded.businessId !== result.businessId) {
          throw new Error("Qualification supersession must reference an older evaluation for the same business");
        }
      }
      const rulesByReference = new Map<string, Set<string>>();
      const register = (ruleId: string, references: ReadonlyArray<QualificationEvidenceReference>) => {
        for (const item of references) {
          const key = `${item.sourceTable}:${item.sourceId}`;
          const rules = rulesByReference.get(key) ?? new Set<string>();
          rules.add(ruleId);
          rulesByReference.set(key, rules);
        }
      };
      for (const component of result.componentScores) {
        for (const outcome of component.outcomes) register(outcome.ruleId, outcome.evidenceReferences);
      }
      for (const disqualifier of result.hardDisqualifiers) {
        register(disqualifier.ruleId, disqualifier.evidenceReferences);
      }
      for (const item of result.evidenceReferences) {
        if (!SOURCE_TABLES.has(item.sourceTable)) throw new Error("Qualification evidence source table is unsupported");
        const found = database.prepare(`SELECT 1 AS found FROM ${item.sourceTable} WHERE ${
          item.sourceTable === "coverage_cells" ? "coverage_key" : "id"
        } = ? LIMIT 1`).get(item.sourceId) as { found: 1 } | undefined;
        if (!found) throw new Error(`Qualification evidence reference is missing: ${item.sourceTable}:${item.sourceId}`);
      }
      withTransaction(database, () => {
        database.prepare(`
          INSERT INTO icp_qualification_evaluations
            (id, run_id, business_id, assessment_id, model_version, niche_id,
             input_fingerprint, evaluated_at, fresh_until, icp_result, total_score, score_tier,
             hard_disqualifiers_json, component_scores_json, positive_signals_json,
             negative_signals_json, missing_information_json, evidence_references_json,
             freshness_warnings_json, verification_limitations_json, identity_review_state,
             review_required, review_reasons_json, confidence_json, evidence_quality_json,
             final_explanation, result_json, supersedes_evaluation_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          result.evaluationId,
          result.runId,
          result.businessId,
          assessmentId,
          result.modelVersion,
          result.niche,
          result.inputFingerprint,
          result.evaluatedAt,
          result.freshUntil,
          result.icpResult,
          result.overallScore,
          result.priorityTier,
          JSON.stringify(result.hardDisqualifiers),
          JSON.stringify(result.componentScores),
          JSON.stringify(result.positiveSignals),
          JSON.stringify(result.negativeSignals),
          JSON.stringify(result.missingInformationFlags),
          JSON.stringify(result.evidenceReferences),
          JSON.stringify(result.freshnessWarnings),
          JSON.stringify(result.verificationLimitations),
          result.identityReviewState,
          result.reviewRequirements.required ? 1 : 0,
          JSON.stringify(result.reviewRequirements.reasons),
          JSON.stringify(result.confidence),
          JSON.stringify(result.evidenceQuality),
          result.finalExplanation,
          JSON.stringify(result),
          result.supersedesEvaluationId,
          result.evaluatedAt,
        );
        for (const [ordinal, item] of result.evidenceReferences.entries()) {
          database.prepare(`
            INSERT INTO icp_qualification_evidence_references
              (evaluation_id, ordinal, source_table, source_id, source_class, claim_state,
               verification_dimension, freshness, rule_ids_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            result.evaluationId,
            ordinal,
            item.sourceTable,
            item.sourceId,
            item.sourceClass,
            item.claimState,
            item.verificationDimension,
            item.freshness,
            JSON.stringify([...(rulesByReference.get(`${item.sourceTable}:${item.sourceId}`) ?? [])].sort()),
          );
        }
      });
      return repository.getById(result.evaluationId) as PoolServiceQualificationResult;
    },

    getById(id) {
      return resultFromJson(database.prepare(`
        SELECT result_json FROM icp_qualification_evaluations WHERE id = ?
      `).get(id) as { result_json: string } | undefined);
    },

    getByFingerprint(businessId, modelVersion, inputFingerprint) {
      return resultFromJson(database.prepare(`
        SELECT result_json FROM icp_qualification_evaluations
        WHERE business_id = ? AND model_version = ? AND input_fingerprint = ?
      `).get(businessId, modelVersion, inputFingerprint) as { result_json: string } | undefined);
    },

    getLatestForBusiness(businessId) {
      return resultFromJson(database.prepare(`
        SELECT result_json FROM icp_qualification_evaluations
        WHERE business_id = ? ORDER BY evaluated_at DESC, id DESC LIMIT 1
      `).get(businessId) as { result_json: string } | undefined);
    },

    listForBusiness(businessId) {
      return (database.prepare(`
        SELECT result_json FROM icp_qualification_evaluations
        WHERE business_id = ? ORDER BY evaluated_at, id
      `).all(businessId) as Array<{ result_json: string }>).map((row) =>
        JSON.parse(row.result_json) as PoolServiceQualificationResult
      );
    },

    isStale(evaluationId, currentAt) {
      const currentMs = Date.parse(currentAt);
      if (!Number.isFinite(currentMs) || new Date(currentMs).toISOString() !== currentAt) {
        throw new Error("Qualification staleness time must be a canonical ISO timestamp");
      }
      const row = database.prepare(`
        SELECT fresh_until FROM icp_qualification_evaluations WHERE id = ?
      `).get(evaluationId) as { fresh_until: string } | undefined;
      if (!row) throw new Error("Qualification evaluation was not found");
      return Date.parse(row.fresh_until) <= currentMs;
    },
  };
  return repository;
}
