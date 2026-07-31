CREATE TABLE stage_tasks (
  id TEXT PRIMARY KEY,
  stage_id TEXT NOT NULL REFERENCES run_stages(id) ON DELETE CASCADE,
  business_id TEXT REFERENCES businesses(id) ON DELETE CASCADE,
  task_name TEXT NOT NULL CHECK (length(trim(task_name)) > 0),
  state TEXT NOT NULL CHECK (state IN ('not_checked', 'running', 'failed', 'human_review', 'accepted', 'rejected')),
  reason_code TEXT,
  attempt INTEGER NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (stage_id, task_name, business_id)
) STRICT;

CREATE TABLE evidence (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('business', 'person')),
  entity_id TEXT NOT NULL,
  field_name TEXT NOT NULL CHECK (length(trim(field_name)) > 0),
  claimed_value TEXT CHECK (claimed_value IS NULL OR length(trim(claimed_value)) > 0),
  source TEXT NOT NULL CHECK (length(trim(source)) > 0),
  source_url TEXT,
  observed_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  confidence_basis_points INTEGER NOT NULL CHECK (confidence_basis_points BETWEEN 0 AND 10000),
  extraction_method TEXT NOT NULL CHECK (length(trim(extraction_method)) > 0),
  conflict_status TEXT NOT NULL CHECK (conflict_status IN ('none', 'potential', 'confirmed', 'resolved')),
  raw_reference_checksum TEXT CHECK (raw_reference_checksum IS NULL OR (length(raw_reference_checksum) = 64 AND raw_reference_checksum NOT GLOB '*[^0-9a-fA-F]*')),
  policy_version TEXT NOT NULL,
  evidence_state TEXT NOT NULL CHECK (evidence_state IN ('unknown', 'not_checked', 'unavailable', 'failed', 'stale', 'conflicting', 'found')),
  verification_state TEXT NOT NULL CHECK (verification_state IN ('not_checked', 'syntactically_valid', 'source_confirmed', 'externally_verified')),
  decision_state TEXT NOT NULL CHECK (decision_state IN ('unknown', 'rejected', 'human_review', 'accepted')),
  verification_method TEXT,
  verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (claimed_value IS NOT NULL OR verification_state = 'not_checked'),
  CHECK (verification_state <> 'externally_verified' OR (verification_method IS NOT NULL AND verified_at IS NOT NULL)),
  CHECK (evidence_state <> 'conflicting' OR conflict_status <> 'none')
) STRICT;

CREATE TABLE evidence_conflicts (
  id TEXT PRIMARY KEY,
  evidence_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  conflicting_evidence_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('potential', 'confirmed', 'resolved')),
  reason_code TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  CHECK (evidence_id <> conflicting_evidence_id),
  UNIQUE (evidence_id, conflicting_evidence_id)
) STRICT;

CREATE TABLE provider_calls (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES lead_runs(id) ON DELETE CASCADE,
  task_id TEXT REFERENCES stage_tasks(id) ON DELETE SET NULL,
  provider TEXT NOT NULL CHECK (length(trim(provider)) > 0),
  operation TEXT NOT NULL CHECK (length(trim(operation)) > 0),
  state TEXT NOT NULL CHECK (state IN ('not_checked', 'running', 'failed', 'human_review', 'accepted', 'rejected')),
  estimated_cost_micro_usd INTEGER NOT NULL CHECK (estimated_cost_micro_usd >= 0),
  actual_cost_micro_usd INTEGER NOT NULL CHECK (actual_cost_micro_usd >= 0),
  cache_hit INTEGER NOT NULL CHECK (cache_hit IN (0, 1)),
  error_reason_code TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
) STRICT;

CREATE TABLE artifact_references (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES lead_runs(id) ON DELETE CASCADE,
  evidence_id TEXT REFERENCES evidence(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('evidence_blob', 'cache_entry', 'run_artifact')),
  external_path TEXT NOT NULL CHECK (length(trim(external_path)) > 0),
  checksum TEXT NOT NULL CHECK (length(checksum) = 64 AND checksum NOT GLOB '*[^0-9a-fA-F]*'),
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX idx_stage_tasks_stage_id ON stage_tasks(stage_id);
CREATE INDEX idx_stage_tasks_business_id ON stage_tasks(business_id);
CREATE INDEX idx_evidence_entity ON evidence(entity_type, entity_id, field_name);
CREATE INDEX idx_evidence_conflicts_evidence_id ON evidence_conflicts(evidence_id);
CREATE INDEX idx_provider_calls_run_id ON provider_calls(run_id);
CREATE INDEX idx_provider_calls_task_id ON provider_calls(task_id);
CREATE INDEX idx_artifact_references_run_id ON artifact_references(run_id);
CREATE INDEX idx_artifact_references_evidence_id ON artifact_references(evidence_id);
