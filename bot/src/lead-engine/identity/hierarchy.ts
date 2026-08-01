import type {
  ClaimState,
  ExternalVerificationState,
  ProvenanceSourceClass,
  VerificationDimension,
  VerificationMethod,
  VerificationResult,
} from "../domain/provenance.js";

export const IDENTITY_POLICY_VERSION = "identity-2.0.0";

export interface IdentitySignalEvidence {
  sourceClass: ProvenanceSourceClass;
  claimState: ClaimState;
  externalVerificationState: ExternalVerificationState;
  verificationDimension: VerificationDimension | null;
  verifierId: string | null;
  verificationMethod: VerificationMethod | null;
  verificationResult: VerificationResult | null;
  verifiedAt: string | null;
  expiresAt: string | null;
  normalizedValue: string | null;
  evidenceReference: string | null;
}

export interface ProviderIdentity {
  providerId: string;
  value: string;
  trusted: boolean;
  evidence: IdentitySignalEvidence;
}

export interface DomainIdentity {
  value: string;
  evidence: IdentitySignalEvidence;
}

export interface PhoneIdentity {
  value: string;
  e164: string | null;
  evidence: IdentitySignalEvidence;
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
  evidence: IdentitySignalEvidence;
}

export interface ChainAffiliation {
  brandName: string;
  franchise: boolean;
  evidence: IdentitySignalEvidence;
}

export interface BusinessIdentityRecord {
  entityId: string;
  locationId: string;
  groupId?: string | null;
  displayName: string;
  dbaNames: ReadonlyArray<string>;
  legalName?: string | null;
  nameEvidence: IdentitySignalEvidence;
  providerIdentifiers: ReadonlyArray<ProviderIdentity>;
  domains: ReadonlyArray<DomainIdentity>;
  phones: ReadonlyArray<PhoneIdentity>;
  address: AddressIdentity | null;
  chainAffiliation?: ChainAffiliation | null;
}

export type IdentityMatchReason =
  | "stable_provider_identifier"
  | "verified_canonical_domain"
  | "verified_domain_group"
  | "verified_phone_with_address"
  | "verified_phone_requires_corroboration"
  | "exact_address_review"
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
  confidenceBasisPoints: number;
  policyVersion: string;
  conflicts: ReadonlyArray<string>;
  supportingSignals: ReadonlyArray<string>;
  conflictingSignals: ReadonlyArray<string>;
  verificationDimensions: ReadonlyArray<VerificationDimension>;
  reviewReason: string | null;
}

export interface BusinessGroup {
  groupId: string;
  displayName: string;
  legalName: string | null;
  chainAffiliation: ChainAffiliation | null;
  locationIds: ReadonlyArray<string>;
  aliases: ReadonlyArray<{ name: string; kind: "dba" | "display" | "legal" }>;
}
