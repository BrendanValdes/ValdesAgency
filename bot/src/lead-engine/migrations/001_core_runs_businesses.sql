CREATE TABLE IF NOT EXISTS migration_history (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL
) STRICT;

CREATE TABLE lead_runs (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL CHECK (state IN ('not_checked', 'running', 'failed', 'human_review', 'accepted', 'rejected')),
  niche_id TEXT NOT NULL CHECK (niche_id IN ('pool_service', 'landscaping', 'hvac')),
  budget_micro_usd INTEGER NOT NULL CHECK (budget_micro_usd >= 0),
  spent_micro_usd INTEGER NOT NULL DEFAULT 0 CHECK (spent_micro_usd >= 0 AND spent_micro_usd <= budget_micro_usd),
  policy_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE run_stages (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES lead_runs(id) ON DELETE CASCADE,
  stage_name TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('not_checked', 'running', 'failed', 'human_review', 'accepted', 'rejected')),
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (run_id, stage_name)
) STRICT;

CREATE TABLE businesses (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL CHECK (length(trim(canonical_name)) > 0),
  state TEXT NOT NULL CHECK (state IN ('unknown', 'found', 'stale', 'conflicting', 'rejected', 'human_review', 'accepted')),
  niche_id TEXT NOT NULL CHECK (niche_id IN ('pool_service', 'landscaping', 'hvac')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE business_identifiers (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  scheme TEXT NOT NULL CHECK (length(trim(scheme)) > 0),
  value TEXT NOT NULL CHECK (length(trim(value)) > 0),
  source TEXT NOT NULL CHECK (length(trim(source)) > 0),
  evidence_state TEXT NOT NULL CHECK (evidence_state IN ('unknown', 'not_checked', 'unavailable', 'failed', 'stale', 'conflicting', 'found')),
  created_at TEXT NOT NULL,
  UNIQUE (scheme, value)
) STRICT;

CREATE TABLE business_locations (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  line1 TEXT,
  city TEXT NOT NULL CHECK (length(trim(city)) > 0),
  region TEXT NOT NULL CHECK (length(trim(region)) > 0),
  postal_code TEXT,
  country_code TEXT NOT NULL CHECK (length(country_code) = 2),
  evidence_state TEXT NOT NULL CHECK (evidence_state IN ('unknown', 'not_checked', 'unavailable', 'failed', 'stale', 'conflicting', 'found')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE contacts (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL DEFAULT 'person' CHECK (entity_type = 'person'),
  person_name TEXT NOT NULL CHECK (length(trim(person_name)) > 0),
  title TEXT,
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'employee', 'unknown')),
  evidence_state TEXT NOT NULL CHECK (evidence_state IN ('unknown', 'not_checked', 'unavailable', 'failed', 'stale', 'conflicting', 'found')),
  verification_state TEXT NOT NULL CHECK (verification_state IN ('not_checked', 'syntactically_valid', 'source_confirmed', 'externally_verified')),
  decision_state TEXT NOT NULL CHECK (decision_state IN ('unknown', 'rejected', 'human_review', 'accepted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (business_id, person_name)
) STRICT;

CREATE TRIGGER contacts_business_name_guard_insert
BEFORE INSERT ON contacts
WHEN lower(trim(NEW.person_name)) = lower(trim((SELECT canonical_name FROM businesses WHERE id = NEW.business_id)))
BEGIN
  SELECT RAISE(ABORT, 'contact identity violates person policy');
END;

CREATE TRIGGER contacts_business_name_guard_update
BEFORE UPDATE OF person_name, business_id ON contacts
WHEN lower(trim(NEW.person_name)) = lower(trim((SELECT canonical_name FROM businesses WHERE id = NEW.business_id)))
BEGIN
  SELECT RAISE(ABORT, 'contact identity violates person policy');
END;

CREATE INDEX idx_run_stages_run_id ON run_stages(run_id);
CREATE INDEX idx_business_identifiers_business_id ON business_identifiers(business_id);
CREATE INDEX idx_business_locations_business_id ON business_locations(business_id);
CREATE INDEX idx_contacts_business_id ON contacts(business_id);
