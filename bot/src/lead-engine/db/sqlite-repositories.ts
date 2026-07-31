import path from "node:path";
import { assertEvidenceSemantics } from "../domain/evidence.js";
import { microUsd } from "../domain/money.js";
import { assertContactIdentityPolicy } from "../domain/policies.js";
import type { ReasonCode } from "../domain/reason-codes.js";
import type {
  ConflictStatus,
  DecisionState,
  EvidenceState,
  LeadState,
  RunState,
  TaskState,
  VerificationState,
} from "../domain/states.js";
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
  NicheId,
  ProviderCall,
  RunStage,
  StageTask,
} from "../domain/types.js";
import { isPathInside } from "../config/loader.js";
import type { SqliteDatabase } from "./database.js";
import type { LeadEngineRepositories } from "./repositories.js";
import { withTransaction } from "./transaction.js";

type RunRow = {
  id: string;
  state: RunState;
  niche_id: NicheId;
  budget_micro_usd: number;
  spent_micro_usd: number;
  policy_version: string;
  created_at: string;
  updated_at: string;
};

type StageRow = {
  id: string;
  run_id: string;
  stage_name: string;
  state: TaskState;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};

type TaskRow = {
  id: string;
  stage_id: string;
  business_id: string | null;
  task_name: string;
  state: TaskState;
  reason_code: ReasonCode | null;
  attempt: number;
  created_at: string;
  updated_at: string;
};

type BusinessRow = {
  id: string;
  canonical_name: string;
  state: LeadState;
  niche_id: NicheId;
  created_at: string;
  updated_at: string;
};

type IdentifierRow = {
  id: string;
  business_id: string;
  scheme: string;
  value: string;
  source: string;
  evidence_state: EvidenceState;
  created_at: string;
};

type LocationRow = {
  id: string;
  business_id: string;
  line1: string | null;
  city: string;
  region: string;
  postal_code: string | null;
  country_code: string;
  evidence_state: EvidenceState;
  created_at: string;
  updated_at: string;
};

type ContactRow = {
  id: string;
  business_id: string;
  entity_type: "person";
  person_name: string;
  title: string | null;
  role: Contact["role"];
  evidence_state: EvidenceState;
  verification_state: VerificationState;
  decision_state: DecisionState;
  created_at: string;
  updated_at: string;
};

type EvidenceRow = {
  id: string;
  entity_type: EvidenceEntityType;
  entity_id: string;
  field_name: string;
  claimed_value: string | null;
  source: string;
  source_url: string | null;
  observed_at: string;
  fetched_at: string;
  confidence_basis_points: number;
  extraction_method: string;
  conflict_status: ConflictStatus;
  raw_reference_checksum: string | null;
  policy_version: string;
  evidence_state: EvidenceState;
  verification_state: VerificationState;
  decision_state: DecisionState;
  verification_method: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
};

type ConflictRow = {
  id: string;
  evidence_id: string;
  conflicting_evidence_id: string;
  status: Exclude<ConflictStatus, "none">;
  reason_code: ReasonCode;
  created_at: string;
  resolved_at: string | null;
};

type ProviderCallRow = {
  id: string;
  run_id: string;
  task_id: string | null;
  provider: string;
  operation: string;
  state: TaskState;
  estimated_cost_micro_usd: number;
  actual_cost_micro_usd: number;
  cache_hit: 0 | 1;
  error_reason_code: ReasonCode | null;
  started_at: string;
  finished_at: string | null;
};

type ArtifactRow = {
  id: string;
  run_id: string;
  evidence_id: string | null;
  kind: ArtifactReference["kind"];
  external_path: string;
  checksum: string;
  created_at: string;
};

