import { createQualificationRepository } from "../qualification/repository.js";
import { qualifyPoolServiceLead } from "../qualification/qualifier.js";
import { POOL_SERVICE_ICP_MODEL_VERSION } from "../qualification/pool-service-model.js";
import type { IcpQualificationResult } from "../qualification/types.js";
import { generateInternalCallingQueue } from "../ranking/internal-calling-queue.js";
import {
  CALLING_QUEUE_VERSION,
  POOL_SERVICE_QUEUE_FRESHNESS_POLICY_VERSION,
  POOL_SERVICE_RANKING_MODEL_VERSION,
  POOL_SERVICE_RANKING_V1,
} from "../ranking/pool-service-ranking-model.js";
import { DEFAULT_QUEUE_STABLE_IDENTIFIERS } from "../ranking/queue-repository.js";
import type { CallingQueueConstraints, QueuePriorityBand } from "../ranking/types.js";
import type { SqliteDatabase } from "../db/database.js";

/**
 * Phase 5C qualification and ranking stage.
 *
 * Reads the live evidence already persisted by the website assessment, runs the
 * existing Phase 4A qualifier and Phase 4B ranker over it, and writes an
 * internal queue snapshot. Nothing is exported: the queue exists only as rows in
 * the run's own database.
 *
 * Identity review, stale evidence, duplicates, and hard disqualifiers are
 * handled by the qualifier and ranker exactly as they are offline — this stage
 * adds no new admissibility rules and relaxes none.
 */

export interface QualificationOutcomeCounts {
  readonly qualified: number;
  readonly qualifiedWithReview: number;
  readonly insufficientEvidence: number;
  readonly disqualified: number;
  readonly identityReviewRequired: number;
  readonly staleEvidence: number;
  readonly notEvaluated: number;
}

export interface BatchQueueSummary {
  readonly evaluated: number;
  readonly skippedAlreadyEvaluated: number;
  readonly qualificationCounts: QualificationOutcomeCounts;
  readonly callableQueueSize: number;
  readonly reviewQueueSize: number;
  readonly notEligible: number;
  readonly priorityBands: Readonly<Record<QueuePriorityBand, number>>;
  readonly snapshotId: string | null;
  readonly queueState: string;
}

function emptyBands(): Record<QueuePriorityBand, number> {
  return { top: 0, high: 0, standard: 0, low: 0 };
}

function bucket(result: IcpQualificationResult, counts: Record<string, number>): void {
  counts[result] = (counts[result] ?? 0) + 1;
}

export function qualifyAndRankBatch(input: {
  database: SqliteDatabase;
  /** Assessment/business pairs produced by the live website assessment. */
  assessments: ReadonlyArray<{ assessmentId: string; businessId: string }>;
  runId: string;
  evaluatedAt: string;
  maximumCallable: number;
  maximumReview: number;
  coverageKeys: ReadonlyArray<string>;
  signal: AbortSignal;
}): BatchQueueSummary {
  const qualification = createQualificationRepository(input.database);
  const counts: Record<string, number> = {};
  let evaluated = 0;
  let skippedAlreadyEvaluated = 0;

  for (const entry of input.assessments) {
    if (input.signal.aborted) break;
    const qualificationInput = qualification.loadPoolServiceInput({
      businessId: entry.businessId,
      // No persisted orchestration run backs this batch, so the evaluation is
      // not bound to a lead_runs row.
      runId: null,
      assessmentId: entry.assessmentId,
      evaluatedAt: input.evaluatedAt,
    });
    const result = qualifyPoolServiceLead(qualificationInput, {
      modelVersion: POOL_SERVICE_ICP_MODEL_VERSION,
    });
    // Idempotency: an identical input fingerprint is never re-persisted, so a
    // resumed batch reuses the prior evaluation instead of duplicating it.
    const existing = qualification.getByFingerprint(
      entry.businessId, POOL_SERVICE_ICP_MODEL_VERSION, result.inputFingerprint,
    );
    if (existing) {
      skippedAlreadyEvaluated += 1;
      bucket(existing.icpResult, counts);
      continue;
    }
    qualification.save(result, entry.assessmentId);
    evaluated += 1;
    bucket(result.icpResult, counts);
  }

  const constraints: CallingQueueConstraints = {
    queueVersion: CALLING_QUEUE_VERSION,
    rankingModelVersion: POOL_SERVICE_RANKING_MODEL_VERSION,
    niche: "pool_service",
    // Scoped to the coverage cells this batch actually discovered.
    scope: { kind: "coverage_keys", coverageKeys: input.coverageKeys },
    maximumCallable: input.maximumCallable,
    maximumReview: input.maximumReview,
    minimumQualificationScore: 0,
    minimumPriorityScore: 0,
    acceptedQualificationResults: ["qualified"],
    qualificationModelVersion: POOL_SERVICE_ICP_MODEL_VERSION,
    freshnessPolicyVersion: POOL_SERVICE_QUEUE_FRESHNESS_POLICY_VERSION,
    includedContactRoutes: ["phone", "email", "form"],
    contactPolicy: "require_route",
    generatedAt: input.evaluatedAt,
  };

  const generated = generateInternalCallingQueue(constraints, {
    database: input.database,
    rankingModel: POOL_SERVICE_RANKING_V1,
    stableIdentifiers: DEFAULT_QUEUE_STABLE_IDENTIFIERS,
    clock: { now: () => input.evaluatedAt },
    signal: input.signal,
    onEvent: () => undefined,
  });

  const bands = emptyBands();
  let callable = 0;
  let review = 0;
  let notEligible = 0;
  const snapshot = generated.state === "completed" ? generated.snapshot : null;
  for (const entry of snapshot?.entries ?? []) {
    if (entry.disposition === "callable") {
      callable += 1;
      bands[entry.priorityBand] = (bands[entry.priorityBand] ?? 0) + 1;
    } else if (entry.disposition === "review_required") review += 1;
    else notEligible += 1;
  }

  return {
    evaluated,
    skippedAlreadyEvaluated,
    qualificationCounts: Object.freeze({
      qualified: counts.qualified ?? 0,
      qualifiedWithReview: counts.qualified_with_review ?? 0,
      insufficientEvidence: counts.insufficient_evidence ?? 0,
      disqualified: counts.disqualified ?? 0,
      identityReviewRequired: counts.identity_review_required ?? 0,
      staleEvidence: counts.stale_evidence ?? 0,
      notEvaluated: counts.not_evaluated ?? 0,
    }),
    callableQueueSize: callable,
    reviewQueueSize: review,
    notEligible,
    priorityBands: Object.freeze(bands),
    snapshotId: snapshot?.snapshotId ?? null,
    queueState: generated.state,
  };
}
