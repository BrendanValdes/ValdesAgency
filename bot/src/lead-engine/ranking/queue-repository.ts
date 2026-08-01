import type { SqliteDatabase } from "../db/database.js";
import { withTransaction } from "../db/transaction.js";
import type { PoolServiceQualificationResult } from "../qualification/types.js";
import { stableHash, stableId, stableJson } from "../shared/stable.js";
import type {
  CallingQueueConstraints,
  CallingQueueSnapshot,
  QueueCandidate,
  RankedQueueEntry,
} from "./types.js";

interface EvaluationRow {
  id: string;
  business_id: string;
  assessment_id: string | null;
  evaluated_at: string;
  input_fingerprint: string;
  model_version: string;
  fresh_until: string;
  icp_result: string;
  total_score: number;
  score_tier: PoolServiceQualificationResult["priorityTier"];
  result_json: string;
  business_state: string;
  business_updated_at: string;
  assessment_status: QueueCandidate["assessment"] extends infer T ? T extends { status: infer S } ? S : never : never;
  assessed_at: string | null;
  assessment_fresh_until: string | null;
  assessment_review_required: 0 | 1 | null;
  assessment_identity_state: "agrees" | "conflicts" | "ambiguous" | "unavailable" | null;
}

function qualificationResult(row: EvaluationRow): PoolServiceQualificationResult {
  const result = JSON.parse(row.result_json) as PoolServiceQualificationResult;
  const componentMaximum = result.componentScores.reduce((sum, component) => sum + component.maximumPoints, 0);
  const componentPoints = result.componentScores.reduce((sum, component) => sum + component.points, 0);
  const validComponents = result.componentScores.length === 7 && result.componentScores.every((component) =>
    Number.isInteger(component.points) && component.points >= 0 && component.points <= component.maximumPoints &&
    component.outcomes.every((item) =>
      Number.isInteger(item.points) && item.points >= 0 && item.points <= item.maximumPoints &&
      (item.points === 0 || item.evidenceReferences.length > 0)
    )
  );
  if (
    result.evaluationId !== row.id || result.businessId !== row.business_id ||
    result.modelVersion !== row.model_version || result.inputFingerprint !== row.input_fingerprint ||
    result.evaluatedAt !== row.evaluated_at || result.freshUntil !== row.fresh_until ||
    result.icpResult !== row.icp_result || result.overallScore !== row.total_score ||
    result.priorityTier !== row.score_tier || !Number.isInteger(result.overallScore) ||
    result.overallScore < 0 || result.overallScore > 100 || !validComponents ||
    componentMaximum !== 100 || componentPoints !== result.overallScore ||
    ((result.icpResult === "disqualified") !== (result.hardDisqualifiers.length > 0))
  ) throw new Error(`Persisted qualification result is internally inconsistent: ${row.id}`);
  return result;
}

interface IdentityAuditRow {
  left_entity_id: string;
  right_entity_id: string;
  action: "auto_merge" | "group_link" | "human_review" | "no_match";
  conflicting_signals_json: string;
  review_reason: string | null;
  decided_at: string;
  id: string;
}

class DisjointSet {
  private readonly parents = new Map<string, string>();

  add(value: string): void {
    if (!this.parents.has(value)) this.parents.set(value, value);
  }

  find(value: string): string {
    this.add(value);
    const parent = this.parents.get(value) as string;
    if (parent === value) return value;
    const root = this.find(parent);
    this.parents.set(value, root);
    return root;
  }

  union(left: string, right: string): void {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot === rightRoot) return;
    const [canonical, other] = [leftRoot, rightRoot].sort();
    this.parents.set(other as string, canonical as string);
  }
}

