-- Phase 3C evolves the existing evidence model in place. Legacy rows are
-- explicitly fail-closed and must be re-observed or re-verified under this policy.
ALTER TABLE evidence ADD COLUMN source_class TEXT CHECK (source_class IN (
  'synthetic_fixture', 'local_public_dataset', 'public_business_website',
  'historical_manual_artifact', 'external_verification_provider', 'human_review',
  'legacy_unclassified'
));
ALTER TABLE evidence ADD COLUMN claim_state TEXT CHECK (claim_state IN (
  'unknown', 'observed', 'source_confirmed', 'public_unverified_candidate',
  'externally_verified', 'human_confirmed', 'rejected', 'stale', 'conflicting'
));
ALTER TABLE evidence ADD COLUMN source_confirmation_state TEXT CHECK (source_confirmation_state IN (
  'unassessed', 'confirmed', 'contradicted'
));
ALTER TABLE evidence ADD COLUMN external_verification_state TEXT CHECK (external_verification_state IN (
  'unassessed', 'current', 'failed', 'expired'
));
ALTER TABLE evidence ADD COLUMN human_review_state TEXT CHECK (human_review_state IN (
  'unreviewed', 'reviewed', 'accepted', 'rejected'
));
ALTER TABLE evidence ADD COLUMN verification_dimension TEXT CHECK (verification_dimension IS NULL OR verification_dimension IN (
  'phone_syntax', 'phone_reachability', 'phone_line_type', 'phone_business_association',
  'phone_person_ownership', 'email_syntax', 'email_domain', 'email_mx', 'email_deliverability',
  'email_person_association', 'email_business_association', 'person_name_observed',
  'person_role_observed', 'person_current_employment', 'person_owner_relationship',
  'person_decision_authority', 'business_provider_identity', 'business_canonical_domain',
  'business_operational_status', 'business_address_association', 'business_phone_association',
  'business_legal_identity'
));
ALTER TABLE evidence ADD COLUMN verifier_id TEXT;
ALTER TABLE evidence ADD COLUMN verification_result TEXT CHECK (verification_result IS NULL OR verification_result IN (
  'passed', 'failed', 'inconclusive'
));
ALTER TABLE evidence ADD COLUMN expires_at TEXT;
ALTER TABLE evidence ADD COLUMN normalized_value TEXT;
ALTER TABLE evidence ADD COLUMN evidence_reference TEXT;
ALTER TABLE evidence ADD COLUMN human_reviewer_id TEXT;
ALTER TABLE evidence ADD COLUMN human_reviewed_at TEXT;

UPDATE evidence
SET source_class = 'legacy_unclassified',
    claim_state = 'unknown',
    source_confirmation_state = 'unassessed',
    external_verification_state = 'unassessed',
    human_review_state = 'unreviewed',
    verification_state = 'not_checked',
    verification_method = NULL,
    verified_at = NULL;

