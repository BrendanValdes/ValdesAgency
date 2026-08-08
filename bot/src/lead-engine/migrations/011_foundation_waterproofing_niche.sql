PRAGMA defer_foreign_keys = ON;
PRAGMA legacy_alter_table = ON;

DROP TRIGGER contacts_person_quality_guard_insert;
DROP TRIGGER contacts_person_quality_guard_update;

ALTER TABLE businesses RENAME TO businesses_legacy_011;

CREATE TABLE businesses (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL CHECK (length(trim(canonical_name)) > 0),
  state TEXT NOT NULL CHECK (state IN ('unknown', 'found', 'stale', 'conflicting', 'rejected', 'human_review', 'accepted')),
  niche_id TEXT NOT NULL CHECK (niche_id IN ('pool_service', 'foundation_waterproofing', 'landscaping', 'hvac')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

INSERT INTO businesses SELECT * FROM businesses_legacy_011;
DROP TABLE businesses_legacy_011;

CREATE TRIGGER contacts_person_quality_guard_insert
BEFORE INSERT ON contacts
WHEN NEW.person_name IS NOT NULL AND (
  lower(trim(NEW.person_name)) IN ('unknown', 'n/a', 'n a', 'na', 'not available', 'owner', 'manager') OR
  instr(NEW.person_name, '@') > 0 OR
  (
    NEW.person_name GLOB '*[0-9]*' AND
    lower(NEW.person_name) NOT GLOB '*[a-z]*' AND
    length(replace(replace(replace(replace(replace(NEW.person_name, ' ', ''), '-', ''), '(', ''), ')', ''), '+', '')) >= 7
  ) OR
  lower(trim(NEW.person_name)) = lower(trim((SELECT canonical_name FROM businesses WHERE id = NEW.business_id)))
)
BEGIN
  SELECT RAISE(ABORT, 'contact identity violates person policy');
END;

CREATE TRIGGER contacts_person_quality_guard_update
BEFORE UPDATE OF person_name, business_id ON contacts
WHEN NEW.person_name IS NOT NULL AND (
  lower(trim(NEW.person_name)) IN ('unknown', 'n/a', 'n a', 'na', 'not available', 'owner', 'manager') OR
  instr(NEW.person_name, '@') > 0 OR
  (
    NEW.person_name GLOB '*[0-9]*' AND
    lower(NEW.person_name) NOT GLOB '*[a-z]*' AND
    length(replace(replace(replace(replace(replace(NEW.person_name, ' ', ''), '-', ''), '(', ''), ')', ''), '+', '')) >= 7
  ) OR
  lower(trim(NEW.person_name)) = lower(trim((SELECT canonical_name FROM businesses WHERE id = NEW.business_id)))
)
BEGIN
  SELECT RAISE(ABORT, 'contact identity violates person policy');
END;

ALTER TABLE icp_qualification_evaluations RENAME TO icp_qualification_evaluations_legacy_011;

CREATE TABLE icp_qualification_evaluations (
  id TEXT PRIMARY KEY,
  run_id TEXT REFERENCES offline_orchestration_runs(run_id) ON DELETE SET NULL,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  assessment_id TEXT REFERENCES website_assessments(id) ON DELETE SET NULL,
  model_version TEXT NOT NULL CHECK (length(trim(model_version)) > 0),
  niche_id TEXT NOT NULL CHECK (niche_id IN ('pool_service', 'foundation_waterproofing')),
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

INSERT INTO icp_qualification_evaluations SELECT * FROM icp_qualification_evaluations_legacy_011;
DROP TABLE icp_qualification_evaluations_legacy_011;

CREATE INDEX idx_icp_qualification_business
ON icp_qualification_evaluations(business_id, evaluated_at, id);

CREATE INDEX idx_icp_qualification_freshness
ON icp_qualification_evaluations(fresh_until, icp_result);

ALTER TABLE niche_configuration_versions RENAME TO niche_configuration_versions_legacy_011;

CREATE TABLE niche_configuration_versions (
  id TEXT PRIMARY KEY,
  niche_id TEXT NOT NULL CHECK (niche_id IN (
    'pool_service',
    'foundation_waterproofing',
    'septic_pumping_repair',
    'well_pump_water_treatment',
    'commercial_refrigeration_ice_machines',
    'automatic_gates_access_control',
    'mobile_truck_fleet_repair'
  )),
  configuration_version TEXT NOT NULL,
  configuration_hash TEXT NOT NULL CHECK (length(configuration_hash) = 64 AND configuration_hash NOT GLOB '*[^0-9a-fA-F]*'),
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  is_default INTEGER NOT NULL CHECK (is_default IN (0, 1)),
  created_at TEXT NOT NULL,
  UNIQUE (niche_id, configuration_version),
  UNIQUE (configuration_hash),
  CHECK (enabled = 0 OR niche_id IN ('pool_service', 'foundation_waterproofing')),
  CHECK (is_default = 0 OR (niche_id = 'pool_service' AND enabled = 1))
) STRICT;

INSERT INTO niche_configuration_versions
  (id, niche_id, configuration_version, configuration_hash, enabled, is_default, created_at)
SELECT id, niche_id, configuration_version, configuration_hash, enabled, is_default, created_at
FROM niche_configuration_versions_legacy_011;

DROP TABLE niche_configuration_versions_legacy_011;

CREATE UNIQUE INDEX idx_niche_configuration_single_default
ON niche_configuration_versions(is_default) WHERE is_default = 1;

PRAGMA legacy_alter_table = OFF;
