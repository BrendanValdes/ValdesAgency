import { rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  LeadPolicyValidationError,
  loadRuntimeLeadPolicy,
} from "../../src/lead-engine/config/lead-policy.js";
import {
  createTemporaryLeadPolicyRoot,
  updatePolicyYaml,
} from "./helpers/lead-policy-fixture.js";

type MutableProvider = Record<string, unknown>;

function providers(value: Record<string, unknown>): Record<string, MutableProvider> {
  return value.providers as Record<string, MutableProvider>;
}

function expectPolicyError(root: string, code?: string): void {
  try {
    loadRuntimeLeadPolicy({ configurationRoot: root });
    throw new Error("Expected lead policy loading to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(LeadPolicyValidationError);
    if (code) expect((error as LeadPolicyValidationError).code).toBe(code);
    expect(JSON.stringify(error)).not.toMatch(/secret|api[_-]?key|token/i);
  }
}

describe("executable lead policy", () => {
  it("loads the checked-in policy as deeply immutable and default-deny", () => {
    const policy = loadRuntimeLeadPolicy();
    expect(policy).toMatchObject({
      policyVersion: "1.0.0",
      networkMode: "disabled",
      paidProvidersEnabled: false,
      externalVerificationEnabled: false,
      requestBudget: 0,
      byteBudget: 0,
      costBudgetMicroUsd: 0,
      defaultNiche: "pool_service",
      enabledNiches: ["pool_service"],
    });
    const enabledProviders = Object.values(policy.providers).filter((provider) => provider.enabled);
    expect(enabledProviders.map((provider) => provider.id)).toEqual([
      "fixture",
      "overture_local",
    ]);
    expect(enabledProviders.every((provider) =>
      ["synthetic_fixture", "local_public_dataset"].includes(provider.sourceClass))).toBe(true);
    expect(policy.providers.website_http).toMatchObject({
      sourceClass: "public_web",
      enabled: false,
      requiresNetwork: true,
    });
    expect(Object.isFrozen(policy)).toBe(true);
    expect(Object.isFrozen(policy.providers)).toBe(true);
    expect(Object.isFrozen(policy.providers.fixture)).toBe(true);
    expect(Object.isFrozen(policy.niches.pool_service)).toBe(true);
    expect(() => {
      (policy.providers.fixture as { enabled: boolean }).enabled = false;
    }).toThrow();
  });

  it("fails when a policy file is missing", () => {
    const fixture = createTemporaryLeadPolicyRoot();
    try {
      rmSync(path.join(fixture.root, "providers.yaml"));
      expectPolicyError(fixture.root, "policy_file_missing");
    } finally {
      fixture.cleanup();
    }
  });

  it("fails on malformed YAML and invalid top-level structures", () => {
    const malformed = createTemporaryLeadPolicyRoot();
    try {
      writeFileSync(path.join(malformed.root, "providers.yaml"), "providers: [");
      expectPolicyError(malformed.root, "yaml_invalid");
    } finally {
      malformed.cleanup();
    }
    const scalar = createTemporaryLeadPolicyRoot();
    try {
      writeFileSync(path.join(scalar.root, "schema.yaml"), "- invalid\n- top-level\n");
      expectPolicyError(scalar.root, "schema_invalid");
    } finally {
      scalar.cleanup();
    }
  });

  it("rejects duplicate provider IDs before schema validation", () => {
    const fixture = createTemporaryLeadPolicyRoot();
    try {
      writeFileSync(
        path.join(fixture.root, "providers.yaml"),
        "configuration_version: 1.0.0\nfixture_kind: synthetic\nproviders:\n  fixture: {}\n  fixture: {}\n",
      );
      expectPolicyError(fixture.root, "yaml_invalid");
    } finally {
      fixture.cleanup();
    }
  });

  it("rejects unsupported provider classes and network modes", () => {
    const providerType = createTemporaryLeadPolicyRoot();
    try {
      updatePolicyYaml(providerType.root, "providers.yaml", (value) => {
        providers(value).fixture!.source_class = "unsupported";
      });
      expectPolicyError(providerType.root, "schema_invalid");
    } finally {
      providerType.cleanup();
    }
    const networkMode = createTemporaryLeadPolicyRoot();
    try {
      updatePolicyYaml(networkMode.root, "schema.yaml", (value) => {
        value.network_mode = "automatic";
      });
      expectPolicyError(networkMode.root, "schema_invalid");
    } finally {
      networkMode.cleanup();
    }
  });

  it("rejects negative and above-global budgets", () => {
    const negative = createTemporaryLeadPolicyRoot();
    try {
      updatePolicyYaml(negative.root, "schema.yaml", (value) => {
        value.request_budget = -1;
      });
      expectPolicyError(negative.root, "schema_invalid");
    } finally {
      negative.cleanup();
    }
    const excessive = createTemporaryLeadPolicyRoot();
    try {
      updatePolicyYaml(excessive.root, "providers.yaml", (value) => {
        providers(value).website_http!.request_budget = 1;
      });
      expectPolicyError(excessive.root, "provider_request_budget_exceeds_global");
    } finally {
      excessive.cleanup();
    }
  });

  it("rejects enabled public networking under disabled global policy", () => {
    const fixture = createTemporaryLeadPolicyRoot();
    try {
      updatePolicyYaml(fixture.root, "providers.yaml", (value) => {
        providers(value).website_http!.enabled = true;
      });
      expectPolicyError(fixture.root, "enabled_network_provider_blocked");
    } finally {
      fixture.cleanup();
    }
  });

  it("rejects enabled cost-bearing providers when paid providers are disabled", () => {
    const fixture = createTemporaryLeadPolicyRoot();
    try {
      updatePolicyYaml(fixture.root, "schema.yaml", (value) => {
        value.cost_budget_micro_usd = 10;
      });
      updatePolicyYaml(fixture.root, "providers.yaml", (value) => {
        const provider = providers(value).fixture!;
        provider.can_incur_cost = true;
        provider.cost_budget_micro_usd = 10;
      });
      expectPolicyError(fixture.root, "enabled_paid_provider_blocked");
    } finally {
      fixture.cleanup();
    }
  });

  it("rejects an enabled external verifier without explicit verification permission", () => {
    const fixture = createTemporaryLeadPolicyRoot();
    try {
      updatePolicyYaml(fixture.root, "schema.yaml", (value) => {
        value.network_mode = "public_web";
        value.request_budget = 1;
        value.byte_budget = 1_000_000;
      });
      updatePolicyYaml(fixture.root, "providers.yaml", (value) => {
        const provider = providers(value).verification_external!;
        provider.enabled = true;
        provider.request_budget = 1;
        provider.byte_budget = 1_000_000;
        provider.max_request_duration_ms = 10_000;
      });
      expectPolicyError(fixture.root, "external_verification_blocked");
    } finally {
      fixture.cleanup();
    }
  });

  it("rejects zero, multiple, unsupported, and non-default enabled niche sets", () => {
    const cases: Array<[unknown, unknown, string]> = [
      [[], "pool_service", "enabled_niche_missing"],
      [["pool_service", "septic_pumping_repair"], "pool_service", "multiple_enabled_niches"],
      [["septic_pumping_repair"], "septic_pumping_repair", "unsupported_enabled_niche"],
      [["pool_service"], "septic_pumping_repair", "default_niche_not_enabled"],
    ];
    for (const [enabled, defaultNiche, code] of cases) {
      const fixture = createTemporaryLeadPolicyRoot();
      try {
        updatePolicyYaml(fixture.root, "schema.yaml", (value) => {
          value.enabled_niches = enabled;
          value.default_niche = defaultNiche;
        });
        expectPolicyError(fixture.root, code);
      } finally {
        fixture.cleanup();
      }
    }
  });

  it("rejects unknown policy keys rather than silently ignoring them", () => {
    const fixture = createTemporaryLeadPolicyRoot();
    try {
      updatePolicyYaml(fixture.root, "schema.yaml", (value) => {
        value.network_override = true;
      });
      expectPolicyError(fixture.root, "schema_invalid");
    } finally {
      fixture.cleanup();
    }
  });
});