CREATE TRIGGER evidence_phase3c_guard_insert
BEFORE INSERT ON evidence
WHEN
  NEW.source_class IS NULL OR
  NEW.claim_state IS NULL OR
  NEW.source_confirmation_state IS NULL OR
  NEW.external_verification_state IS NULL OR
  NEW.human_review_state IS NULL OR
  (
    (NEW.claim_state = 'externally_verified' OR NEW.external_verification_state = 'current' OR NEW.verification_state = 'externally_verified')
    AND NOT (
      NEW.source_class = 'external_verification_provider' AND
      NEW.claim_state = 'externally_verified' AND
      NEW.external_verification_state = 'current' AND
      NEW.verification_state = 'externally_verified' AND
      NEW.verification_dimension IS NOT NULL AND
      length(trim(COALESCE(NEW.verifier_id, ''))) > 0 AND
      length(trim(COALESCE(NEW.verification_method, ''))) > 0 AND
      NEW.verification_result = 'passed' AND
      (NEW.verification_method || ':' || NEW.verification_dimension) IN (
        'phone_syntax_normalization:phone_syntax',
        'phone_reachability_check:phone_reachability',
        'phone_line_type_lookup:phone_line_type',
        'phone_business_association_check:phone_business_association',
        'phone_person_ownership_check:phone_person_ownership',
        'email_syntax_validation:email_syntax',
        'email_domain_validation:email_domain',
        'email_mx_lookup:email_mx',
        'email_deliverability_check:email_deliverability',
        'email_person_association_check:email_person_association',
        'email_business_association_check:email_business_association',
        'person_name_observation_review:person_name_observed',
        'person_role_observation_review:person_role_observed',
        'employment_verification:person_current_employment',
        'owner_relationship_verification:person_owner_relationship',
        'decision_authority_verification:person_decision_authority',
        'provider_business_identity_match:business_provider_identity',
        'canonical_domain_verification:business_canonical_domain',
        'business_operational_verification:business_operational_status',
        'address_association_verification:business_address_association',
        'business_phone_association_verification:business_phone_association',
        'legal_entity_verification:business_legal_identity'
      ) AND
      NEW.verified_at IS NOT NULL AND
      NEW.expires_at IS NOT NULL AND
      julianday(NEW.verified_at) IS NOT NULL AND
      julianday(NEW.expires_at) IS NOT NULL AND
      julianday(NEW.updated_at) IS NOT NULL AND
      julianday(NEW.expires_at) > julianday(NEW.verified_at) AND
      julianday(NEW.verified_at) <= julianday(NEW.updated_at) AND
      julianday(NEW.expires_at) > julianday(NEW.updated_at) AND
      length(trim(COALESCE(NEW.normalized_value, ''))) > 0 AND
      length(trim(COALESCE(NEW.evidence_reference, ''))) > 0
    )
  ) OR
  (
    NEW.claim_state = 'human_confirmed' AND NOT (
      NEW.source_class = 'human_review' AND
      NEW.human_review_state = 'accepted' AND
      NEW.verification_dimension IS NOT NULL AND
      length(trim(COALESCE(NEW.normalized_value, ''))) > 0 AND
      length(trim(COALESCE(NEW.human_reviewer_id, ''))) > 0 AND
      NEW.human_reviewed_at IS NOT NULL AND
      julianday(NEW.human_reviewed_at) IS NOT NULL AND
      julianday(NEW.updated_at) IS NOT NULL AND
      julianday(NEW.human_reviewed_at) <= julianday(NEW.updated_at) AND
      length(trim(COALESCE(NEW.evidence_reference, ''))) > 0 AND
      NEW.verification_state <> 'externally_verified'
    )
  ) OR
  (NEW.verification_state = 'source_confirmed' AND NEW.claim_state <> 'source_confirmed') OR
  (NEW.claim_state = 'source_confirmed' AND NOT (
    NEW.verification_state = 'source_confirmed' AND NEW.source_confirmation_state = 'confirmed'
  ))
BEGIN
  SELECT RAISE(ABORT, 'evidence violates Phase 3C provenance or verification policy');
END;

