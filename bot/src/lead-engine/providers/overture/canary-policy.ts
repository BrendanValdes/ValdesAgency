import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse, stringify } from "yaml";
import { loadRuntimeLeadPolicy, type RuntimeLeadPolicy } from "../../config/lead-policy.js";
import { OVERTURE_PLACES_PROVIDER_ID } from "./types.js";

export interface EphemeralOvertureCanaryPolicy {
  readonly policy: RuntimeLeadPolicy;
  readonly root: string;
  cleanup(): void;
}

function readObject(filePath: string): Record<string, unknown> {
  return parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
}

export function createEphemeralOvertureCanaryPolicy(input: {
  checkedInConfigurationRoot: string;
  maxRequests: number;
  maxBytes: number;
  maxDurationMs: number;
}): EphemeralOvertureCanaryPolicy {
  if (!path.isAbsolute(input.checkedInConfigurationRoot)) {
    throw new Error("Checked-in lead policy root must be absolute");
  }
  if (!Number.isSafeInteger(input.maxRequests) || input.maxRequests < 1 || input.maxRequests > 32 ||
    !Number.isSafeInteger(input.maxBytes) || input.maxBytes < 1 || input.maxBytes > 256 * 1024 * 1024 ||
    !Number.isSafeInteger(input.maxDurationMs) || input.maxDurationMs < 1 || input.maxDurationMs > 120_000) {
    throw new Error("Ephemeral Overture canary budgets are invalid or exceed hard limits");
  }
  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "rocco-overture-canary-policy-"));
  const root = path.join(temporaryRoot, "leads");
  try {
    cpSync(input.checkedInConfigurationRoot, root, { recursive: true });
    const schemaPath = path.join(root, "schema.yaml");
    const schema = readObject(schemaPath);
    schema.network_mode = "public_web";
    schema.request_budget = input.maxRequests;
    schema.byte_budget = input.maxBytes;
    schema.cost_budget_micro_usd = 0;
    schema.max_request_duration_ms = input.maxDurationMs;
    writeFileSync(schemaPath, stringify(schema), { encoding: "utf8", mode: 0o600 });

    const providersPath = path.join(root, "providers.yaml");
    const providerFile = readObject(providersPath);
    const providers = providerFile.providers as Record<string, Record<string, unknown>>;
    const provider = providers[OVERTURE_PLACES_PROVIDER_ID];
    if (!provider) throw new Error("Checked-in policy is missing the disabled Overture Places provider");
    provider.enabled = true;
    provider.request_budget = input.maxRequests;
    provider.byte_budget = input.maxBytes;
    provider.cost_budget_micro_usd = 0;
    provider.max_request_duration_ms = input.maxDurationMs;
    writeFileSync(providersPath, stringify(providerFile), { encoding: "utf8", mode: 0o600 });

    const policy = loadRuntimeLeadPolicy({ configurationRoot: root });
    const live = policy.providers[OVERTURE_PLACES_PROVIDER_ID];
    if (!live?.enabled || policy.networkMode !== "public_web" ||
      live.requestBudget !== input.maxRequests || live.byteBudget !== input.maxBytes) {
      throw new Error("Ephemeral Overture canary policy activation did not validate");
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
