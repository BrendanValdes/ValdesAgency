import { describe, expect, it } from "vitest";
import {
  loadRuntimeLeadPolicy,
  type RuntimeLeadPolicy,
} from "../../src/lead-engine/config/lead-policy.js";
import {
  NetworkPolicyAuthorizer,
  type PublicWebCapability,
} from "../../src/lead-engine/config/network-capability.js";
import { createDirectHttpFetcher } from "../../src/lead-engine/crawl/fetchers/direct-http.js";
import type { DiscoveryProviderGateway } from "../../src/lead-engine/providers/provider-gateway.js";
import { ProviderRegistry } from "../../src/lead-engine/providers/registry.js";
import {
  createTemporaryLeadPolicyRoot,
  updatePolicyYaml,
} from "./helpers/lead-policy-fixture.js";

type MutableProvider = Record<string, unknown>;

function providerDefinitions(value: Record<string, unknown>): Record<string, MutableProvider> {
  return value.providers as Record<string, MutableProvider>;
}

function publicWebPolicy(options: {
  requests?: number;
  bytes?: number;
  paid?: boolean;
  costMicroUsd?: number;
} = {}): RuntimeLeadPolicy {
  const requests = options.requests ?? 4;
  const bytes = options.bytes ?? 8_000_000;
  const costMicroUsd = options.costMicroUsd ?? 0;
  const fixture = createTemporaryLeadPolicyRoot();
  try {
    updatePolicyYaml(fixture.root, "schema.yaml", (value) => {
      value.network_mode = "public_web";
      value.request_budget = requests;
      value.byte_budget = bytes;
      value.paid_providers_enabled = options.paid ?? false;
      value.cost_budget_micro_usd = costMicroUsd;
    });
    updatePolicyYaml(fixture.root, "providers.yaml", (value) => {
      const provider = providerDefinitions(value).website_http!;
      provider.enabled = true;
      provider.request_budget = requests;
      provider.byte_budget = bytes;
      provider.max_request_duration_ms = 10_000;
      provider.can_incur_cost = options.paid ?? false;
      provider.cost_budget_micro_usd = costMicroUsd;
    });
    return loadRuntimeLeadPolicy({ configurationRoot: fixture.root });
  } finally {
    fixture.cleanup();
  }
}

function issue(
  authorizer: NetworkPolicyAuthorizer,
  overrides: Partial<Parameters<NetworkPolicyAuthorizer["issuePublicWebCapability"]>[0]> = {},
): PublicWebCapability {
  return authorizer.issuePublicWebCapability({
    providerId: "website_http",
    runId: "run-synthetic-capability",
    assessmentId: "assessment-synthetic-capability",
    maxRequests: 1,
    maxBytes: 2_000_000,
    maxBytesPerRequest: 1_000_000,
    maxRequestDurationMs: 10_000,
    costBudgetMicroUsd: 0,
    ttlMs: 60_000,
    ...overrides,
  });
}

function binding(capability: PublicWebCapability) {
  return {
    capability,
    providerId: capability.providerId,
    runId: capability.runId,
    assessmentId: capability.assessmentId,
  };
}

function gateway(providerId: string): DiscoveryProviderGateway {
  return {
    providerId,
    async discover() {
      return { status: "complete", envelopes: [] };
    },
  };
}

