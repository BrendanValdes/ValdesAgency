import { describe, expect, it } from "vitest";
import { generateInternalCallingQueue } from "../../src/lead-engine/ranking/internal-calling-queue.js";
import { createCallingQueueRepository } from "../../src/lead-engine/ranking/queue-repository.js";
import { completedQueue, createRankingFixture, defaultQueueConstraints, queueDependencies, seedRankedLead } from "./helpers/ranking-fixture.js";

describe("calling queue snapshot persistence and cancellation", () => {
  it("is idempotent, fingerprints source changes, and retains history", () => {
    const fixture = createRankingFixture();
    try {
      seedRankedLead(fixture.database, { id: "one" });
      const constraints = defaultQueueConstraints();
      const first = completedQueue(generateInternalCallingQueue(constraints, queueDependencies(fixture.database)));
      const repeated = completedQueue(generateInternalCallingQueue(constraints, queueDependencies(fixture.database)));
      expect(repeated.snapshotId).toBe(first.snapshotId);
      expect(repeated.reused).toBe(true);
      expect((fixture.database.prepare("SELECT COUNT(*) AS count FROM lead_queue_entries").get() as { count: number }).count).toBe(1);
      seedRankedLead(fixture.database, { id: "two" });
      const changed = completedQueue(generateInternalCallingQueue(constraints, queueDependencies(fixture.database)));
      expect(changed.snapshotId).not.toBe(first.snapshotId);
      expect((fixture.database.prepare("SELECT COUNT(*) AS count FROM lead_queue_snapshots WHERE status = 'complete'").get() as { count: number }).count).toBe(2);
      const repository = createCallingQueueRepository(fixture.database);
      const versioned = repository.beginSnapshot(
        { ...constraints, rankingModelVersion: "pool_service_ranking_v2" as "pool_service_ranking_v1" },
        repository.sourceFingerprint(repository.loadCandidates("pool_service_icp_v1")),
      );
      expect(versioned.snapshotId).not.toBe(changed.snapshotId);
    } finally {
      fixture.cleanup();
    }
  });

  it("never publishes cancellation during ranking or persistence and can retry", () => {
    const fixture = createRankingFixture();
    try {
      seedRankedLead(fixture.database, { id: "cancel-a" });
      seedRankedLead(fixture.database, { id: "cancel-b" });
      const controller = new AbortController();
      const cancelled = generateInternalCallingQueue(defaultQueueConstraints(), queueDependencies(fixture.database, {
        signal: controller.signal,
        onEvent(event) {
          if (event.type === "candidate_ranked") controller.abort();
        },
      }));
      expect(cancelled).toMatchObject({ state: "cancelled" });
      expect(fixture.database.prepare("SELECT status FROM lead_queue_snapshots").get()).toMatchObject({ status: "cancelled" });
      expect((fixture.database.prepare("SELECT COUNT(*) AS count FROM lead_queue_entries").get() as { count: number }).count).toBe(0);
      const retry = completedQueue(generateInternalCallingQueue(defaultQueueConstraints(), queueDependencies(fixture.database)));
      expect(retry.entries).toHaveLength(2);
      expect((fixture.database.prepare("SELECT COUNT(*) AS count FROM lead_queue_generation_attempts").get() as { count: number }).count).toBe(2);

      seedRankedLead(fixture.database, { id: "cancel-c" });
      const persistenceController = new AbortController();
      const persistenceCancelled = generateInternalCallingQueue(defaultQueueConstraints(), queueDependencies(fixture.database, {
        signal: persistenceController.signal,
        onEvent(event) {
          if (event.type === "entry_persisting") persistenceController.abort();
        },
      }));
      expect(persistenceCancelled).toMatchObject({ state: "cancelled" });
      const newest = fixture.database.prepare("SELECT status FROM lead_queue_snapshots ORDER BY rowid DESC LIMIT 1").get();
      expect(newest).toMatchObject({ status: "cancelled" });

      completedQueue(generateInternalCallingQueue(defaultQueueConstraints(), queueDependencies(fixture.database)));
      seedRankedLead(fixture.database, { id: "cancel-d" });
      const beforeCompleteController = new AbortController();
      let persistenceEvents = 0;
      const beforeComplete = generateInternalCallingQueue(defaultQueueConstraints(), queueDependencies(fixture.database, {
        signal: beforeCompleteController.signal,
        onEvent(event) {
          if (event.type === "entry_persisting" && ++persistenceEvents === 4) beforeCompleteController.abort();
        },
      }));
      expect(beforeComplete).toMatchObject({ state: "cancelled" });
    } finally {
      fixture.cleanup();
    }
  });

  it("stops before candidate loading when already cancelled", () => {
    const fixture = createRankingFixture();
    try {
      const controller = new AbortController();
      controller.abort();
      const result = generateInternalCallingQueue(defaultQueueConstraints(), queueDependencies(fixture.database, {
        signal: controller.signal,
      }));
      expect(result).toEqual({ state: "cancelled", snapshotId: null, attemptNumber: null });
      expect((fixture.database.prepare("SELECT COUNT(*) AS count FROM lead_queue_snapshots").get() as { count: number }).count).toBe(0);
    } finally {
      fixture.cleanup();
    }
  });

  it("enforces callable uniqueness, positions, bounds, malformed JSON, and incomplete consumption", () => {
    const fixture = createRankingFixture();
    try {
      seedRankedLead(fixture.database, { id: "guard" });
      const snapshot = completedQueue(generateInternalCallingQueue(defaultQueueConstraints(), queueDependencies(fixture.database)));
      const entry = snapshot.entries[0]!;
      expect(() => fixture.database.prepare("UPDATE lead_queue_entries SET position = 0 WHERE id = ?").run(entry.entryId)).toThrow();
      expect(() => fixture.database.prepare("UPDATE lead_queue_entries SET priority_score = 1001 WHERE id = ?").run(entry.entryId)).toThrow();
      expect(() => fixture.database.prepare("UPDATE lead_queue_entries SET component_scores_json = 'bad' WHERE id = ?").run(entry.entryId)).toThrow();
      expect(() => fixture.database.prepare("UPDATE lead_queue_entries SET qualification_result = 'disqualified' WHERE id = ?").run(entry.entryId)).toThrow();
      expect(() => fixture.database.prepare(`
        INSERT INTO lead_queue_entries (
          id, snapshot_id, source_business_id, canonical_business_id, evaluation_id,
          position, disposition, priority_score, priority_band, qualification_score,
          qualification_result, freshness_state, identity_state, component_scores_json,
          reason_codes_json, explanation, result_json, created_at
        ) SELECT 'duplicate-entry', snapshot_id, source_business_id, canonical_business_id,
                 evaluation_id, 2, 'callable', priority_score, priority_band, qualification_score,
                 qualification_result, freshness_state, identity_state, component_scores_json,
                 reason_codes_json, explanation, result_json, created_at
          FROM lead_queue_entries WHERE id = ?
      `).run(entry.entryId)).toThrow();
      fixture.database.prepare(`
        INSERT INTO lead_queue_snapshots (
          id, queue_version, ranking_model_version, qualification_model_version,
          freshness_policy_version, generated_at, scope_json, constraints_json,
          request_fingerprint, source_fingerprint, status, result_json, warning_json,
          created_at, completed_at
        ) VALUES ('incomplete', 'calling_queue_v1', 'pool_service_ranking_v1', 'pool_service_icp_v1',
                  'pool_service_queue_freshness_v1', ?, '{}', '{}', ?, ?, 'building', NULL, '[]', ?, NULL)
      `).run(defaultQueueConstraints().generatedAt, "1".repeat(64), "2".repeat(64), defaultQueueConstraints().generatedAt);
      const consumable = fixture.database.prepare("SELECT id FROM lead_queue_snapshots WHERE id = 'incomplete' AND status = 'complete' AND result_json IS NOT NULL").get();
      expect(consumable).toBeUndefined();
      expect(createCallingQueueRepository(fixture.database).getComplete("incomplete")).toBeNull();
    } finally {
      fixture.cleanup();
    }
  });
});
