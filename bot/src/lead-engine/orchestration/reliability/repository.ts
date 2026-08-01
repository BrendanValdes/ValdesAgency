import type { SqliteDatabase } from "../../db/database.js";
import { withTransaction } from "../../db/transaction.js";
import {
  OfflineLeaseLostError,
  OfflineLeaseUnavailableError,
  OfflineRetryNotReadyError,
} from "./errors.js";
import { assertOfflineRunTransition, legacyStatusFor } from "./state-machine.js";
import type {
  OfflineCheckpointReference,
  OfflineDurableStage,
  OfflineErrorClassification,
  OfflineLease,
  OfflineLeaseCredentials,
  OfflineRetryClassification,
  OfflineRunState,
  OfflineStageCheckpoint,
} from "./types.js";
import { OFFLINE_TERMINAL_RUN_STATES } from "./types.js";

interface OfflineRunExecutionRow {
  run_id: string;
  run_key: string;
  input_hash: string;
  status: string;
  execution_state: OfflineRunState;
  next_retry_at: string | null;
  terminal_reason_code: string | null;
  safe_error_summary: string | null;
  result_json: string | null;
  usage_json: string;
  started_at: string;
  completed_at: string | null;
  updated_at: string;
  recovery_generation: number;
  state_version: number;
}

interface CheckpointRow {
  run_id: string;
  stage_id: OfflineDurableStage;
  status: OfflineStageCheckpoint["status"];
  attempt_number: number;
  started_at: string | null;
  completed_at: string | null;
  input_fingerprint: string;
  output_fingerprint: string | null;
  output_json: string | null;
  references_json: string;
  error_classification: OfflineErrorClassification | null;
  error_code: string | null;
  safe_error_summary: string | null;
  retry_eligible: 0 | 1;
  next_retry_at: string | null;
  worker_id: string | null;
  lease_token_hash: string | null;
  lease_generation: number | null;
  budget_consumed_json: string;
  stage_version: string;
  orchestration_version: string;
  created_at: string;
  updated_at: string;
}

interface LeaseRow {
  id: string;
  run_id: string;
  scope: "run";
  worker_id: string;
  lease_token_hash: string;
  generation: number;
  state: OfflineLease["state"];
  acquired_at: string;
  heartbeat_at: string;
  expires_at: string;
  released_at: string | null;
  superseded_at: string | null;
  superseded_by_lease_id: string | null;
}

const REFERENCE_COLUMNS: Readonly<Record<string, ReadonlySet<string>>> = {
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

function requireIso(name: string, value: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) {
    throw new Error(`${name} must be a canonical ISO timestamp`);
  }
  return timestamp;
}

function mapLease(row: LeaseRow): OfflineLease {
  return {
    id: row.id,
    runId: row.run_id,
    scope: row.scope,
    workerId: row.worker_id,
    tokenHash: row.lease_token_hash,
    generation: row.generation,
    state: row.state,
    acquiredAt: row.acquired_at,
    heartbeatAt: row.heartbeat_at,
    expiresAt: row.expires_at,
    releasedAt: row.released_at,
    supersededAt: row.superseded_at,
    supersededByLeaseId: row.superseded_by_lease_id,
  };
}

function mapCheckpoint<T extends object>(row: CheckpointRow): OfflineStageCheckpoint<T> {
  return {
    runId: row.run_id,
    stageId: row.stage_id,
    status: row.status,
    attemptNumber: row.attempt_number,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    inputFingerprint: row.input_fingerprint,
    outputFingerprint: row.output_fingerprint,
    output: row.output_json ? JSON.parse(row.output_json) as T : null,
    references: JSON.parse(row.references_json) as OfflineCheckpointReference[],
    errorClassification: row.error_classification,
    errorCode: row.error_code,
    safeErrorSummary: row.safe_error_summary,
    retryEligible: row.retry_eligible === 1,
    nextRetryAt: row.next_retry_at,
    workerId: row.worker_id,
    leaseTokenHash: row.lease_token_hash,
    leaseGeneration: row.lease_generation,
    budgetConsumed: JSON.parse(row.budget_consumed_json) as Record<string, number>,
    stageVersion: row.stage_version,
    orchestrationVersion: row.orchestration_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function usageJson(usage: Readonly<Record<string, number>>): string {
  for (const [name, value] of Object.entries(usage)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`Offline budget usage ${name} must be a nonnegative safe integer`);
    }
  }
  return JSON.stringify(usage);
}

