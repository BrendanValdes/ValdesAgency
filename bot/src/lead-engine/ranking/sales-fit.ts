/**
 * Sales fit — a non-blocking prioritization hint for callable leads.
 *
 * WHAT THIS IS. A small score over rule outcomes the qualifier ALREADY produced
 * and persisted, answering a question qualification deliberately does not: of the
 * leads that cleared the bar, which ones look like the easiest sale? Every input
 * is a `state` on a persisted `QualificationRuleOutcome`. Nothing here crawls,
 * calls an API, reads a new table, or adds a column to one.
 *
 * WHAT THIS IS NOT — and cannot become by accident:
 *
 *   - It is NOT a gate. No caller may reject, disqualify, suppress, deprioritize,
 *     or filter a lead on it. `qualifyPoolServiceLead`, the ranker, and the
 *     calling-queue generator never import this module, and a test asserts that.
 *   - It does NOT change the ICP score, the callable rule, the priority score, or
 *     the priority band. Those are produced upstream and are untouched.
 *   - It is NOT evidence. It cites nothing, is derived rather than observed, and
 *     is written to the private CSV only — never to the evidence tables.
 *
 * WEIGHTING — gap-rich first. The heaviest points go to the marketing gaps the
 * agency is actually paid to close: no online booking, weak lead capture,
 * phone-only intake, recurring-maintenance revenue to protect. Owner and
 * independence evidence adds a smaller bump, because it is almost never present:
 * across the 20-lead Phoenix measurement `person.owner_relationship_verified` was
 * `missing` on 20 of 20 and a person's name was observed on 1 of 20. Weighting
 * owner evidence heavily would have collapsed every lead into one band and
 * ordered nothing.
 *
 * TWO REQUESTED SIGNALS ARE ABSENT ON PURPOSE, rather than faked from a proxy:
 *
 *   - "No visible website chat." Chat is not a `ConversionFeature` and is not
 *     extracted anywhere in the engine, so its absence cannot be distinguished
 *     from never having looked. Claiming it would require new extraction and a
 *     new persisted feature value.
 *   - "Independent / local business evidence." Nothing extracted separates an
 *     independent from a franchise: the niche configuration's
 *     `chain_franchise_exclusions` is still the placeholder
 *     "national pool retail chain", and no multi-location evidence is persisted.
 *     What remains is owner/named-person evidence plus `independent_site_identity`
 *     — the assessed site is the listing's own site, which is weak and is scored
 *     as weak (1 point).
 *
 * OWNER-OPERATED IS NEVER INFERRED. `owner_operated_evidence` requires
 * `person.owner_relationship_verified` to be positive, which the qualifier awards
 * only when the business's own crawled page names a person in an owner-class
 * title. A domain, a business name, or a small site earns it nothing.
 */

export const SALES_FIT_MODEL_VERSION = "sales_fit_v1" as const;

export type SalesFitBand = "strong" | "moderate" | "light" | "minimal" | "unscored";

export interface SalesFit {
  readonly score: number;
  readonly band: SalesFitBand;
  /** Stable snake_case codes for the signals that fired, sorted. */
  readonly reasons: ReadonlyArray<string>;
}

/** Highest score the signal table below can produce. */
export const SALES_FIT_MAXIMUM_SCORE = 14;

/** Band floors, applied highest-first. */
export const SALES_FIT_BAND_FLOORS = Object.freeze({
  strong: 9,
  moderate: 6,
  light: 3,
  minimal: 0,
});

/** Signals whose absence is indistinguishable from never having looked. */
export const SALES_FIT_UNAVAILABLE_SIGNALS: ReadonlyArray<string> = Object.freeze([
  "website_chat_absent",
  "franchise_or_multi_location_evidence",
]);

/** The one rule state that counts as a fired signal. */
const POSITIVE = "positive";

/**
 * Lead-capture gaps, each worth a point and capped as a group.
 *
 * Capped because these three rules overlap heavily in practice: a site with no
 * form usually also has no estimate request and no strong CTA, and three near-
 * duplicate observations should not outweigh a distinct signal.
 */
const WEAK_CAPTURE_SIGNALS: ReadonlyArray<{ readonly ruleId: string; readonly reason: string }> =
  Object.freeze([
    Object.freeze({ ruleId: "opportunity.contact_form_absent", reason: "contact_form_absent" }),
    Object.freeze({ ruleId: "opportunity.estimate_request_absent", reason: "estimate_request_absent" }),
    Object.freeze({ ruleId: "opportunity.primary_cta_absent", reason: "primary_cta_absent" }),
  ]);

