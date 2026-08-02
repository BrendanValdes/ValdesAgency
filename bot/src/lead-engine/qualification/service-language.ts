/**
 * Phase 5D versioned pool-service language rules.
 *
 * v1 relied on the niche configuration's literal synonyms, which are narrow
 * marketing phrases that real contractor sites rarely use verbatim. v2 keeps
 * every v1 term and adds a candidate catalogue that is only PROMOTED once the
 * same phrase family is observed on several independent live sites.
 *
 * The catalogue approach is deliberate: mining free text would mean storing page
 * text, which this phase forbids. Instead each candidate is a fixed, reviewable
 * pattern; the live sample decides which ones earn promotion, and unpromoted
 * candidates are reported as rejected with their observed frequency.
 *
 * Nothing here promotes a business, contact, or person to verified status.
 */

export const SERVICE_LANGUAGE_RULESET_VERSION = "pool_service_language_v2" as const;

/** A phrase must appear on at least this many independent sites to be promoted. */
export const MINIMUM_INDEPENDENT_SITES = 2;

export type ServiceEvidenceStrength = "strong" | "supporting";

export interface ServiceLanguageRule {
  /** Stable identifier, recorded with every observation. */
  readonly id: string;
  readonly family: string;
  readonly strength: ServiceEvidenceStrength;
  /**
   * Multi-token patterns. Single generic words are never patterns: a term only
   * qualifies when it pairs an action with a pool-domain object.
   */
  readonly patterns: ReadonlyArray<RegExp>;
  readonly evidenceType: "service_language";
  readonly falsePositiveRisk: "low" | "medium" | "high";
  readonly falsePositiveNotes: string;
  /**
   * The existing POOL_SERVICE_ICP_V1 service term this family corresponds to.
   * Persisted evidence carries this canonical term so the unchanged qualifier
   * can match it; null where the model has no authoritative equivalent, in
   * which case the observation stays supporting-only and scores nothing.
   */
  readonly canonicalServiceTerm: string | null;
}

/**
 * Words that carry no niche signal on their own. A candidate pattern containing
 * only these is rejected at construction time by assertNonGenericRules().
 */
export const GENERIC_SERVICE_TERMS: ReadonlyArray<string> = Object.freeze([
  "service", "services", "repair", "repairs", "cleaning", "clean",
  "maintenance", "maintain", "technician", "pool", "pools", "spa",
]);

/**
 * Wording that indicates a facility, retailer, or builder rather than a
 * recurring-service contractor. A page matching these is held ambiguous even if
 * a service pattern also matched.
 */
export const FACILITY_OR_RETAIL_PATTERNS: ReadonlyArray<RegExp> = Object.freeze([
  /\bpool\s+supply\s+(?:store|shop)\b/i,
  /\bswim\s+(?:lessons|school|team)\b/i,
  /\bopen\s+swim\b/i,
  /\bday\s+pass(?:es)?\b/i,
  /\bmembership\s+rates?\b/i,
  /\bwater\s+park\b/i,
  /\bhotel\s+pool\b/i,
  /\bfitness\s+cent(?:er|re)\b/i,
  /\bshop\s+(?:chemicals|parts|supplies)\b/i,
  /\bnew\s+pool\s+construction\b/i,
  /\bpool\s+builder\b/i,
]);

/**
 * Candidate catalogue. Every pattern pairs an action with a pool-domain object,
 * so no entry can match on a generic word alone.
 */
