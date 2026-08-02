import { normalizeBusinessName } from "./normalize.js";

/**
 * Phase 5D identity corroboration.
 *
 * Phase 5B attached a website to a business on business-name agreement alone,
 * which sent two of three real candidates to review because a trading name
 * rarely matches a site's title verbatim. This module corroborates across
 * several independent dimensions instead.
 *
 * Rules that do not move:
 *  - name similarity alone never attaches a site;
 *  - any actively conflicting dimension forces review;
 *  - nothing here marks a phone, email, person, domain, or business verified.
 */

export const IDENTITY_CORROBORATION_VERSION = "pool_service_identity_corroboration_v1" as const;

/** Two independent compatible dimensions are required to attach automatically. */
export const MINIMUM_COMPATIBLE_DIMENSIONS = 2;

export type IdentityDimension =
  | "normalized_name"
  | "domain"
  | "locality"
  | "phone"
  | "structured_organization_name"
  | "service_area";

export type DimensionState = "compatible" | "conflicting" | "unavailable";

export interface IdentityDimensionOutcome {
  readonly dimension: IdentityDimension;
  readonly state: DimensionState;
}

export type IdentityDecision = "attach" | "review_required" | "conflict";

export interface IdentityCorroborationResult {
  readonly version: typeof IDENTITY_CORROBORATION_VERSION;
  readonly dimensions: ReadonlyArray<IdentityDimensionOutcome>;
  readonly compatibleCount: number;
  readonly conflictingCount: number;
  readonly decision: IdentityDecision;
  /** Aggregate reason codes only — never a name, domain, phone, or address. */
  readonly reasonCodes: ReadonlyArray<string>;
}

export interface IdentityObservation {
  /** Business name as recorded by the discovery provider. */
  readonly expectedName: string;
  /** Host of the approved candidate website. */
  readonly candidateHost: string;
  /** Locality recorded by the discovery provider, if any. */
  readonly expectedLocality: string | null;
  /** Public phone digits recorded by the discovery provider, if any. */
  readonly expectedPhones: ReadonlyArray<string>;
  /** Names observed on the site (title, copyright, structured data). */
  readonly observedNames: ReadonlyArray<string>;
  /** Organization names from structured data specifically. */
  readonly structuredOrganizationNames: ReadonlyArray<string>;
  /** Public phone values observed on the site. */
  readonly observedPhones: ReadonlyArray<string>;
  /** Localities observed on the site (addresses, service-area copy). */
  readonly observedLocalities: ReadonlyArray<string>;
  /** Service-area localities observed on the site. */
  readonly observedServiceAreas: ReadonlyArray<string>;
}

function tokens(value: string): Set<string> {
  return new Set(normalizeBusinessName(value).split(" ").filter((token) => token.length > 2));
}

/** Distinctive-token overlap, ignoring words that carry no identity signal. */
const NON_DISTINCTIVE = new Set([
  "pool", "pools", "spa", "spas", "service", "services", "company", "inc", "llc",
  "the", "and", "care", "cleaning", "maintenance", "repair", "solutions", "group",
]);

function distinctive(value: string): Set<string> {
  return new Set([...tokens(value)].filter((token) => !NON_DISTINCTIVE.has(token)));
}

function nameState(expected: string, observed: ReadonlyArray<string>): DimensionState {
  if (!observed || observed.length === 0) return "unavailable";
  const expectedNormalized = normalizeBusinessName(expected);
  const expectedDistinctive = distinctive(expected);
  let sawAny = false;
  for (const candidate of observed) {
    const normalized = normalizeBusinessName(candidate);
    if (!normalized) continue;
    sawAny = true;
    if (normalized === expectedNormalized) return "compatible";
    const overlap = [...expectedDistinctive].filter((token) => distinctive(candidate).has(token));
    if (expectedDistinctive.size > 0 && overlap.length >= Math.min(1, expectedDistinctive.size)) {
      return "compatible";
    }
  }
  // Names were present and none shared a distinctive token: an active conflict.
  return sawAny ? "conflicting" : "unavailable";
}

