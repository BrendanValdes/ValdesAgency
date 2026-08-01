import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument } from "yaml";
import { z } from "zod";
import {
  PHASE_2_NICHE_IDS,
  loadNicheConfigurations,
  type NicheConfiguration,
  type Phase2NicheId,
} from "./niches.js";

export const PROVIDER_SOURCE_CLASSES = [
  "synthetic_fixture",
  "local_public_dataset",
  "public_web",
  "historical_manual_artifact",
  "external_verification_provider",
] as const;

export type ProviderSourceClass = (typeof PROVIDER_SOURCE_CLASSES)[number];
export type LeadNetworkMode = "disabled" | "public_web";
export type ProviderPolicyOperation =
  | "discovery"
  | "website_assessment"
  | "historical_import"
  | "external_verification";

export interface LeadPolicyIssue {
  readonly path: string;
  readonly code: string;
}

export class LeadPolicyValidationError extends Error {
  readonly code: string;
  readonly issues: ReadonlyArray<LeadPolicyIssue>;

  constructor(code: string, issues: ReadonlyArray<LeadPolicyIssue>) {
    super(`Lead policy validation failed: ${code}`);
    this.name = "LeadPolicyValidationError";
    this.code = code;
    this.issues = Object.freeze(issues.map((issue) => Object.freeze({ ...issue })));
  }
}

const finiteBudget = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const positiveDuration = z.number().int().positive().max(120_000);
const nonnegativeDuration = z.number().int().nonnegative().max(120_000);
const version = z.string().regex(/^\d+\.\d+\.\d+$/);
const nicheId = z.enum(PHASE_2_NICHE_IDS);
const providerOperation = z.enum([
  "discovery",
  "website_assessment",
  "historical_import",
  "external_verification",
]);

const globalPolicyFileSchema = z
  .object({
    schema_version: version,
    policy_version: version,
    fixture_kind: z.literal("synthetic"),
    network_mode: z.enum(["disabled", "public_web"]),
    paid_providers_enabled: z.boolean(),
    external_verification_enabled: z.boolean(),
    request_budget: finiteBudget,
    byte_budget: finiteBudget,
    cost_budget_micro_usd: finiteBudget,
    max_request_duration_ms: positiveDuration,
    capability_ttl_seconds: z.number().int().positive().max(3_600),
    cache_policy: z
      .object({
        enabled: z.boolean(),
        ttl_seconds: finiteBudget,
        max_entries: finiteBudget,
      })
      .strict(),
    required_niche_fields: z.array(z.string().trim().min(1)).min(1),
    default_niche: nicheId,
    enabled_niches: z.array(nicheId),
  })
  .strict();

const providerDefinitionSchema = z
  .object({
    source_class: z.enum(PROVIDER_SOURCE_CLASSES),
    enabled: z.boolean(),
    operations: z.array(providerOperation).min(1),
    requires_network: z.boolean(),
    can_incur_cost: z.boolean(),
    request_budget: finiteBudget,
    byte_budget: finiteBudget,
    cost_budget_micro_usd: finiteBudget,
    max_request_duration_ms: nonnegativeDuration,
    cache_policy: z
      .object({
        enabled: z.boolean(),
        ttl_seconds: finiteBudget,
      })
      .strict(),
    access: z.enum([
      "explicitly_configured_absolute_local_fixture_only",
      "official_overture_https_only",
    ]).optional(),
    pinned_release_required: z.literal(true).optional(),
    sha256_required: z.literal(true).optional(),
  })
  .strict();

const providersFileSchema = z
  .object({
    configuration_version: version,
    fixture_kind: z.literal("synthetic"),
    providers: z.record(z.string().regex(/^[a-z][a-z0-9_]*$/), providerDefinitionSchema),
  })
  .strict();

type GlobalPolicyFile = z.infer<typeof globalPolicyFileSchema>;
type ProviderDefinitionFile = z.infer<typeof providerDefinitionSchema>;