function mapRun(row: RunRow): LeadRun {
  return {
    id: row.id,
    state: row.state,
    nicheId: row.niche_id,
    budgetMicroUsd: microUsd(row.budget_micro_usd),
    spentMicroUsd: microUsd(row.spent_micro_usd),
    policyVersion: row.policy_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapStage(row: StageRow): RunStage {
  return {
    id: row.id,
    runId: row.run_id,
    stageName: row.stage_name,
    state: row.state,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTask(row: TaskRow): StageTask {
  return {
    id: row.id,
    stageId: row.stage_id,
    businessId: row.business_id,
    taskName: row.task_name,
    state: row.state,
    reasonCode: row.reason_code,
    attempt: row.attempt,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBusiness(row: BusinessRow): Business {
  return {
    id: row.id,
    canonicalName: row.canonical_name,
    state: row.state,
    nicheId: row.niche_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapIdentifier(row: IdentifierRow): BusinessIdentifier {
  return {
    id: row.id,
    businessId: row.business_id,
    scheme: row.scheme,
    value: row.value,
    source: row.source,
    evidenceState: row.evidence_state,
    createdAt: row.created_at,
  };
}

function mapLocation(row: LocationRow): BusinessLocation {
  return {
    id: row.id,
    businessId: row.business_id,
    line1: row.line1,
    city: row.city,
    region: row.region,
    postalCode: row.postal_code,
    countryCode: row.country_code,
    evidenceState: row.evidence_state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapContact(row: ContactRow): Contact {
  return {
    id: row.id,
    businessId: row.business_id,
    entityType: row.entity_type,
    personName: row.person_name,
    title: row.title,
    role: row.role,
    evidenceState: row.evidence_state,
    verificationState: row.verification_state,
    decisionState: row.decision_state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEvidence(row: EvidenceRow): Evidence {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    fieldName: row.field_name,
    claimedValue: row.claimed_value,
    source: row.source,
    sourceUrl: row.source_url,
    observedAt: row.observed_at,
    fetchedAt: row.fetched_at,
    confidenceBasisPoints: row.confidence_basis_points,
    extractionMethod: row.extraction_method,
    conflictStatus: row.conflict_status,
    rawReferenceChecksum: row.raw_reference_checksum,
    policyVersion: row.policy_version,
    evidenceState: row.evidence_state,
    verificationState: row.verification_state,
    decisionState: row.decision_state,
    verificationMethod: row.verification_method,
    verifiedAt: row.verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapConflict(row: ConflictRow): EvidenceConflict {
  return {
    id: row.id,
    evidenceId: row.evidence_id,
    conflictingEvidenceId: row.conflicting_evidence_id,
    status: row.status,
    reasonCode: row.reason_code,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

function mapProviderCall(row: ProviderCallRow): ProviderCall {
  return {
    id: row.id,
    runId: row.run_id,
    taskId: row.task_id,
    provider: row.provider,
    operation: row.operation,
    state: row.state,
    estimatedCostMicroUsd: microUsd(row.estimated_cost_micro_usd),
    actualCostMicroUsd: microUsd(row.actual_cost_micro_usd),
    cacheHit: row.cache_hit === 1,
    errorReasonCode: row.error_reason_code,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

function mapArtifact(row: ArtifactRow): ArtifactReference {
  return {
    id: row.id,
    runId: row.run_id,
    evidenceId: row.evidence_id,
    kind: row.kind,
    externalPath: row.external_path,
    checksum: row.checksum,
    createdAt: row.created_at,
  };
}

function requireUpdate(changes: number): void {
  if (changes !== 1) throw new Error("Repository record was not found");
}

export function createSqliteRepositories(
  database: SqliteDatabase,
  options: { dataRoot: string },
): LeadEngineRepositories {
  if (!path.isAbsolute(options.dataRoot)) {
    throw new Error("Repository data root must be absolute");
  }
  const dataRoot = path.resolve(options.dataRoot);

  const getRun = (id: string): LeadRun | null => {
    const row = database.prepare("SELECT * FROM lead_runs WHERE id = ?").get(id) as
      | RunRow
      | undefined;
    return row ? mapRun(row) : null;
  };
  const getStage = (id: string): RunStage | null => {
    const row = database.prepare("SELECT * FROM run_stages WHERE id = ?").get(id) as
      | StageRow
      | undefined;
    return row ? mapStage(row) : null;
  };
  const getTask = (id: string): StageTask | null => {
    const row = database.prepare("SELECT * FROM stage_tasks WHERE id = ?").get(id) as
      | TaskRow
      | undefined;
    return row ? mapTask(row) : null;
  };
  const getBusiness = (id: string): Business | null => {
    const row = database.prepare("SELECT * FROM businesses WHERE id = ?").get(id) as
      | BusinessRow
      | undefined;
    return row ? mapBusiness(row) : null;
  };
  const getContact = (id: string): Contact | null => {
    const row = database.prepare("SELECT * FROM contacts WHERE id = ?").get(id) as
      | ContactRow
      | undefined;
    return row ? mapContact(row) : null;
  };
  const getEvidence = (id: string): Evidence | null => {
    const row = database.prepare("SELECT * FROM evidence WHERE id = ?").get(id) as
      | EvidenceRow
      | undefined;
    return row ? mapEvidence(row) : null;
  };
  const getProviderCall = (id: string): ProviderCall | null => {
    const row = database.prepare("SELECT * FROM provider_calls WHERE id = ?").get(id) as
      | ProviderCallRow
      | undefined;
    return row ? mapProviderCall(row) : null;
  };
  const getArtifact = (id: string): ArtifactReference | null => {
    const row = database.prepare("SELECT * FROM artifact_references WHERE id = ?").get(id) as
      | ArtifactRow
      | undefined;
    return row ? mapArtifact(row) : null;
  };

  let repositories: LeadEngineRepositories;
  repositories = {
    runs: {
      create(run) {
        database.prepare(`
          INSERT INTO lead_runs
            (id, state, niche_id, budget_micro_usd, spent_micro_usd, policy_version, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          run.id,
          run.state,
          run.nicheId,
          run.budgetMicroUsd,
          run.spentMicroUsd,
          run.policyVersion,
          run.createdAt,
          run.updatedAt,
        );
        return getRun(run.id) as LeadRun;
      },
      getById: getRun,
      updateState(id, state, spentMicroUsd, updatedAt) {
        const result = database
          .prepare("UPDATE lead_runs SET state = ?, spent_micro_usd = ?, updated_at = ? WHERE id = ?")
          .run(state, spentMicroUsd, updatedAt, id);
        requireUpdate(result.changes);
        return getRun(id) as LeadRun;
      },
    },
    stagesAndTasks: {
      createStage(stage) {
        database.prepare(`
          INSERT INTO run_stages
            (id, run_id, stage_name, state, started_at, finished_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          stage.id,
          stage.runId,
          stage.stageName,
          stage.state,
          stage.startedAt,
          stage.finishedAt,
          stage.createdAt,
          stage.updatedAt,
        );
        return getStage(stage.id) as RunStage;
      },
      getStageById: getStage,
      updateStageState(id, state, updatedAt, finishedAt = null) {
        const result = database
          .prepare("UPDATE run_stages SET state = ?, finished_at = ?, updated_at = ? WHERE id = ?")
          .run(state, finishedAt, updatedAt, id);
        requireUpdate(result.changes);
        return getStage(id) as RunStage;
      },
      createTask(task) {
        database.prepare(`
          INSERT INTO stage_tasks
            (id, stage_id, business_id, task_name, state, reason_code, attempt, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          task.id,
          task.stageId,
          task.businessId,
          task.taskName,
          task.state,
          task.reasonCode,
          task.attempt,
          task.createdAt,
          task.updatedAt,
        );
        return getTask(task.id) as StageTask;
      },
      getTaskById: getTask,
      updateTaskState(id, state, updatedAt, reasonCode = null) {
        const result = database
          .prepare("UPDATE stage_tasks SET state = ?, reason_code = ?, updated_at = ? WHERE id = ?")
          .run(state, reasonCode, updatedAt, id);
        requireUpdate(result.changes);
        return getTask(id) as StageTask;
      },
    },
    businesses: {
      create(business) {
        database.prepare(`
          INSERT INTO businesses (id, canonical_name, state, niche_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          business.id,
          business.canonicalName,
          business.state,
          business.nicheId,
          business.createdAt,
          business.updatedAt,
        );
        return getBusiness(business.id) as Business;
      },
      getById: getBusiness,
      updateState(id, state, updatedAt) {
        const result = database
          .prepare("UPDATE businesses SET state = ?, updated_at = ? WHERE id = ?")
          .run(state, updatedAt, id);
        requireUpdate(result.changes);
        return getBusiness(id) as Business;
      },
      addIdentifier(identifier) {
        database.prepare(`
          INSERT INTO business_identifiers
            (id, business_id, scheme, value, source, evidence_state, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          identifier.id,
          identifier.businessId,
          identifier.scheme,
          identifier.value,
          identifier.source,
          identifier.evidenceState,
          identifier.createdAt,
        );
        return mapIdentifier(
          database.prepare("SELECT * FROM business_identifiers WHERE id = ?").get(identifier.id) as IdentifierRow,
        );
      },
      listIdentifiers(businessId) {
        return (database
          .prepare("SELECT * FROM business_identifiers WHERE business_id = ? ORDER BY id")
          .all(businessId) as IdentifierRow[]).map(mapIdentifier);
      },
      addLocation(location) {
        database.prepare(`
          INSERT INTO business_locations
            (id, business_id, line1, city, region, postal_code, country_code, evidence_state, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          location.id,
          location.businessId,
          location.line1,
          location.city,
          location.region,
          location.postalCode,
          location.countryCode,
          location.evidenceState,
          location.createdAt,
          location.updatedAt,
        );
        return mapLocation(
          database.prepare("SELECT * FROM business_locations WHERE id = ?").get(location.id) as LocationRow,
        );
      },
      listLocations(businessId) {
        return (database
          .prepare("SELECT * FROM business_locations WHERE business_id = ? ORDER BY id")
          .all(businessId) as LocationRow[]).map(mapLocation);
      },
    },
    contacts: {
      create(contact) {
        const business = getBusiness(contact.businessId);
        if (!business) throw new Error("Contact business was not found");
        assertContactIdentityPolicy(business.canonicalName, contact.personName);
        database.prepare(`
          INSERT INTO contacts
            (id, business_id, entity_type, person_name, title, role, evidence_state, verification_state, decision_state, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          contact.id,
          contact.businessId,
          contact.entityType,
          contact.personName,
          contact.title,
          contact.role,
          contact.evidenceState,
          contact.verificationState,
          contact.decisionState,
          contact.createdAt,
          contact.updatedAt,
        );
        return getContact(contact.id) as Contact;
      },
      getById: getContact,
      listByBusiness(businessId) {
        return (database
          .prepare("SELECT * FROM contacts WHERE business_id = ? ORDER BY id")
          .all(businessId) as ContactRow[]).map(mapContact);
      },
      updateStates(id, states) {
        const result = database.prepare(`
          UPDATE contacts
          SET evidence_state = ?, verification_state = ?, decision_state = ?, updated_at = ?
          WHERE id = ?
        `).run(
          states.evidenceState,
          states.verificationState,
          states.decisionState,
          states.updatedAt,
          id,
        );
        requireUpdate(result.changes);
        return getContact(id) as Contact;
      },
    },
    evidence: {
      create(evidence) {
        assertEvidenceSemantics(evidence);
        database.prepare(`
          INSERT INTO evidence
            (id, entity_type, entity_id, field_name, claimed_value, source, source_url,
             observed_at, fetched_at, confidence_basis_points, extraction_method,
             conflict_status, raw_reference_checksum, policy_version, evidence_state,
             verification_state, decision_state, verification_method, verified_at,
             created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          evidence.id,
          evidence.entityType,
          evidence.entityId,
          evidence.fieldName,
          evidence.claimedValue,
          evidence.source,
          evidence.sourceUrl,
          evidence.observedAt,
          evidence.fetchedAt,
          evidence.confidenceBasisPoints,
          evidence.extractionMethod,
          evidence.conflictStatus,
          evidence.rawReferenceChecksum,
          evidence.policyVersion,
          evidence.evidenceState,
          evidence.verificationState,
          evidence.decisionState,
          evidence.verificationMethod,
          evidence.verifiedAt,
          evidence.createdAt,
          evidence.updatedAt,
        );
        return getEvidence(evidence.id) as Evidence;
      },
      getById: getEvidence,
      listForEntity(entityType, entityId) {
        return (database
          .prepare("SELECT * FROM evidence WHERE entity_type = ? AND entity_id = ? ORDER BY id")
          .all(entityType, entityId) as EvidenceRow[]).map(mapEvidence);
      },
      updateStates(id, states) {
        const current = getEvidence(id);
        if (!current) throw new Error("Repository record was not found");
        assertEvidenceSemantics({ ...current, ...states });
        const result = database.prepare(`
          UPDATE evidence
          SET evidence_state = ?, verification_state = ?, decision_state = ?, conflict_status = ?,
              verification_method = ?, verified_at = ?, updated_at = ?
          WHERE id = ?
        `).run(
          states.evidenceState,
          states.verificationState,
          states.decisionState,
          states.conflictStatus,
          states.verificationMethod,
          states.verifiedAt,
          states.updatedAt,
          id,
        );
        requireUpdate(result.changes);
        return getEvidence(id) as Evidence;
      },
      addConflict(conflict) {
        return withTransaction(database, () => {
          database.prepare(`
            INSERT INTO evidence_conflicts
              (id, evidence_id, conflicting_evidence_id, status, reason_code, created_at, resolved_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            conflict.id,
            conflict.evidenceId,
            conflict.conflictingEvidenceId,
            conflict.status,
            conflict.reasonCode,
            conflict.createdAt,
            conflict.resolvedAt,
          );
          if (conflict.status !== "resolved") {
            database
              .prepare("UPDATE evidence SET evidence_state = 'conflicting', conflict_status = ?, updated_at = ? WHERE id = ?")
              .run(conflict.status, conflict.createdAt, conflict.evidenceId);
          }
          return mapConflict(
            database.prepare("SELECT * FROM evidence_conflicts WHERE id = ?").get(conflict.id) as ConflictRow,
          );
        });
      },
    },
    providerCalls: {
      create(providerCall) {
        database.prepare(`
          INSERT INTO provider_calls
            (id, run_id, task_id, provider, operation, state, estimated_cost_micro_usd,
             actual_cost_micro_usd, cache_hit, error_reason_code, started_at, finished_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          providerCall.id,
          providerCall.runId,
          providerCall.taskId,
          providerCall.provider,
          providerCall.operation,
          providerCall.state,
          providerCall.estimatedCostMicroUsd,
          providerCall.actualCostMicroUsd,
          providerCall.cacheHit ? 1 : 0,
          providerCall.errorReasonCode,
          providerCall.startedAt,
          providerCall.finishedAt,
        );
        return getProviderCall(providerCall.id) as ProviderCall;
      },
      getById: getProviderCall,
      updateResult(id, result) {
        const update = database.prepare(`
          UPDATE provider_calls
          SET state = ?, actual_cost_micro_usd = ?, error_reason_code = ?, finished_at = ?
          WHERE id = ?
        `).run(
          result.state,
          result.actualCostMicroUsd,
          result.errorReasonCode,
          result.finishedAt,
          id,
        );
        requireUpdate(update.changes);
        return getProviderCall(id) as ProviderCall;
      },
    },
    artifacts: {
      create(reference) {
        if (!path.isAbsolute(reference.externalPath)) {
          throw new Error("Artifact references must use absolute external paths");
        }
        const externalPath = path.resolve(reference.externalPath);
        if (!isPathInside(dataRoot, externalPath)) {
          throw new Error("Artifact references must remain inside the external data root");
        }
        database.prepare(`
          INSERT INTO artifact_references
            (id, run_id, evidence_id, kind, external_path, checksum, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          reference.id,
          reference.runId,
          reference.evidenceId,
          reference.kind,
          externalPath,
          reference.checksum,
          reference.createdAt,
        );
        return getArtifact(reference.id) as ArtifactReference;
      },
      getById: getArtifact,
      listByRun(runId) {
        return (database
          .prepare("SELECT * FROM artifact_references WHERE run_id = ? ORDER BY id")
          .all(runId) as ArtifactRow[]).map(mapArtifact);
      },
    },
    transaction(operation) {
      return withTransaction(database, () => operation(repositories));
    },
  };

  return repositories;
}
