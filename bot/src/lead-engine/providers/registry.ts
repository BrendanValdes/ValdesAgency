import {
  assertRuntimeLeadPolicy,
  requireProviderPolicy,
  type RuntimeLeadPolicy,
} from "../config/lead-policy.js";
import type { DiscoveryProviderGateway } from "./provider-gateway.js";

export class ProviderRegistry {
  readonly #providers = new Map<string, DiscoveryProviderGateway>();
  readonly #policy: RuntimeLeadPolicy;

  constructor(policy: RuntimeLeadPolicy) {
    assertRuntimeLeadPolicy(policy);
    this.#policy = policy;
  }

  register(provider: DiscoveryProviderGateway): void {
    const providerPolicy = requireProviderPolicy(this.#policy, provider.providerId);
    if (!providerPolicy.enabled || !providerPolicy.operations.includes("discovery")) {
      throw new Error(`Provider is disabled by executable policy: ${provider.providerId}`);
    }
    if (this.#providers.has(provider.providerId)) {
      throw new Error(`Provider is already registered: ${provider.providerId}`);
    }
    this.#providers.set(provider.providerId, provider);
  }

  require(providerId: string): DiscoveryProviderGateway {
    const providerPolicy = requireProviderPolicy(this.#policy, providerId);
    if (!providerPolicy.enabled || !providerPolicy.operations.includes("discovery")) {
      throw new Error(`Provider is disabled by executable policy: ${providerId}`);
    }
    const provider = this.#providers.get(providerId);
    if (!provider) throw new Error(`Unsupported or disabled provider: ${providerId}`);
    return provider;
  }

  list(): string[] {
    return [...this.#providers.keys()].sort();
  }
}