describe("public-web network capability", () => {
  it("cannot be issued from the checked-in disabled policy", () => {
    const authorizer = new NetworkPolicyAuthorizer(loadRuntimeLeadPolicy());
    expect(() => issue(authorizer)).toThrow();
  });

  it("rejects disabled, synthetic-fixture, and local-dataset providers", () => {
    const authorizer = new NetworkPolicyAuthorizer(publicWebPolicy());
    expect(() => issue(authorizer, { providerId: "overture_live" })).toThrow("provider_disabled");
    expect(() => issue(authorizer, { providerId: "fixture" })).toThrow("provider_not_public_web");
    expect(() => issue(authorizer, { providerId: "overture_local" })).toThrow("provider_not_public_web");
    expect(() => issue(authorizer, { providerId: "missing_provider" })).toThrow("provider_missing");
  });

  it("enforces authorizer request allocation exhaustion", () => {
    const authorizer = new NetworkPolicyAuthorizer(publicWebPolicy({ requests: 1 }));
    issue(authorizer);
    expect(() => issue(authorizer)).toThrow("request_budget_exhausted");
  });

  it("revalidates and consumes capability budget at request execution", async () => {
    const capability = issue(new NetworkPolicyAuthorizer(publicWebPolicy({ requests: 1 })));
    const fetcher = createDirectHttpFetcher({
      ...binding(capability),
      resolver: {
        async resolve() {
          throw new Error("synthetic offline resolver failure");
        },
      },
    });
    await expect(fetcher.fetch({ url: "https://public.example/" })).resolves.toMatchObject({
      ok: false,
      errorCode: "dns_failure",
    });
    await expect(fetcher.fetch({ url: "https://public.example/" })).resolves.toMatchObject({
      ok: false,
      errorCode: "policy_rejected",
    });
  });

  it("enforces cost allocation for cost-bearing providers", () => {
    const authorizer = new NetworkPolicyAuthorizer(publicWebPolicy({
      requests: 2,
      bytes: 4_000_000,
      paid: true,
      costMicroUsd: 10,
    }));
    issue(authorizer, { costBudgetMicroUsd: 10 });
    expect(() => issue(authorizer, { costBudgetMicroUsd: 1 })).toThrow("cost_budget_exhausted");
  });

  it("rejects fabricated capabilities and construction without a capability", () => {
    expect(() => (createDirectHttpFetcher as unknown as () => unknown)()).toThrow("capability_missing");
    expect(() => createDirectHttpFetcher({
      capability: {
        kind: "public_web_capability",
        providerId: "website_http",
        runId: "forged-run",
        assessmentId: "forged-assessment",
        networkClass: "public_web",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        limits: {
          maxRequests: 1,
          maxBytes: 2_000_000,
          maxBytesPerRequest: 1_000_000,
          maxRequestDurationMs: 10_000,
          costBudgetMicroUsd: 0,
        },
      },
      providerId: "website_http",
      runId: "forged-run",
      assessmentId: "forged-assessment",
    })).toThrow("capability_untrusted");
  });

  it("binds capabilities to one provider, run, and assessment scope", () => {
    const capability = issue(new NetworkPolicyAuthorizer(publicWebPolicy()));
    expect(() => createDirectHttpFetcher({
      ...binding(capability),
      providerId: "other_provider",
    })).toThrow("capability_provider_mismatch");
    expect(() => createDirectHttpFetcher({
      ...binding(capability),
      runId: "other-run",
    })).toThrow("capability_run_mismatch");
    expect(() => createDirectHttpFetcher({
      ...binding(capability),
      assessmentId: "other-assessment",
    })).toThrow("capability_assessment_mismatch");
  });

  it("rejects expired and revoked capabilities at runtime", async () => {
    let now = Date.parse("2026-01-15T12:00:00.000Z");
    const expiringAuthorizer = new NetworkPolicyAuthorizer(publicWebPolicy(), { now: () => now });
    const expiring = issue(expiringAuthorizer, { ttlMs: 1_000 });
    now += 1_000;
    expect(() => createDirectHttpFetcher(binding(expiring))).toThrow("capability_expired");

    const revokingAuthorizer = new NetworkPolicyAuthorizer(publicWebPolicy());
    const revoked = issue(revokingAuthorizer);
    const fetcher = createDirectHttpFetcher(binding(revoked));
    revokingAuthorizer.revoke(revoked);
    await expect(fetcher.fetch({ url: "https://public.example/" })).resolves.toMatchObject({
      ok: false,
      errorCode: "policy_rejected",
      attempts: 0,
    });
  });

  it("constructs a scoped public fetcher without activating network access", () => {
    const capability = issue(new NetworkPolicyAuthorizer(publicWebPolicy()));
    const fetcher = createDirectHttpFetcher(binding(capability));
    expect(fetcher).toMatchObject({ sourceClass: "public_web" });
  });

  it("enforces provider policy in the manually populated registry", () => {
    const policy = loadRuntimeLeadPolicy();
    const registry = new ProviderRegistry(policy);
    registry.register(gateway("fixture"));
    expect(registry.list()).toEqual(["fixture"]);
    expect(() => registry.register(gateway("search"))).toThrow("disabled by executable policy");
    expect(() => registry.register(gateway("missing"))).toThrow("provider_missing");
  });
});