const WEAK_CAPTURE_GROUP_CAP = 3;

function bandFor(score: number): SalesFitBand {
  if (score >= SALES_FIT_BAND_FLOORS.strong) return "strong";
  if (score >= SALES_FIT_BAND_FLOORS.moderate) return "moderate";
  if (score >= SALES_FIT_BAND_FLOORS.light) return "light";
  return "minimal";
}

/**
 * Score one lead from its persisted rule states.
 *
 * A missing rule id is treated exactly like a rule that did not fire: absence of
 * evidence never earns a point, and never costs one either. There is no negative
 * term anywhere in this function, so no lead can be pushed below zero and no
 * caller can read a low score as a disqualification.
 */
export function scoreSalesFit(ruleStates: ReadonlyMap<string, string>): SalesFit {
  const positive = (ruleId: string): boolean => ruleStates.get(ruleId) === POSITIVE;
  const reasons: string[] = [];
  let score = 0;

  // Recurring maintenance revenue: the retainer this business already sells, and
  // the thing paid acquisition compounds against.
  if (positive("niche.recurring_service_observed")) {
    score += 3;
    reasons.push("recurring_service_language");
  }

  // The largest concrete gap: no way for a customer to book without a human.
  if (positive("opportunity.booking_absent")) {
    score += 3;
    reasons.push("no_online_booking");
  }

  let weakCapture = 0;
  for (const signal of WEAK_CAPTURE_SIGNALS) {
    if (weakCapture >= WEAK_CAPTURE_GROUP_CAP) break;
    if (!positive(signal.ruleId)) continue;
    weakCapture += 1;
    score += 1;
    reasons.push(signal.reason);
  }

  // Phone-first intake. The qualifier's own phone-only rule is the strong form;
  // an observed public phone with no observed form is the weaker form.
  if (positive("opportunity.phone_only_dependency")) {
    score += 2;
    reasons.push("phone_first_contact");
  } else if (
    positive("contact.public_phone_observed") &&
    ruleStates.get("contact.form_observed") !== POSITIVE
  ) {
    score += 1;
    reasons.push("phone_first_contact");
  }

  // Owner evidence, only where the site itself states it.
  if (positive("person.owner_relationship_verified")) {
    score += 2;
    reasons.push("owner_operated_evidence");
  } else if (positive("person.name_observed") && positive("person.title_observed")) {
    score += 1;
    reasons.push("named_operator_evidence");
  }

  // Weak independence proxy: the assessed site is the listing's own site.
  if (positive("legitimacy.identity_agrees")) {
    score += 1;
    reasons.push("independent_site_identity");
  }

  if (reasons.length === 0) reasons.push("no_positive_signals");
  return Object.freeze({
    score,
    band: bandFor(score),
    reasons: Object.freeze([...reasons].sort()),
  });
}

/**
 * Flatten a persisted `component_scores_json` array into rule states.
 *
 * Parsing is defensive by design: this reads a JSON column, and a lead that
 * cannot be read is reported as `unscored` rather than as a zero. `unscored` and
 * `minimal` are different claims — one means we did not score it, the other means
 * we scored it and it looks like a hard sell.
 */
export function salesFitFromComponentScores(componentScoresJson: string | null): SalesFit {
  const states = ruleStatesFromComponentScores(componentScoresJson);
  if (states === null) {
    return Object.freeze({
      score: 0,
      band: "unscored",
      reasons: Object.freeze(["qualification_not_evaluated"]),
    });
  }
  return scoreSalesFit(states);
}

/** Null when the column is absent, unparseable, or carries no rule outcome. */
export function ruleStatesFromComponentScores(
  componentScoresJson: string | null,
): ReadonlyMap<string, string> | null {
  if (componentScoresJson === null || componentScoresJson.trim() === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(componentScoresJson);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const states = new Map<string, string>();
  for (const component of parsed) {
    if (typeof component !== "object" || component === null) continue;
    const outcomes = (component as { outcomes?: unknown }).outcomes;
    if (!Array.isArray(outcomes)) continue;
    for (const outcome of outcomes) {
      if (typeof outcome !== "object" || outcome === null) continue;
      const { ruleId, state } = outcome as { ruleId?: unknown; state?: unknown };
      if (typeof ruleId !== "string" || typeof state !== "string") continue;
      if (!ruleId.trim() || !state.trim()) continue;
      states.set(ruleId, state);
    }
  }
  return states.size > 0 ? states : null;
}
