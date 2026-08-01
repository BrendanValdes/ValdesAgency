ALTER TABLE offline_orchestration_runs ADD COLUMN execution_state TEXT NOT NULL DEFAULT 'pending'
CHECK (execution_state IN (
  'pending', 'running', 'waiting_retry', 'recovering', 'review_required',
  'completed', 'cancelled', 'failed_terminal', 'manual_intervention'
));

ALTER TABLE offline_orchestration_runs ADD COLUMN next_retry_at TEXT;
ALTER TABLE offline_orchestration_runs ADD COLUMN terminal_reason_code TEXT;
ALTER TABLE offline_orchestration_runs ADD COLUMN safe_error_summary TEXT;
ALTER TABLE offline_orchestration_runs ADD COLUMN recovery_generation INTEGER NOT NULL DEFAULT 0
CHECK (recovery_generation >= 0);
ALTER TABLE offline_orchestration_runs ADD COLUMN state_version INTEGER NOT NULL DEFAULT 0
CHECK (state_version >= 0);
ALTER TABLE offline_orchestration_runs ADD COLUMN last_transition_reason TEXT;
ALTER TABLE offline_orchestration_runs ADD COLUMN last_transition_at TEXT;

UPDATE offline_orchestration_runs
SET execution_state = CASE status
      WHEN 'completed' THEN 'completed'
      WHEN 'review_required' THEN 'review_required'
      WHEN 'cancelled' THEN 'cancelled'
      WHEN 'failed' THEN 'failed_terminal'
      WHEN 'budget_blocked' THEN 'failed_terminal'
      ELSE 'running'
    END,
    terminal_reason_code = CASE
      WHEN status IN ('failed', 'budget_blocked') THEN COALESCE(denial_reason, 'legacy_terminal_failure')
      ELSE NULL
    END,
    safe_error_summary = CASE
      WHEN status IN ('failed', 'budget_blocked') THEN COALESCE(denial_reason, 'Legacy terminal failure')
      ELSE NULL
    END,
    last_transition_reason = 'migration_007_state_mapping',
    last_transition_at = updated_at;

CREATE TABLE offline_run_state_transitions (
  run_id TEXT NOT NULL REFERENCES offline_orchestration_runs(run_id) ON DELETE CASCADE,
  state_version INTEGER NOT NULL CHECK (state_version > 0),
  from_state TEXT NOT NULL CHECK (from_state IN (
    'pending', 'running', 'waiting_retry', 'recovering', 'review_required',
    'completed', 'cancelled', 'failed_terminal', 'manual_intervention'
  )),
  to_state TEXT NOT NULL CHECK (to_state IN (
    'pending', 'running', 'waiting_retry', 'recovering', 'review_required',
    'completed', 'cancelled', 'failed_terminal', 'manual_intervention'
  )),
  reason_code TEXT NOT NULL CHECK (length(trim(reason_code)) > 0),
  transitioned_at TEXT NOT NULL,
  PRIMARY KEY (run_id, state_version),
  CHECK (from_state <> to_state)
) STRICT, WITHOUT ROWID;

