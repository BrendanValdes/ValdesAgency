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
  | "secure_remote_geoparquet_transport_unavailable";

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
