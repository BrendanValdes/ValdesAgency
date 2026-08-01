import { z } from "zod";
import type { ClaimState, ProvenanceSourceClass } from "../domain/provenance.js";

export const PROVIDER_ERROR_CATEGORIES = [
  "unavailable",
  "timeout",
  "rate_limited",
  "authentication_failed",
  "authorization_failed",
  "schema_validation_failed",
  "policy_blocked",
  "unsupported_operation",
  "budget_blocked",
  "cancelled",
  "provider_failure",
] as const;

export type ProviderErrorCategory = (typeof PROVIDER_ERROR_CATEGORIES)[number];
export type ProviderOperation = "discovery";
export type FixtureScenario =
  | "success"
  | "empty"
  | "duplicate"
  | "timeout"
  | "rate_limited"
  | "unavailable"
  | "malformed"
  | "partial_failure";

export interface DiscoveryProviderRequest {
  operation: "discovery";
  correlationId: string;
  queryId: string;
  queryText: string;
  nicheId: string;
  coverageKey: string;
  observedAt: string;
  retrievedAt: string;
  fixtureScenario?: FixtureScenario;
}

export const normalizedDiscoveryResultSchema = z
  .object({
    providerPlaceId: z.string().trim().min(1).nullable(),
    name: z.string().trim().min(1),
    categories: z.array(z.string().trim().min(1)),
    address: z
      .object({
        line1: z.string().trim().min(1).nullable(),
        city: z.string().trim().min(1),
        region: z.string().trim().min(1),
        postalCode: z.string().trim().min(1).nullable(),
        countryCode: z.string().length(2),
      })
      .strict(),
    domains: z.array(z.string().trim().min(1)),
    phones: z.array(z.string().trim().min(1)),
    emails: z.array(z.string().trim().min(1)).optional(),
    brandName: z.string().trim().min(1).nullable(),
    groupHint: z.string().trim().min(1).nullable(),
    providerObservation: z
      .object({
        releaseId: z.string().trim().min(1),
        featureVersion: z.number().int().nonnegative(),
        schemaVersion: z.string().trim().min(1),
        taxonomyMappingVersion: z.string().trim().min(1),
        basicCategory: z.string().trim().min(1).nullable(),
        taxonomyPrimary: z.string().trim().min(1).nullable(),
        taxonomyHierarchy: z.array(z.string().trim().min(1)),
        taxonomyAlternates: z.array(z.string().trim().min(1)),
        categoryDisposition: z.enum(["strong", "supporting", "review"]),
        providerConfidence: z.number().min(0).max(1).nullable(),
        operatingStatus: z.enum([
          "open",
          "temporarily_closed",
          "permanently_closed",
          "unknown",
        ]),
        sourceMetadata: z.array(z.object({
          property: z.string().nullable(),
          dataset: z.string().nullable(),
          recordId: z.string().nullable(),
          updateTime: z.string().datetime().nullable(),
          confidence: z.number().min(0).max(1).nullable(),
        }).strict()),
        coverageKey: z.string().trim().min(1),
        queryFingerprint: z.string().trim().min(1),
        assetIds: z.array(z.string().regex(/^[a-f0-9]{64}$/)).min(1),
      })
      .strict()
      .optional(),
  })
  .strict();

export type NormalizedDiscoveryResult = z.infer<
  typeof normalizedDiscoveryResultSchema
>;

export interface ProviderValidationResult {
  status: "accepted" | "rejected";
  issues: ReadonlyArray<{ field: string; reason: string }>;
}

export interface ProviderCostMetadata {
  billable: boolean;
  billableUnits: number;
  unit: "record" | "request" | "none";
  microUsd: number;
}

export interface ProviderCacheMetadata {
  status: "hit" | "miss" | "bypassed";
  key: string | null;
}

export interface ProviderEnvelope<T> {
  providerId: string;
  sourceClass: ProvenanceSourceClass;
  claimState: ClaimState;
  operation: ProviderOperation;
  providerSchemaVersion: string;
  correlationId: string;
  providerResultId: string | null;
  observedAt: string;
  retrievedAt: string;
  cost: ProviderCostMetadata;
  cache: ProviderCacheMetadata;
  normalizedResult: T | null;
  validation: ProviderValidationResult;
  error: { category: ProviderErrorCategory; retryable: boolean } | null;
  rawReferenceChecksum: string | null;
}
