import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse, stringify } from "yaml";
import { loadRuntimeLeadPolicy, type RuntimeLeadPolicy } from "../config/lead-policy.js";

export const WEBSITE_HTTP_PROVIDER_ID = "website_http";

export interface EphemeralWebsiteCanaryPolicy {
  readonly policy: RuntimeLeadPolicy;
  readonly root: string;
  cleanup(): void;
}

function readObject(filePath: string): Record<string, unknown> {
  return parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
}

/**
 * Activate the website_http provider for one bounded canary run in a throwaway
 * policy tree under the OS temp directory. The checked-in configuration keeps
 * live crawling disabled; nothing here writes back to the repository, and the
 * tree is removed on cleanup. Only website_http is enabled — no other provider
 * is touched.
 */
export function createEphemeralWebsiteCanaryPolicy(input: {
  checkedInConfigurationRoot: string;
  maxRequests: number;
  maxBytes: number;
  maxDurationMs: number;
}): EphemeralWebsiteCanaryPolicy {
  if (!path.isAbsolute(input.checkedInConfigurationRoot)) {
    throw new Error("Checked-in lead policy root must be absolute");
  }
  if (!Number.isSafeInteger(input.maxRequests) || input.maxRequests < 1 || input.maxRequests > 64 ||
    !Number.isSafeInteger(input.maxBytes) || input.maxBytes < 1 || input.maxBytes > 64 * 1024 * 1024 ||
    !Number.isSafeInteger(input.maxDurationMs) || input.maxDurationMs < 1 || input.maxDurationMs > 120_000) {
    throw new Error("Ephemeral website canary budgets are invalid or exceed hard limits");
  }
  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "rocco-website-canary-policy-"));
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
    const provider = providers[WEBSITE_HTTP_PROVIDER_ID];
    if (!provider) throw new Error("Checked-in policy is missing the disabled website_http provider");
    provider.enabled = true;
    provider.request_budget = input.maxRequests;
    provider.byte_budget = input.maxBytes;
    provider.cost_budget_micro_usd = 0;
    provider.max_request_duration_ms = input.maxDurationMs;
    writeFileSync(providersPath, stringify(providerFile), { encoding: "utf8", mode: 0o600 });

    const policy = loadRuntimeLeadPolicy({ configurationRoot: root });
    const live = policy.providers[WEBSITE_HTTP_PROVIDER_ID];
    if (!live?.enabled || policy.networkMode !== "public_web" ||
      !live.operations.includes("website_assessment") || live.canIncurCost ||
      live.requestBudget !== input.maxRequests || live.byteBudget !== input.maxBytes) {
      throw new Error("Ephemeral website canary policy activation did not validate");
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
