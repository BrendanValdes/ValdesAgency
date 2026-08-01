import type { DiscoveryProviderGateway } from "./provider-gateway.js";

export class ProviderRegistry {
  readonly #providers = new Map<string, DiscoveryProviderGateway>();

  register(provider: DiscoveryProviderGateway): void {
    if (this.#providers.has(provider.providerId)) {
      throw new Error(`Provider is already registered: ${provider.providerId}`);
    }
    this.#providers.set(provider.providerId, provider);
  }

  require(providerId: string): DiscoveryProviderGateway {
    const provider = this.#providers.get(providerId);
    if (!provider) throw new Error(`Unsupported or disabled provider: ${providerId}`);
    return provider;
  }

  list(): string[] {
    return [...this.#providers.keys()].sort();
  }
}

