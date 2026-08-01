CREATE TABLE overture_release_pins (
  run_id TEXT PRIMARY KEY REFERENCES lead_runs(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL CHECK (provider_id = 'overture_places_live'),
  adapter_version TEXT NOT NULL CHECK (length(trim(adapter_version)) > 0),
  release_id TEXT NOT NULL CHECK (
    length(release_id) BETWEEN 12 AND 32
    AND substr(release_id, 1, 10) GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    AND substr(release_id, 11, 1) = '.'
    AND length(substr(release_id, 12)) > 0
    AND substr(release_id, 12) NOT GLOB '*[^0-9]*'
  ),
  schema_version TEXT NOT NULL CHECK (length(trim(schema_version)) > 0),
  taxonomy_mapping_version TEXT NOT NULL CHECK (length(trim(taxonomy_mapping_version)) > 0),
  catalog_url TEXT NOT NULL CHECK (
    catalog_url LIKE 'https://stac.overturemaps.org/%'
    AND instr(catalog_url, '@') = 0
    AND instr(catalog_url, '?') = 0
    AND instr(catalog_url, '#') = 0
  ),
  catalog_checksum TEXT NOT NULL CHECK (
    length(catalog_checksum) = 64 AND catalog_checksum NOT GLOB '*[^0-9a-f]*'
  ),
  resolved_at TEXT NOT NULL,
  asset_manifest_json TEXT NOT NULL CHECK (
    json_valid(asset_manifest_json) AND json_type(asset_manifest_json) = 'array'
  ),
  license TEXT NOT NULL CHECK (length(trim(license)) > 0),
  attribution TEXT NOT NULL CHECK (length(trim(attribution)) > 0),
  coverage_key TEXT NOT NULL CHECK (length(trim(coverage_key)) > 0),
  bbox_json TEXT NOT NULL CHECK (
    json_valid(bbox_json) AND json_type(bbox_json) = 'object'
  ),
  query_fingerprint TEXT NOT NULL CHECK (length(trim(query_fingerprint)) > 0),
  query_plan_json TEXT NOT NULL CHECK (
    json_valid(query_plan_json) AND json_type(query_plan_json) = 'object'
  ),
  selected_columns_json TEXT NOT NULL CHECK (
    json_valid(selected_columns_json) AND json_type(selected_columns_json) = 'array'
  ),
  input_fingerprint TEXT NOT NULL CHECK (
    length(input_fingerprint) = 64 AND input_fingerprint NOT GLOB '*[^0-9a-f]*'
  ),
  budget_limits_json TEXT NOT NULL CHECK (
    json_valid(budget_limits_json) AND json_type(budget_limits_json) = 'object'
  ),
  budget_usage_json TEXT NOT NULL CHECK (
    json_valid(budget_usage_json) AND json_type(budget_usage_json) = 'object'
    AND json_type(budget_usage_json, '$.stacRequests') = 'integer'
    AND json_type(budget_usage_json, '$.assetRequests') = 'integer'
    AND json_type(budget_usage_json, '$.reservedDownloadedBytes') = 'integer'
    AND json_type(budget_usage_json, '$.downloadedBytes') = 'integer'
    AND json_type(budget_usage_json, '$.processedBytes') = 'integer'
    AND json_type(budget_usage_json, '$.rowsRead') = 'integer'
    AND json_type(budget_usage_json, '$.candidates') = 'integer'
    AND json_type(budget_usage_json, '$.retryAttempts') = 'integer'
    AND json_type(budget_usage_json, '$.costMicroUsd') = 'integer'
    AND json_extract(budget_usage_json, '$.stacRequests') >= 0
    AND json_extract(budget_usage_json, '$.assetRequests') >= 0
    AND json_extract(budget_usage_json, '$.reservedDownloadedBytes') >= 0
    AND json_extract(budget_usage_json, '$.downloadedBytes') >= 0
    AND json_extract(budget_usage_json, '$.processedBytes') >= 0
    AND json_extract(budget_usage_json, '$.rowsRead') >= 0
    AND json_extract(budget_usage_json, '$.candidates') >= 0
    AND json_extract(budget_usage_json, '$.retryAttempts') >= 0
    AND json_extract(budget_usage_json, '$.costMicroUsd') = 0
    AND json_extract(budget_usage_json, '$.downloadedBytes')
      <= json_extract(budget_usage_json, '$.reservedDownloadedBytes')
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE overture_provider_call_lineage (
  provider_call_id TEXT PRIMARY KEY REFERENCES provider_calls(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES overture_release_pins(run_id) ON DELETE CASCADE,
  query_id TEXT NOT NULL CHECK (length(trim(query_id)) > 0),
  query_fingerprint TEXT NOT NULL CHECK (length(trim(query_fingerprint)) > 0),
  asset_ids_json TEXT NOT NULL CHECK (
    json_valid(asset_ids_json) AND json_type(asset_ids_json) = 'array'
  ),
  request_count INTEGER NOT NULL CHECK (request_count >= 0),
  downloaded_bytes INTEGER NOT NULL CHECK (downloaded_bytes >= 0),
  processed_bytes INTEGER NOT NULL CHECK (processed_bytes >= 0),
  rows_read INTEGER NOT NULL CHECK (rows_read >= 0),
  accepted_count INTEGER NOT NULL CHECK (accepted_count >= 0),
  rejected_count INTEGER NOT NULL CHECK (rejected_count >= 0),
  review_count INTEGER NOT NULL CHECK (review_count >= 0),
  duplicate_count INTEGER NOT NULL CHECK (duplicate_count >= 0),
  status TEXT NOT NULL CHECK (status IN ('complete', 'partial', 'failed')),
  failure_code TEXT,
  budget_usage_json TEXT NOT NULL CHECK (
    json_valid(budget_usage_json) AND json_type(budget_usage_json) = 'object'
  ),
  recorded_at TEXT NOT NULL,
  UNIQUE (run_id, query_id, query_fingerprint, provider_call_id)
) STRICT;

CREATE INDEX idx_overture_provider_call_lineage_run
ON overture_provider_call_lineage(run_id, query_id);

CREATE TRIGGER overture_release_pin_immutable
BEFORE UPDATE OF provider_id, adapter_version, release_id, schema_version,
  taxonomy_mapping_version, catalog_url, catalog_checksum, resolved_at,
  asset_manifest_json, license, attribution, coverage_key, bbox_json,
  query_fingerprint, query_plan_json, selected_columns_json, input_fingerprint,
  budget_limits_json
ON overture_release_pins
BEGIN
  SELECT RAISE(ABORT, 'Overture release/query pin metadata is immutable');
END;

CREATE TRIGGER overture_budget_usage_monotonic
BEFORE UPDATE OF budget_usage_json ON overture_release_pins
WHEN json_extract(NEW.budget_usage_json, '$.stacRequests')
       < json_extract(OLD.budget_usage_json, '$.stacRequests')
  OR json_extract(NEW.budget_usage_json, '$.assetRequests')
       < json_extract(OLD.budget_usage_json, '$.assetRequests')
  OR json_extract(NEW.budget_usage_json, '$.reservedDownloadedBytes')
       < json_extract(OLD.budget_usage_json, '$.reservedDownloadedBytes')
  OR json_extract(NEW.budget_usage_json, '$.downloadedBytes')
       < json_extract(OLD.budget_usage_json, '$.downloadedBytes')
  OR json_extract(NEW.budget_usage_json, '$.processedBytes')
       < json_extract(OLD.budget_usage_json, '$.processedBytes')
  OR json_extract(NEW.budget_usage_json, '$.rowsRead')
       < json_extract(OLD.budget_usage_json, '$.rowsRead')
  OR json_extract(NEW.budget_usage_json, '$.candidates')
       < json_extract(OLD.budget_usage_json, '$.candidates')
  OR json_extract(NEW.budget_usage_json, '$.retryAttempts')
       < json_extract(OLD.budget_usage_json, '$.retryAttempts')
BEGIN
  SELECT RAISE(ABORT, 'Overture cumulative budget usage cannot decrease');
END;
