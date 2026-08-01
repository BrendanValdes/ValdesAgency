CREATE TABLE niche_configuration_versions (
  id TEXT PRIMARY KEY,
  niche_id TEXT NOT NULL CHECK (niche_id IN (
    'pool_service',
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
  CHECK (enabled = 0 OR niche_id = 'pool_service'),
  CHECK (is_default = 0 OR (niche_id = 'pool_service' AND enabled = 1))
) STRICT;

CREATE UNIQUE INDEX idx_niche_configuration_single_default
ON niche_configuration_versions(is_default) WHERE is_default = 1;

CREATE TABLE coverage_manifests (
  id TEXT PRIMARY KEY,
  niche_configuration_id TEXT NOT NULL REFERENCES niche_configuration_versions(id),
  query_version TEXT NOT NULL,
  strategy TEXT NOT NULL CHECK (strategy IN ('dense', 'rural', 'adaptive')),
  result_cap INTEGER NOT NULL CHECK (result_cap > 0),
  maximum_depth INTEGER NOT NULL CHECK (maximum_depth BETWEEN 0 AND 12),
  minimum_span REAL NOT NULL CHECK (minimum_span > 0),
  created_at TEXT NOT NULL,
  UNIQUE (niche_configuration_id, query_version, strategy, result_cap, maximum_depth, minimum_span)
) STRICT;

CREATE TABLE coverage_cells (
  coverage_key TEXT PRIMARY KEY,
  manifest_id TEXT NOT NULL REFERENCES coverage_manifests(id) ON DELETE CASCADE,
  parent_coverage_key TEXT REFERENCES coverage_cells(coverage_key) ON DELETE CASCADE,
  geography_level TEXT NOT NULL CHECK (geography_level IN ('country', 'state', 'county', 'metro', 'city', 'bounding_area', 'grid_cell')),
  label TEXT NOT NULL CHECK (length(trim(label)) > 0),
  country_code TEXT NOT NULL CHECK (length(country_code) = 2),
  subdivision_code TEXT,
  west REAL NOT NULL,
  south REAL NOT NULL,
  east REAL NOT NULL,
  north REAL NOT NULL,
  depth INTEGER NOT NULL CHECK (depth BETWEEN 0 AND 12),
  state TEXT NOT NULL CHECK (state IN ('completed', 'partial', 'blocked', 'failed', 'pending')),
  stop_reason TEXT CHECK (stop_reason IS NULL OR stop_reason IN ('maximum_depth', 'minimum_span')),
  updated_at TEXT NOT NULL,
  CHECK (west < east AND south < north),
  UNIQUE (manifest_id, coverage_key)
) STRICT;

CREATE TABLE discovery_queries (
  id TEXT PRIMARY KEY,
  coverage_key TEXT NOT NULL REFERENCES coverage_cells(coverage_key) ON DELETE CASCADE,
  niche_configuration_id TEXT NOT NULL REFERENCES niche_configuration_versions(id),
  query_version TEXT NOT NULL,
  configuration_hash TEXT NOT NULL CHECK (length(configuration_hash) = 64),
  query_text TEXT NOT NULL CHECK (length(trim(query_text)) > 0),
  negative_policy_hash TEXT NOT NULL CHECK (length(negative_policy_hash) = 64),
  created_at TEXT NOT NULL,
  UNIQUE (coverage_key, query_version, configuration_hash, query_text)
) STRICT;

CREATE TABLE discovery_observations (
  id TEXT PRIMARY KEY,
  query_id TEXT NOT NULL REFERENCES discovery_queries(id) ON DELETE CASCADE,
  provider_call_id TEXT REFERENCES provider_calls(id) ON DELETE SET NULL,
  provider_id TEXT NOT NULL,
  provider_schema_version TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  provider_result_id TEXT,
  observed_at TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  validation_state TEXT NOT NULL CHECK (validation_state IN ('accepted', 'rejected')),
  error_category TEXT CHECK (error_category IS NULL OR error_category IN (
    'unavailable', 'timeout', 'rate_limited', 'authentication_failed',
    'authorization_failed', 'schema_validation_failed', 'policy_blocked',
    'unsupported_operation', 'budget_blocked', 'cancelled', 'provider_failure'
  )),
  cost_micro_usd INTEGER NOT NULL CHECK (cost_micro_usd >= 0),
  billable_units INTEGER NOT NULL CHECK (billable_units >= 0),
  cache_status TEXT NOT NULL CHECK (cache_status IN ('hit', 'miss', 'bypassed')),
  normalized_result_json TEXT,
  raw_reference_checksum TEXT CHECK (raw_reference_checksum IS NULL OR length(raw_reference_checksum) = 64),
  CHECK (validation_state <> 'accepted' OR normalized_result_json IS NOT NULL),
  CHECK (validation_state <> 'rejected' OR normalized_result_json IS NULL)
) STRICT;

CREATE TABLE provider_result_identifiers (
  provider_id TEXT NOT NULL,
  provider_result_id TEXT NOT NULL,
  observation_id TEXT NOT NULL REFERENCES discovery_observations(id) ON DELETE CASCADE,
  first_observed_at TEXT NOT NULL,
  last_observed_at TEXT NOT NULL,
  PRIMARY KEY (provider_id, provider_result_id)
) STRICT, WITHOUT ROWID;

CREATE TABLE business_groups (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
  legal_name TEXT,
  chain_brand TEXT,
  franchise INTEGER NOT NULL DEFAULT 0 CHECK (franchise IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE business_group_locations (
  group_id TEXT NOT NULL REFERENCES business_groups(id) ON DELETE CASCADE,
  business_location_id TEXT NOT NULL REFERENCES business_locations(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL CHECK (relationship IN ('owned', 'franchise', 'affiliate', 'unknown')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (group_id, business_location_id)
) STRICT, WITHOUT ROWID;

CREATE TABLE business_aliases (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES business_groups(id) ON DELETE CASCADE,
  business_id TEXT REFERENCES businesses(id) ON DELETE CASCADE,
  alias_name TEXT NOT NULL CHECK (length(trim(alias_name)) > 0),
  alias_kind TEXT NOT NULL CHECK (alias_kind IN ('display', 'dba', 'legal', 'provider')),
  normalized_name TEXT NOT NULL CHECK (length(trim(normalized_name)) > 0),
  created_at TEXT NOT NULL,
  UNIQUE (group_id, alias_kind, normalized_name)
) STRICT;

CREATE TABLE identity_candidates (
  id TEXT PRIMARY KEY,
  left_business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  right_business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  candidate_reason TEXT NOT NULL,
  match_score INTEGER NOT NULL CHECK (match_score BETWEEN 0 AND 10000),
  policy_version TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending', 'accepted', 'rejected', 'human_review')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (left_business_id < right_business_id),
  UNIQUE (left_business_id, right_business_id, policy_version)
) STRICT;

CREATE TABLE identity_matches (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES identity_candidates(id) ON DELETE CASCADE,
  match_reason TEXT NOT NULL CHECK (match_reason IN (
    'stable_provider_identifier', 'verified_domain', 'verified_domain_group',
    'verified_e164_phone', 'exact_normalized_address', 'strong_multi_field',
    'fuzzy_candidate', 'conflicting_identifiers', 'insufficient_evidence'
  )),
  match_score INTEGER NOT NULL CHECK (match_score BETWEEN 0 AND 10000),
  policy_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (candidate_id, policy_version)
) STRICT;

CREATE TABLE merge_decisions (
  id TEXT PRIMARY KEY,
  identity_match_id TEXT NOT NULL REFERENCES identity_matches(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('auto_merge', 'group_link', 'human_review', 'no_match')),
  automatic INTEGER NOT NULL CHECK (automatic IN (0, 1)),
  reason TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  CHECK (action NOT IN ('human_review', 'no_match') OR automatic = 0)
) STRICT;

CREATE TABLE identity_conflicts (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES identity_candidates(id) ON DELETE CASCADE,
  conflict_type TEXT NOT NULL,
  details_json TEXT NOT NULL,
  review_state TEXT NOT NULL CHECK (review_state IN ('pending', 'resolved', 'rejected')),
  created_at TEXT NOT NULL,
  resolved_at TEXT
) STRICT;

CREATE INDEX idx_coverage_cells_manifest ON coverage_cells(manifest_id, state);
CREATE INDEX idx_coverage_cells_parent ON coverage_cells(parent_coverage_key);
CREATE INDEX idx_discovery_queries_coverage ON discovery_queries(coverage_key);
CREATE INDEX idx_discovery_observations_query ON discovery_observations(query_id);
CREATE INDEX idx_business_group_locations_location ON business_group_locations(business_location_id);
CREATE INDEX idx_business_aliases_normalized ON business_aliases(normalized_name);
CREATE INDEX idx_identity_candidates_state ON identity_candidates(state);
CREATE INDEX idx_identity_conflicts_candidate ON identity_conflicts(candidate_id, review_state);
