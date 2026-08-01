import type {
  ArtifactReference,
  Business,
  BusinessIdentifier,
  BusinessLocation,
  Contact,
  Evidence,
  EvidenceConflict,
  EvidenceEntityType,
  LeadRun,
  ProviderCall,
  RunStage,
  StageTask,
} from "../domain/types.js";
import type {
  ConflictStatus,
  DecisionState,
  EvidenceState,
  LeadState,
  RunState,
  TaskState,
  VerificationState,
} from "../domain/states.js";
import type { MicroUsd } from "../domain/money.js";
import type {
  EvidencePromotionDecision,
  EvidencePromotionRequest,
} from "../domain/verification-policy.js";
import type { IdentityMatchDecision } from "../identity/hierarchy.js";

export interface RunRepository {
  create(run: LeadRun): LeadRun;
  getById(id: string): LeadRun | null;
  updateState(
    id: string,
    state: RunState,
    spentMicroUsd: MicroUsd,
    updatedAt: string,
  ): LeadRun;
}

export interface StageTaskRepository {
  createStage(stage: RunStage): RunStage;
  getStageById(id: string): RunStage | null;
  updateStageState(
    id: string,
    state: TaskState,
    updatedAt: string,
    finishedAt?: string | null,
  ): RunStage;
  createTask(task: StageTask): StageTask;
  getTaskById(id: string): StageTask | null;
  updateTaskState(
    id: string,
    state: TaskState,
    updatedAt: string,
    reasonCode?: StageTask["reasonCode"],
  ): StageTask;
}

export interface BusinessRepository {
  create(business: Business): Business;
  getById(id: string): Business | null;
  updateState(id: string, state: LeadState, updatedAt: string): Business;
  addIdentifier(identifier: BusinessIdentifier): BusinessIdentifier;
  listIdentifiers(businessId: string): BusinessIdentifier[];
  addLocation(location: BusinessLocation): BusinessLocation;
  listLocations(businessId: string): BusinessLocation[];
}

export interface ContactRepository {
  create(contact: Contact): Contact;
  getById(id: string): Contact | null;
  listByBusiness(businessId: string): Contact[];
  updateStates(
    id: string,
    states: {
      evidenceState: EvidenceState;
      verificationState: VerificationState;
      decisionState: DecisionState;
      claimState?: Contact["claimState"];
      relationshipEvidenceId?: string | null;
      updatedAt: string;
    },
  ): Contact;
}

export interface EvidenceRepository {
  create(evidence: Evidence): Evidence;
  getById(id: string): Evidence | null;
  listForEntity(entityType: EvidenceEntityType, entityId: string): Evidence[];
  updateStates(
    id: string,
    states: {
      evidenceState: EvidenceState;
      decisionState: DecisionState;
      conflictStatus: ConflictStatus;
      updatedAt: string;
    },
  ): Evidence;
  promote(
    id: string,
    request: Omit<EvidencePromotionRequest, "evidence"> & { decisionId: string },
  ): EvidencePromotionDecision;
  listPromotionDecisions(evidenceId: string): EvidencePromotionAudit[];
  addConflict(conflict: EvidenceConflict): EvidenceConflict;
}

export interface EvidencePromotionAudit {
  id: string;
  evidenceId: string;
  requestedClaimState: Evidence["claimState"];
  allowed: boolean;
  denialReasons: ReadonlyArray<string>;
  resolutionReference: string | null;
  policyVersion: string;
  decidedAt: string;
}

export interface IdentityDecisionRepository {
  record(decision: IdentityMatchDecision, decidedAt: string): IdentityMatchDecision;
  getById(id: string): IdentityMatchDecision | null;
}

export interface ProviderCallRepository {
  create(providerCall: ProviderCall): ProviderCall;
  getById(id: string): ProviderCall | null;
  updateResult(
    id: string,
    result: {
      state: TaskState;
      actualCostMicroUsd: MicroUsd;
      errorReasonCode: ProviderCall["errorReasonCode"];
      finishedAt: string;
    },
  ): ProviderCall;
}

export interface ArtifactRepository {
  create(reference: ArtifactReference): ArtifactReference;
  getById(id: string): ArtifactReference | null;
  listByRun(runId: string): ArtifactReference[];
}

export interface LeadEngineRepositories {
  runs: RunRepository;
  stagesAndTasks: StageTaskRepository;
  businesses: BusinessRepository;
  contacts: ContactRepository;
  evidence: EvidenceRepository;
  identityDecisions: IdentityDecisionRepository;
  providerCalls: ProviderCallRepository;
  artifacts: ArtifactRepository;
  transaction<T>(operation: (repositories: LeadEngineRepositories) => T): T;
}
