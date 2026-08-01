CREATE TABLE website_assessments (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  source_website_url TEXT NOT NULL,
  canonical_homepage_url TEXT,
  status TEXT NOT NULL CHECK (status IN ('complete', 'partial', 'blocked', 'failed', 'stale')),
  started_at TEXT NOT NULL,
  assessed_at TEXT NOT NULL,
  fresh_until TEXT NOT NULL,
  crawl_policy_version TEXT NOT NULL,
  extraction_policy_version TEXT NOT NULL,
  browser_status TEXT NOT NULL CHECK (browser_status IN ('disabled', 'unavailable', 'not_checked')),
  identity_state TEXT NOT NULL CHECK (identity_state IN ('agrees', 'conflicts', 'ambiguous', 'unavailable')),
  review_required INTEGER NOT NULL CHECK (review_required IN (0, 1)),
  UNIQUE (business_id, source_website_url, assessed_at)
) STRICT;

CREATE TABLE website_fetches (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES website_assessments(id) ON DELETE CASCADE,
  requested_url TEXT NOT NULL,
  final_url TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failed')),
  http_status INTEGER,
  error_code TEXT,
  retryable INTEGER NOT NULL CHECK (retryable IN (0, 1)),
  attempts INTEGER NOT NULL CHECK (attempts >= 0 AND attempts <= 3),
  content_type TEXT,
  compressed_bytes INTEGER CHECK (compressed_bytes IS NULL OR compressed_bytes >= 0),
  decompressed_bytes INTEGER CHECK (decompressed_bytes IS NULL OR decompressed_bytes >= 0),
  content_checksum TEXT CHECK (content_checksum IS NULL OR (length(content_checksum) = 64 AND content_checksum NOT GLOB '*[^0-9a-fA-F]*')),
  etag TEXT,
  last_modified TEXT,
  redirect_history_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(redirect_history_json)),
  fetched_at TEXT NOT NULL,
  CHECK (outcome <> 'success' OR (final_url IS NOT NULL AND content_type IS NOT NULL AND content_checksum IS NOT NULL)),
  CHECK (outcome <> 'failed' OR error_code IS NOT NULL)
) STRICT;

CREATE TABLE website_pages (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES website_assessments(id) ON DELETE CASCADE,
  fetch_id TEXT REFERENCES website_fetches(id) ON DELETE SET NULL,
  page_url TEXT NOT NULL,
  page_kind TEXT NOT NULL CHECK (page_kind IN ('homepage', 'contact', 'about', 'team', 'services', 'booking', 'sitemap_discovered', 'other')),
  inspection_status TEXT NOT NULL CHECK (inspection_status IN ('successful', 'blocked', 'unavailable', 'failed', 'not_checked', 'stale')),
  title TEXT,
  meta_description TEXT,
  language TEXT,
  viewport TEXT,
  content_checksum TEXT CHECK (content_checksum IS NULL OR length(content_checksum) = 64),
  observed_at TEXT NOT NULL,
  fetched_at TEXT,
  UNIQUE (assessment_id, page_url)
) STRICT;

CREATE TABLE website_links (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL REFERENCES website_pages(id) ON DELETE CASCADE,
  target_url TEXT NOT NULL,
  link_kind TEXT NOT NULL CHECK (link_kind IN ('homepage', 'contact', 'about', 'team', 'services', 'booking', 'sitemap_discovered', 'other', 'social', 'telephone', 'email', 'external')),
  link_text_checksum TEXT NOT NULL CHECK (length(link_text_checksum) = 64),
  extraction_method TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  UNIQUE (page_id, target_url, link_kind)
) STRICT;

CREATE TABLE robots_decisions (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES website_assessments(id) ON DELETE CASCADE,
  page_url TEXT NOT NULL,
  robots_url TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('allowed', 'denied', 'unavailable')),
  reason TEXT NOT NULL CHECK (reason IN ('matched_allow', 'matched_disallow', 'no_matching_rule', 'not_published', 'fetch_failed')),
  matched_rule TEXT,
  content_checksum TEXT CHECK (content_checksum IS NULL OR length(content_checksum) = 64),
  fetched_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  UNIQUE (assessment_id, page_url)
) STRICT;

CREATE TABLE crawl_cache_entries (
  id TEXT PRIMARY KEY,
  cache_url TEXT NOT NULL UNIQUE,
  fetched_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  etag TEXT,
  last_modified TEXT,
  content_checksum TEXT CHECK (content_checksum IS NULL OR length(content_checksum) = 64),
  http_status INTEGER,
  content_type TEXT,
  robots_status TEXT CHECK (robots_status IS NULL OR robots_status IN ('allowed', 'denied', 'unavailable')),
  extraction_policy_version TEXT NOT NULL
) STRICT;

CREATE TABLE crawl_failures (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES website_assessments(id) ON DELETE CASCADE,
  page_url TEXT NOT NULL,
  error_code TEXT NOT NULL,
  retryable INTEGER NOT NULL CHECK (retryable IN (0, 1)),
  attempts INTEGER NOT NULL CHECK (attempts >= 0 AND attempts <= 3),
  http_status INTEGER,
  occurred_at TEXT NOT NULL
) STRICT;

