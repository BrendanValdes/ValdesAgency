CREATE TABLE lead_queue_snapshots (
  id TEXT PRIMARY KEY,
  queue_version TEXT NOT NULL CHECK (length(trim(queue_version)) > 0),
  ranking_model_version TEXT NOT NULL CHECK (length(trim(ranking_model_version)) > 0),
  qualification_model_version TEXT NOT NULL CHECK (length(trim(qualification_model_version)) > 0),
  freshness_policy_version TEXT NOT NULL CHECK (length(trim(freshness_policy_version)) > 0),
  generated_at TEXT NOT NULL,
  scope_json TEXT NOT NULL CHECK (json_valid(scope_json) AND json_type(scope_json) = 'object'),
  constraints_json TEXT NOT NULL CHECK (json_valid(constraints_json) AND json_type(constraints_json) = 'object'),
  request_fingerprint TEXT NOT NULL CHECK (
    length(request_fingerprint) = 64 AND request_fingerprint NOT GLOB '*[^0-9a-fA-F]*'
  ),
  source_fingerprint TEXT NOT NULL CHECK (
    length(source_fingerprint) = 64 AND source_fingerprint NOT GLOB '*[^0-9a-fA-F]*'
  ),
  status TEXT NOT NULL CHECK (status IN ('building', 'complete', 'cancelled', 'failed')),
  result_json TEXT CHECK (result_json IS NULL OR (json_valid(result_json) AND json_type(result_json) = 'object')),
  warning_json TEXT NOT NULL CHECK (json_valid(warning_json) AND json_type(warning_json) = 'array'),
  created_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE (queue_version, ranking_model_version, freshness_policy_version, request_fingerprint, source_fingerprint),
  CHECK ((status = 'complete') = (result_json IS NOT NULL AND completed_at IS NOT NULL))
) STRICT;

CREATE TABLE lead_queue_generation_attempts (
  snapshot_id TEXT NOT NULL REFERENCES lead_queue_snapshots(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  status TEXT NOT NULL CHECK (status IN ('running', 'complete', 'cancelled', 'failed')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  error_code TEXT,
  safe_error_summary TEXT,
  PRIMARY KEY (snapshot_id, attempt_number),
  CHECK (status = 'running' OR completed_at IS NOT NULL)
) STRICT, WITHOUT ROWID;

CREATE TABLE lead_queue_entries (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES lead_queue_snapshots(id) ON DELETE CASCADE,
  source_business_id TEXT NOT NULL REFERENCES businesses(id),
  canonical_business_id TEXT NOT NULL REFERENCES businesses(id),
  evaluation_id TEXT NOT NULL REFERENCES icp_qualification_evaluations(id),
  position INTEGER CHECK (position IS NULL OR position > 0),
  disposition TEXT NOT NULL CHECK (disposition IN (
    'callable', 'review_required', 'insufficient_evidence', 'stale', 'disqualified',
    'suppressed', 'duplicate_excluded', 'not_eligible'
  )),
  priority_score INTEGER NOT NULL CHECK (priority_score BETWEEN 0 AND 1000),
  priority_band TEXT NOT NULL CHECK (priority_band IN ('top', 'high', 'standard', 'low')),
  qualification_score INTEGER NOT NULL CHECK (qualification_score BETWEEN 0 AND 100),
  qualification_result TEXT NOT NULL CHECK (qualification_result IN (
    'qualified', 'qualified_with_review', 'insufficient_evidence', 'disqualified',
    'identity_review_required', 'stale_evidence', 'not_evaluated'
  )),
  freshness_state TEXT NOT NULL CHECK (freshness_state IN ('fresh', 'aging', 'stale', 'expired', 'missing_timestamp')),
  identity_state TEXT NOT NULL CHECK (identity_state IN ('clear', 'review_required', 'safe_duplicate', 'duplicate_excluded')),
  component_scores_json TEXT NOT NULL CHECK (json_valid(component_scores_json) AND json_type(component_scores_json) = 'array'),
  reason_codes_json TEXT NOT NULL CHECK (json_valid(reason_codes_json) AND json_type(reason_codes_json) = 'array'),
  explanation TEXT NOT NULL CHECK (length(trim(explanation)) > 0),
  result_json TEXT NOT NULL CHECK (json_valid(result_json) AND json_type(result_json) = 'object'),
  created_at TEXT NOT NULL,
  UNIQUE (snapshot_id, evaluation_id),
  CHECK ((disposition = 'callable') = (position IS NOT NULL)),
  CHECK ((qualification_result = 'disqualified') = (disposition = 'disqualified')),
  CHECK (disposition <> 'callable' OR freshness_state IN ('fresh', 'aging')),
  CHECK (identity_state <> 'review_required' OR disposition IN ('review_required', 'not_eligible')),
  CHECK (identity_state <> 'duplicate_excluded' OR disposition = 'duplicate_excluded')
) STRICT;

CREATE TABLE lead_queue_entry_reasons (
  entry_id TEXT NOT NULL REFERENCES lead_queue_entries(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  reason_code TEXT NOT NULL CHECK (length(trim(reason_code)) > 0),
  detail TEXT NOT NULL CHECK (length(trim(detail)) > 0),
  PRIMARY KEY (entry_id, ordinal)
) STRICT, WITHOUT ROWID;

CREATE TABLE lead_queue_evidence_references (
  entry_id TEXT NOT NULL REFERENCES lead_queue_entries(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  evaluation_id TEXT NOT NULL REFERENCES icp_qualification_evaluations(id),
  rule_id TEXT NOT NULL CHECK (length(trim(rule_id)) > 0),
  source_table TEXT NOT NULL CHECK (source_table = 'icp_qualification_evaluations'),
  source_id TEXT NOT NULL,
  PRIMARY KEY (entry_id, ordinal),
  CHECK (evaluation_id = source_id)
) STRICT, WITHOUT ROWID;

CREATE UNIQUE INDEX idx_lead_queue_callable_position
ON lead_queue_entries(snapshot_id, position) WHERE disposition = 'callable';

CREATE UNIQUE INDEX idx_lead_queue_callable_business
ON lead_queue_entries(snapshot_id, canonical_business_id) WHERE disposition = 'callable';

CREATE INDEX idx_lead_queue_snapshot_status
ON lead_queue_snapshots(status, generated_at, id);

CREATE INDEX idx_lead_queue_entry_disposition
ON lead_queue_entries(snapshot_id, disposition, priority_score);