export interface RuntimeProviderPolicy {
  readonly id: string;
  readonly sourceClass: ProviderSourceClass;
  readonly enabled: boolean;
  readonly operations: ReadonlyArray<ProviderPolicyOperation>;
  readonly requiresNetwork: boolean;
  readonly canIncurCost: boolean;
  readonly requestBudget: number;
  readonly byteBudget: number;
  readonly costBudgetMicroUsd: number;
  readonly maxRequestDurationMs: number;
  readonly cachePolicy: Readonly<{
    enabled: boolean;
    ttlSeconds: number;
  }>;
  readonly access:
    | "explicitly_configured_absolute_local_fixture_only"
    | "official_overture_https_only"
    | null;
  readonly pinnedReleaseRequired: boolean;
  readonly sha256Required: boolean;
}

export interface RuntimeLeadPolicy {
  readonly schemaVersion: string;
  readonly policyVersion: string;
  readonly providerConfigurationVersion: string;
  readonly networkMode: LeadNetworkMode;
  readonly paidProvidersEnabled: boolean;
  readonly externalVerificationEnabled: boolean;
  readonly requestBudget: number;
  readonly byteBudget: number;
  readonly costBudgetMicroUsd: number;
  readonly maxRequestDurationMs: number;
  readonly capabilityTtlMs: number;
  readonly cachePolicy: Readonly<{
    enabled: boolean;
    ttlSeconds: number;
    maxEntries: number;
  }>;
  readonly providers: Readonly<Record<string, RuntimeProviderPolicy>>;
  readonly defaultNiche: Phase2NicheId;
  readonly enabledNiches: ReadonlyArray<Phase2NicheId>;
  readonly niches: Readonly<Record<Phase2NicheId, NicheConfiguration>>;
}

export const DEFAULT_LEAD_POLICY_ROOT = fileURLToPath(
  new URL("../../../../config/leads/", import.meta.url),
);