CREATE TRIGGER evidence_phase3c_guard_update
BEFORE UPDATE ON evidence
WHEN
  NEW.source_class IS NULL OR
  NEW.claim_state IS NULL OR
  NEW.source_confirmation_state IS NULL OR
  NEW.external_verification_state IS NULL OR
  NEW.human_review_state IS NULL OR
  (
    (NEW.claim_state = 'externally_verified' OR NEW.external_verification_state = 'current' OR NEW.verification_state = 'externally_verified')
    AND NOT (
      NEW.source_class = 'external_verification_provider' AND
      NEW.claim_state = 'externally_verified' AND
      NEW.external_verification_state = 'current' AND
      NEW.verification_state = 'externally_verified' AND
      NEW.verification_dimension IS NOT NULL AND
      length(trim(COALESCE(NEW.verifier_id, ''))) > 0 AND
      length(trim(COALESCE(NEW.verification_method, ''))) > 0 AND
      NEW.verification_result = 'passed' AND
      (NEW.verification_method || ':' || NEW.verification_dimension) IN (
        'phone_syntax_normalization:phone_syntax',
        'phone_reachability_check:phone_reachability',
        'phone_line_type_lookup:phone_line_type',
        'phone_business_association_check:phone_business_association',
        'phone_person_ownership_check:phone_person_ownership',
        'email_syntax_validation:email_syntax',
        'email_domain_validation:email_domain',
        'email_mx_lookup:email_mx',
        'email_deliverability_check:email_deliverability',
        'email_person_association_check:email_person_association',
        'email_business_association_check:email_business_association',
        'person_name_observation_review:person_name_observed',
        'person_role_observation_review:person_role_observed',
        'employment_verification:person_current_employment',
        'owner_relationship_verification:person_owner_relationship',
        'decision_authority_verification:person_decision_authority',
        'provider_business_identity_match:business_provider_identity',
        'canonical_domain_verification:business_canonical_domain',
        'business_operational_verification:business_operational_status',
        'address_association_verification:business_address_association',
        'business_phone_association_verification:business_phone_association',
        'legal_entity_verification:business_legal_identity'
      ) AND
      NEW.verified_at IS NOT NULL AND
      NEW.expires_at IS NOT NULL AND
      julianday(NEW.verified_at) IS NOT NULL AND
      julianday(NEW.expires_at) IS NOT NULL AND
      julianday(NEW.updated_at) IS NOT NULL AND
      julianday(NEW.expires_at) > julianday(NEW.verified_at) AND
      julianday(NEW.verified_at) <= julianday(NEW.updated_at) AND
      julianday(NEW.expires_at) > julianday(NEW.updated_at) AND
      length(trim(COALESCE(NEW.normalized_value, ''))) > 0 AND
      length(trim(COALESCE(NEW.evidence_reference, ''))) > 0
    )
  ) OR
  (
    NEW.claim_state = 'human_confirmed' AND NOT (
      NEW.source_class = 'human_review' AND
      NEW.human_review_state = 'accepted' AND
      NEW.verification_dimension IS NOT NULL AND
      length(trim(COALESCE(NEW.normalized_value, ''))) > 0 AND
      length(trim(COALESCE(NEW.human_reviewer_id, ''))) > 0 AND
      NEW.human_reviewed_at IS NOT NULL AND
      julianday(NEW.human_reviewed_at) IS NOT NULL AND
      julianday(NEW.updated_at) IS NOT NULL AND
      julianday(NEW.human_reviewed_at) <= julianday(NEW.updated_at) AND
      length(trim(COALESCE(NEW.evidence_reference, ''))) > 0 AND
      NEW.verification_state <> 'externally_verified'
    )
  ) OR
  (NEW.verification_state = 'source_confirmed' AND NEW.claim_state <> 'source_confirmed') OR
  (NEW.claim_state = 'source_confirmed' AND NOT (
    NEW.verification_state = 'source_confirmed' AND NEW.source_confirmation_state = 'confirmed'
  ))
BEGIN
  SELECT RAISE(ABORT, 'evidence violates Phase 3C provenance or verification policy');
END;

-- Contacts remain person candidates. A name may be absent, but placeholders,
-- contact values, and business-name fallbacks are forbidden at the database boundary.
ALTER TABLE contacts RENAME TO contacts_legacy_005;

CREATE TABLE contacts (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL DEFAULT 'person' CHECK (entity_type = 'person'),
  person_name TEXT CHECK (person_name IS NULL OR length(trim(person_name)) > 0),
  title TEXT,
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'employee', 'unknown')),
  evidence_state TEXT NOT NULL CHECK (evidence_state IN ('unknown', 'not_checked', 'unavailable', 'failed', 'stale', 'conflicting', 'found')),
  verification_state TEXT NOT NULL CHECK (verification_state IN ('not_checked', 'syntactically_valid', 'source_confirmed', 'externally_verified')),
  decision_state TEXT NOT NULL CHECK (decision_state IN ('unknown', 'rejected', 'human_review', 'accepted')),
  source_class TEXT NOT NULL CHECK (source_class IN (
    'synthetic_fixture', 'local_public_dataset', 'public_business_website',
    'historical_manual_artifact', 'external_verification_provider', 'human_review',
    'legacy_unclassified'
  )),
  claim_state TEXT NOT NULL CHECK (claim_state IN (
    'unknown', 'observed', 'source_confirmed', 'public_unverified_candidate',
    'externally_verified', 'human_confirmed', 'rejected', 'stale', 'conflicting'
  )),
  relationship_evidence_id TEXT REFERENCES evidence(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (business_id, person_name),
  CHECK (claim_state <> 'externally_verified' OR (
    verification_state = 'externally_verified' AND relationship_evidence_id IS NOT NULL
  )),
  CHECK (claim_state <> 'human_confirmed' OR relationship_evidence_id IS NOT NULL)
) STRICT;

