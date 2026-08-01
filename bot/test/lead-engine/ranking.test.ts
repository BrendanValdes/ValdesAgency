import { describe, expect, it } from "vitest";
import { generateInternalCallingQueue } from "../../src/lead-engine/ranking/internal-calling-queue.js";
import { rankQueueCandidate, validateCallingQueueConstraints } from "../../src/lead-engine/ranking/ranker.js";
import { createCallingQueueRepository } from "../../src/lead-engine/ranking/queue-repository.js";
import {
  createRankingFixture,
  completedQueue,
  defaultQueueConstraints,
  QUEUE_TIME,
  queueDependencies,
  seedRankedLead,
} from "./helpers/ranking-fixture.js";

describe("deterministic pool-service call ranking", () => {
  it("routes every persisted qualification outcome to one truthful disposition", () => {
    const fixture = createRankingFixture();
    try {
      seedRankedLead(fixture.database, { id: "callable", result: "qualified", score: 75 });
      seedRankedLead(fixture.database, { id: "review", result: "qualified_with_review", score: 60 });
      seedRankedLead(fixture.database, { id: "identity", result: "identity_review_required", score: 60 });
      seedRankedLead(fixture.database, { id: "insufficient", result: "insufficient_evidence", score: 40 });
      seedRankedLead(fixture.database, { id: "stale", result: "stale_evidence", score: 40 });
      seedRankedLead(fixture.database, { id: "disqualified", result: "disqualified", score: 40 });
      const snapshot = completedQueue(generateInternalCallingQueue(defaultQueueConstraints(), queueDependencies(fixture.database, {
        clock: { now: () => QUEUE_TIME },
      })));
      const dispositions = Object.fromEntries(snapshot.entries.map((entry) => [entry.evaluationId, entry.disposition]));
      expect(dispositions).toMatchObject({
        "evaluation-callable": "callable",
        "evaluation-review": "review_required",
        "evaluation-identity": "review_required",
        "evaluation-insufficient": "insufficient_evidence",
        "evaluation-stale": "stale",
        "evaluation-disqualified": "disqualified",
      });
      expect(snapshot.entries.filter((entry) => entry.position !== null)).toHaveLength(1);
      expect(snapshot.counts.suppressed).toBe(0);
      expect(snapshot.warnings).toContain("suppression_state_unavailable");
      const boundedReview = completedQueue(generateInternalCallingQueue(
        defaultQueueConstraints({ maximumReview: 1 }),
        queueDependencies(fixture.database),
      ));
      expect(boundedReview.reviewEntries).toHaveLength(1);
      expect(boundedReview.entries.filter((entry) => entry.reasons.some((reason) => reason.code === "review_limit_exceeded")))
        .toHaveLength(1);
    } finally {
      fixture.cleanup();
    }
  });

  it("keeps public candidate routes separate from current compatible verification", () => {
    const fixture = createRankingFixture();
    try {
      seedRankedLead(fixture.database, { id: "public", publicPhone: true });
      seedRankedLead(fixture.database, { id: "verified", publicPhone: true, verifiedPhone: "current" });
      seedRankedLead(fixture.database, { id: "public-email", publicPhone: false, publicEmail: true });
      seedRankedLead(fixture.database, { id: "verified-email", publicPhone: false, publicEmail: true, verifiedEmail: "current" });
      const repository = createCallingQueueRepository(fixture.database);
      const candidates = repository.loadCandidates("pool_service_icp_v1");
      const publicEntry = rankQueueCandidate(candidates.find((item) => item.businessId === "business-public")!, defaultQueueConstraints());
      const verifiedEntry = rankQueueCandidate(candidates.find((item) => item.businessId === "business-verified")!, defaultQueueConstraints());
      expect(publicEntry.contactReadinessScore).toBeLessThan(verifiedEntry.contactReadinessScore);
      expect(publicEntry.components.find((item) => item.component === "contact_readiness")?.ruleIds)
        .not.toContain("contact.phone_reachability_verified");
      expect(verifiedEntry.components.find((item) => item.component === "contact_readiness")?.ruleIds)
        .toContain("contact.phone_reachability_verified");
      expect(publicEntry.qualificationScore).toBe(verifiedEntry.qualificationScore);
      expect(publicEntry.priorityScore).not.toBe(publicEntry.qualificationScore);
      const publicEmail = rankQueueCandidate(candidates.find((item) => item.businessId === "business-public-email")!, defaultQueueConstraints());
      const verifiedEmail = rankQueueCandidate(candidates.find((item) => item.businessId === "business-verified-email")!, defaultQueueConstraints());
      expect(publicEmail.contactReadinessScore).toBeLessThan(verifiedEmail.contactReadinessScore);
      expect(publicEmail.contactRouteSummary.verifiedRoutes).not.toContain("email");
      expect(verifiedEmail.contactRouteSummary.verifiedRoutes).toContain("email");
    } finally {
      fixture.cleanup();
    }
  });

  it("changes priority only by the documented opportunity contribution", () => {
    const fixture = createRankingFixture();
    try {
      seedRankedLead(fixture.database, { id: "opportunity-low", opportunityPoints: 2 });
      seedRankedLead(fixture.database, { id: "opportunity-high", opportunityPoints: 12 });
      const candidates = createCallingQueueRepository(fixture.database).loadCandidates("pool_service_icp_v1");
      const low = rankQueueCandidate(candidates.find((item) => item.businessId === "business-opportunity-low")!, defaultQueueConstraints());
      const high = rankQueueCandidate(candidates.find((item) => item.businessId === "business-opportunity-high")!, defaultQueueConstraints());
      expect(high.priorityScore - low.priorityScore).toBe(100);
      expect(high.components.filter((item) => item.component !== "opportunity_urgency").map((item) => item.points))
        .toEqual(low.components.filter((item) => item.component !== "opportunity_urgency").map((item) => item.points));
    } finally {
      fixture.cleanup();
    }
  });

  it("applies scope, route, threshold, and deterministic canonical-ID tie breakers", () => {
    const fixture = createRankingFixture();
    try {
      seedRankedLead(fixture.database, { id: "zeta", score: 75 });
      seedRankedLead(fixture.database, { id: "alpha", score: 75 });
      seedRankedLead(fixture.database, { id: "outside", coverageKey: "coverage:us-ca" });
      seedRankedLead(fixture.database, { id: "route-less", publicPhone: false, publicEmail: false, form: false });
      const snapshot = completedQueue(generateInternalCallingQueue(defaultQueueConstraints(), queueDependencies(fixture.database)));
      expect(snapshot.entries.filter((entry) => entry.position !== null).map((entry) => entry.canonicalBusinessId))
        .toEqual(["business-alpha", "business-zeta"]);
      expect(snapshot.entries.find((entry) => entry.evaluationId === "evaluation-outside")?.reasons.map((reason) => reason.code))
        .toContain("outside_queue_scope");
      expect(snapshot.entries.find((entry) => entry.evaluationId === "evaluation-route-less")?.reasons.map((reason) => reason.code))
        .toContain("contact_route_unavailable");
    } finally {
      fixture.cleanup();
    }
  });

  it("validates bounded, versioned, expression-free constraints", () => {
    expect(() => validateCallingQueueConstraints(defaultQueueConstraints({ maximumCallable: -1 }))).toThrow("bounded range");
    expect(() => validateCallingQueueConstraints(defaultQueueConstraints({ includedContactRoutes: ["phone", "phone"] }))).toThrow("unique");
    expect(() => validateCallingQueueConstraints(defaultQueueConstraints({ scope: { kind: "coverage_keys", coverageKeys: [] } }))).toThrow("scope");
    expect(() => validateCallingQueueConstraints(defaultQueueConstraints({ generatedAt: "today" }))).toThrow("canonical ISO");
  });
});
