import { stableId } from "../shared/stable.js";
import type {
  NormalizedDiscoveryResult,
  ProviderEnvelope,
} from "../providers/contracts.js";

export interface DiscoveryObservation {
  observationId: string;
  providerId: string;
  providerResultId: string | null;
  correlationId: string;
  observedAt: string;
  retrievedAt: string;
  result: NormalizedDiscoveryResult;
}

export function acceptedDiscoveryObservations(
  envelopes: ReadonlyArray<ProviderEnvelope<NormalizedDiscoveryResult>>,
): DiscoveryObservation[] {
  const observations = new Map<string, DiscoveryObservation>();
  for (const envelope of envelopes) {
    if (envelope.validation.status !== "accepted" || envelope.normalizedResult === null) {
      continue;
    }
    const identity = envelope.providerResultId ?? stableId("provider_result", envelope.normalizedResult);
    const observationId = stableId("observation", {
      providerId: envelope.providerId,
      identity,
      correlationId: envelope.correlationId,
    });
    observations.set(`${envelope.providerId}:${identity}`, {
      observationId,
      providerId: envelope.providerId,
      providerResultId: envelope.providerResultId,
      correlationId: envelope.correlationId,
      observedAt: envelope.observedAt,
      retrievedAt: envelope.retrievedAt,
      result: envelope.normalizedResult,
    });
  }
  return [...observations.values()].sort((left, right) =>
    `${left.providerId}:${left.providerResultId ?? left.observationId}`.localeCompare(
      `${right.providerId}:${right.providerResultId ?? right.observationId}`,
    ),
  );
}