export class OfflineReliabilityRepository {
  readonly #database: SqliteDatabase;
  readonly #clock: { now(): string };
  readonly #ids: { id(prefix: string, value: unknown): string; hash(value: unknown): string };

  constructor(input: {
    database: SqliteDatabase;
    clock: { now(): string };
    ids: { id(prefix: string, value: unknown): string; hash(value: unknown): string };
  }) {
    this.#database = input.database;
    this.#clock = input.clock;
    this.#ids = input.ids;
  }

  getRun(runId: string): OfflineRunExecutionRow | null {
    return this.#database.prepare(`
      SELECT run_id, run_key, input_hash, status, execution_state, next_retry_at,
             terminal_reason_code, safe_error_summary, result_json, usage_json,
             started_at, completed_at, updated_at, recovery_generation, state_version
      FROM offline_orchestration_runs WHERE run_id = ?
    `).get(runId) as OfflineRunExecutionRow | undefined ?? null;
  }

  getRunByKey(runKey: string): OfflineRunExecutionRow | null {
    return this.#database.prepare(`
      SELECT run_id, run_key, input_hash, status, execution_state, next_retry_at,
             terminal_reason_code, safe_error_summary, result_json, usage_json,
             started_at, completed_at, updated_at, recovery_generation, state_version
      FROM offline_orchestration_runs WHERE run_key = ?
    `).get(runKey) as OfflineRunExecutionRow | undefined ?? null;
  }

  transitionRun(input: {
    runId: string;
    to: OfflineRunState;
    reasonCode: string;
    nextRetryAt?: string | null;
    terminalReasonCode?: string | null;
    safeErrorSummary?: string | null;
    completedAt?: string | null;
  }): void {
    const at = this.#clock.now();
    requireIso("Transition time", at);
    withTransaction(this.#database, () => {
      const current = this.getRun(input.runId);
      if (!current) throw new Error("Offline run was not found");
      assertOfflineRunTransition(current.execution_state, input.to);
      const nextRetryAt = input.nextRetryAt ?? null;
      if (input.to === "waiting_retry") {
        if (!nextRetryAt) throw new Error("Waiting retry requires a next retry timestamp");
        requireIso("Next retry time", nextRetryAt);
      } else if (nextRetryAt !== null) {
        throw new Error("Only waiting-retry runs may retain a next retry timestamp");
      }
      const terminal = [
        "review_required", "completed", "cancelled", "failed_terminal", "manual_intervention",
      ].includes(input.to);
      const completedAt = terminal ? (input.completedAt ?? at) : null;
      const terminalReason = input.terminalReasonCode ?? null;
      const safeSummary = input.safeErrorSummary ?? null;
      if (["failed_terminal", "manual_intervention"].includes(input.to) && (!terminalReason || !safeSummary)) {
        throw new Error("Terminal failures require a structured reason and safe summary");
      }
      const updated = this.#database.prepare(`
        UPDATE offline_orchestration_runs
        SET execution_state = ?, status = ?, next_retry_at = ?, terminal_reason_code = ?,
            safe_error_summary = ?, completed_at = ?, updated_at = ?,
            state_version = state_version + 1, last_transition_reason = ?, last_transition_at = ?
        WHERE run_id = ? AND state_version = ?
      `).run(
        input.to,
        legacyStatusFor(input.to, terminalReason),
        nextRetryAt,
        terminalReason,
        safeSummary,
        completedAt,
        at,
        input.reasonCode,
        at,
        input.runId,
        current.state_version,
      );
      if (updated.changes !== 1) throw new Error("Offline run changed during state transition");
    });
  }

  updateUsage(runId: string, usage: Readonly<Record<string, number>>): void {
    const updated = this.#database.prepare(`
      UPDATE offline_orchestration_runs SET usage_json = ?, updated_at = ? WHERE run_id = ?
    `).run(usageJson(usage), this.#clock.now(), runId);
    if (updated.changes !== 1) throw new Error("Offline run was not found");
  }

  updateRunningStageBudget(input: {
    runId: string;
    stage: OfflineDurableStage;
    lease: OfflineLeaseCredentials;
    budgetConsumed: Readonly<Record<string, number>>;
  }): void {
    withTransaction(this.#database, () => {
      this.assertCurrentLease(input.runId, input.lease);
      const runUpdated = this.#database.prepare(`
        UPDATE offline_orchestration_runs SET usage_json = ?, updated_at = ? WHERE run_id = ?
      `).run(usageJson(input.budgetConsumed), this.#clock.now(), input.runId);
      if (runUpdated.changes !== 1) throw new Error("Offline run was not found");
      const checkpoint = this.getCheckpoint(input.runId, input.stage);
      if (!checkpoint || checkpoint.status !== "running") return;
      const attempt = this.#database.prepare(`
        SELECT budget_delta_json FROM offline_execution_attempts
        WHERE run_id = ? AND stage_id = ? AND attempt_number = ? AND status = 'running'
      `).get(input.runId, input.stage, checkpoint.attemptNumber) as { budget_delta_json: string } | undefined;
      if (!attempt) throw new Error("Running stage attempt was not found");
      const previousTotal = checkpoint.budgetConsumed;
      const previousDelta = JSON.parse(attempt.budget_delta_json) as Record<string, number>;
      const nextDelta: Record<string, number> = { ...previousDelta };
      for (const [name, value] of Object.entries(input.budgetConsumed)) {
        const increment = Math.max(0, value - (previousTotal[name] ?? 0));
        nextDelta[name] = (nextDelta[name] ?? 0) + increment;
      }
      const at = this.#clock.now();
      this.#database.prepare(`
        UPDATE offline_stage_checkpoints SET budget_consumed_json = ?, updated_at = ?
        WHERE run_id = ? AND stage_id = ? AND status = 'running'
          AND lease_token_hash = ? AND lease_generation = ?
      `).run(
        usageJson(input.budgetConsumed), at, input.runId, input.stage,
        input.lease.tokenHash, input.lease.generation,
      );
      this.#database.prepare(`
        UPDATE offline_execution_attempts SET budget_delta_json = ?, updated_at = ?
        WHERE run_id = ? AND stage_id = ? AND attempt_number = ? AND status = 'running'
      `).run(
        usageJson(nextDelta), at, input.runId, input.stage, checkpoint.attemptNumber,
      );
    });
  }

  getActiveLease(runId: string): OfflineLease | null {
    const row = this.#database.prepare(`
      SELECT * FROM offline_worker_leases WHERE run_id = ? AND scope = 'run' AND state = 'active'
    `).get(runId) as LeaseRow | undefined;
    return row ? mapLease(row) : null;
  }

  acquireLease(input: {
    runId: string;
    workerId: string;
    token: string;
    durationMs: number;
  }): OfflineLeaseCredentials {
    if (!input.workerId.trim() || !input.token.trim()) throw new Error("Worker and lease token are required");
    if (!Number.isInteger(input.durationMs) || input.durationMs < 1_000 || input.durationMs > 3_600_000) {
      throw new Error("Offline lease duration must be between 1000 and 3600000 ms");
    }
    const now = this.#clock.now();
    const nowMs = requireIso("Lease acquisition time", now);
    const expiresAt = new Date(nowMs + input.durationMs).toISOString();
    return withTransaction(this.#database, () => {
      const run = this.getRun(input.runId);
      if (!run) throw new Error("Offline run was not found");
      if (OFFLINE_TERMINAL_RUN_STATES.has(run.execution_state)) {
        throw new Error("Terminal offline runs cannot acquire worker leases");
      }
      const active = this.getActiveLease(input.runId);
      if (active && Date.parse(active.expiresAt) > nowMs) {
        throw new OfflineLeaseUnavailableError(input.runId, active.expiresAt);
      }
      const generation = (this.#database.prepare(`
        SELECT COALESCE(MAX(generation), 0) AS generation
        FROM offline_worker_leases WHERE run_id = ? AND scope = 'run'
      `).get(input.runId) as { generation: number }).generation + 1;
      const tokenHash = this.#ids.hash({ runId: input.runId, token: input.token });
      const leaseId = this.#ids.id("offline_lease", {
        runId: input.runId,
        generation,
        workerId: input.workerId,
        tokenHash,
      });
      if (active) {
        const superseded = this.#database.prepare(`
          UPDATE offline_worker_leases
          SET state = 'superseded', superseded_at = ?
          WHERE id = ? AND state = 'active' AND expires_at <= ?
        `).run(now, active.id, now);
        if (superseded.changes !== 1) {
          throw new OfflineLeaseUnavailableError(input.runId, active.expiresAt);
        }
      }
      this.#database.prepare(`
        INSERT INTO offline_worker_leases
          (id, run_id, scope, worker_id, lease_token_hash, generation, state,
           acquired_at, heartbeat_at, expires_at, released_at, superseded_at, superseded_by_lease_id)
        VALUES (?, ?, 'run', ?, ?, ?, 'active', ?, ?, ?, NULL, NULL, NULL)
      `).run(leaseId, input.runId, input.workerId, tokenHash, generation, now, now, expiresAt);
      if (active) {
        this.#database.prepare(`
          UPDATE offline_worker_leases SET superseded_by_lease_id = ? WHERE id = ?
        `).run(leaseId, active.id);
      }
      this.#database.prepare(`
        UPDATE offline_orchestration_runs
        SET recovery_generation = MAX(recovery_generation, ?), updated_at = ? WHERE run_id = ?
      `).run(generation, now, input.runId);
      this.audit({
        runId: input.runId,
        action: active ? "lease_reclaimed" : "lease_acquired",
        priorLeaseId: active?.id ?? null,
        leaseId,
        workerId: input.workerId,
        generation,
        details: { expiresAt },
      });
      return { leaseId, token: input.token, tokenHash, generation, workerId: input.workerId };
    });
  }

  assertCurrentLease(runId: string, lease: OfflineLeaseCredentials): OfflineLease {
    const now = this.#clock.now();
    const row = this.#database.prepare(`
      SELECT * FROM offline_worker_leases
      WHERE id = ? AND run_id = ? AND scope = 'run' AND worker_id = ?
        AND lease_token_hash = ? AND generation = ? AND state = 'active' AND expires_at > ?
    `).get(
      lease.leaseId,
      runId,
      lease.workerId,
      lease.tokenHash,
      lease.generation,
      now,
    ) as LeaseRow | undefined;
    if (!row) throw new OfflineLeaseLostError(runId);
    return mapLease(row);
  }

  heartbeatLease(runId: string, lease: OfflineLeaseCredentials, durationMs: number): OfflineLease {
    const now = this.#clock.now();
    const nowMs = requireIso("Lease heartbeat time", now);
    if (!Number.isInteger(durationMs) || durationMs < 1_000 || durationMs > 3_600_000) {
      throw new Error("Offline lease duration must be between 1000 and 3600000 ms");
    }
    const expiresAt = new Date(nowMs + durationMs).toISOString();
    return withTransaction(this.#database, () => {
      const updated = this.#database.prepare(`
        UPDATE offline_worker_leases
        SET heartbeat_at = ?, expires_at = ?
        WHERE id = ? AND run_id = ? AND worker_id = ? AND lease_token_hash = ?
          AND generation = ? AND state = 'active' AND expires_at > ?
      `).run(
        now, expiresAt, lease.leaseId, runId, lease.workerId,
        lease.tokenHash, lease.generation, now,
      );
      if (updated.changes !== 1) throw new OfflineLeaseLostError(runId);
      this.audit({
        runId, action: "lease_heartbeat", leaseId: lease.leaseId,
        workerId: lease.workerId, generation: lease.generation, details: { expiresAt },
      });
      return this.assertCurrentLease(runId, lease);
    });
  }

  releaseLease(runId: string, lease: OfflineLeaseCredentials): void {
    const now = this.#clock.now();
    const updated = this.#database.prepare(`
      UPDATE offline_worker_leases
      SET state = 'released', released_at = ?
      WHERE id = ? AND run_id = ? AND worker_id = ? AND lease_token_hash = ?
        AND generation = ? AND state = 'active' AND expires_at > ?
    `).run(now, lease.leaseId, runId, lease.workerId, lease.tokenHash, lease.generation, now);
    if (updated.changes !== 1) throw new OfflineLeaseLostError(runId);
    this.audit({
      runId, action: "lease_released", leaseId: lease.leaseId,
      workerId: lease.workerId, generation: lease.generation, details: {},
    });
  }

  cancelLease(runId: string, lease: OfflineLeaseCredentials): void {
    const now = this.#clock.now();
    const updated = this.#database.prepare(`
      UPDATE offline_worker_leases
      SET state = 'cancelled', released_at = ?
      WHERE id = ? AND run_id = ? AND worker_id = ? AND lease_token_hash = ?
        AND generation = ? AND state = 'active'
    `).run(now, lease.leaseId, runId, lease.workerId, lease.tokenHash, lease.generation);
    if (updated.changes !== 1) throw new OfflineLeaseLostError(runId);
    this.audit({
      runId, action: "lease_cancelled", leaseId: lease.leaseId,
      workerId: lease.workerId, generation: lease.generation, details: {},
    });
  }

  getCheckpoint<T extends object>(runId: string, stage: OfflineDurableStage): OfflineStageCheckpoint<T> | null {
    const row = this.#database.prepare(`
      SELECT * FROM offline_stage_checkpoints WHERE run_id = ? AND stage_id = ?
    `).get(runId, stage) as CheckpointRow | undefined;
    return row ? mapCheckpoint<T>(row) : null;
  }

  beginStage(input: {
    runId: string;
    stage: OfflineDurableStage;
    inputFingerprint: string;
    stageVersion: string;
    orchestrationVersion: string;
    lease: OfflineLeaseCredentials;
    budgetConsumed: Readonly<Record<string, number>>;
  }): OfflineStageCheckpoint<object> {
    const at = this.#clock.now();
    return withTransaction(this.#database, () => {
      this.assertCurrentLease(input.runId, input.lease);
      const current = this.getCheckpoint(input.runId, input.stage);
      if (current?.status === "completed") return current;
      if (current?.status === "waiting_retry" && current.nextRetryAt && current.nextRetryAt > at) {
        throw new OfflineRetryNotReadyError(input.runId, current.nextRetryAt);
      }
      if (current && (current.inputFingerprint !== input.inputFingerprint || current.stageVersion !== input.stageVersion)) {
        throw new Error("Incomplete checkpoint is incompatible with the current stage input or version");
      }
      if (current?.status === "running" && current.attemptNumber > 0) {
        const interrupted = this.#database.prepare(`
          UPDATE offline_execution_attempts
          SET status = 'interrupted', completed_at = ?, error_classification = 'lease_lost',
              error_code = 'worker_interrupted', safe_error_summary = 'Worker stopped before the stage committed',
              retry_eligible = 0, updated_at = ?
          WHERE run_id = ? AND stage_id = ? AND attempt_number = ? AND status = 'running'
        `).run(at, at, input.runId, input.stage, current.attemptNumber);
        if (interrupted.changes !== 1) throw new Error("Interrupted stage attempt was not found");
      }
      const attempt = (current?.attemptNumber ?? 0) + 1;
      this.#database.prepare(`
        INSERT INTO offline_stage_checkpoints
          (run_id, stage_id, status, attempt_number, started_at, completed_at,
           input_fingerprint, output_fingerprint, output_json, references_json,
           error_classification, error_code, safe_error_summary, retry_eligible, next_retry_at,
           worker_id, lease_token_hash, lease_generation, budget_consumed_json,
           stage_version, orchestration_version, created_at, updated_at)
        VALUES (?, ?, 'running', ?, ?, NULL, ?, NULL, NULL, '[]', NULL, NULL, NULL, 0, NULL,
          ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(run_id, stage_id) DO UPDATE SET
          status = 'running', attempt_number = excluded.attempt_number,
          started_at = excluded.started_at, completed_at = NULL,
          error_classification = NULL, error_code = NULL, safe_error_summary = NULL,
          retry_eligible = 0, next_retry_at = NULL, worker_id = excluded.worker_id,
          lease_token_hash = excluded.lease_token_hash, lease_generation = excluded.lease_generation,
          budget_consumed_json = excluded.budget_consumed_json, updated_at = excluded.updated_at
      `).run(
        input.runId, input.stage, attempt, at, input.inputFingerprint,
        input.lease.workerId, input.lease.tokenHash, input.lease.generation,
        usageJson(input.budgetConsumed), input.stageVersion, input.orchestrationVersion, at, at,
      );
      this.#database.prepare(`
        INSERT INTO offline_execution_attempts
          (run_id, stage_id, attempt_number, status, worker_id, lease_token_hash,
           lease_generation, started_at, completed_at, error_classification, error_code,
           safe_error_summary, retry_eligible, retry_delay_ms, next_retry_at,
           budget_delta_json, created_at, updated_at)
        VALUES (?, ?, ?, 'running', ?, ?, ?, ?, NULL, NULL, NULL, NULL, 0, NULL, NULL, '{}', ?, ?)
      `).run(
        input.runId, input.stage, attempt, input.lease.workerId, input.lease.tokenHash,
        input.lease.generation, at, at, at,
      );
      if (attempt > 1) {
        this.audit({
          runId: input.runId, stageId: input.stage, action: "retry_started",
          leaseId: input.lease.leaseId, workerId: input.lease.workerId,
          generation: input.lease.generation, details: { attemptNumber: attempt },
        });
      }
      return this.getCheckpoint(input.runId, input.stage) as OfflineStageCheckpoint<object>;
    });
  }

  updateStageProgress(input: {
    runId: string;
    stage: OfflineDurableStage;
    lease: OfflineLeaseCredentials;
    output: object;
    outputFingerprint: string;
    references: ReadonlyArray<OfflineCheckpointReference>;
    budgetConsumed: Readonly<Record<string, number>>;
  }): void {
    this.assertCurrentLease(input.runId, input.lease);
    const updated = this.#database.prepare(`
      UPDATE offline_stage_checkpoints
      SET output_fingerprint = ?, output_json = ?, references_json = ?,
          budget_consumed_json = ?, updated_at = ?
      WHERE run_id = ? AND stage_id = ? AND status = 'running'
        AND lease_token_hash = ? AND lease_generation = ?
    `).run(
      input.outputFingerprint, JSON.stringify(input.output), JSON.stringify(input.references),
      usageJson(input.budgetConsumed), this.#clock.now(), input.runId, input.stage,
      input.lease.tokenHash, input.lease.generation,
    );
    if (updated.changes !== 1) throw new OfflineLeaseLostError(input.runId);
  }

  completeStage(input: {
    runId: string;
    stage: OfflineDurableStage;
    lease: OfflineLeaseCredentials;
    output: object;
    outputFingerprint: string;
    references: ReadonlyArray<OfflineCheckpointReference>;
    budgetConsumed: Readonly<Record<string, number>>;
    budgetDelta: Readonly<Record<string, number>>;
  }): OfflineStageCheckpoint {
    const at = this.#clock.now();
    return withTransaction(this.#database, () => {
      this.assertCurrentLease(input.runId, input.lease);
      const checkpoint = this.getCheckpoint(input.runId, input.stage);
      if (!checkpoint || checkpoint.status !== "running") throw new Error("Stage attempt is not running");
      const updated = this.#database.prepare(`
        UPDATE offline_stage_checkpoints
        SET status = 'completed', completed_at = ?, output_fingerprint = ?, output_json = ?,
            references_json = ?, error_classification = NULL, error_code = NULL,
            safe_error_summary = NULL, retry_eligible = 0, next_retry_at = NULL,
            budget_consumed_json = ?, updated_at = ?
        WHERE run_id = ? AND stage_id = ? AND status = 'running'
          AND lease_token_hash = ? AND lease_generation = ?
      `).run(
        at, input.outputFingerprint, JSON.stringify(input.output), JSON.stringify(input.references),
        usageJson(input.budgetConsumed), at, input.runId, input.stage,
        input.lease.tokenHash, input.lease.generation,
      );
      if (updated.changes !== 1) throw new OfflineLeaseLostError(input.runId);
      const attempt = this.#database.prepare(`
        UPDATE offline_execution_attempts
        SET status = 'completed', completed_at = ?, budget_delta_json = ?, updated_at = ?
        WHERE run_id = ? AND stage_id = ? AND attempt_number = ? AND status = 'running'
      `).run(
        at, usageJson(input.budgetDelta), at, input.runId, input.stage, checkpoint.attemptNumber,
      );
      if (attempt.changes !== 1) throw new Error("Running stage attempt was not found");
      return this.getCheckpoint(input.runId, input.stage) as OfflineStageCheckpoint;
    });
  }

  failStage(input: {
    runId: string;
    stage: OfflineDurableStage;
    lease: OfflineLeaseCredentials;
    classification: OfflineRetryClassification;
    status: "waiting_retry" | "failed_terminal" | "manual_intervention" | "cancelled";
    nextRetryAt: string | null;
    retryDelayMs: number | null;
    budgetConsumed: Readonly<Record<string, number>>;
    budgetDelta: Readonly<Record<string, number>>;
  }): OfflineStageCheckpoint {
    const at = this.#clock.now();
    return withTransaction(this.#database, () => {
      this.assertCurrentLease(input.runId, input.lease);
      const checkpoint = this.getCheckpoint(input.runId, input.stage);
      if (!checkpoint || checkpoint.status !== "running") throw new Error("Stage attempt is not running");
      const retry = input.status === "waiting_retry";
      const updated = this.#database.prepare(`
        UPDATE offline_stage_checkpoints
        SET status = ?, completed_at = ?, error_classification = ?, error_code = ?,
            safe_error_summary = ?, retry_eligible = ?, next_retry_at = ?,
            budget_consumed_json = ?, updated_at = ?
        WHERE run_id = ? AND stage_id = ? AND status = 'running'
          AND lease_token_hash = ? AND lease_generation = ?
      `).run(
        input.status, at, input.classification.classification, input.classification.safeErrorCode,
        input.classification.safeSummary, retry ? 1 : 0, input.nextRetryAt,
        usageJson(input.budgetConsumed), at, input.runId, input.stage,
        input.lease.tokenHash, input.lease.generation,
      );
      if (updated.changes !== 1) throw new OfflineLeaseLostError(input.runId);
      const attemptStatus = retry ? "failed_retryable" : input.status === "cancelled"
        ? "cancelled" : input.status === "manual_intervention" ? "manual_intervention" : "failed_terminal";
      const attempt = this.#database.prepare(`
        UPDATE offline_execution_attempts
        SET status = ?, completed_at = ?, error_classification = ?, error_code = ?,
            safe_error_summary = ?, retry_eligible = ?, retry_delay_ms = ?, next_retry_at = ?,
            budget_delta_json = ?, updated_at = ?
        WHERE run_id = ? AND stage_id = ? AND attempt_number = ? AND status = 'running'
      `).run(
        attemptStatus, at, input.classification.classification, input.classification.safeErrorCode,
        input.classification.safeSummary, retry ? 1 : 0, input.retryDelayMs, input.nextRetryAt,
        usageJson(input.budgetDelta), at, input.runId, input.stage, checkpoint.attemptNumber,
      );
      if (attempt.changes !== 1) throw new Error("Running stage attempt was not found");
      return this.getCheckpoint(input.runId, input.stage) as OfflineStageCheckpoint;
    });
  }

  validateCompletedCheckpoint(input: {
    checkpoint: OfflineStageCheckpoint<object>;
    inputFingerprint: string;
    stageVersion: string;
    orchestrationVersion: string;
  }): { reusable: true } | { reusable: false; reasonCode: string; summary: string } {
    const checkpoint = input.checkpoint;
    if (checkpoint.status !== "completed") {
      return { reusable: false, reasonCode: "checkpoint_not_completed", summary: "Checkpoint is not completed" };
    }
    if (checkpoint.stageVersion !== input.stageVersion) {
      return { reusable: false, reasonCode: "incompatible_stage_version", summary: "Checkpoint stage version is incompatible" };
    }
    if (checkpoint.orchestrationVersion !== input.orchestrationVersion) {
      return { reusable: false, reasonCode: "incompatible_orchestration_version", summary: "Checkpoint orchestration version is incompatible" };
    }
    if (checkpoint.inputFingerprint !== input.inputFingerprint) {
      return { reusable: false, reasonCode: "checkpoint_input_mismatch", summary: "Checkpoint input fingerprint no longer matches" };
    }
    if (!checkpoint.output || !checkpoint.outputFingerprint || this.#ids.hash(checkpoint.output) !== checkpoint.outputFingerprint) {
      return { reusable: false, reasonCode: "checkpoint_output_corrupt", summary: "Checkpoint output fingerprint is invalid" };
    }
    for (const reference of checkpoint.references) {
      const columns = REFERENCE_COLUMNS[reference.table];
      if (!columns?.has(reference.column)) {
        return { reusable: false, reasonCode: "checkpoint_reference_unsupported", summary: "Checkpoint reference is not allowlisted" };
      }
      const found = this.#database.prepare(
        `SELECT 1 AS found FROM ${reference.table} WHERE ${reference.column} = ? LIMIT 1`,
      ).get(reference.id) as { found: 1 } | undefined;
      if (!found) {
        return { reusable: false, reasonCode: "checkpoint_reference_missing", summary: "Checkpoint references missing persisted records" };
      }
    }
    return { reusable: true };
  }

  recordCheckpointReuse(runId: string, stage: OfflineDurableStage, lease: OfflineLeaseCredentials): void {
    this.assertCurrentLease(runId, lease);
    this.audit({
      runId, stageId: stage, action: "checkpoint_reused", leaseId: lease.leaseId,
      workerId: lease.workerId, generation: lease.generation, details: {},
    });
  }

  recordManualIntervention(input: {
    runId: string;
    stage: OfflineDurableStage | null;
    reasonCode: string;
    safeSummary: string;
    details?: Readonly<Record<string, unknown>>;
  }): void {
    const at = this.#clock.now();
    const id = this.#ids.id("offline_manual_intervention", {
      runId: input.runId, stage: input.stage, reasonCode: input.reasonCode,
    });
    this.#database.prepare(`
      INSERT OR IGNORE INTO offline_manual_interventions
        (id, run_id, stage_id, reason_code, safe_summary, details_json, created_at, resolved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
    `).run(
      id, input.runId, input.stage, input.reasonCode, input.safeSummary,
      JSON.stringify(input.details ?? {}), at,
    );
    this.audit({
      runId: input.runId, stageId: input.stage, action: "manual_intervention",
      details: { reasonCode: input.reasonCode },
    });
  }

  audit(input: {
    runId: string;
    stageId?: OfflineDurableStage | null;
    action:
      | "lease_acquired" | "lease_heartbeat" | "lease_released" | "lease_reclaimed"
      | "lease_cancelled" | "run_recovered" | "retry_scheduled" | "retry_started"
      | "checkpoint_reused" | "checkpoint_reconciled" | "finalized_from_result"
      | "manual_intervention" | "cancellation_recorded";
    priorLeaseId?: string | null;
    leaseId?: string | null;
    workerId?: string | null;
    generation?: number | null;
    details: Readonly<Record<string, unknown>>;
  }): void {
    const at = this.#clock.now();
    const id = this.#ids.id("offline_recovery_event", {
      runId: input.runId,
      stageId: input.stageId ?? null,
      action: input.action,
      priorLeaseId: input.priorLeaseId ?? null,
      leaseId: input.leaseId ?? null,
      generation: input.generation ?? null,
      at,
      details: input.details,
    });
    this.#database.prepare(`
      INSERT OR IGNORE INTO offline_recovery_events
        (id, run_id, stage_id, action, prior_lease_id, lease_id, worker_id,
         generation, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, input.runId, input.stageId ?? null, input.action,
      input.priorLeaseId ?? null, input.leaseId ?? null, input.workerId ?? null,
      input.generation ?? null, JSON.stringify(input.details), at,
    );
  }
}
