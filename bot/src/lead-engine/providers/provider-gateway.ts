import type {
  DiscoveryProviderRequest,
  NormalizedDiscoveryResult,
  ProviderEnvelope,
} from "./contracts.js";

export interface ProviderBatch<T> {
  status: "complete" | "partial" | "failed";
  envelopes: ReadonlyArray<ProviderEnvelope<T>>;
}

export interface DiscoveryProviderGateway {
  readonly providerId: string;
  discover(
    request: DiscoveryProviderRequest,
  ): Promise<ProviderBatch<NormalizedDiscoveryResult>>;
}

