import type { ProviderErrorCategory } from "../contracts.js";

export type OverturePlacesErrorCode =
  | "catalog_invalid"
  | "catalog_oversized"
  | "catalog_transport_failed"
  | "release_invalid"
  | "release_missing"
  | "release_ambiguous"
  | "release_changed"
  | "schema_unsupported"
  | "schema_invalid"
  | "asset_invalid"
  | "query_invalid"
  | "taxonomy_unsupported"
  | "budget_exhausted"
  | "cancelled"
  | "result_invalid"
  | "secure_remote_geoparquet_transport_unavailable"
  // Secure capability-controlled byte-range transport (Phase 5A.1). Every code
  // below is a deterministic, caller- or server-side protocol violation and is
  // therefore non-retryable by default (see OverturePlacesError.retryable);
  // range_status_invalid is the sole exception and sets retryable explicitly at
  // its throw site for 429/5xx.
  | "range_transport_untrusted"
  | "range_invalid"
  | "range_oversized"
  | "range_headers_oversized"
  | "range_status_invalid"
  | "range_compressed"
  | "range_transfer_invalid"
  | "range_multipart_rejected"
  | "range_length_mismatch"
  | "range_cache_capacity_exceeded"
  | "content_range_invalid"
  | "content_range_mismatch"
  // Stable asset-identity binding across ranged reads and retries.
  | "asset_identity_invalid"
  | "asset_identity_unavailable"
  | "asset_identity_changed"
  // Parquet container safety validated at the transport boundary.
  | "parquet_magic_invalid"
  | "parquet_metadata_invalid"
  // The official asset layout cannot support safe bounded row-group pruning or
  // projection within the canary budget; the reader fails closed rather than
  // scanning the asset.
  | "overture_data_layout_unsupported"
  // The official place collection could not be paired one-to-one with partition
  // extents, covers no partition for the coverage cell, or spans more partitions
  // than the bounded run may read. Never widened by guessing a partition.
  | "partition_unresolved";

export class OverturePlacesError extends Error {
  readonly code: OverturePlacesErrorCode;
  readonly category: ProviderErrorCategory;
  readonly retryable: boolean;

  constructor(input: {
    code: OverturePlacesErrorCode;
    message: string;
    category?: ProviderErrorCategory;
    retryable?: boolean;
  }) {
    super(input.message);
    this.name = "OverturePlacesError";
    this.code = input.code;
    this.category = input.category ?? "provider_failure";
    this.retryable = input.retryable ?? false;
  }
}

export function overtureFailure(
  code: OverturePlacesErrorCode,
  message: string,
  options: { category?: ProviderErrorCategory; retryable?: boolean } = {},
): OverturePlacesError {
  return new OverturePlacesError({ code, message, ...options });
}
