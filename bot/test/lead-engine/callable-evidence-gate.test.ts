import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { POOL_SERVICE_ICP_MODEL_VERSION } from "../../src/lead-engine/qualification/pool-service-model.js";
import { CALLABLE_EVIDENCE_REASONS, rankQueueCandidate } from "../../src/lead-engine/ranking/ranker.js";
import { createCallingQueueRepository } from "../../src/lead-engine/ranking/queue-repository.js";
import {
  createRankingFixture,
  defaultQueueConstraints,
  seedRankedLead,
  type SeedLeadOptions,
} from "./helpers/ranking-fixture.js";
import type { CallingQueueConstraints, RankedQueueEntry } from "../../src/lead-engine/ranking/types.js";

/**
 * Minimum callable-evidence gate.
 *
 * `callable` must mean "a person can pick up the phone and call this business",
 * not merely "qualified with some route". These tests pin both halves: what the
 * gate lets through, and what it refuses without silently discarding.
 */

const CELL = "coverage:us-az";

/** Seeds one lead and ranks it, returning the entry plus the loaded candidate. */
function rankWithCandidate(
  options: Partial<SeedLeadOptions> & { id: string },
  constraints: Partial<CallingQueueConstraints> = {},
) {
  const fixture = createRankingFixture();
  try {
    seedRankedLead(fixture.database, {
      result: "qualified", score: 75, coverageKey: CELL, ...options,
    });
    const candidates = createCallingQueueRepository(fixture.database)
      .loadCandidates(POOL_SERVICE_ICP_MODEL_VERSION);
    const candidate = candidates[0] as never as {
      qualification: { componentScores: ReadonlyArray<{ component: string; points: number }> };
    };
    const entry = rankQueueCandidate(
      candidates[0] as never,
      defaultQueueConstraints({ scope: { kind: "coverage_keys", coverageKeys: [CELL] }, ...constraints }),
    );
    return { entry, candidate };
  } finally {
    fixture.database.close();
  }
}

function rank(
  options: Partial<SeedLeadOptions> & { id: string },
  constraints: Partial<CallingQueueConstraints> = {},
): RankedQueueEntry {
  return rankWithCandidate(options, constraints).entry;
}

const codes = (entry: RankedQueueEntry): string[] => entry.reasons.map((reason) => reason.code);

describe("minimum callable-evidence gate", () => {
  it("admits a qualified, in-scope, identity-clear business with an observed website phone", () => {
    const entry = rank({ id: "callable-ok", publicPhone: true });
    expect(entry.disposition).toBe("callable");
    expect(codes(entry)).toContain("callable");
    expect(codes(entry)).not.toContain(CALLABLE_EVIDENCE_REASONS.incomplete);
  });

  it("holds an email-only lead in review rather than dropping it", () => {
    const entry = rank({ id: "email-only", publicPhone: false, publicEmail: true });
    expect(entry.disposition).toBe("review_required");
    expect(codes(entry)).toContain(CALLABLE_EVIDENCE_REASONS.phoneRoute);
    // Preserved, not discarded: a route exists, so it never fell to not_eligible.
    expect(entry.disposition).not.toBe("not_eligible");
  });

  it("holds a form-only lead in review rather than dropping it", () => {
    const entry = rank({ id: "form-only", publicPhone: false, publicEmail: false, form: true });
    expect(entry.disposition).toBe("review_required");
    expect(codes(entry)).toContain(CALLABLE_EVIDENCE_REASONS.phoneRoute);
  });

  it("keeps an identity-unavailable lead in review", () => {
    const entry = rank({ id: "identity-unavailable", identityReviewState: "unavailable" });
    expect(entry.disposition).toBe("review_required");
    expect(codes(entry)).toContain(CALLABLE_EVIDENCE_REASONS.identity);
  });

  it("keeps a lead whose assessed site disagrees with the business in review", () => {
    const entry = rank({ id: "identity-ambiguous", assessmentIdentityState: "ambiguous" });
    expect(entry.disposition).toBe("review_required");
  });

  it("keeps a conflicting business record and an identity-review result in review", () => {
    expect(rank({ id: "identity-conflict", businessState: "conflicting" }).disposition)
      .toBe("review_required");
    expect(rank({ id: "identity-review", result: "identity_review_required" }).disposition)
      .toBe("review_required");
  });

  it("keeps a lead missing service fit or operational evidence in review", () => {
    const entry = rank({ id: "no-evidence", callableEvidence: false });
    expect(entry.disposition).toBe("review_required");
    expect(codes(entry)).toEqual(expect.arrayContaining([
      CALLABLE_EVIDENCE_REASONS.serviceFit,
      CALLABLE_EVIDENCE_REASONS.homepage,
      CALLABLE_EVIDENCE_REASONS.https,
    ]));
    // Every missing piece is named, so a reviewer knows what to confirm.
    expect(codes(entry)).toContain(CALLABLE_EVIDENCE_REASONS.incomplete);
  });

  it("still rejects an out-of-scope lead as not_eligible before the evidence gate", () => {
    const entry = rank({ id: "out-of-scope" }, {
      scope: { kind: "coverage_keys", coverageKeys: ["coverage:elsewhere"] },
    });
    expect(entry.disposition).toBe("not_eligible");
    expect(codes(entry)).toContain("outside_queue_scope");
    // The evidence gate never runs, so it cannot mask a scope rejection.
    expect(codes(entry)).not.toContain(CALLABLE_EVIDENCE_REASONS.incomplete);
  });

  it("does not block a callable business that has no decision-maker evidence", () => {
    const { entry, candidate } = rankWithCandidate({
      id: "no-decision-maker", score: 65, opportunityPoints: 20,
    });
    // Prove the premise: this lead genuinely has zero decision-maker evidence.
    const person = candidate.qualification.componentScores
      .find((item) => item.component === "decision_maker_evidence");
    expect(person?.points).toBe(0);
    // And it is still callable — no owner, title, or authority is demanded.
    expect(entry.disposition).toBe("callable");
  });

  it("fabricates no external verification or human confirmation", () => {
    const entry = rank({ id: "unverified", publicPhone: true });
    expect(entry.disposition).toBe("callable");
    // The admitted route is a public candidate, never a verified one.
    expect(entry.contactRouteSummary.candidateRoutes).toContain("phone");
    expect(entry.contactRouteSummary.verifiedRoutes).toEqual([]);
    expect(entry.verificationLimitations.join(" ")).toMatch(/not verified/i);
  });

  it("preserves priority ordering when the gate holds a lead back", () => {
    const held = rank({ id: "held", publicPhone: false, publicEmail: true, score: 75 });
    const admitted = rank({ id: "admitted", publicPhone: true, score: 75 });
    // The gate changes disposition only; the priority score and band are
    // computed before it and stay intact, so review ordering is unaffected.
    expect(held.priorityScore).toBeGreaterThan(0);
    expect(held.priorityBand).toBe(admitted.priorityBand);
    expect(held.qualificationScore).toBe(admitted.qualificationScore);
  });

  it("adds no external consumer or side effect", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/lead-engine/ranking/ranker.ts"), "utf8",
    );
    expect(source).not.toMatch(/discord|retell|crm|node-cron|scheduler|csv|fetch\(|https?:\/\//i);
  });
});