INSERT INTO contacts
  (id, business_id, entity_type, person_name, title, role, evidence_state,
   verification_state, decision_state, source_class, claim_state,
   relationship_evidence_id, created_at, updated_at)
SELECT id, business_id, entity_type, person_name, title, role, evidence_state,
       'not_checked', 'unknown', 'legacy_unclassified', 'unknown', NULL,
       created_at, updated_at
FROM contacts_legacy_005;

DROP TABLE contacts_legacy_005;

CREATE INDEX idx_contacts_business_id ON contacts(business_id);

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

CREATE TRIGGER contacts_verified_relationship_guard_insert
BEFORE INSERT ON contacts
WHEN NEW.claim_state IN ('externally_verified', 'human_confirmed') AND NOT EXISTS (
  SELECT 1 FROM evidence e
  WHERE e.id = NEW.relationship_evidence_id
    AND e.entity_type = 'person'
    AND e.entity_id = NEW.id
    AND e.claim_state = NEW.claim_state
    AND (
      (NEW.role = 'owner' AND e.verification_dimension = 'person_owner_relationship') OR
      (NEW.role = 'manager' AND e.verification_dimension = 'person_decision_authority') OR
      (NEW.role IN ('employee', 'unknown') AND e.verification_dimension = 'person_current_employment')
    )
)
BEGIN
  SELECT RAISE(ABORT, 'verified person relationship requires complete matching evidence');
END;

CREATE TRIGGER contacts_verified_relationship_guard_update
BEFORE UPDATE ON contacts
WHEN NEW.claim_state IN ('externally_verified', 'human_confirmed') AND NOT EXISTS (
  SELECT 1 FROM evidence e
  WHERE e.id = NEW.relationship_evidence_id
    AND e.entity_type = 'person'
    AND e.entity_id = NEW.id
    AND e.claim_state = NEW.claim_state
    AND (
      (NEW.role = 'owner' AND e.verification_dimension = 'person_owner_relationship') OR
      (NEW.role = 'manager' AND e.verification_dimension = 'person_decision_authority') OR
      (NEW.role IN ('employee', 'unknown') AND e.verification_dimension = 'person_current_employment')
    )
)
BEGIN
  SELECT RAISE(ABORT, 'verified person relationship requires complete matching evidence');
END;

-- Core business observations now retain explicit provenance and claim state.
ALTER TABLE business_identifiers ADD COLUMN source_class TEXT CHECK (source_class IN (
  'synthetic_fixture', 'local_public_dataset', 'public_business_website',
  'historical_manual_artifact', 'external_verification_provider', 'human_review', 'legacy_unclassified'
));
ALTER TABLE business_identifiers ADD COLUMN claim_state TEXT CHECK (claim_state IN (
  'unknown', 'observed', 'source_confirmed', 'public_unverified_candidate', 'externally_verified',
  'human_confirmed', 'rejected', 'stale', 'conflicting'
));
UPDATE business_identifiers SET source_class = 'legacy_unclassified', claim_state = 'unknown';