/** Host tokens, minus the public suffix, split on separators. */
function hostTokens(host: string): Set<string> {
  const withoutSuffix = host.toLocaleLowerCase("en-US").split(".").slice(0, -1).join(" ");
  return new Set(withoutSuffix.split(/[^a-z0-9]+/).filter((token) => token.length > 2));
}

function domainState(expectedName: string, host: string): DimensionState {
  const expectedDistinctive = distinctive(expectedName);
  if (expectedDistinctive.size === 0) return "unavailable";
  const hostText = [...hostTokens(host)].join(" ");
  if (!hostText) return "unavailable";
  // A distinctive business token appearing in the host corroborates the pairing.
  for (const token of expectedDistinctive) {
    if (hostText.includes(token)) return "compatible";
  }
  return "unavailable";
}

/** Last ten digits, so formatting and country prefixes do not matter. */
function phoneDigits(value: string): string {
  return value.replace(/\D+/g, "").slice(-10);
}

function phoneState(
  expected: ReadonlyArray<string>, observed: ReadonlyArray<string>,
): DimensionState {
  const expectedSet = new Set((expected ?? []).map(phoneDigits).filter((digits) => digits.length === 10));
  const observedSet = new Set((observed ?? []).map(phoneDigits).filter((digits) => digits.length === 10));
  if (expectedSet.size === 0 || observedSet.size === 0) return "unavailable";
  for (const digits of expectedSet) if (observedSet.has(digits)) return "compatible";
  return "conflicting";
}

function localityState(
  expected: string | null, observed: ReadonlyArray<string>,
): DimensionState {
  if (!expected || !observed || observed.length === 0) return "unavailable";
  const target = expected.trim().toLocaleLowerCase("en-US");
  if (!target) return "unavailable";
  for (const candidate of observed) {
    if (candidate.trim().toLocaleLowerCase("en-US").includes(target)) return "compatible";
  }
  // A locality was published and none matched: treat as unavailable rather than a
  // conflict, since a service business legitimately lists many localities.
  return "unavailable";
}

export function assessIdentityCorroboration(
  observation: IdentityObservation,
  options: { minimumCompatibleDimensions?: number } = {},
): IdentityCorroborationResult {
  const minimum = options.minimumCompatibleDimensions ?? MINIMUM_COMPATIBLE_DIMENSIONS;
  const dimensions: IdentityDimensionOutcome[] = [
    { dimension: "normalized_name", state: nameState(observation.expectedName, observation.observedNames) },
    { dimension: "domain", state: domainState(observation.expectedName, observation.candidateHost) },
    { dimension: "locality", state: localityState(observation.expectedLocality, observation.observedLocalities) },
    { dimension: "phone", state: phoneState(observation.expectedPhones, observation.observedPhones) },
    {
      dimension: "structured_organization_name",
      state: nameState(observation.expectedName, observation.structuredOrganizationNames),
    },
    {
      dimension: "service_area",
      state: localityState(observation.expectedLocality, observation.observedServiceAreas),
    },
  ];

  const compatible = dimensions.filter((entry) => entry.state === "compatible");
  const conflicting = dimensions.filter((entry) => entry.state === "conflicting");
  const reasonCodes: string[] = [];

  // An actively conflicting dimension always wins: a mismatch is never
  // auto-approved because other dimensions happen to agree.
  let decision: IdentityDecision;
  if (conflicting.length > 0) {
    decision = "conflict";
    for (const entry of conflicting) reasonCodes.push(`conflicting_${entry.dimension}`);
  } else if (compatible.length >= minimum) {
    decision = "attach";
    for (const entry of compatible) reasonCodes.push(`compatible_${entry.dimension}`);
  } else {
    decision = "review_required";
    reasonCodes.push(
      compatible.length === 0 ? "no_compatible_dimension" : "insufficient_corroboration",
    );
    // Name agreement on its own is explicitly not enough to attach.
    if (compatible.length === 1 && compatible[0]?.dimension === "normalized_name") {
      reasonCodes.push("name_similarity_only");
    }
  }

  return {
    version: IDENTITY_CORROBORATION_VERSION,
    dimensions: Object.freeze(dimensions),
    compatibleCount: compatible.length,
    conflictingCount: conflicting.length,
    decision,
    reasonCodes: Object.freeze([...new Set(reasonCodes)].sort()),
  };
}
