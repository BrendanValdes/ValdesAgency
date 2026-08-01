import { describe, expect, it } from "vitest";
import { generateInternalCallingQueue } from "../../src/lead-engine/ranking/internal-calling-queue.js";
import { completedQueue, createRankingFixture, defaultQueueConstraints, queueDependencies, seedRankedLead } from "./helpers/ranking-fixture.js";

describe("calling queue identity and duplicate handling", () => {
  it("selects only the latest nonsuperseded evaluation for one business", () => {
    const fixture = createRankingFixture();
    try {
      seedRankedLead(fixture.database, { id: "old", evaluatedAt: "2026-01-17T12:00:00.000Z" });
      seedRankedLead(fixture.database, { id: "new", evaluatedAt: "2026-01-19T12:00:00.000Z", supersedesEvaluationId: "evaluation-old" });
      fixture.database.prepare(`
        UPDATE icp_qualification_evaluations
        SET business_id = 'business-old', result_json = json_set(result_json, '$.businessId', 'business-old')
        WHERE id = 'evaluation-new'
      `).run();
      const snapshot = completedQueue(generateInternalCallingQueue(defaultQueueConstraints(), queueDependencies(fixture.database)));
      expect(snapshot.entries.map((entry) => entry.evaluationId)).toEqual(["evaluation-new"]);
      expect(fixture.database.prepare("SELECT COUNT(*) AS count FROM icp_qualification_evaluations").get())
        .toMatchObject({ count: 2 });
    } finally {
      fixture.cleanup();
    }
  });

  it("deduplicates only a safe automatic merge and records the retained evaluation", () => {
    const fixture = createRankingFixture();
    try {
      seedRankedLead(fixture.database, { id: "a", evaluatedAt: "2026-01-18T12:00:00.000Z" });
      seedRankedLead(fixture.database, { id: "b", evaluatedAt: "2026-01-19T12:00:00.000Z" });
      fixture.database.prepare(`
        INSERT INTO identity_decision_audits (
          id, left_entity_id, right_entity_id, action, rule, confidence_basis_points,
          supporting_signals_json, conflicting_signals_json, verification_dimensions_json,
          review_reason, policy_version, decided_at
        ) VALUES ('audit-auto', 'business-a', 'business-b', 'auto_merge', 'verified_domain', 9500,
                  '["verified_domain"]', '[]', '["business_canonical_domain"]', NULL,
                  'identity-fixture-v1', '2026-01-19T12:00:00.000Z')
      `).run();
      const snapshot = completedQueue(generateInternalCallingQueue(defaultQueueConstraints(), queueDependencies(fixture.database)));
      expect(snapshot.entries.filter((entry) => entry.disposition === "callable")).toHaveLength(1);
      const duplicate = snapshot.entries.find((entry) => entry.disposition === "duplicate_excluded")!;
      expect(duplicate.canonicalBusinessId).toBe("business-a");
      expect(duplicate.reasons[0]?.detail).toContain("evaluation-b");
    } finally {
      fixture.cleanup();
    }
  });

  it("keeps ambiguous/conflicting matches in review and distinct franchise or chain locations callable", () => {
    const fixture = createRankingFixture();
    try {
      seedRankedLead(fixture.database, { id: "amb-a" });
      seedRankedLead(fixture.database, { id: "amb-b" });
      seedRankedLead(fixture.database, { id: "franchise-a" });
      seedRankedLead(fixture.database, { id: "franchise-b" });
      seedRankedLead(fixture.database, { id: "chain-parent" });
      seedRankedLead(fixture.database, { id: "chain-child" });
      fixture.database.prepare(`
        INSERT INTO identity_candidates (
          id, left_business_id, right_business_id, candidate_reason, match_score,
          policy_version, state, created_at, updated_at
        ) VALUES ('candidate-amb', 'business-amb-a', 'business-amb-b', 'conflicting_provider_ids', 5000,
                  'identity-fixture-v1', 'human_review', '2026-01-19T12:00:00.000Z', '2026-01-19T12:00:00.000Z')
      `).run();
      fixture.database.prepare(`
        INSERT INTO identity_conflicts (id, candidate_id, conflict_type, details_json, review_state, created_at, resolved_at)
        VALUES ('conflict-amb', 'candidate-amb', 'provider_identifier', '{}', 'pending', '2026-01-19T12:00:00.000Z', NULL)
      `).run();
      fixture.database.prepare(`
        INSERT INTO business_groups (id, display_name, legal_name, chain_brand, franchise, created_at, updated_at)
        VALUES ('group-franchise', 'Fixture Franchise', NULL, 'Fixture', 1, '2026-01-19T12:00:00.000Z', '2026-01-19T12:00:00.000Z')
      `).run();
      for (const id of ["franchise-a", "franchise-b"] as const) {
        fixture.database.prepare(`
          INSERT INTO business_group_locations (group_id, business_location_id, relationship, created_at)
          VALUES ('group-franchise', ?, 'franchise', '2026-01-19T12:00:00.000Z')
        `).run(`location-${id}`);
      }
      fixture.database.prepare(`
        INSERT INTO business_groups (id, display_name, legal_name, chain_brand, franchise, created_at, updated_at)
        VALUES ('group-chain', 'Fixture Chain', NULL, 'Fixture Chain', 0, '2026-01-19T12:00:00.000Z', '2026-01-19T12:00:00.000Z')
      `).run();
      for (const id of ["chain-parent", "chain-child"] as const) {
        fixture.database.prepare(`
          INSERT INTO business_group_locations (group_id, business_location_id, relationship, created_at)
          VALUES ('group-chain', ?, 'owned', '2026-01-19T12:00:00.000Z')
        `).run(`location-${id}`);
      }
      const snapshot = completedQueue(generateInternalCallingQueue(defaultQueueConstraints(), queueDependencies(fixture.database)));
      expect(snapshot.entries.filter((entry) => entry.sourceBusinessId.startsWith("business-amb-")).map((entry) => entry.disposition))
        .toEqual(["review_required", "review_required"]);
      expect(snapshot.entries.filter((entry) => entry.sourceBusinessId.startsWith("business-franchise-")).map((entry) => entry.disposition))
        .toEqual(["callable", "callable"]);
      expect(snapshot.entries.filter((entry) => entry.sourceBusinessId.startsWith("business-chain-")).map((entry) => entry.disposition))
        .toEqual(["callable", "callable"]);
    } finally {
      fixture.cleanup();
    }
  });
});
