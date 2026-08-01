import {
  assertRuntimeLeadPolicy,
  requireProviderPolicy,
  type ProviderPolicyOperation,
  type RuntimeLeadPolicy,
} from "./lead-policy.js";

export interface PublicWebCapability {
  readonly kind: "public_web_capability";
  readonly providerId: string;
  readonly runId: string;
  readonly assessmentId: string;
  readonly operation: Extract<ProviderPolicyOperation, "discovery" | "website_assessment">;
  readonly networkClass: "public_web";
  readonly expiresAt: string;
  readonly limits: Readonly<{
    maxRequests: number;
    maxBytes: number;
    maxBytesPerRequest: number;
    maxRequestDurationMs: number;
    costBudgetMicroUsd: number;
  }>;
}

export interface PublicWebCapabilityBinding {
  readonly providerId: string;
  readonly runId: string;
  readonly assessmentId: string;
  readonly operation?: Extract<ProviderPolicyOperation, "discovery" | "website_assessment">;
}

interface CapabilityState {
  readonly providerId: string;
  readonly runId: string;
  readonly assessmentId: string;
  readonly operation: Extract<ProviderPolicyOperation, "discovery" | "website_assessment">;
  readonly expiresAtMs: number;
  readonly now: () => number;
  readonly maxBytesPerRequest: number;
  readonly maxRequestDurationMs: number;
  remainingRequests: number;
  remainingBytes: number;
  remainingCostMicroUsd: number;
  revoked: boolean;
}

interface RemainingProviderBudget {
  requests: number;
  bytes: number;
  costMicroUsd: number;
}

const capabilityStates = new WeakMap<object, CapabilityState>();

export class NetworkCapabilityError extends Error {
  readonly code: string;
  readonly fetchCode = "policy_rejected" as const;

  constructor(code: string) {
    super(`Network capability rejected: ${code}`);
    this.name = "NetworkCapabilityError";
    this.code = code;
  }
}

function reject(code: string): never {
  throw new NetworkCapabilityError(code);
}

function nonemptyScope(value: string, code: string): string {
  if (typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value)) reject(code);
  return value;
}

function positiveInteger(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) reject(code);
  return value;
}

function nonnegativeInteger(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 0) reject(code);
  return value;
}

function stateFor(
  capability: unknown,
  binding: PublicWebCapabilityBinding,
): CapabilityState {
  if (!capability || typeof capability !== "object") reject("capability_missing");
  const state = capabilityStates.get(capability);
  if (!state) reject("capability_untrusted");
  if (state.revoked) reject("capability_revoked");
  if (state.now() >= state.expiresAtMs) reject("capability_expired");
  if (state.providerId !== binding.providerId) reject("capability_provider_mismatch");
  if (state.runId !== binding.runId) reject("capability_run_mismatch");
  if (state.assessmentId !== binding.assessmentId) reject("capability_assessment_mismatch");
  if (state.operation !== (binding.operation ?? "website_assessment")) {
    reject("capability_operation_mismatch");
  }
  return state;
}

export class NetworkPolicyAuthorizer {
  readonly #policy: RuntimeLeadPolicy;
  readonly #now: () => number;
  #remainingGlobalRequests: number;
  #remainingGlobalBytes: number;
  #remainingGlobalCostMicroUsd: number;
  readonly #providerBudgets = new Map<string, RemainingProviderBudget>();

