CREATE TABLE offline_orchestration_runs (
  run_id TEXT PRIMARY KEY REFERENCES lead_runs(id) ON DELETE CASCADE,
  run_key TEXT NOT NULL UNIQUE CHECK (length(trim(run_key)) > 0),
  input_hash TEXT NOT NULL CHECK (
    length(input_hash) = 64 AND input_hash NOT GLOB '*[^0-9a-fA-F]*'
  ),
  execution_mode TEXT NOT NULL CHECK (execution_mode = 'offline_synthetic'),
  status TEXT NOT NULL CHECK (status IN (
    'running', 'completed', 'review_required', 'cancelled', 'budget_blocked', 'failed'
  )),
  niche_id TEXT NOT NULL CHECK (niche_id = 'pool_service'),
  provider_id TEXT NOT NULL CHECK (length(trim(provider_id)) > 0),
  fixture_id TEXT NOT NULL CHECK (length(trim(fixture_id)) > 0),
  fixture_url TEXT NOT NULL CHECK (length(trim(fixture_url)) > 0),
  policy_version TEXT NOT NULL CHECK (length(trim(policy_version)) > 0),
  orchestration_version TEXT NOT NULL CHECK (length(trim(orchestration_version)) > 0),
  extraction_version TEXT NOT NULL CHECK (length(trim(extraction_version)) > 0),
  budget_json TEXT NOT NULL CHECK (
    json_valid(budget_json) AND json_type(budget_json) = 'object'
  ),
  usage_json TEXT NOT NULL CHECK (
    json_valid(usage_json) AND json_type(usage_json) = 'object'
  ),
  review_required INTEGER NOT NULL DEFAULT 0 CHECK (review_required IN (0, 1)),
  assessment_attachment TEXT NOT NULL DEFAULT 'not_assessed' CHECK (
    assessment_attachment IN ('not_assessed', 'new_candidate', 'safe_match', 'isolated_candidate')
  ),
  denial_reason TEXT,
  result_json TEXT CHECK (
    result_json IS NULL OR (json_valid(result_json) AND json_type(result_json) = 'object')
  ),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  CHECK (
    status = 'running' OR completed_at IS NOT NULL
  ),
  CHECK (
    status IN ('running', 'failed') OR result_json IS NOT NULL
  )
) STRICT;

CREATE TABLE offline_orchestration_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES offline_orchestration_runs(run_id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (length(trim(stage)) > 0),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'started', 'completed', 'review_required', 'cancelled', 'budget_blocked', 'failed'
  )),
  payload_json TEXT NOT NULL CHECK (
    json_valid(payload_json) AND json_type(payload_json) = 'object'
  ),
  created_at TEXT NOT NULL,
  UNIQUE (run_id, stage, event_type)
) STRICT;

CREATE INDEX idx_offline_orchestration_status
ON offline_orchestration_runs(status, updated_at);

CREATE INDEX idx_offline_orchestration_events_run
ON offline_orchestration_events(run_id, created_at);
