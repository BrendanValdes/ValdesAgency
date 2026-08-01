import type { SqliteDatabase } from "../../db/database.js";
import {
  OFFLINE_DURABLE_STAGE_VERSIONS,
  OFFLINE_TERMINAL_RUN_STATES,
  type OfflineCheckpointReference,
  type OfflineDurableStage,
  type OfflineRecoveryDecision,
  type OfflineRunState,
} from "./types.js";

interface RecoveryRunRow {
  run_id: string;
  execution_state: OfflineRunState;
  next_retry_at: string | null;
  result_json: string | null;
}

interface RecoveryCheckpointRow {
  stage_id: OfflineDurableStage;
  status: string;
  stage_version: string;
  references_json: string;
}

const RECOVERY_REFERENCES: Readonly<Record<string, ReadonlySet<string>>> = {
  lead_runs: new Set(["id"]),
  run_stages: new Set(["id"]),
  stage_tasks: new Set(["id"]),
  niche_configuration_versions: new Set(["id"]),
  coverage_manifests: new Set(["id"]),
  coverage_cells: new Set(["coverage_key"]),
  discovery_queries: new Set(["id"]),
  provider_calls: new Set(["id"]),
  discovery_observations: new Set(["id"]),
  businesses: new Set(["id"]),
  business_identifiers: new Set(["id"]),
  business_locations: new Set(["id"]),
  identity_candidates: new Set(["id"]),
  identity_conflicts: new Set(["id"]),
  identity_decision_audits: new Set(["id"]),
  website_assessments: new Set(["id"]),
  website_fetches: new Set(["id"]),
  website_pages: new Set(["id"]),
  evidence: new Set(["id"]),
  contacts: new Set(["id"]),
  website_contact_observations: new Set(["id"]),
  person_evidence_candidates: new Set(["id"]),
  service_evidence: new Set(["id"]),
  conversion_feature_observations: new Set(["id"]),
  icp_qualification_evaluations: new Set(["id"]),
};

function firstCheckpointProblem(
  database: SqliteDatabase,
  runId: string,
  checkpoints: ReadonlyArray<RecoveryCheckpointRow>,
): OfflineRecoveryDecision | null {
  for (const checkpoint of checkpoints) {
    if (checkpoint.status === "completed" && checkpoint.stage_version !== OFFLINE_DURABLE_STAGE_VERSIONS[checkpoint.stage_id]) {
      return {
        runId,
        decision: "requires_manual_intervention",
        reasonCode: "incompatible_stage_version",
        stageId: checkpoint.stage_id,
        details: {
          persistedVersion: checkpoint.stage_version,
          currentVersion: OFFLINE_DURABLE_STAGE_VERSIONS[checkpoint.stage_id],
        },
      };
    }
    if (checkpoint.status !== "completed") continue;
    const references = JSON.parse(checkpoint.references_json) as OfflineCheckpointReference[];
    for (const reference of references) {
      const columns = RECOVERY_REFERENCES[reference.table];
      if (!columns?.has(reference.column)) {
        return {
          runId,
          decision: "requires_manual_intervention",
          reasonCode: "checkpoint_reference_unsupported",
          stageId: checkpoint.stage_id,
          details: { table: reference.table, column: reference.column },
        };
      }
      const found = database.prepare(
        `SELECT 1 AS found FROM ${reference.table} WHERE ${reference.column} = ? LIMIT 1`,
      ).get(reference.id) as { found: 1 } | undefined;
      if (!found) {
        return {
          runId,
          decision: "requires_manual_intervention",
          reasonCode: "checkpoint_reference_missing",
          stageId: checkpoint.stage_id,
          details: { table: reference.table, column: reference.column, id: reference.id },
        };
      }
    }
  }
  return null;
}