  constructor(
    policy: RuntimeLeadPolicy,
    options: { now?: () => number } = {},
  ) {
    assertRuntimeLeadPolicy(policy);
    this.#policy = policy;
    this.#now = options.now ?? Date.now;
    this.#remainingGlobalRequests = policy.requestBudget;
    this.#remainingGlobalBytes = policy.byteBudget;
    this.#remainingGlobalCostMicroUsd = policy.costBudgetMicroUsd;
    for (const provider of Object.values(policy.providers)) {
      this.#providerBudgets.set(provider.id, {
        requests: provider.requestBudget,
        bytes: provider.byteBudget,
        costMicroUsd: provider.costBudgetMicroUsd,
      });
    }
  }

  issuePublicWebCapability(input: {
    providerId: string;
    runId: string;
    assessmentId: string;
    operation?: Extract<ProviderPolicyOperation, "discovery" | "website_assessment">;
    maxRequests: number;
    maxBytes: number;
    maxBytesPerRequest: number;
    maxRequestDurationMs: number;
    costBudgetMicroUsd: number;
    ttlMs: number;
  }): PublicWebCapability {
    const providerId = nonemptyScope(input.providerId, "provider_id_invalid");
    const runId = nonemptyScope(input.runId, "run_id_invalid");
    const assessmentId = nonemptyScope(input.assessmentId, "assessment_id_invalid");
    const operation = input.operation ?? "website_assessment";
    const provider = requireProviderPolicy(this.#policy, providerId);
    if (!provider.enabled) reject("provider_disabled");
    if (!provider.requiresNetwork || !["public_web", "local_public_dataset"].includes(provider.sourceClass)) {
      reject("provider_not_public_web");
    }
    if (!provider.operations.includes(operation)) {
      reject("provider_operation_blocked");
    }
    if (this.#policy.networkMode !== "public_web") reject("network_disabled");

    const maxRequests = positiveInteger(input.maxRequests, "request_budget_invalid");
    const maxBytes = positiveInteger(input.maxBytes, "byte_budget_invalid");
    const maxBytesPerRequest = positiveInteger(
      input.maxBytesPerRequest,
      "request_byte_limit_invalid",
    );
    const maxRequestDurationMs = positiveInteger(
      input.maxRequestDurationMs,
      "request_duration_invalid",
    );
    const costBudgetMicroUsd = nonnegativeInteger(
      input.costBudgetMicroUsd,
      "cost_budget_invalid",
    );
    const ttlMs = positiveInteger(input.ttlMs, "capability_ttl_invalid");
    if (maxBytesPerRequest > maxBytes) reject("request_byte_limit_exceeds_capability");
    if (maxRequestDurationMs > provider.maxRequestDurationMs ||
      maxRequestDurationMs > this.#policy.maxRequestDurationMs) {
      reject("request_duration_exceeds_policy");
    }
    if (ttlMs > this.#policy.capabilityTtlMs) reject("capability_ttl_exceeds_policy");
    if (provider.canIncurCost) {
      if (!this.#policy.paidProvidersEnabled) reject("paid_providers_disabled");
      if (costBudgetMicroUsd === 0) reject("cost_budget_exhausted");
    } else if (costBudgetMicroUsd !== 0) {
      reject("cost_budget_not_applicable");
    }

    const providerBudget = this.#providerBudgets.get(providerId);
    if (!providerBudget) reject("provider_budget_missing");
    if (maxRequests > providerBudget.requests || maxRequests > this.#remainingGlobalRequests) {
      reject("request_budget_exhausted");
    }
    if (maxBytes > providerBudget.bytes || maxBytes > this.#remainingGlobalBytes) {
      reject("byte_budget_exhausted");
    }
    if (costBudgetMicroUsd > providerBudget.costMicroUsd ||
      costBudgetMicroUsd > this.#remainingGlobalCostMicroUsd) {
      reject("cost_budget_exhausted");
    }

    providerBudget.requests -= maxRequests;
    providerBudget.bytes -= maxBytes;
    providerBudget.costMicroUsd -= costBudgetMicroUsd;
    this.#remainingGlobalRequests -= maxRequests;
    this.#remainingGlobalBytes -= maxBytes;
    this.#remainingGlobalCostMicroUsd -= costBudgetMicroUsd;

    const expiresAtMs = this.#now() + ttlMs;
    const capability: PublicWebCapability = Object.freeze({
      kind: "public_web_capability",
      providerId,
      runId,
      assessmentId,
      operation,
      networkClass: "public_web",
      expiresAt: new Date(expiresAtMs).toISOString(),
      limits: Object.freeze({
        maxRequests,
        maxBytes,
        maxBytesPerRequest,
        maxRequestDurationMs,
        costBudgetMicroUsd,
      }),
    });
    capabilityStates.set(capability, {
      providerId,
      runId,
      assessmentId,
      operation,
      expiresAtMs,
      now: this.#now,
      maxBytesPerRequest,
      maxRequestDurationMs,
      remainingRequests: maxRequests,
      remainingBytes: maxBytes,
      remainingCostMicroUsd: costBudgetMicroUsd,
      revoked: false,
    });
    return capability;
  }

  revoke(capability: PublicWebCapability): void {
    const state = capabilityStates.get(capability);
    if (!state) reject("capability_untrusted");
    state.revoked = true;
  }
}

export function assertPublicWebCapability(
  capability: unknown,
  binding: PublicWebCapabilityBinding,
  limits?: { maxBytesPerRequest: number; maxRequestDurationMs: number },
): void {
  const state = stateFor(capability, binding);
  if (limits && (limits.maxBytesPerRequest > state.maxBytesPerRequest ||
    limits.maxRequestDurationMs > state.maxRequestDurationMs)) {
    reject("fetcher_limits_exceed_capability");
  }
}

export function reservePublicWebRequest(
  capability: unknown,
  binding: PublicWebCapabilityBinding,
  reservation: { bytes: number },
): void {
  const state = stateFor(capability, binding);
  const bytes = positiveInteger(reservation.bytes, "request_byte_reservation_invalid");
  if (bytes > state.maxBytesPerRequest) reject("request_byte_limit_exceeded");
  if (state.remainingRequests <= 0) reject("request_budget_exhausted");
  if (state.remainingBytes < bytes) reject("byte_budget_exhausted");
  state.remainingRequests -= 1;
  state.remainingBytes -= bytes;
}
