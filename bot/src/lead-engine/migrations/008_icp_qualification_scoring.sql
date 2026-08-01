CREATE TABLE icp_qualification_evaluations (
  id TEXT PRIMARY KEY,
  run_id TEXT REFERENCES offline_orchestration_runs(run_id) ON DELETE SET NULL,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  assessment_id TEXT REFERENCES website_assessments(id) ON DELETE SET NULL,
  model_version TEXT NOT NULL CHECK (length(trim(model_version)) > 0),
  niche_id TEXT NOT NULL CHECK (niche_id = 'pool_service'),
  input_fingerprint TEXT NOT NULL CHECK (
    length(input_fingerprint) = 64 AND input_fingerprint NOT GLOB '*[^0-9a-fA-F]*'
  ),
  evaluated_at TEXT NOT NULL,
  fresh_until TEXT NOT NULL,
  icp_result TEXT NOT NULL CHECK (icp_result IN (
    'qualified', 'qualified_with_review', 'insufficient_evidence', 'disqualified',
    'identity_review_required', 'stale_evidence', 'not_evaluated'
  )),
  total_score INTEGER NOT NULL CHECK (total_score BETWEEN 0 AND 100),
  score_tier TEXT NOT NULL CHECK (score_tier IN (
    'high_priority', 'qualified', 'moderate', 'low'
  )),
  hard_disqualifiers_json TEXT NOT NULL CHECK (
    json_valid(hard_disqualifiers_json) AND json_type(hard_disqualifiers_json) = 'array'
  ),
  component_scores_json TEXT NOT NULL CHECK (
    json_valid(component_scores_json) AND json_type(component_scores_json) = 'array'
  ),
  positive_signals_json TEXT NOT NULL CHECK (
    json_valid(positive_signals_json) AND json_type(positive_signals_json) = 'array'
  ),
  negative_signals_json TEXT NOT NULL CHECK (
    json_valid(negative_signals_json) AND json_type(negative_signals_json) = 'array'
  ),
  missing_information_json TEXT NOT NULL CHECK (
    json_valid(missing_information_json) AND json_type(missing_information_json) = 'array'
  ),
  evidence_references_json TEXT NOT NULL CHECK (
    json_valid(evidence_references_json) AND json_type(evidence_references_json) = 'array'
  ),
  freshness_warnings_json TEXT NOT NULL CHECK (
    json_valid(freshness_warnings_json) AND json_type(freshness_warnings_json) = 'array'
  ),
  verification_limitations_json TEXT NOT NULL CHECK (
    json_valid(verification_limitations_json) AND json_type(verification_limitations_json) = 'array'
  ),
  identity_review_state TEXT NOT NULL CHECK (identity_review_state IN (
    'clear', 'required', 'resolved', 'unavailable'
  )),
  review_required INTEGER NOT NULL CHECK (review_required IN (0, 1)),
  review_reasons_json TEXT NOT NULL CHECK (
    json_valid(review_reasons_json) AND json_type(review_reasons_json) = 'array'
  ),
  confidence_json TEXT NOT NULL CHECK (
    json_valid(confidence_json) AND json_type(confidence_json) = 'object'
  ),
  evidence_quality_json TEXT NOT NULL CHECK (
    json_valid(evidence_quality_json) AND json_type(evidence_quality_json) = 'object'
  ),
  final_explanation TEXT NOT NULL CHECK (length(trim(final_explanation)) > 0),
  result_json TEXT NOT NULL CHECK (
    json_valid(result_json) AND json_type(result_json) = 'object'
  ),
  supersedes_evaluation_id TEXT REFERENCES icp_qualification_evaluations(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  UNIQUE (business_id, model_version, input_fingerprint),
  CHECK (supersedes_evaluation_id IS NULL OR supersedes_evaluation_id <> id),
  CHECK (
    (total_score BETWEEN 80 AND 100 AND score_tier = 'high_priority') OR
    (total_score BETWEEN 65 AND 79 AND score_tier = 'qualified') OR
    (total_score BETWEEN 50 AND 64 AND score_tier = 'moderate') OR
    (total_score BETWEEN 0 AND 49 AND score_tier = 'low')
  ),
  CHECK (icp_result <> 'qualified' OR total_score >= 65),
  CHECK (icp_result <> 'qualified_with_review' OR total_score BETWEEN 50 AND 64),
  CHECK (
    (icp_result = 'disqualified' AND json_array_length(hard_disqualifiers_json) > 0) OR
    (icp_result <> 'disqualified' AND json_array_length(hard_disqualifiers_json) = 0)
  ),
  CHECK (
    (icp_result = 'qualified' AND review_required = 0 AND json_array_length(review_reasons_json) = 0) OR
    (icp_result = 'disqualified' AND review_required = 0) OR
    (icp_result IN (
      'qualified_with_review', 'insufficient_evidence', 'identity_review_required',
      'stale_evidence', 'not_evaluated'
    ) AND review_required = 1 AND json_array_length(review_reasons_json) > 0)
  ),
  CHECK (
    icp_result <> 'identity_review_required' OR (
      identity_review_state = 'required' AND json_array_length(review_reasons_json) > 0
    )
  )
) STRICT;

CREATE TABLE icp_qualification_evidence_references (
  evaluation_id TEXT NOT NULL REFERENCES icp_qualification_evaluations(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  source_table TEXT NOT NULL CHECK (source_table IN (
    'businesses', 'business_locations', 'coverage_cells', 'website_assessments',
    'website_pages', 'structured_data_observations', 'service_evidence',
    'conversion_feature_observations', 'website_contact_observations',
    'person_evidence_candidates', 'contacts', 'evidence',
    'identity_decision_audits', 'website_identity_conflicts'
  )),
  source_id TEXT NOT NULL CHECK (length(trim(source_id)) > 0),
  source_class TEXT,
  claim_state TEXT,
  verification_dimension TEXT,
  freshness TEXT NOT NULL CHECK (freshness IN ('current', 'stale', 'unknown')),
  rule_ids_json TEXT NOT NULL CHECK (
    json_valid(rule_ids_json) AND json_type(rule_ids_json) = 'array'
  ),
  PRIMARY KEY (evaluation_id, ordinal),
  UNIQUE (evaluation_id, source_table, source_id)
) STRICT, WITHOUT ROWID;

CREATE INDEX idx_icp_qualification_business
ON icp_qualification_evaluations(business_id, evaluated_at, id);

CREATE INDEX idx_icp_qualification_freshness
ON icp_qualification_evaluations(fresh_until, icp_result);

CREATE INDEX idx_icp_qualification_reference_source
ON icp_qualification_evidence_references(source_table, source_id);

-- Rebuild durable-stage tables to add the versioned local qualification stage
-- without editing migration 007 or trusting incompatible old checkpoints.
CREATE TABLE offline_stage_checkpoints_v008 (
  run_id TEXT NOT NULL REFERENCES offline_orchestration_runs(run_id) ON DELETE CASCADE,
  stage_id TEXT NOT NULL CHECK (stage_id IN (
    'policy_validation', 'run_initialization', 'coverage_planning', 'query_generation',
    'provider_discovery', 'result_normalization', 'identity_resolution',
    'website_eligibility', 'website_crawl', 'extraction',
    'assessment_persistence', 'qualification_scoring', 'result_assembly', 'finalization'
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

INSERT INTO offline_stage_checkpoints_v008 SELECT * FROM offline_stage_checkpoints;

CREATE TABLE offline_execution_attempts_v008 (
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
    REFERENCES offline_stage_checkpoints_v008(run_id, stage_id) ON DELETE CASCADE,
  CHECK (status = 'running' OR completed_at IS NOT NULL),
  CHECK (
    status <> 'failed_retryable' OR (
      error_classification = 'transient' AND error_code IS NOT NULL
      AND retry_eligible = 1 AND retry_delay_ms IS NOT NULL AND next_retry_at IS NOT NULL
    )
  ),
  CHECK (retry_eligible = 0 OR status = 'failed_retryable')
) STRICT, WITHOUT ROWID;

INSERT INTO offline_execution_attempts_v008 SELECT * FROM offline_execution_attempts;

CREATE TABLE offline_recovery_events_v008 (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES offline_orchestration_runs(run_id) ON DELETE CASCADE,
  stage_id TEXT CHECK (stage_id IS NULL OR stage_id IN (
    'policy_validation', 'run_initialization', 'coverage_planning', 'query_generation',
    'provider_discovery', 'result_normalization', 'identity_resolution',
    'website_eligibility', 'website_crawl', 'extraction',
    'assessment_persistence', 'qualification_scoring', 'result_assembly', 'finalization'
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

INSERT INTO offline_recovery_events_v008 SELECT * FROM offline_recovery_events;

DROP TABLE offline_recovery_events;
DROP TABLE offline_execution_attempts;
DROP TABLE offline_stage_checkpoints;

ALTER TABLE offline_stage_checkpoints_v008 RENAME TO offline_stage_checkpoints;
ALTER TABLE offline_execution_attempts_v008 RENAME TO offline_execution_attempts;
ALTER TABLE offline_recovery_events_v008 RENAME TO offline_recovery_events;

CREATE INDEX idx_offline_checkpoints_status
ON offline_stage_checkpoints(status, next_retry_at);

CREATE INDEX idx_offline_attempts_run
ON offline_execution_attempts(run_id, stage_id, attempt_number);

CREATE INDEX idx_offline_recovery_run
ON offline_recovery_events(run_id, created_at);