ALTER TABLE business_locations ADD COLUMN source_class TEXT CHECK (source_class IN (
  'synthetic_fixture', 'local_public_dataset', 'public_business_website',
  'historical_manual_artifact', 'external_verification_provider', 'human_review', 'legacy_unclassified'
));
ALTER TABLE business_locations ADD COLUMN claim_state TEXT CHECK (claim_state IN (
  'unknown', 'observed', 'source_confirmed', 'public_unverified_candidate', 'externally_verified',
  'human_confirmed', 'rejected', 'stale', 'conflicting'
));
UPDATE business_locations SET source_class = 'legacy_unclassified', claim_state = 'unknown';

CREATE TRIGGER business_identifiers_provenance_insert BEFORE INSERT ON business_identifiers
WHEN NEW.source_class IS NULL OR NEW.claim_state IS NULL
BEGIN SELECT RAISE(ABORT, 'business identifier requires provenance'); END;
CREATE TRIGGER business_identifiers_provenance_update BEFORE UPDATE ON business_identifiers
WHEN NEW.source_class IS NULL OR NEW.claim_state IS NULL
BEGIN SELECT RAISE(ABORT, 'business identifier requires provenance'); END;
CREATE TRIGGER business_locations_provenance_insert BEFORE INSERT ON business_locations
WHEN NEW.source_class IS NULL OR NEW.claim_state IS NULL
BEGIN SELECT RAISE(ABORT, 'business location requires provenance'); END;
CREATE TRIGGER business_locations_provenance_update BEFORE UPDATE ON business_locations
WHEN NEW.source_class IS NULL OR NEW.claim_state IS NULL
BEGIN SELECT RAISE(ABORT, 'business location requires provenance'); END;

-- Discovery and website semantic observations are explicit at their own rows.
ALTER TABLE discovery_observations ADD COLUMN source_class TEXT CHECK (source_class IN (
  'synthetic_fixture', 'local_public_dataset', 'public_business_website',
  'historical_manual_artifact', 'external_verification_provider', 'human_review', 'legacy_unclassified'
));
ALTER TABLE discovery_observations ADD COLUMN claim_state TEXT CHECK (claim_state IN (
  'unknown', 'observed', 'source_confirmed', 'public_unverified_candidate', 'externally_verified',
  'human_confirmed', 'rejected', 'stale', 'conflicting'
));
UPDATE discovery_observations SET source_class = 'legacy_unclassified', claim_state = 'unknown';
CREATE TRIGGER discovery_observations_provenance_insert BEFORE INSERT ON discovery_observations
WHEN NEW.source_class IS NULL OR NEW.claim_state IS NULL
BEGIN SELECT RAISE(ABORT, 'discovery observation requires provenance'); END;
CREATE TRIGGER discovery_observations_provenance_update BEFORE UPDATE ON discovery_observations
WHEN NEW.source_class IS NULL OR NEW.claim_state IS NULL
BEGIN SELECT RAISE(ABORT, 'discovery observation requires provenance'); END;

ALTER TABLE website_assessments ADD COLUMN source_class TEXT CHECK (source_class IN (
  'synthetic_fixture', 'public_business_website', 'legacy_unclassified'
));
UPDATE website_assessments SET source_class = 'legacy_unclassified';
CREATE TRIGGER website_assessments_provenance_insert BEFORE INSERT ON website_assessments
WHEN NEW.source_class IS NULL
BEGIN SELECT RAISE(ABORT, 'website assessment requires provenance'); END;
CREATE TRIGGER website_assessments_provenance_update BEFORE UPDATE ON website_assessments
WHEN NEW.source_class IS NULL
BEGIN SELECT RAISE(ABORT, 'website assessment requires provenance'); END;

ALTER TABLE structured_data_observations ADD COLUMN source_class TEXT CHECK (source_class IN (
  'synthetic_fixture', 'public_business_website', 'legacy_unclassified'
));
ALTER TABLE structured_data_observations ADD COLUMN claim_state TEXT CHECK (claim_state IN (
  'unknown', 'observed', 'source_confirmed', 'public_unverified_candidate', 'rejected', 'stale', 'conflicting'
));
UPDATE structured_data_observations SET source_class = 'legacy_unclassified', claim_state = 'unknown';