const issuedPolicies = new WeakSet<object>();

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value)) {
      deepFreeze((value as Record<PropertyKey, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

function policyError(code: string, pathValue: string): LeadPolicyValidationError {
  return new LeadPolicyValidationError(code, [{ path: pathValue, code }]);
}

function readYaml(filePath: string, label: string): unknown {
  let source: string;
  try {
    source = readFileSync(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw policyError("policy_file_missing", label);
    }
    throw policyError("policy_file_unreadable", label);
  }

  const document = parseDocument(source, { strict: true, uniqueKeys: true });
  if (document.errors.length > 0) {
    throw policyError("yaml_invalid", label);
  }
  try {
    return document.toJS({ mapAsMap: false });
  } catch {
    throw policyError("yaml_invalid", label);
  }
}

function parseStrict<T>(
  schema: z.ZodType<T>,
  input: unknown,
  label: string,
): T {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  throw new LeadPolicyValidationError(
    "schema_invalid",
    parsed.error.issues.map((issue) => ({
      path: [label, ...issue.path.map(String)].join("."),
      code: issue.code,
    })),
  );
}

function assertProviderConsistency(
  global: GlobalPolicyFile,
  providers: Readonly<Record<string, ProviderDefinitionFile>>,
): void {
  for (const [providerId, provider] of Object.entries(providers)) {
    const pathPrefix = `providers.${providerId}`;
    const remotePublicDataset = provider.source_class === "local_public_dataset" &&
      provider.access === "official_overture_https_only";
    const networkClass = provider.source_class === "public_web" ||
      provider.source_class === "external_verification_provider" || remotePublicDataset;
    if (provider.requires_network !== networkClass) {
      throw policyError("provider_network_class_conflict", pathPrefix);
    }
    if (!provider.can_incur_cost && provider.cost_budget_micro_usd !== 0) {
      throw policyError("provider_cost_class_conflict", pathPrefix);
    }
    if (provider.cache_policy.enabled && provider.cache_policy.ttl_seconds === 0) {
      throw policyError("provider_cache_policy_conflict", pathPrefix);
    }
    if (new Set(provider.operations).size !== provider.operations.length) {
      throw policyError("duplicate_provider_operation", pathPrefix);
    }
    const allowedOperations: ReadonlyArray<ProviderPolicyOperation> =
      provider.source_class === "historical_manual_artifact"
        ? ["historical_import"]
        : provider.source_class === "external_verification_provider"
          ? ["external_verification"]
          : provider.source_class === "public_web"
            ? ["discovery", "website_assessment"]
            : ["discovery"];
    if (provider.operations.some((operation) => !allowedOperations.includes(operation))) {
      throw policyError("provider_operation_class_conflict", pathPrefix);
    }
    if (provider.request_budget > global.request_budget) {
      throw policyError("provider_request_budget_exceeds_global", pathPrefix);
    }
    if (provider.byte_budget > global.byte_budget) {
      throw policyError("provider_byte_budget_exceeds_global", pathPrefix);
    }
    if (provider.cost_budget_micro_usd > global.cost_budget_micro_usd) {
      throw policyError("provider_cost_budget_exceeds_global", pathPrefix);
    }
    if (provider.max_request_duration_ms > global.max_request_duration_ms) {
      throw policyError("provider_duration_exceeds_global", pathPrefix);
    }
    const hasLocalDatasetPinPolicy = Boolean(
      provider.access || provider.pinned_release_required || provider.sha256_required,
    );
    if (provider.source_class === "local_public_dataset") {
      if (!provider.access || !provider.pinned_release_required) {
        throw policyError("local_dataset_pin_policy_missing", pathPrefix);
      }
      if (provider.access === "explicitly_configured_absolute_local_fixture_only" &&
        !provider.sha256_required) {
        throw policyError("local_dataset_checksum_policy_missing", pathPrefix);
      }
      if (provider.access === "official_overture_https_only" && provider.sha256_required) {
        throw policyError("remote_dataset_checksum_policy_conflict", pathPrefix);
      }
    } else if (hasLocalDatasetPinPolicy) {
      throw policyError("local_dataset_pin_policy_not_applicable", pathPrefix);
    }
    if (!provider.enabled) continue;
    if (provider.requires_network && global.network_mode !== "public_web") {
      throw policyError("enabled_network_provider_blocked", pathPrefix);
    }
    if (provider.requires_network &&
      (provider.request_budget === 0 || provider.byte_budget === 0 || provider.max_request_duration_ms === 0)) {
      throw policyError("enabled_network_provider_budget_exhausted", pathPrefix);
    }
    if (provider.can_incur_cost && !global.paid_providers_enabled) {
      throw policyError("enabled_paid_provider_blocked", pathPrefix);
    }
    if (provider.can_incur_cost && provider.cost_budget_micro_usd === 0) {
      throw policyError("enabled_paid_provider_budget_exhausted", pathPrefix);
    }
    if (provider.source_class === "external_verification_provider" &&
      !global.external_verification_enabled) {
      throw policyError("external_verification_blocked", pathPrefix);
    }
  }
}

function assertNicheConsistency(
  global: GlobalPolicyFile,
  niches: ReadonlyMap<Phase2NicheId, NicheConfiguration>,
): void {
  if (new Set(global.enabled_niches).size !== global.enabled_niches.length) {
    throw policyError("duplicate_enabled_niche", "schema.enabled_niches");
  }
  if (global.enabled_niches.length === 0) {
    throw policyError("enabled_niche_missing", "schema.enabled_niches");
  }
  if (global.enabled_niches.length !== 1) {
    throw policyError("multiple_enabled_niches", "schema.enabled_niches");
  }
  if (global.enabled_niches[0] !== "pool_service") {
    throw policyError("unsupported_enabled_niche", "schema.enabled_niches");
  }
  if (!global.enabled_niches.includes(global.default_niche)) {
    throw policyError("default_niche_not_enabled", "schema.default_niche");
  }
  const enabledFiles = [...niches.values()]
    .filter((niche) => niche.enabled)
    .map((niche) => niche.id);
  if (enabledFiles.length !== 1 || enabledFiles[0] !== "pool_service") {
    throw policyError("niche_files_not_pool_only", "niches");
  }
  if (enabledFiles[0] !== global.enabled_niches[0]) {
    throw policyError("niche_policy_mismatch", "schema.enabled_niches");
  }
  if (new Set(global.required_niche_fields).size !== global.required_niche_fields.length) {
    throw policyError("duplicate_required_niche_field", "schema.required_niche_fields");
  }
  for (const [id, niche] of niches) {
    if (niche.configuration_version !== global.schema_version) {
      throw policyError("niche_version_mismatch", `niches.${id}`);
    }
    for (const field of global.required_niche_fields) {
      if (!Object.prototype.hasOwnProperty.call(niche, field)) {
        throw policyError("required_niche_field_missing", `niches.${id}`);
      }
    }
  }
}

function runtimeProvider(id: string, provider: ProviderDefinitionFile): RuntimeProviderPolicy {
  return {
    id,
    sourceClass: provider.source_class,
    enabled: provider.enabled,
    operations: [...provider.operations],
    requiresNetwork: provider.requires_network,
    canIncurCost: provider.can_incur_cost,
    requestBudget: provider.request_budget,
    byteBudget: provider.byte_budget,
    costBudgetMicroUsd: provider.cost_budget_micro_usd,
    maxRequestDurationMs: provider.max_request_duration_ms,
    cachePolicy: {
      enabled: provider.cache_policy.enabled,
      ttlSeconds: provider.cache_policy.ttl_seconds,
    },
    access: provider.access ?? null,
    pinnedReleaseRequired: provider.pinned_release_required ?? false,
    sha256Required: provider.sha256_required ?? false,
  };
}

export function loadRuntimeLeadPolicy(
  options: { configurationRoot?: string; nicheRoot?: string } = {},
): RuntimeLeadPolicy {
  const configurationRoot = options.configurationRoot ?? DEFAULT_LEAD_POLICY_ROOT;
  const global = parseStrict(
    globalPolicyFileSchema,
    readYaml(path.join(configurationRoot, "schema.yaml"), "schema.yaml"),
    "schema",
  );
  const providerFile = parseStrict(
    providersFileSchema,
    readYaml(path.join(configurationRoot, "providers.yaml"), "providers.yaml"),
    "providers",
  );
  let nicheConfigurations: ReadonlyMap<Phase2NicheId, NicheConfiguration>;
  try {
    nicheConfigurations = loadNicheConfigurations(
      options.nicheRoot ?? path.join(configurationRoot, "niches"),
    );
  } catch {
    throw policyError("niche_configuration_invalid", "niches");
  }

  assertNicheConsistency(global, nicheConfigurations);
  if (providerFile.configuration_version !== global.policy_version) {
    throw policyError("provider_policy_version_mismatch", "providers.configuration_version");
  }
  if (global.cache_policy.enabled &&
    (global.cache_policy.ttl_seconds === 0 || global.cache_policy.max_entries === 0)) {
    throw policyError("global_cache_policy_conflict", "schema.cache_policy");
  }
  assertProviderConsistency(global, providerFile.providers);

  const providers = Object.fromEntries(
    Object.entries(providerFile.providers).map(([id, provider]) => [id, runtimeProvider(id, provider)]),
  );
  const niches = Object.fromEntries(
    PHASE_2_NICHE_IDS.map((id) => [id, nicheConfigurations.get(id) as NicheConfiguration]),
  ) as Record<Phase2NicheId, NicheConfiguration>;
  const policy: RuntimeLeadPolicy = {
    schemaVersion: global.schema_version,
    policyVersion: global.policy_version,
    providerConfigurationVersion: providerFile.configuration_version,
    networkMode: global.network_mode,
    paidProvidersEnabled: global.paid_providers_enabled,
    externalVerificationEnabled: global.external_verification_enabled,
    requestBudget: global.request_budget,
    byteBudget: global.byte_budget,
    costBudgetMicroUsd: global.cost_budget_micro_usd,
    maxRequestDurationMs: global.max_request_duration_ms,
    capabilityTtlMs: global.capability_ttl_seconds * 1_000,
    cachePolicy: {
      enabled: global.cache_policy.enabled,
      ttlSeconds: global.cache_policy.ttl_seconds,
      maxEntries: global.cache_policy.max_entries,
    },
    providers,
    defaultNiche: global.default_niche,
    enabledNiches: [...global.enabled_niches],
    niches,
  };
  deepFreeze(policy);
  issuedPolicies.add(policy);
  return policy;
}

export function assertRuntimeLeadPolicy(
  policy: unknown,
): asserts policy is RuntimeLeadPolicy {
  if (!policy || typeof policy !== "object" || !issuedPolicies.has(policy)) {
    throw policyError("runtime_policy_untrusted", "policy");
  }
}

export function requireProviderPolicy(
  policy: RuntimeLeadPolicy,
  providerId: string,
): RuntimeProviderPolicy {
  assertRuntimeLeadPolicy(policy);
  const provider = policy.providers[providerId];
  if (!provider) throw policyError("provider_missing", "providerId");
  return provider;
}
