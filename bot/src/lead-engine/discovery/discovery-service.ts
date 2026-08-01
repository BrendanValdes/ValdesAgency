import {
  loadNicheConfigurations,
  resolveNicheConfiguration,
} from "../config/niches.js";
import type { CoverageCell } from "../geography/types.js";
import type { FixtureScenario } from "../providers/contracts.js";
import type { ProviderRegistry } from "../providers/registry.js";
import { generateDiscoveryQueries } from "./query-generator.js";
import {
  acceptedDiscoveryObservations,
  type DiscoveryObservation,
} from "./result-normalizer.js";

export class DiscoveryService {
  readonly #providers: ProviderRegistry;

  constructor(providers: ProviderRegistry) {
    this.#providers = providers;
  }

  async discover(input: {
    nicheId?: string;
    providerId: string;
    geography: CoverageCell;
    queryVersion: string;
    correlationId: string;
    observedAt: string;
    retrievedAt: string;
    fixtureScenario?: FixtureScenario;
  }): Promise<DiscoveryObservation[]> {
    const niche = resolveNicheConfiguration(input.nicheId, loadNicheConfigurations());
    const provider = this.#providers.require(input.providerId);
    const queries = generateDiscoveryQueries({
      niche,
      geography: input.geography,
      queryVersion: input.queryVersion,
    });
    const observations: DiscoveryObservation[] = [];
    for (const query of queries) {
      const batch = await provider.discover({
        operation: "discovery",
        correlationId: `${input.correlationId}:${query.queryId}`,
        queryId: query.queryId,
        queryText: query.text,
        nicheId: niche.id,
        coverageKey: input.geography.coverageKey,
        observedAt: input.observedAt,
        retrievedAt: input.retrievedAt,
        fixtureScenario: input.fixtureScenario,
      });
      observations.push(...acceptedDiscoveryObservations(batch.envelopes));
    }
    return acceptedDiscoveryObservations(
      observations.map((observation) => ({
        providerId: observation.providerId,
        operation: "discovery",
        providerSchemaVersion: "normalized-observation-1.0.0",
        correlationId: observation.correlationId,
        providerResultId: observation.providerResultId,
        observedAt: observation.observedAt,
        retrievedAt: observation.retrievedAt,
        cost: { billable: false, billableUnits: 0, unit: "none", microUsd: 0 },
        cache: { status: "bypassed", key: null },
        normalizedResult: observation.result,
        validation: { status: "accepted", issues: [] },
        error: null,
        rawReferenceChecksum: null,
      })),
    );
  }
}