export const CANDIDATE_SERVICE_LANGUAGE_RULES: ReadonlyArray<ServiceLanguageRule> = Object.freeze([
  {
    id: "psl_cleaning_service",
    family: "pool_cleaning",
    strength: "strong",
    patterns: [/\bpool\s+cleaning\b/i, /\bclean(?:ing)?\s+your\s+pool\b/i, /\bpool\s+cleaner\b/i],
    evidenceType: "service_language",
    falsePositiveRisk: "low",
    falsePositiveNotes: "Retailers occasionally sell cleaning products; retail patterns hold those ambiguous.",
    canonicalServiceTerm: "pool cleaning",
  },
  {
    id: "psl_maintenance_service",
    family: "pool_maintenance",
    strength: "strong",
    patterns: [/\bpool\s+maintenance\b/i, /\bpool\s+care\b/i, /\bmaintain(?:ing)?\s+your\s+pool\b/i],
    evidenceType: "service_language",
    falsePositiveRisk: "low",
    falsePositiveNotes: "Property managers may mention pool care as an amenity; identity checks separate those.",
    canonicalServiceTerm: "pool maintenance",
  },
  {
    id: "psl_repair_service",
    family: "pool_repair",
    strength: "strong",
    patterns: [/\bpool\s+repair\b/i, /\bpool\s+equipment\s+repair\b/i, /\bpump\s+(?:and|&)\s+filter\s+repair\b/i],
    evidenceType: "service_language",
    falsePositiveRisk: "low",
    falsePositiveNotes: "Parts retailers advertise repair parts; retail patterns hold those ambiguous.",
    canonicalServiceTerm: "pool repair",
  },
  {
    id: "psl_equipment_service",
    family: "equipment_service",
    strength: "strong",
    patterns: [
      /\bpool\s+equipment\b/i, /\bfilter\s+clean(?:ing|s)?\b/i,
      /\b(?:pool\s+)?pump\s+(?:repair|replacement|install)/i, /\bsalt\s+cell\b/i, /\bheater\s+repair\b/i,
    ],
    evidenceType: "service_language",
    falsePositiveRisk: "medium",
    falsePositiveNotes: "Equipment wording also appears on supply sites; requires a second family for strong evidence.",
    canonicalServiceTerm: "pool equipment service",
  },
  {
    id: "psl_recurring_service",
    family: "recurring_service",
    strength: "strong",
    patterns: [
      /\bweekly\s+(?:pool\s+)?service\b/i, /\bweekly\s+cleaning\b/i,
      /\bmonthly\s+(?:pool\s+)?service\b/i, /\bservice\s+plans?\b/i, /\brecurring\s+service\b/i,
      /\bpool\s+service\s+route\b/i,
    ],
    evidenceType: "service_language",
    falsePositiveRisk: "medium",
    falsePositiveNotes: "\"Service plans\" is used by many trades; paired with a pool family it is reliable.",
    canonicalServiceTerm: "recurring pool maintenance",
  },
  {
    id: "psl_water_chemistry",
    family: "water_chemistry",
    strength: "supporting",
    patterns: [
      /\bwater\s+chemistry\b/i, /\bchemical\s+balanc(?:e|ing)\b/i,
      /\bacid\s+wash\b/i, /\bgreen\s+pool\s+(?:cleanup|recovery|clean-up)\b/i, /\bchlorine\s+wash\b/i,
    ],
    evidenceType: "service_language",
    falsePositiveRisk: "low",
    falsePositiveNotes: "Chemistry wording is service-specific but also used by supply retailers.",
    canonicalServiceTerm: null,
  },
  {
    id: "psl_residential_pools",
    family: "residential_pools",
    strength: "supporting",
    patterns: [/\bresidential\s+pool/i, /\bhomeowners?\b[^.]{0,40}\bpool/i, /\bbackyard\s+pool/i],
    evidenceType: "service_language",
    falsePositiveRisk: "medium",
    falsePositiveNotes: "Builders also target residential pools; construction patterns hold those ambiguous.",
    canonicalServiceTerm: "residential pool service",
  },
  {
    id: "psl_commercial_pools",
    family: "commercial_pools",
    strength: "supporting",
    patterns: [/\bcommercial\s+pool/i, /\bhoa\s+pool/i, /\bapartment\s+pool/i, /\bcommunity\s+pool\s+service\b/i],
    evidenceType: "service_language",
    falsePositiveRisk: "medium",
    falsePositiveNotes: "Facilities describe their own commercial pools; identity checks separate operators from servicers.",
    canonicalServiceTerm: "commercial pool service",
  },
]);

/** Guard: no rule may be satisfiable by a generic single word. */
export function assertNonGenericRules(
  rules: ReadonlyArray<ServiceLanguageRule> = CANDIDATE_SERVICE_LANGUAGE_RULES,
): void {
  for (const rule of rules) {
    for (const pattern of rule.patterns) {
      for (const generic of GENERIC_SERVICE_TERMS) {
        if (pattern.test(generic)) {
          throw new Error(`Service language rule ${rule.id} matches the generic term "${generic}"`);
        }
      }
    }
  }
}

export interface ServiceLanguageHit {
  readonly ruleId: string;
  readonly family: string;
  readonly strength: ServiceEvidenceStrength;
  readonly canonicalServiceTerm: string | null;
}