function currentIdentityAudits(database: SqliteDatabase): IdentityAuditRow[] {
  const rows = database.prepare(`
    SELECT audit.left_entity_id, audit.right_entity_id, audit.action, audit.conflicting_signals_json,
           audit.review_reason, audit.decided_at, audit.id
    FROM identity_decision_audits audit
    JOIN businesses left_business ON left_business.id = audit.left_entity_id
    JOIN businesses right_business ON right_business.id = audit.right_entity_id
    ORDER BY audit.left_entity_id, audit.right_entity_id, audit.decided_at DESC, audit.id DESC
  `).all() as IdentityAuditRow[];
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.left_entity_id}:${row.right_entity_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function identityReasons(database: SqliteDatabase, businessId: string, audits: IdentityAuditRow[]): string[] {
  const reasons: string[] = [];
  const candidates = database.prepare(`
    SELECT id, state FROM identity_candidates
    WHERE (left_business_id = ? OR right_business_id = ?)
      AND state IN ('pending', 'human_review') ORDER BY id
  `).all(businessId, businessId) as Array<{ id: string; state: string }>;
  for (const candidate of candidates) reasons.push(`identity_candidate_${candidate.state}:${candidate.id}`);
  const conflicts = database.prepare(`
    SELECT ic.id FROM identity_conflicts ic
    JOIN identity_candidates candidate ON candidate.id = ic.candidate_id
    WHERE (candidate.left_business_id = ? OR candidate.right_business_id = ?)
      AND ic.review_state = 'pending' ORDER BY ic.id
  `).all(businessId, businessId) as Array<{ id: string }>;
  for (const conflict of conflicts) reasons.push(`identity_conflict_pending:${conflict.id}`);
  const website = database.prepare(`
    SELECT id FROM website_identity_conflicts
    WHERE business_id = ? AND review_state = 'pending' ORDER BY id
  `).all(businessId) as Array<{ id: string }>;
  for (const conflict of website) reasons.push(`website_identity_conflict_pending:${conflict.id}`);
  for (const audit of audits) {
    if ((audit.left_entity_id === businessId || audit.right_entity_id === businessId) && audit.action === "human_review") {
      reasons.push(`identity_audit_human_review:${audit.id}${audit.review_reason ? `:${audit.review_reason}` : ""}`);
    }
  }
  return [...new Set(reasons)].sort();
}

function preferEvaluation(left: EvaluationRow, right: EvaluationRow): number {
  return right.evaluated_at.localeCompare(left.evaluated_at) || right.id.localeCompare(left.id);
}

export interface QueueSnapshotStart {
  readonly snapshotId: string;
  readonly attemptNumber: number;
  readonly reused: CallingQueueSnapshot | null;
}

export interface QueueStableIdentifiers {
  hash(value: unknown): string;
  id(prefix: string, value: unknown): string;
}

export const DEFAULT_QUEUE_STABLE_IDENTIFIERS: QueueStableIdentifiers = Object.freeze({
  hash: stableHash,
  id: stableId,
});

export interface CallingQueueRepository {
  loadCandidates(qualificationModelVersion: string): QueueCandidate[];
  sourceFingerprint(candidates: ReadonlyArray<QueueCandidate>): string;
  beginSnapshot(constraints: CallingQueueConstraints, sourceFingerprint: string): QueueSnapshotStart;
  saveComplete(
    snapshotId: string,
    attemptNumber: number,
    snapshot: CallingQueueSnapshot,
    beforeEntry?: (entry: RankedQueueEntry) => void,
    beforeComplete?: () => void,
  ): CallingQueueSnapshot;
  markAttempt(snapshotId: string, attemptNumber: number, status: "cancelled" | "failed", code: string, summary: string, completedAt: string): void;
  getComplete(snapshotId: string): CallingQueueSnapshot | null;
}

export function createCallingQueueRepository(
  database: SqliteDatabase,
  stableIdentifiers: QueueStableIdentifiers = DEFAULT_QUEUE_STABLE_IDENTIFIERS,
): CallingQueueRepository {
  const getComplete = (snapshotId: string): CallingQueueSnapshot | null => {
    const row = database.prepare(`
      SELECT result_json FROM lead_queue_snapshots WHERE id = ? AND status = 'complete'
    `).get(snapshotId) as { result_json: string } | undefined;
    return row ? { ...(JSON.parse(row.result_json) as CallingQueueSnapshot), reused: true } : null;
  };

  return {
    loadCandidates(qualificationModelVersion) {
      const rows = database.prepare(`
        SELECT q.id, q.business_id, q.assessment_id, q.evaluated_at, q.input_fingerprint,
               q.model_version, q.fresh_until, q.icp_result, q.total_score, q.score_tier,
               q.result_json, b.state AS business_state, b.updated_at AS business_updated_at,
               a.status AS assessment_status, a.assessed_at, a.fresh_until AS assessment_fresh_until,
               a.review_required AS assessment_review_required, a.identity_state AS assessment_identity_state
        FROM icp_qualification_evaluations q
        JOIN businesses b ON b.id = q.business_id
        LEFT JOIN website_assessments a ON a.id = q.assessment_id
        WHERE q.niche_id = 'pool_service' AND q.model_version = ?
          AND NOT EXISTS (
            SELECT 1 FROM icp_qualification_evaluations newer
            WHERE newer.supersedes_evaluation_id = q.id
          )
        ORDER BY q.business_id, q.evaluated_at DESC, q.id DESC
      `).all(qualificationModelVersion) as EvaluationRow[];
      const latestByBusiness = new Map<string, EvaluationRow>();
      for (const row of rows) if (!latestByBusiness.has(row.business_id)) latestByBusiness.set(row.business_id, row);
      const selected = [...latestByBusiness.values()];
      const businessIds = new Set(selected.map((row) => row.business_id));
      const audits = currentIdentityAudits(database);
      const identities = new DisjointSet();
      for (const businessId of businessIds) identities.add(businessId);
      for (const audit of audits) {
        if (audit.action === "auto_merge" && businessIds.has(audit.left_entity_id) && businessIds.has(audit.right_entity_id) &&
            (JSON.parse(audit.conflicting_signals_json) as unknown[]).length === 0) {
          identities.union(audit.left_entity_id, audit.right_entity_id);
        }
      }
      const groups = new Map<string, EvaluationRow[]>();
      for (const row of selected) {
        const root = identities.find(row.business_id);
        groups.set(root, [...(groups.get(root) ?? []), row]);
      }
      const retainedByRoot = new Map<string, EvaluationRow>();
      for (const [root, members] of groups) retainedByRoot.set(root, [...members].sort(preferEvaluation)[0] as EvaluationRow);

      return selected.map((row): QueueCandidate => {
        const persistedQualification = qualificationResult(row);
        const root = identities.find(row.business_id);
        const retained = retainedByRoot.get(root) as EvaluationRow;
        const coverageKeys = (database.prepare(`
          SELECT r.source_id FROM icp_qualification_evidence_references r
          WHERE r.evaluation_id = ? AND r.source_table = 'coverage_cells' ORDER BY r.source_id
        `).all(row.id) as Array<{ source_id: string }>).map((item) => item.source_id);
        const geographies = database.prepare(`
          SELECT upper(country_code) AS countryCode,
                 upper(country_code || '-' || region) AS subdivisionCode
          FROM business_locations WHERE business_id = ? ORDER BY id
        `).all(row.business_id) as Array<{ countryCode: string; subdivisionCode: string }>;
        const assessment = row.assessment_id && row.assessment_status && row.assessed_at && row.assessment_fresh_until && row.assessment_identity_state
          ? {
              id: row.assessment_id,
              status: row.assessment_status,
              assessedAt: row.assessed_at,
              freshUntil: row.assessment_fresh_until,
              reviewRequired: row.assessment_review_required === 1,
              identityState: row.assessment_identity_state,
            } : null;
        const reasons = identityReasons(database, row.business_id, audits);
        if (assessment?.identityState === "conflicts" || assessment?.identityState === "ambiguous") {
          reasons.push(`assessment_identity_${assessment.identityState}`);
        }
        return {
          businessId: row.business_id,
          canonicalBusinessId: root,
          businessState: row.business_state,
          businessUpdatedAt: row.business_updated_at,
          assessment,
          qualification: persistedQualification,
          coverageKeys,
          geographies,
          identityReviewReasons: [...new Set(reasons)].sort(),
          duplicateOfEvaluationId: retained.id === row.id ? null : retained.id,
        };
      }).sort((left, right) => left.qualification.evaluationId.localeCompare(right.qualification.evaluationId));
    },

    sourceFingerprint(candidates) {
      return stableIdentifiers.hash(candidates.map((candidate) => ({
        businessId: candidate.businessId,
        canonicalBusinessId: candidate.canonicalBusinessId,
        businessState: candidate.businessState,
        businessUpdatedAt: candidate.businessUpdatedAt,
        assessment: candidate.assessment,
        qualification: candidate.qualification,
        coverageKeys: candidate.coverageKeys,
        geographies: candidate.geographies,
        identityReviewReasons: candidate.identityReviewReasons,
        duplicateOfEvaluationId: candidate.duplicateOfEvaluationId,
      })));
    },

    beginSnapshot(constraints, sourceFingerprint) {
      const requestFingerprint = stableIdentifiers.hash(constraints);
      const snapshotId = stableIdentifiers.id("calling-queue", {
        queueVersion: constraints.queueVersion,
        rankingModelVersion: constraints.rankingModelVersion,
        freshnessPolicyVersion: constraints.freshnessPolicyVersion,
        requestFingerprint,
        sourceFingerprint,
      });
      const existing = getComplete(snapshotId);
      if (existing) return { snapshotId, attemptNumber: 0, reused: existing };
      const start = withTransaction(database, () => {
        database.prepare(`
          INSERT INTO lead_queue_snapshots (
            id, queue_version, ranking_model_version, qualification_model_version,
            freshness_policy_version, generated_at, scope_json, constraints_json,
            request_fingerprint, source_fingerprint, status, result_json, warning_json,
            created_at, completed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'building', NULL, ?, ?, NULL)
          ON CONFLICT(id) DO UPDATE SET status = 'building', result_json = NULL, completed_at = NULL
          WHERE lead_queue_snapshots.status IN ('cancelled', 'failed', 'building')
        `).run(
          snapshotId, constraints.queueVersion, constraints.rankingModelVersion,
          constraints.qualificationModelVersion, constraints.freshnessPolicyVersion,
          constraints.generatedAt, stableJson(constraints.scope), stableJson(constraints),
          requestFingerprint, sourceFingerprint,
          stableJson(["suppression_state_unavailable"]), constraints.generatedAt,
        );
        database.prepare(`
          UPDATE lead_queue_generation_attempts
          SET status = 'failed', completed_at = ?, error_code = 'queue_attempt_interrupted',
              safe_error_summary = 'A later deterministic attempt replaced an incomplete attempt.'
          WHERE snapshot_id = ? AND status = 'running'
        `).run(constraints.generatedAt, snapshotId);
        const next = (database.prepare(`
          SELECT COALESCE(MAX(attempt_number), 0) + 1 AS attemptNumber
          FROM lead_queue_generation_attempts WHERE snapshot_id = ?
        `).get(snapshotId) as { attemptNumber: number }).attemptNumber;
        database.prepare(`
          INSERT INTO lead_queue_generation_attempts (
            snapshot_id, attempt_number, status, started_at, completed_at, error_code, safe_error_summary
          ) VALUES (?, ?, 'running', ?, NULL, NULL, NULL)
        `).run(snapshotId, next, constraints.generatedAt);
        return next;
      });
      return { snapshotId, attemptNumber: start, reused: null };
    },

    saveComplete(snapshotId, attemptNumber, snapshot, beforeEntry, beforeComplete) {
      withTransaction(database, () => {
        for (const entry of snapshot.entries) {
          beforeEntry?.(entry);
          database.prepare(`
            INSERT INTO lead_queue_entries (
              id, snapshot_id, source_business_id, canonical_business_id, evaluation_id,
              position, disposition, priority_score, priority_band, qualification_score,
              qualification_result, freshness_state, identity_state, component_scores_json,
              reason_codes_json, explanation, result_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            entry.entryId, snapshotId, entry.sourceBusinessId, entry.canonicalBusinessId,
            entry.evaluationId, entry.position, entry.disposition, entry.priorityScore,
            entry.priorityBand, entry.qualificationScore, entry.qualificationResult,
            entry.freshnessState, entry.identityState, stableJson(entry.components),
            stableJson(entry.reasons.map((reason) => reason.code)), entry.explanation,
            stableJson(entry), snapshot.generatedAt,
          );
          const insertReason = database.prepare(`
            INSERT INTO lead_queue_entry_reasons (entry_id, ordinal, reason_code, detail)
            VALUES (?, ?, ?, ?)
          `);
          entry.reasons.forEach((reason, ordinal) => insertReason.run(entry.entryId, ordinal, reason.code, reason.detail));
          const ruleIds = [...new Set(entry.components.flatMap((component) => component.ruleIds))].sort();
          const insertReference = database.prepare(`
            INSERT INTO lead_queue_evidence_references (
              entry_id, ordinal, evaluation_id, rule_id, source_table, source_id
            ) VALUES (?, ?, ?, ?, 'icp_qualification_evaluations', ?)
          `);
          ruleIds.forEach((ruleId, ordinal) => insertReference.run(entry.entryId, ordinal, entry.evaluationId, ruleId, entry.evaluationId));
        }
        beforeComplete?.();
        database.prepare(`
          UPDATE lead_queue_generation_attempts
          SET status = 'complete', completed_at = ?
          WHERE snapshot_id = ? AND attempt_number = ? AND status = 'running'
        `).run(snapshot.generatedAt, snapshotId, attemptNumber);
        const updated = database.prepare(`
          UPDATE lead_queue_snapshots
          SET status = 'complete', result_json = ?, completed_at = ?
          WHERE id = ? AND status = 'building'
        `).run(stableJson(snapshot), snapshot.generatedAt, snapshotId);
        if (updated.changes !== 1) throw new Error("Queue snapshot completion lost its building state");
      });
      return snapshot;
    },

    markAttempt(snapshotId, attemptNumber, status, code, summary, completedAt) {
      withTransaction(database, () => {
        database.prepare(`
          UPDATE lead_queue_generation_attempts
          SET status = ?, completed_at = ?, error_code = ?, safe_error_summary = ?
          WHERE snapshot_id = ? AND attempt_number = ? AND status = 'running'
        `).run(status, completedAt, code, summary, snapshotId, attemptNumber);
        database.prepare(`
          UPDATE lead_queue_snapshots SET status = ?, result_json = NULL, completed_at = NULL
          WHERE id = ? AND status = 'building'
        `).run(status, snapshotId);
      });
    },

    getComplete,
  };
}
