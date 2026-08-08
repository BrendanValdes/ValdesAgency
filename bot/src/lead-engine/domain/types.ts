import type { MicroUsd } from "./money.js";
import type { ReasonCode } from "./reason-codes.js";
import type {
  ClaimState,
  ExternalVerificationState,
  HumanReviewState,
  ProvenanceSourceClass,
  SourceConfirmationState,
  VerificationDimension,
  VerificationMethod,
  VerificationResult,
} from "./provenance.js";
import type {
  ConflictStatus,
  DecisionState,
  EvidenceState,
  LeadState,
  RunState,
  TaskState,
  VerificationState,
} from "./states.js";

export type IsoTimestamp = string;
export type RunId = string;
export type StageId = string;
export type TaskId = string;
export type BusinessId = string;
export type ContactId = string;
export type EvidenceId = string;
export type ProviderCallId = string;
export type ArtifactReferenceId = string;

export type NicheId = "pool_service" | "foundation_waterproofing" | "landscaping" | "hvac";
export type EvidenceEntityType = "business" | "person";

export interface LeadRun {
  id: RunId;
  state: RunState;
  nicheId: NicheId;
  budgetMicroUsd: MicroUsd;
  spentMicroUsd: MicroUsd;
  policyVersion: string;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface RunStage {
  id: StageId;
  runId: RunId;
  stageName: string;
  state: TaskState;
  startedAt: IsoTimestamp | null;
  finishedAt: IsoTimestamp | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface StageTask {
  id: TaskId;
  stageId: StageId;
  businessId: BusinessId | null;
  taskName: string;
  state: TaskState;
  reasonCode: ReasonCode | null;
  attempt: number;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface Business {
  id: BusinessId;
  canonicalName: string;
  state: LeadState;
  nicheId: NicheId;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface BusinessIdentifier {
  id: string;
  businessId: BusinessId;
  scheme: string;
  value: string;
  source: string;
  sourceClass: ProvenanceSourceClass;
  claimState: ClaimState;
  evidenceState: EvidenceState;
  createdAt: IsoTimestamp;
}

export interface BusinessLocation {
  id: string;
  businessId: BusinessId;
  line1: string | null;
  city: string;
  region: string;
  postalCode: string | null;
  countryCode: string;
  evidenceState: EvidenceState;
  sourceClass: ProvenanceSourceClass;
  claimState: ClaimState;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface Contact {
  id: ContactId;
  businessId: BusinessId;
  entityType: "person";
  personName: string | null;
  title: string | null;
  role: "owner" | "manager" | "employee" | "unknown";
  evidenceState: EvidenceState;
  verificationState: VerificationState;
  decisionState: DecisionState;
  sourceClass: ProvenanceSourceClass;
  claimState: ClaimState;
  relationshipEvidenceId: EvidenceId | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface Evidence {
  id: EvidenceId;
  entityType: EvidenceEntityType;
  entityId: string;
  fieldName: string;
  claimedValue: string | null;
  source: string;
  sourceClass: ProvenanceSourceClass;
  sourceUrl: string | null;
  observedAt: IsoTimestamp;
  fetchedAt: IsoTimestamp;
  confidenceBasisPoints: number;
  extractionMethod: string;
  conflictStatus: ConflictStatus;
  rawReferenceChecksum: string | null;
  policyVersion: string;
  evidenceState: EvidenceState;
  verificationState: VerificationState;
  decisionState: DecisionState;
  claimState: ClaimState;
  sourceConfirmationState: SourceConfirmationState;
  externalVerificationState: ExternalVerificationState;
  humanReviewState: HumanReviewState;
  verificationDimension: VerificationDimension | null;
  verifierId: string | null;
  verificationMethod: VerificationMethod | null;
  verificationResult: VerificationResult | null;
  verifiedAt: IsoTimestamp | null;
  expiresAt: IsoTimestamp | null;
  normalizedValue: string | null;
  evidenceReference: string | null;
  humanReviewerId: string | null;
  humanReviewedAt: IsoTimestamp | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface EvidenceConflict {
  id: string;
  evidenceId: EvidenceId;
  conflictingEvidenceId: EvidenceId;
  status: Exclude<ConflictStatus, "none">;
  reasonCode: ReasonCode;
  createdAt: IsoTimestamp;
  resolvedAt: IsoTimestamp | null;
}

export interface ProviderCall {
  id: ProviderCallId;
  runId: RunId;
  taskId: TaskId | null;
  provider: string;
  operation: string;
  state: TaskState;
  estimatedCostMicroUsd: MicroUsd;
  actualCostMicroUsd: MicroUsd;
  cacheHit: boolean;
  errorReasonCode: ReasonCode | null;
  startedAt: IsoTimestamp;
  finishedAt: IsoTimestamp | null;
}

export interface ArtifactReference {
  id: ArtifactReferenceId;
  runId: RunId;
  evidenceId: EvidenceId | null;
  kind: "evidence_blob" | "cache_entry" | "run_artifact";
  externalPath: string;
  checksum: string;
  createdAt: IsoTimestamp;
}