ALTER TABLE website_contact_observations ADD COLUMN source_class TEXT CHECK (source_class IN (
  'synthetic_fixture', 'public_business_website', 'legacy_unclassified'
));
ALTER TABLE website_contact_observations ADD COLUMN claim_state TEXT CHECK (claim_state = 'public_unverified_candidate');
UPDATE website_contact_observations SET source_class = 'legacy_unclassified', claim_state = 'public_unverified_candidate';

ALTER TABLE person_evidence_candidates ADD COLUMN source_class TEXT CHECK (source_class IN (
  'synthetic_fixture', 'public_business_website', 'legacy_unclassified'
));
ALTER TABLE person_evidence_candidates ADD COLUMN claim_state TEXT CHECK (claim_state = 'public_unverified_candidate');
UPDATE person_evidence_candidates SET source_class = 'legacy_unclassified', claim_state = 'public_unverified_candidate';

ALTER TABLE service_evidence ADD COLUMN source_class TEXT CHECK (source_class IN (
  'synthetic_fixture', 'local_public_dataset', 'public_business_website', 'legacy_unclassified'
));
ALTER TABLE service_evidence ADD COLUMN claim_state TEXT CHECK (claim_state IN (
  'unknown', 'observed', 'source_confirmed', 'rejected', 'stale', 'conflicting'
));
UPDATE service_evidence SET source_class = 'legacy_unclassified', claim_state = 'unknown';

ALTER TABLE conversion_feature_observations ADD COLUMN source_class TEXT CHECK (source_class IN (
  'synthetic_fixture', 'public_business_website', 'legacy_unclassified'
));
ALTER TABLE conversion_feature_observations ADD COLUMN claim_state TEXT CHECK (claim_state IN (
  'unknown', 'observed', 'source_confirmed', 'rejected', 'stale', 'conflicting'
));
UPDATE conversion_feature_observations SET source_class = 'legacy_unclassified', claim_state = 'unknown';

ALTER TABLE website_identity_conflicts ADD COLUMN source_class TEXT CHECK (source_class IN (
  'synthetic_fixture', 'public_business_website', 'legacy_unclassified'
));
ALTER TABLE website_identity_conflicts ADD COLUMN claim_state TEXT CHECK (claim_state = 'conflicting');
UPDATE website_identity_conflicts SET source_class = 'legacy_unclassified', claim_state = 'conflicting';

CREATE TRIGGER structured_data_provenance_insert BEFORE INSERT ON structured_data_observations
WHEN NEW.source_class IS NULL OR NEW.claim_state IS NULL
BEGIN SELECT RAISE(ABORT, 'structured-data observation requires provenance'); END;
CREATE TRIGGER structured_data_provenance_update BEFORE UPDATE ON structured_data_observations
WHEN NEW.source_class IS NULL OR NEW.claim_state IS NULL
BEGIN SELECT RAISE(ABORT, 'structured-data observation requires provenance'); END;
CREATE TRIGGER website_contacts_provenance_insert BEFORE INSERT ON website_contact_observations
WHEN NEW.source_class IS NULL OR NEW.claim_state IS NULL
BEGIN SELECT RAISE(ABORT, 'website contact observation requires provenance'); END;
CREATE TRIGGER website_contacts_provenance_update BEFORE UPDATE ON website_contact_observations
WHEN NEW.source_class IS NULL OR NEW.claim_state IS NULL
BEGIN SELECT RAISE(ABORT, 'website contact observation requires provenance'); END;
CREATE TRIGGER person_candidates_provenance_insert BEFORE INSERT ON person_evidence_candidates
WHEN NEW.source_class IS NULL OR NEW.claim_state IS NULL
BEGIN SELECT RAISE(ABORT, 'person candidate requires provenance'); END;
CREATE TRIGGER person_candidates_provenance_update BEFORE UPDATE ON person_evidence_candidates
WHEN NEW.source_class IS NULL OR NEW.claim_state IS NULL
BEGIN SELECT RAISE(ABORT, 'person candidate requires provenance'); END;
CREATE TRIGGER service_evidence_provenance_insert BEFORE INSERT ON service_evidence
WHEN NEW.source_class IS NULL OR NEW.claim_state IS NULL
BEGIN SELECT RAISE(ABORT, 'service evidence requires provenance'); END;
CREATE TRIGGER service_evidence_provenance_update BEFORE UPDATE ON service_evidence
WHEN NEW.source_class IS NULL OR NEW.claim_state IS NULL
BEGIN SELECT RAISE(ABORT, 'service evidence requires provenance'); END;
CREATE TRIGGER conversion_observations_provenance_insert BEFORE INSERT ON conversion_feature_observations
WHEN NEW.source_class IS NULL OR NEW.claim_state IS NULL
BEGIN SELECT RAISE(ABORT, 'conversion observation requires provenance'); END;
CREATE TRIGGER conversion_observations_provenance_update BEFORE UPDATE ON conversion_feature_observations
WHEN NEW.source_class IS NULL OR NEW.claim_state IS NULL
BEGIN SELECT RAISE(ABORT, 'conversion observation requires provenance'); END;
CREATE TRIGGER website_identity_conflicts_provenance_insert BEFORE INSERT ON website_identity_conflicts
WHEN NEW.source_class IS NULL OR NEW.claim_state IS NULL
BEGIN SELECT RAISE(ABORT, 'website identity conflict requires provenance'); END;
CREATE TRIGGER website_identity_conflicts_provenance_update BEFORE UPDATE ON website_identity_conflicts
WHEN NEW.source_class IS NULL OR NEW.claim_state IS NULL
BEGIN SELECT RAISE(ABORT, 'website identity conflict requires provenance'); END;