CREATE TABLE structured_data_observations (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL REFERENCES website_pages(id) ON DELETE CASCADE,
  evidence_id TEXT REFERENCES evidence(id) ON DELETE SET NULL,
  schema_type TEXT NOT NULL,
  structured_data_path TEXT NOT NULL,
  field_name TEXT NOT NULL,
  claimed_value TEXT,
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  observed_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  content_checksum TEXT NOT NULL CHECK (length(content_checksum) = 64),
  extraction_policy_version TEXT NOT NULL
) STRICT;

CREATE TABLE website_contact_observations (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES website_assessments(id) ON DELETE CASCADE,
  page_id TEXT NOT NULL REFERENCES website_pages(id) ON DELETE CASCADE,
  evidence_id TEXT REFERENCES evidence(id) ON DELETE SET NULL,
  contact_kind TEXT NOT NULL CHECK (contact_kind IN ('phone', 'email', 'address')),
  displayed_value TEXT NOT NULL,
  candidate_status TEXT NOT NULL CHECK (candidate_status = 'public_unverified'),
  extraction_method TEXT NOT NULL,
  selector_or_path TEXT,
  observed_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  content_checksum TEXT NOT NULL CHECK (length(content_checksum) = 64),
  extraction_policy_version TEXT NOT NULL
) STRICT;

CREATE TABLE person_evidence_candidates (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES website_assessments(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  page_id TEXT NOT NULL REFERENCES website_pages(id) ON DELETE CASCADE,
  evidence_id TEXT REFERENCES evidence(id) ON DELETE SET NULL,
  displayed_name TEXT NOT NULL CHECK (length(trim(displayed_name)) > 0),
  displayed_title TEXT,
  candidate_status TEXT NOT NULL CHECK (candidate_status = 'unverified_evidence_candidate'),
  ambiguity_state TEXT NOT NULL CHECK (ambiguity_state IN ('none', 'ambiguous', 'conflicting')),
  extraction_method TEXT NOT NULL CHECK (extraction_method IN ('html', 'json_ld')),
  observed_at TEXT NOT NULL,
  CHECK (lower(candidate_status) NOT LIKE '%confirmed%')
) STRICT;

CREATE TABLE service_evidence (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES website_assessments(id) ON DELETE CASCADE,
  page_id TEXT REFERENCES website_pages(id) ON DELETE CASCADE,
  evidence_id TEXT REFERENCES evidence(id) ON DELETE SET NULL,
  evidence_state TEXT NOT NULL CHECK (evidence_state IN ('positive', 'negative', 'ambiguous', 'unavailable')),
  term TEXT,
  basis TEXT NOT NULL CHECK (basis IN ('heading', 'service_description', 'json_ld_service', 'navigation', 'provider_category', 'not_available')),
  observed_at TEXT NOT NULL,
  extraction_policy_version TEXT NOT NULL
) STRICT;

CREATE TABLE conversion_feature_observations (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES website_assessments(id) ON DELETE CASCADE,
  page_id TEXT REFERENCES website_pages(id) ON DELETE CASCADE,
  evidence_id TEXT REFERENCES evidence(id) ON DELETE SET NULL,
  feature TEXT NOT NULL CHECK (feature IN ('click_to_call', 'contact_form', 'estimate_request', 'booking', 'primary_cta', 'contact_route', 'mobile_viewport', 'https', 'valid_page_response', 'service_route')),
  status TEXT NOT NULL CHECK (status IN ('present', 'absent_after_successful_inspection', 'ambiguous', 'blocked', 'unavailable', 'not_checked', 'stale')),
  observed_at TEXT NOT NULL,
  fresh_until TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  UNIQUE (assessment_id, feature)
) STRICT;

CREATE TABLE website_identity_conflicts (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES website_assessments(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  page_id TEXT REFERENCES website_pages(id) ON DELETE SET NULL,
  evidence_id TEXT REFERENCES evidence(id) ON DELETE SET NULL,
  conflict_type TEXT NOT NULL CHECK (conflict_type IN ('business_name', 'contact_information', 'redirect_destination')),
  expected_value TEXT,
  observed_value TEXT,
  review_state TEXT NOT NULL CHECK (review_state IN ('pending', 'resolved', 'rejected')),
  observed_at TEXT NOT NULL,
  resolved_at TEXT
) STRICT;

CREATE INDEX idx_website_assessments_business ON website_assessments(business_id, assessed_at);
CREATE INDEX idx_website_fetches_assessment ON website_fetches(assessment_id, fetched_at);
CREATE INDEX idx_website_pages_assessment ON website_pages(assessment_id, page_kind);
CREATE INDEX idx_website_links_page ON website_links(page_id, link_kind);
CREATE INDEX idx_robots_decisions_assessment ON robots_decisions(assessment_id, decision);
CREATE INDEX idx_crawl_cache_expiration ON crawl_cache_entries(expires_at);
CREATE INDEX idx_crawl_failures_assessment ON crawl_failures(assessment_id, error_code);
CREATE INDEX idx_structured_data_page ON structured_data_observations(page_id, schema_type);
CREATE INDEX idx_website_contacts_assessment ON website_contact_observations(assessment_id, contact_kind);
CREATE INDEX idx_person_candidates_business ON person_evidence_candidates(business_id, candidate_status);
CREATE INDEX idx_service_evidence_assessment ON service_evidence(assessment_id, evidence_state);
CREATE INDEX idx_conversion_assessment ON conversion_feature_observations(assessment_id, status);
CREATE INDEX idx_website_identity_conflicts_business ON website_identity_conflicts(business_id, review_state);
