import { describe, expect, it } from "vitest";
import { rankQueueCandidate } from "../../src/lead-engine/ranking/ranker.js";
import { createCallingQueueRepository } from "../../src/lead-engine/ranking/queue-repository.js";
import { createRankingFixture, defaultQueueConstraints, seedRankedLead } from "./helpers/ranking-fixture.js";

describe("queue freshness and explainability", () => {
  it("distinguishes fresh, aging, stale, expired verification, and missing assessment", () => {
    const fixture = createRankingFixture();
    try {
      seedRankedLead(fixture.database, { id: "fresh" });
      seedRankedLead(fixture.database, { id: "aging", evaluatedAt: "2026-01-05T12:00:00.000Z", assessmentAt: "2026-01-04T12:00:00.000Z" });
      seedRankedLead(fixture.database, { id: "stale", evaluatedAt: "2025-12-01T12:00:00.000Z", evaluationFreshUntil: "2026-02-01T12:00:00.000Z" });
      seedRankedLead(fixture.database, { id: "expired-verification", verifiedPhone: "expired" });
      seedRankedLead(fixture.database, { id: "missing" });
      fixture.database.prepare("UPDATE icp_qualification_evaluations SET assessment_id = NULL WHERE id = 'evaluation-missing'").run();
      const candidates = createCallingQueueRepository(fixture.database).loadCandidates("pool_service_icp_v1");
      const states = Object.fromEntries(candidates.map((candidate) => [
        candidate.qualification.evaluationId,
        rankQueueCandidate(candidate, defaultQueueConstraints()).freshnessState,
      ]));
      expect(states).toMatchObject({
        "evaluation-fresh": "fresh",
        "evaluation-aging": "aging",
        "evaluation-stale": "stale",
        "evaluation-expired-verification": "expired",
        "evaluation-missing": "missing_timestamp",
      });
    } finally {
      fixture.cleanup();
    }
  });

  it("provides bounded contributions, rule lineage, maximums, and deterministic explanations", () => {
    const fixture = createRankingFixture();
    try {
      seedRankedLead(fixture.database, { id: "explain", verifiedPhone: "current", publicEmail: true });
      const candidate = createCallingQueueRepository(fixture.database).loadCandidates("pool_service_icp_v1")[0]!;
      const first = rankQueueCandidate(candidate, defaultQueueConstraints());
      const second = rankQueueCandidate(candidate, defaultQueueConstraints());
      expect(second).toEqual(first);
      expect(first.components).toHaveLength(7);
      expect(first.components.reduce((sum, item) => sum + item.maximumPoints, 0)).toBe(1000);
      expect(first.components.every((item) => item.points >= 0 && item.points <= item.maximumPoints && item.ruleIds.length > 0 && item.explanation.length > 0)).toBe(true);
      expect(first.priorityScore).toBe(first.components.reduce((sum, item) => sum + item.points, 0));
      expect(first.explanation).toContain("priority");
    } finally {
      fixture.cleanup();
    }
  });
});