CREATE TABLE evidence_promotion_decisions (
  id TEXT PRIMARY KEY,
  evidence_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  requested_claim_state TEXT NOT NULL CHECK (requested_claim_state IN (
    'unknown', 'observed', 'source_confirmed', 'public_unverified_candidate',
    'externally_verified', 'human_confirmed', 'rejected', 'stale', 'conflicting'
  )),
  allowed INTEGER NOT NULL CHECK (allowed IN (0, 1)),
  denial_reasons_json TEXT NOT NULL CHECK (json_valid(denial_reasons_json) AND json_type(denial_reasons_json) = 'array'),
  resolution_reference TEXT,
  policy_version TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  CHECK (allowed = 0 OR json_array_length(denial_reasons_json) = 0),
  CHECK (allowed = 1 OR json_array_length(denial_reasons_json) > 0)
) STRICT;

CREATE TABLE identity_decision_audits (
  id TEXT PRIMARY KEY,
  left_entity_id TEXT NOT NULL,
  right_entity_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('auto_merge', 'group_link', 'human_review', 'no_match')),
  rule TEXT NOT NULL CHECK (length(trim(rule)) > 0),
  confidence_basis_points INTEGER NOT NULL CHECK (confidence_basis_points BETWEEN 0 AND 10000),
  supporting_signals_json TEXT NOT NULL CHECK (json_valid(supporting_signals_json) AND json_type(supporting_signals_json) = 'array'),
  conflicting_signals_json TEXT NOT NULL CHECK (json_valid(conflicting_signals_json) AND json_type(conflicting_signals_json) = 'array'),
  verification_dimensions_json TEXT NOT NULL CHECK (json_valid(verification_dimensions_json) AND json_type(verification_dimensions_json) = 'array'),
  review_reason TEXT,
  policy_version TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  CHECK (left_entity_id < right_entity_id),
  CHECK (action <> 'auto_merge' OR json_array_length(conflicting_signals_json) = 0),
  CHECK (action <> 'human_review' OR review_reason IS NOT NULL)
) STRICT;

CREATE INDEX idx_evidence_source_claim ON evidence(source_class, claim_state, external_verification_state);
CREATE INDEX idx_evidence_promotion_evidence ON evidence_promotion_decisions(evidence_id, decided_at);
CREATE INDEX idx_identity_decision_pair ON identity_decision_audits(left_entity_id, right_entity_id, decided_at);