export function scanOfflineRunRecovery(
  database: SqliteDatabase,
  now: string,
): OfflineRecoveryDecision[] {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs) || new Date(nowMs).toISOString() !== now) {
    throw new Error("Recovery scan time must be a canonical ISO timestamp");
  }
  const runs = database.prepare(`
    SELECT run_id, execution_state, next_retry_at, result_json
    FROM offline_orchestration_runs ORDER BY run_id
  `).all() as RecoveryRunRow[];
  return runs.map((run): OfflineRecoveryDecision => {
    const checkpoints = database.prepare(`
      SELECT stage_id, status, stage_version, references_json
      FROM offline_stage_checkpoints WHERE run_id = ? ORDER BY created_at, stage_id
    `).all(run.run_id) as RecoveryCheckpointRow[];
    const activeLease = database.prepare(`
      SELECT id, worker_id, generation, expires_at
      FROM offline_worker_leases
      WHERE run_id = ? AND scope = 'run' AND state = 'active'
    `).get(run.run_id) as {
      id: string;
      worker_id: string;
      generation: number;
      expires_at: string;
    } | undefined;

    const checkpointProblem = firstCheckpointProblem(database, run.run_id, checkpoints);
    if (checkpointProblem) return checkpointProblem;

    if (OFFLINE_TERMINAL_RUN_STATES.has(run.execution_state)) {
      if (activeLease) {
        return {
          runId: run.run_id,
          decision: "requires_reconciliation",
          reasonCode: "terminal_run_has_active_lease",
          stageId: null,
          details: { leaseId: activeLease.id, generation: activeLease.generation },
        };
      }
      const activeCheckpoint = checkpoints.find(({ status }) => ["running", "waiting_retry"].includes(status));
      if (activeCheckpoint) {
        return {
          runId: run.run_id,
          decision: "requires_reconciliation",
          reasonCode: "terminal_run_has_active_checkpoint",
          stageId: activeCheckpoint.stage_id,
          details: { checkpointStatus: activeCheckpoint.status },
        };
      }
      return {
        runId: run.run_id,
        decision: "leave_unchanged",
        reasonCode: "terminal_run_stable",
        stageId: null,
        details: { state: run.execution_state },
      };
    }

    if (run.result_json) {
      return {
        runId: run.run_id,
        decision: "eligible_to_finalize",
        reasonCode: "result_persisted_before_terminal_state",
        stageId: "finalization",
        details: { state: run.execution_state },
      };
    }

    if (run.execution_state === "waiting_retry") {
      if (!run.next_retry_at) {
        return {
          runId: run.run_id,
          decision: "requires_reconciliation",
          reasonCode: "waiting_retry_missing_schedule",
          stageId: checkpoints.find(({ status }) => status === "waiting_retry")?.stage_id ?? null,
          details: {},
        };
      }
      return Date.parse(run.next_retry_at) <= nowMs ? {
        runId: run.run_id,
        decision: "eligible_to_retry",
        reasonCode: "retry_due",
        stageId: checkpoints.find(({ status }) => status === "waiting_retry")?.stage_id ?? null,
        details: { nextRetryAt: run.next_retry_at },
      } : {
        runId: run.run_id,
        decision: "leave_unchanged",
        reasonCode: "retry_not_due",
        stageId: checkpoints.find(({ status }) => status === "waiting_retry")?.stage_id ?? null,
        details: { nextRetryAt: run.next_retry_at },
      };
    }

    if (!activeLease || Date.parse(activeLease.expires_at) <= nowMs) {
      return {
        runId: run.run_id,
        decision: "eligible_to_reclaim",
        reasonCode: activeLease ? "worker_lease_expired" : "active_run_without_lease",
        stageId: checkpoints.find(({ status }) => status === "running")?.stage_id ?? null,
        details: activeLease ? {
          leaseId: activeLease.id,
          workerId: activeLease.worker_id,
          generation: activeLease.generation,
          expiresAt: activeLease.expires_at,
        } : {},
      };
    }

    return {
      runId: run.run_id,
      decision: "leave_unchanged",
      reasonCode: "active_worker_lease_valid",
      stageId: checkpoints.find(({ status }) => status === "running")?.stage_id ?? null,
      details: { leaseId: activeLease.id, expiresAt: activeLease.expires_at },
    };
  });
}
