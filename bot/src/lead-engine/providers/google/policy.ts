import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse, stringify } from "yaml";
import { loadRuntimeLeadPolicy, type RuntimeLeadPolicy } from "../../config/lead-policy.js";
import { GOOGLE_PLACES_PROVIDER_ID } from "./types.js";

/**
 * Activate the `search` discovery provider for one bounded Google Places run in
 * a throwaway policy tree under the OS temp directory.
 *
 * Mirrors the website canary policy exactly: the checked-in configuration keeps
 * live discovery disabled, nothing is written back to the repository, and the
 * tree is removed on cleanup. Only `search` is touched — no other provider is
 * enabled, and cost stays pinned at zero so a paid call cannot be authorized.
 */

export interface EphemeralGooglePlacesPolicy {
  readonly policy: RuntimeLeadPolicy;
  readonly root: string;
  cleanup(): void;
}

/** Hard ceiling for one run, matching the operator-approved Text Search cap. */
export const GOOGLE_PLACES_MAX_RUN_REQUESTS = 500;

function readObject(filePath: string): Record<string, unknown> {
  return parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
}

export function createEphemeralGooglePlacesPolicy(input: {
  checkedInConfigurationRoot: string;
  maxRequests: number;
  maxBytes: number;
  maxRequestDurationMs: number;
  capabilityTtlSeconds: number;
}): EphemeralGooglePlacesPolicy {
  if (!path.isAbsolute(input.checkedInConfigurationRoot)) {
    throw new Error("Checked-in lead policy root must be absolute");
  }
  if (!Number.isSafeInteger(input.maxRequests) || input.maxRequests < 1 ||
    input.maxRequests > GOOGLE_PLACES_MAX_RUN_REQUESTS) {
    throw new Error("Google Places request budget is invalid or exceeds the hard run cap");
  }
  if (!Number.isSafeInteger(input.maxBytes) || input.maxBytes < 1 ||
    input.maxBytes > 64 * 1024 * 1024) {
    throw new Error("Google Places byte budget is invalid or exceeds hard limits");
  }
  if (!Number.isSafeInteger(input.maxRequestDurationMs) || input.maxRequestDurationMs < 1 ||
    input.maxRequestDurationMs > 30_000) {
    throw new Error("Google Places request duration is invalid or exceeds hard limits");
  }
  if (!Number.isSafeInteger(input.capabilityTtlSeconds) || input.capabilityTtlSeconds < 1 ||
    input.capabilityTtlSeconds > 3_600) {
    throw new Error("Google Places capability TTL is invalid or exceeds hard limits");
  }

  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "rocco-google-places-policy-"));
  const root = path.join(temporaryRoot, "leads");
  try {
    cpSync(input.checkedInConfigurationRoot, root, { recursive: true });

    const schemaPath = path.join(root, "schema.yaml");
    const schema = readObject(schemaPath);
    schema.network_mode = "public_web";
    schema.request_budget = input.maxRequests;
    schema.byte_budget = input.maxBytes;
    schema.cost_budget_micro_usd = 0;
    schema.max_request_duration_ms = input.maxRequestDurationMs;
    schema.capability_ttl_seconds = input.capabilityTtlSeconds;
    writeFileSync(schemaPath, stringify(schema), { encoding: "utf8", mode: 0o600 });

    const providersPath = path.join(root, "providers.yaml");
    const providerFile = readObject(providersPath);
    const providers = providerFile.providers as Record<string, Record<string, unknown>>;
    const provider = providers[GOOGLE_PLACES_PROVIDER_ID];
    if (!provider) throw new Error("Checked-in policy is missing the disabled search provider");
    provider.enabled = true;
    provider.request_budget = input.maxRequests;
    provider.byte_budget = input.maxBytes;
    provider.cost_budget_micro_usd = 0;
    provider.max_request_duration_ms = input.maxRequestDurationMs;
    writeFileSync(providersPath, stringify(providerFile), { encoding: "utf8", mode: 0o600 });

    const policy = loadRuntimeLeadPolicy({ configurationRoot: root });
    const live = policy.providers[GOOGLE_PLACES_PROVIDER_ID];
    if (!live?.enabled || policy.networkMode !== "public_web" ||
      !live.operations.includes("discovery") || live.canIncurCost ||
      policy.paidProvidersEnabled ||
      live.requestBudget !== input.maxRequests || live.byteBudget !== input.maxBytes) {
      throw new Error("Ephemeral Google Places policy activation did not validate");
    }
    return {
      policy,
      root,
      cleanup: () => rmSync(temporaryRoot, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}
