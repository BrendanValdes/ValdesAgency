import { createHash } from "node:crypto";
import type { z } from "zod";
import type {
  ProviderCacheMetadata,
  ProviderCostMetadata,
  ProviderEnvelope,
  ProviderErrorCategory,
  ProviderOperation,
} from "./contracts.js";

interface EnvelopeBase {
  providerId: string;
  operation: ProviderOperation;
  providerSchemaVersion: string;
  correlationId: string;
  providerResultId?: string | null;
  observedAt: string;
  retrievedAt: string;
  cost?: ProviderCostMetadata;
  cache?: ProviderCacheMetadata;
  rawForChecksum?: string | Buffer;
  retainRawReference?: boolean;
}

const ZERO_COST: ProviderCostMetadata = {
  billable: false,
  billableUnits: 0,
  unit: "none",
  microUsd: 0,
};

const BYPASSED_CACHE: ProviderCacheMetadata = {
  status: "bypassed",
  key: null,
};

function rawChecksum(input: EnvelopeBase): string | null {
  if (!input.retainRawReference || input.rawForChecksum === undefined) return null;
  return createHash("sha256").update(input.rawForChecksum).digest("hex");
}

export function normalizedEnvelope<T>(
  base: EnvelopeBase,
  raw: unknown,
  schema: z.ZodType<T>,
): ProviderEnvelope<T> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      providerId: base.providerId,
      operation: base.operation,
      providerSchemaVersion: base.providerSchemaVersion,
      correlationId: base.correlationId,
      providerResultId: base.providerResultId ?? null,
      observedAt: base.observedAt,
      retrievedAt: base.retrievedAt,
      cost: base.cost ?? ZERO_COST,
      cache: base.cache ?? BYPASSED_CACHE,
      normalizedResult: null,
      validation: {
        status: "rejected",
        issues: parsed.error.issues.map((issue) => ({
          field: issue.path.join(".") || "result",
          reason: issue.code,
        })),
      },
      error: { category: "schema_validation_failed", retryable: false },
      rawReferenceChecksum: rawChecksum(base),
    };
  }
  return {
    providerId: base.providerId,
    operation: base.operation,
    providerSchemaVersion: base.providerSchemaVersion,
    correlationId: base.correlationId,
    providerResultId: base.providerResultId ?? null,
    observedAt: base.observedAt,
    retrievedAt: base.retrievedAt,
    cost: base.cost ?? ZERO_COST,
    cache: base.cache ?? BYPASSED_CACHE,
    normalizedResult: parsed.data,
    validation: { status: "accepted", issues: [] },
    error: null,
    rawReferenceChecksum: rawChecksum(base),
  };
}

export function failedEnvelope<T>(
  base: EnvelopeBase,
  category: ProviderErrorCategory,
  retryable: boolean,
): ProviderEnvelope<T> {
  return {
    providerId: base.providerId,
    operation: base.operation,
    providerSchemaVersion: base.providerSchemaVersion,
    correlationId: base.correlationId,
    providerResultId: base.providerResultId ?? null,
    observedAt: base.observedAt,
    retrievedAt: base.retrievedAt,
    cost: base.cost ?? ZERO_COST,
    cache: base.cache ?? BYPASSED_CACHE,
    normalizedResult: null,
    validation: { status: "rejected", issues: [{ field: "result", reason: category }] },
    error: { category, retryable },
    rawReferenceChecksum: rawChecksum(base),
  };
}