CREATE TABLE offline_stage_checkpoints (
  run_id TEXT NOT NULL REFERENCES offline_orchestration_runs(run_id) ON DELETE CASCADE,
  stage_id TEXT NOT NULL CHECK (stage_id IN (
    'policy_validation', 'run_initialization', 'coverage_planning', 'query_generation',
    'provider_discovery', 'result_normalization', 'identity_resolution',
    'website_eligibility', 'website_crawl', 'extraction',
    'assessment_persistence', 'result_assembly', 'finalization'
  )),
  status TEXT NOT NULL CHECK (status IN (
    'pending', 'running', 'waiting_retry', 'completed', 'cancelled',
    'failed_terminal', 'manual_intervention'
  )),
  attempt_number INTEGER NOT NULL DEFAULT 0 CHECK (attempt_number >= 0),
  started_at TEXT,
  completed_at TEXT,
  input_fingerprint TEXT NOT NULL CHECK (
    length(input_fingerprint) = 64 AND input_fingerprint NOT GLOB '*[^0-9a-fA-F]*'
  ),
  output_fingerprint TEXT CHECK (
    output_fingerprint IS NULL OR (
      length(output_fingerprint) = 64 AND output_fingerprint NOT GLOB '*[^0-9a-fA-F]*'
    )
  ),
  output_json TEXT CHECK (
    output_json IS NULL OR (json_valid(output_json) AND json_type(output_json) = 'object')
  ),
  references_json TEXT NOT NULL DEFAULT '[]' CHECK (
    json_valid(references_json) AND json_type(references_json) = 'array'
  ),
  error_classification TEXT CHECK (error_classification IS NULL OR error_classification IN (
    'transient', 'deterministic', 'policy', 'cancellation', 'budget',
    'lease_lost', 'invariant', 'schema', 'manual_intervention'
  )),
  error_code TEXT,
  safe_error_summary TEXT,
  retry_eligible INTEGER NOT NULL DEFAULT 0 CHECK (retry_eligible IN (0, 1)),
  next_retry_at TEXT,
  worker_id TEXT,
  lease_token_hash TEXT CHECK (
    lease_token_hash IS NULL OR (
      length(lease_token_hash) = 64 AND lease_token_hash NOT GLOB '*[^0-9a-fA-F]*'
    )
  ),
  lease_generation INTEGER CHECK (lease_generation IS NULL OR lease_generation > 0),
  budget_consumed_json TEXT NOT NULL CHECK (
    json_valid(budget_consumed_json) AND json_type(budget_consumed_json) = 'object'
  ),
  stage_version TEXT NOT NULL CHECK (length(trim(stage_version)) > 0),
  orchestration_version TEXT NOT NULL CHECK (length(trim(orchestration_version)) > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (run_id, stage_id),
  CHECK (
    status <> 'completed' OR (
      attempt_number > 0 AND started_at IS NOT NULL AND completed_at IS NOT NULL
      AND output_fingerprint IS NOT NULL AND output_json IS NOT NULL
      AND error_classification IS NULL AND error_code IS NULL
      AND retry_eligible = 0 AND next_retry_at IS NULL
    )
  ),
  CHECK (
    status <> 'waiting_retry' OR (
      attempt_number > 0 AND started_at IS NOT NULL AND completed_at IS NOT NULL
      AND error_classification = 'transient' AND error_code IS NOT NULL
      AND safe_error_summary IS NOT NULL AND retry_eligible = 1 AND next_retry_at IS NOT NULL
    )
  ),
  CHECK (retry_eligible = 0 OR status = 'waiting_retry'),
  CHECK ((lease_token_hash IS NULL) = (lease_generation IS NULL))
) STRICT, WITHOUT ROWID;

CREATE TABLE offline_execution_attempts (
  run_id TEXT NOT NULL,
  stage_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  status TEXT NOT NULL CHECK (status IN (
    'running', 'completed', 'failed_retryable', 'failed_terminal',
    'cancelled', 'manual_intervention', 'interrupted'
  )),
  worker_id TEXT NOT NULL CHECK (length(trim(worker_id)) > 0),
  lease_token_hash TEXT NOT NULL CHECK (
    length(lease_token_hash) = 64 AND lease_token_hash NOT GLOB '*[^0-9a-fA-F]*'
  ),
  lease_generation INTEGER NOT NULL CHECK (lease_generation > 0),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  error_classification TEXT CHECK (error_classification IS NULL OR error_classification IN (
    'transient', 'deterministic', 'policy', 'cancellation', 'budget',
    'lease_lost', 'invariant', 'schema', 'manual_intervention'
  )),
  error_code TEXT,
  safe_error_summary TEXT,
  retry_eligible INTEGER NOT NULL DEFAULT 0 CHECK (retry_eligible IN (0, 1)),
  retry_delay_ms INTEGER CHECK (retry_delay_ms IS NULL OR retry_delay_ms BETWEEN 0 AND 86400000),
  next_retry_at TEXT,
  budget_delta_json TEXT NOT NULL CHECK (
    json_valid(budget_delta_json) AND json_type(budget_delta_json) = 'object'
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (run_id, stage_id, attempt_number),
  FOREIGN KEY (run_id, stage_id)
    REFERENCES offline_stage_checkpoints(run_id, stage_id) ON DELETE CASCADE,
  CHECK (status = 'running' OR completed_at IS NOT NULL),
  CHECK (
    status <> 'failed_retryable' OR (
      error_classification = 'transient' AND error_code IS NOT NULL
      AND retry_eligible = 1 AND retry_delay_ms IS NOT NULL AND next_retry_at IS NOT NULL
    )
  ),
  CHECK (retry_eligible = 0 OR status = 'failed_retryable')
) STRICT, WITHOUT ROWID;

CREATE TABLE offline_worker_leases (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES offline_orchestration_runs(run_id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope = 'run'),
  worker_id TEXT NOT NULL CHECK (length(trim(worker_id)) > 0),
  lease_token_hash TEXT NOT NULL CHECK (
    length(lease_token_hash) = 64 AND lease_token_hash NOT GLOB '*[^0-9a-fA-F]*'
  ),
  generation INTEGER NOT NULL CHECK (generation > 0),
  state TEXT NOT NULL CHECK (state IN ('active', 'released', 'superseded', 'cancelled')),
  acquired_at TEXT NOT NULL,
  heartbeat_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  released_at TEXT,
  superseded_at TEXT,
  superseded_by_lease_id TEXT REFERENCES offline_worker_leases(id),
  CHECK (expires_at > acquired_at),
  CHECK (heartbeat_at >= acquired_at),
  CHECK (state <> 'released' OR released_at IS NOT NULL),
  CHECK (state <> 'superseded' OR superseded_at IS NOT NULL),
  CHECK (state <> 'cancelled' OR released_at IS NOT NULL),
  UNIQUE (run_id, scope, generation)
) STRICT;

CREATE UNIQUE INDEX idx_offline_worker_active_scope
ON offline_worker_leases(run_id, scope) WHERE state = 'active';

CREATE INDEX idx_offline_worker_lease_expiry
ON offline_worker_leases(state, expires_at);

CREATE TABLE offline_recovery_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES offline_orchestration_runs(run_id) ON DELETE CASCADE,
  stage_id TEXT CHECK (stage_id IS NULL OR stage_id IN (
    'policy_validation', 'run_initialization', 'coverage_planning', 'query_generation',
    'provider_discovery', 'result_normalization', 'identity_resolution',
    'website_eligibility', 'website_crawl', 'extraction',
    'assessment_persistence', 'result_assembly', 'finalization'
  )),
  action TEXT NOT NULL CHECK (action IN (
    'lease_acquired', 'lease_heartbeat', 'lease_released', 'lease_reclaimed',
    'lease_cancelled', 'run_recovered', 'retry_scheduled', 'retry_started',
    'checkpoint_reused', 'checkpoint_reconciled', 'finalized_from_result',
    'manual_intervention', 'cancellation_recorded'
  )),
  prior_lease_id TEXT REFERENCES offline_worker_leases(id),
  lease_id TEXT REFERENCES offline_worker_leases(id),
  worker_id TEXT,
  generation INTEGER CHECK (generation IS NULL OR generation > 0),
  details_json TEXT NOT NULL CHECK (
    json_valid(details_json) AND json_type(details_json) = 'object'
  ),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE offline_manual_interventions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES offline_orchestration_runs(run_id) ON DELETE CASCADE,
  stage_id TEXT,
  reason_code TEXT NOT NULL CHECK (length(trim(reason_code)) > 0),
  safe_summary TEXT NOT NULL CHECK (length(trim(safe_summary)) > 0),
  details_json TEXT NOT NULL CHECK (
    json_valid(details_json) AND json_type(details_json) = 'object'
  ),
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  UNIQUE (run_id, stage_id, reason_code)
) STRICT;

CREATE INDEX idx_offline_checkpoints_status
ON offline_stage_checkpoints(status, next_retry_at);

CREATE INDEX idx_offline_attempts_run
ON offline_execution_attempts(run_id, stage_id, attempt_number);

CREATE INDEX idx_offline_recovery_run
ON offline_recovery_events(run_id, created_at);

CREATE TRIGGER offline_run_state_transition_guard
BEFORE UPDATE OF execution_state ON offline_orchestration_runs
WHEN NEW.execution_state <> OLD.execution_state AND NOT (
  (OLD.execution_state = 'pending' AND NEW.execution_state IN (
    'running', 'cancelled', 'failed_terminal', 'manual_intervention'
  )) OR
  (OLD.execution_state = 'running' AND NEW.execution_state IN (
    'waiting_retry', 'recovering', 'review_required', 'completed',
    'cancelled', 'failed_terminal', 'manual_intervention'
  )) OR
  (OLD.execution_state = 'waiting_retry' AND NEW.execution_state IN (
    'running', 'recovering', 'cancelled', 'failed_terminal', 'manual_intervention'
  )) OR
  (OLD.execution_state = 'recovering' AND NEW.execution_state IN (
    'running', 'waiting_retry', 'review_required', 'completed',
    'cancelled', 'failed_terminal', 'manual_intervention'
  ))
)
BEGIN
  SELECT RAISE(ABORT, 'invalid offline run state transition');
END;

CREATE TRIGGER offline_run_state_metadata_guard
BEFORE UPDATE OF execution_state ON offline_orchestration_runs
WHEN NEW.execution_state <> OLD.execution_state AND (
  NEW.state_version <> OLD.state_version + 1 OR
  NEW.last_transition_reason IS NULL OR length(trim(NEW.last_transition_reason)) = 0 OR
  NEW.last_transition_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'offline run transition metadata is required');
END;

CREATE TRIGGER offline_run_state_consistency_insert
BEFORE INSERT ON offline_orchestration_runs
WHEN NOT (
  (NEW.execution_state IN ('pending', 'running', 'waiting_retry', 'recovering') AND NEW.status = 'running') OR
  (NEW.execution_state = 'review_required' AND NEW.status = 'review_required') OR
  (NEW.execution_state = 'completed' AND NEW.status = 'completed') OR
  (NEW.execution_state = 'cancelled' AND NEW.status = 'cancelled') OR
  (NEW.execution_state = 'failed_terminal' AND NEW.status IN ('failed', 'budget_blocked')) OR
  (NEW.execution_state = 'manual_intervention' AND NEW.status = 'failed')
)
BEGIN
  SELECT RAISE(ABORT, 'offline run execution state and legacy status disagree');
END;

CREATE TRIGGER offline_run_state_consistency_update
BEFORE UPDATE ON offline_orchestration_runs
WHEN NOT (
  (NEW.execution_state IN ('pending', 'running', 'waiting_retry', 'recovering') AND NEW.status = 'running') OR
  (NEW.execution_state = 'review_required' AND NEW.status = 'review_required') OR
  (NEW.execution_state = 'completed' AND NEW.status = 'completed') OR
  (NEW.execution_state = 'cancelled' AND NEW.status = 'cancelled') OR
  (NEW.execution_state = 'failed_terminal' AND NEW.status IN ('failed', 'budget_blocked')) OR
  (NEW.execution_state = 'manual_intervention' AND NEW.status = 'failed')
)
BEGIN
  SELECT RAISE(ABORT, 'offline run execution state and legacy status disagree');
END;

CREATE TRIGGER offline_run_retry_consistency_insert
BEFORE INSERT ON offline_orchestration_runs
WHEN (NEW.execution_state = 'waiting_retry') <> (NEW.next_retry_at IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'waiting retry requires exactly one next retry timestamp');
END;

CREATE TRIGGER offline_run_retry_consistency_update
BEFORE UPDATE ON offline_orchestration_runs
WHEN (NEW.execution_state = 'waiting_retry') <> (NEW.next_retry_at IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'waiting retry requires exactly one next retry timestamp');
END;

CREATE TRIGGER offline_run_terminal_consistency_insert
BEFORE INSERT ON offline_orchestration_runs
WHEN (
  NEW.execution_state IN ('review_required', 'completed', 'cancelled', 'failed_terminal', 'manual_intervention')
  AND NEW.completed_at IS NULL
) OR (
  NEW.execution_state IN ('failed_terminal', 'manual_intervention')
  AND (NEW.terminal_reason_code IS NULL OR NEW.safe_error_summary IS NULL)
)
BEGIN
  SELECT RAISE(ABORT, 'terminal offline run metadata is incomplete');
END;

CREATE TRIGGER offline_run_terminal_consistency_update
BEFORE UPDATE ON offline_orchestration_runs
WHEN (
  NEW.execution_state IN ('review_required', 'completed', 'cancelled', 'failed_terminal', 'manual_intervention')
  AND NEW.completed_at IS NULL
) OR (
  NEW.execution_state IN ('failed_terminal', 'manual_intervention')
  AND (NEW.terminal_reason_code IS NULL OR NEW.safe_error_summary IS NULL)
)
BEGIN
  SELECT RAISE(ABORT, 'terminal offline run metadata is incomplete');
END;

CREATE TRIGGER offline_run_state_transition_audit
AFTER UPDATE OF execution_state ON offline_orchestration_runs
WHEN NEW.execution_state <> OLD.execution_state
BEGIN
  INSERT INTO offline_run_state_transitions
    (run_id, state_version, from_state, to_state, reason_code, transitioned_at)
  VALUES (
    NEW.run_id, NEW.state_version, OLD.execution_state, NEW.execution_state,
    NEW.last_transition_reason, NEW.last_transition_at
  );
END;