export interface ServiceLanguageEvaluation {
  readonly hits: ReadonlyArray<ServiceLanguageHit>;
  readonly facilityOrRetail: boolean;
  /**
   * strong    — at least one strong family, no facility/retail wording
   * supporting— only supporting families, no facility/retail wording
   * ambiguous — any hit alongside facility or retail wording
   * missing   — nothing matched
   */
  readonly state: "strong" | "supporting" | "ambiguous" | "missing";
}

/**
 * Evaluate page text against the catalogue. Text is read in memory and never
 * returned, stored, or logged — only rule identifiers leave this function.
 */
export function evaluateServiceLanguage(
  text: string,
  rules: ReadonlyArray<ServiceLanguageRule> = CANDIDATE_SERVICE_LANGUAGE_RULES,
): ServiceLanguageEvaluation {
  const hits: ServiceLanguageHit[] = [];
  for (const rule of rules) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      hits.push({
        ruleId: rule.id, family: rule.family, strength: rule.strength,
        canonicalServiceTerm: rule.canonicalServiceTerm,
      });
    }
  }
  const facilityOrRetail = FACILITY_OR_RETAIL_PATTERNS.some((pattern) => pattern.test(text));
  const state = hits.length === 0
    ? "missing"
    : facilityOrRetail
      ? "ambiguous"
      : hits.some((hit) => hit.strength === "strong") ? "strong" : "supporting";
  // Deterministic order for stable persistence and reporting.
  hits.sort((left, right) => left.ruleId.localeCompare(right.ruleId));
  return { hits: Object.freeze(hits), facilityOrRetail, state };
}

export interface CalibratedRule {
  readonly ruleId: string;
  readonly family: string;
  readonly strength: ServiceEvidenceStrength;
  readonly evidenceType: "service_language";
  readonly independentSites: number;
  readonly falsePositiveRisk: "low" | "medium" | "high";
}

export interface ServiceLanguageCalibration {
  readonly rulesetVersion: typeof SERVICE_LANGUAGE_RULESET_VERSION;
  readonly minimumIndependentSites: number;
  readonly sitesObserved: number;
  readonly promoted: ReadonlyArray<CalibratedRule>;
  readonly rejected: ReadonlyArray<CalibratedRule>;
  readonly familyCounts: Readonly<Record<string, number>>;
}

/**
 * Promote a rule only when its family was observed on at least
 * MINIMUM_INDEPENDENT_SITES distinct sites. Everything else is reported as
 * rejected with its observed frequency, so a one-off phrase never becomes a rule.
 */
export function calibrateServiceLanguage(input: {
  /** One entry per assessed site: the rule ids observed anywhere on that site. */
  observationsBySite: ReadonlyArray<ReadonlyArray<string>>;
  rules?: ReadonlyArray<ServiceLanguageRule>;
  minimumIndependentSites?: number;
}): ServiceLanguageCalibration {
  const rules = input.rules ?? CANDIDATE_SERVICE_LANGUAGE_RULES;
  const minimum = input.minimumIndependentSites ?? MINIMUM_INDEPENDENT_SITES;
  const siteCounts = new Map<string, number>();
  for (const site of input.observationsBySite) {
    for (const ruleId of new Set(site)) {
      siteCounts.set(ruleId, (siteCounts.get(ruleId) ?? 0) + 1);
    }
  }
  const promoted: CalibratedRule[] = [];
  const rejected: CalibratedRule[] = [];
  const familyCounts: Record<string, number> = {};
  for (const rule of [...rules].sort((left, right) => left.id.localeCompare(right.id))) {
    const independentSites = siteCounts.get(rule.id) ?? 0;
    familyCounts[rule.family] = (familyCounts[rule.family] ?? 0) + independentSites;
    const calibrated: CalibratedRule = {
      ruleId: rule.id, family: rule.family, strength: rule.strength,
      evidenceType: rule.evidenceType, independentSites, falsePositiveRisk: rule.falsePositiveRisk,
    };
    if (independentSites >= minimum) promoted.push(calibrated);
    else rejected.push(calibrated);
  }
  return {
    rulesetVersion: SERVICE_LANGUAGE_RULESET_VERSION,
    minimumIndependentSites: minimum,
    sitesObserved: input.observationsBySite.length,
    promoted: Object.freeze(promoted),
    rejected: Object.freeze(rejected),
    familyCounts: Object.freeze(familyCounts),
  };
}
