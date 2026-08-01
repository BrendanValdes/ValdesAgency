export const IDENTITY_POLICY_VERSION = "identity-1.0.0";

export interface ProviderIdentity {
  providerId: string;
  value: string;
}

export interface DomainIdentity {
  value: string;
  verified: boolean;
}

export interface PhoneIdentity {
  value: string;
  e164: string | null;
  verified: boolean;
  shared: boolean;
  tollFree: boolean;
  callCenter: boolean;
  multipleLocations: boolean;
  associationCertain: boolean;
}

export interface AddressIdentity {
  line1: string;
  line2?: string | null;
  city: string;
  region: string;
  postalCode: string;
  countryCode: string;
}

export interface ChainAffiliation {
  brandName: string;
  franchise: boolean;
  verified: boolean;
}

export interface BusinessIdentityRecord {
  entityId: string;
  locationId: string;
  groupId?: string | null;
  displayName: string;
  dbaNames: ReadonlyArray<string>;
  legalName?: string | null;
  providerIdentifiers: ReadonlyArray<ProviderIdentity>;
  domains: ReadonlyArray<DomainIdentity>;
  phones: ReadonlyArray<PhoneIdentity>;
  address: AddressIdentity | null;
  chainAffiliation?: ChainAffiliation | null;
}

export type IdentityMatchReason =
  | "stable_provider_identifier"
  | "verified_domain"
  | "verified_domain_group"
  | "verified_e164_phone"
  | "exact_normalized_address"
  | "strong_multi_field"
  | "fuzzy_candidate"
  | "conflicting_identifiers"
  | "insufficient_evidence";

export interface IdentityMatchDecision {
  decisionId: string;
  leftEntityId: string;
  rightEntityId: string;
  action: "auto_merge" | "group_link" | "human_review" | "no_match";
  reason: IdentityMatchReason;
  matchScore: number;
  policyVersion: string;
  conflicts: ReadonlyArray<string>;
}

export interface BusinessGroup {
  groupId: string;
  displayName: string;
  legalName: string | null;
  chainAffiliation: ChainAffiliation | null;
  locationIds: ReadonlyArray<string>;
  aliases: ReadonlyArray<{ name: string; kind: "dba" | "display" | "legal" }>;
}

