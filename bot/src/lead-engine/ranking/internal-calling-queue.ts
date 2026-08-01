import type { SqliteDatabase } from "../db/database.js";
import {
  CALLING_QUEUE_VERSION,
  POOL_SERVICE_QUEUE_FRESHNESS_POLICY_VERSION,
  POOL_SERVICE_RANKING_MODEL_VERSION,
  POOL_SERVICE_RANKING_V1,
} from "./pool-service-ranking-model.js";
import { createCallingQueueRepository, type CallingQueueRepository, type QueueStableIdentifiers } from "./queue-repository.js";
import { compareRankedQueueEntries, rankQueueCandidate, validateCallingQueueConstraints } from "./ranker.js";
import { QUEUE_DISPOSITIONS, type CallingQueueConstraints, type CallingQueueGenerationResult, type CallingQueueSnapshot, type QueueGenerationEvent, type RankedQueueEntry } from "./types.js";

export class QueueGenerationCancelledError extends Error {
  constructor() {
    super("Calling queue generation was cancelled");
    this.name = "QueueGenerationCancelledError";
  }
}

export interface CallingQueueDependencies {
  readonly database?: SqliteDatabase;
  readonly repository?: CallingQueueRepository;
  readonly rankingModel: typeof POOL_SERVICE_RANKING_V1;
  readonly stableIdentifiers: QueueStableIdentifiers;
  readonly clock: Readonly<{ now(): string }>;
  readonly signal: AbortSignal;
  readonly onEvent: (event: QueueGenerationEvent) => void;
}

function checkCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new QueueGenerationCancelledError();
}

function withLimits(entries: ReadonlyArray<RankedQueueEntry>, constraints: CallingQueueConstraints): RankedQueueEntry[] {
  const ordered = [...entries].sort(compareRankedQueueEntries);
  let callable = 0;
  let review = 0;
  return ordered.map((entry) => {
    if (entry.disposition === "callable") {
      callable += 1;
      if (callable <= constraints.maximumCallable) return { ...entry, position: callable };
      return {
        ...entry,
        disposition: "not_eligible" as const,
        reasons: [...entry.reasons, { code: "callable_limit_exceeded", detail: "The deterministic callable queue limit was reached." }],
        explanation: `not_eligible: deterministic callable limit exceeded; ${entry.explanation}`,
      };
    }
    if (entry.disposition === "review_required") {
      review += 1;
      if (review > constraints.maximumReview) return {
        ...entry,
        disposition: "not_eligible" as const,
        reasons: [...entry.reasons, { code: "review_limit_exceeded", detail: "The deterministic review queue limit was reached." }],
        explanation: `not_eligible: deterministic review limit exceeded; ${entry.explanation}`,
      };
    }
    return entry;
  }).sort((left, right) => {
    if (left.position !== null || right.position !== null) {
      if (left.position === null) return 1;
      if (right.position === null) return -1;
      return left.position - right.position;
    }
    return left.disposition.localeCompare(right.disposition) || compareRankedQueueEntries(left, right);
  });
}

export function generateInternalCallingQueue(
  constraints: CallingQueueConstraints,
  dependencies: CallingQueueDependencies,
): CallingQueueGenerationResult {
  validateCallingQueueConstraints(constraints);
  if (dependencies.rankingModel !== POOL_SERVICE_RANKING_V1 ||
      dependencies.rankingModel.version !== constraints.rankingModelVersion) {
    throw new Error("Injected ranking model does not match the requested ranking version");
  }
  if (dependencies.clock.now() !== constraints.generatedAt) {
    throw new Error("Injected queue clock must equal the explicit generatedAt timestamp");
  }
  const repository = dependencies.repository ?? (dependencies.database
    ? createCallingQueueRepository(dependencies.database, dependencies.stableIdentifiers)
    : null);
  if (!repository) throw new Error("Calling queue generation requires a repository or SQLite database");
  if (dependencies.signal?.aborted) return { state: "cancelled", snapshotId: null, attemptNumber: null };
  const candidates = repository.loadCandidates(constraints.qualificationModelVersion);
  if (dependencies.signal?.aborted) return { state: "cancelled", snapshotId: null, attemptNumber: null };
  const sourceFingerprint = repository.sourceFingerprint(candidates);
  const start = repository.beginSnapshot(constraints, sourceFingerprint);
  if (start.reused) return { state: "completed", snapshot: start.reused };

  try {
    const ranked: RankedQueueEntry[] = [];
    for (const candidate of candidates) {
      checkCancelled(dependencies.signal);
      const entry = rankQueueCandidate(candidate, constraints, dependencies.stableIdentifiers);
      ranked.push({
        ...entry,
        entryId: dependencies.stableIdentifiers.id("queue-entry", {
          evaluationId: entry.evaluationId,
          snapshotId: start.snapshotId,
        }),
      });
      dependencies.onEvent?.({ type: "candidate_ranked", evaluationId: entry.evaluationId });
    }
    const entries = withLimits(ranked, constraints);
    const counts = Object.fromEntries(QUEUE_DISPOSITIONS.map((disposition) => [
      disposition,
      entries.filter((entry) => entry.disposition === disposition).length,
    ])) as CallingQueueSnapshot["counts"];
    const snapshot: CallingQueueSnapshot = {
      snapshotId: start.snapshotId,
      queueVersion: CALLING_QUEUE_VERSION,
      rankingModelVersion: POOL_SERVICE_RANKING_MODEL_VERSION,
      freshnessPolicyVersion: POOL_SERVICE_QUEUE_FRESHNESS_POLICY_VERSION,
      generatedAt: constraints.generatedAt,
      scope: constraints.scope,
      constraints,
      totalCandidatesConsidered: candidates.length,
      requestFingerprint: dependencies.stableIdentifiers.hash(constraints),
      sourceFingerprint,
      entries,
      callableEntries: entries.filter((entry) => entry.disposition === "callable"),
      reviewEntries: entries.filter((entry) => entry.disposition === "review_required"),
      staleEntries: entries.filter((entry) => entry.disposition === "stale"),
      insufficientEvidenceEntries: entries.filter((entry) => entry.disposition === "insufficient_evidence"),
      counts,
      warnings: ["suppression_state_unavailable"],
      reused: false,
    };
    const saved = repository.saveComplete(
      start.snapshotId,
      start.attemptNumber,
      snapshot,
      (entry) => {
        checkCancelled(dependencies.signal);
        dependencies.onEvent?.({ type: "entry_persisting", evaluationId: entry.evaluationId });
      },
      () => checkCancelled(dependencies.signal),
    );
    dependencies.onEvent({ type: "snapshot_completed" });
    return { state: "completed", snapshot: saved };
  } catch (error) {
    const cancelled = error instanceof QueueGenerationCancelledError || dependencies.signal?.aborted === true;
    const now = dependencies.clock.now();
    repository.markAttempt(
      start.snapshotId,
      start.attemptNumber,
      cancelled ? "cancelled" : "failed",
      cancelled ? "queue_generation_cancelled" : "queue_generation_failed",
      cancelled ? "Calling queue generation was cancelled safely." : "Calling queue generation failed without publishing a partial snapshot.",
      now,
    );
    if (cancelled) return {
      state: "cancelled",
      snapshotId: start.snapshotId,
      attemptNumber: start.attemptNumber,
    };
    throw error;
  }
}
