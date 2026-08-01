import { microUsd } from "../../domain/money.js";
import type { ProviderCallRepository } from "../../db/repositories.js";
import { stableId } from "../../shared/stable.js";
import {
  normalizedDiscoveryResultSchema,
  type DiscoveryProviderRequest,
  type FixtureScenario,
  type NormalizedDiscoveryResult,
  type ProviderErrorCategory,
} from "../contracts.js";
import { failedEnvelope, normalizedEnvelope } from "../provider-envelope.js";
import type {
  DiscoveryProviderGateway,
  ProviderBatch,
} from "../provider-gateway.js";

export interface FixtureProviderOptions {
  records: ReadonlyArray<NormalizedDiscoveryResult>;
  providerCalls?: ProviderCallRepository;
  runId?: string;
  taskId?: string | null;
}

const ERROR_SCENARIOS: Partial<Record<FixtureScenario, ProviderErrorCategory>> = {
  timeout: "timeout",
  rate_limited: "rate_limited",
  unavailable: "unavailable",
};

export class FixtureDiscoveryProvider implements DiscoveryProviderGateway {
  readonly providerId = "fixture";
  readonly #options: FixtureProviderOptions;

  constructor(options: FixtureProviderOptions) {
    this.#options = options;
  }

  async discover(
    request: DiscoveryProviderRequest,
  ): Promise<ProviderBatch<NormalizedDiscoveryResult>> {
    const scenario = request.fixtureScenario ?? "success";
    const callId = stableId("provider_call", {
      provider: this.providerId,
      operation: request.operation,
      correlationId: request.correlationId,
    });
    if (this.#options.providerCalls && this.#options.runId) {
      this.#options.providerCalls.create({
        id: callId,
        runId: this.#options.runId,
        taskId: this.#options.taskId ?? null,
        provider: this.providerId,
        operation: request.operation,
        state: "running",
        estimatedCostMicroUsd: microUsd(0),
        actualCostMicroUsd: microUsd(0),
        cacheHit: false,
        errorReasonCode: null,
        startedAt: request.retrievedAt,
        finishedAt: null,
      });
    }

    const base = {
      providerId: this.providerId,
      sourceClass: "synthetic_fixture" as const,
      claimState: "observed" as const,
      operation: request.operation,
      providerSchemaVersion: "fixture-discovery-1.0.0",
      correlationId: request.correlationId,
      observedAt: request.observedAt,
      retrievedAt: request.retrievedAt,
      cost: { billable: false, billableUnits: 0, unit: "none" as const, microUsd: 0 },
      cache: { status: "bypassed" as const, key: null },
    };

    let batch: ProviderBatch<NormalizedDiscoveryResult>;
    const errorCategory = ERROR_SCENARIOS[scenario];
    if (errorCategory) {
      batch = {
        status: "failed",
        envelopes: [failedEnvelope(base, errorCategory, errorCategory !== "unavailable")],
      };
    } else if (scenario === "empty") {
      batch = { status: "complete", envelopes: [] };
    } else if (scenario === "malformed") {
      batch = {
        status: "failed",
        envelopes: [
          normalizedEnvelope(
            { ...base, providerResultId: "fixture-malformed" },
            { schema_drift: true },
            normalizedDiscoveryResultSchema,
          ),
        ],
      };
    } else {
      const records = scenario === "duplicate"
        ? this.#options.records.flatMap((record) => [record, record])
        : this.#options.records;
      const envelopes = records.map((record, index) =>
        normalizedEnvelope(
          {
            ...base,
            providerResultId: record.providerPlaceId ?? stableId("fixture_result", { request, index }),
          },
          record,
          normalizedDiscoveryResultSchema,
        ),
      );
      if (scenario === "partial_failure") {
        envelopes.push(
          normalizedEnvelope(
            { ...base, providerResultId: "fixture-partial-malformed" },
            { name: null },
            normalizedDiscoveryResultSchema,
          ),
        );
      }
      batch = { status: scenario === "partial_failure" ? "partial" : "complete", envelopes };
    }

    if (this.#options.providerCalls && this.#options.runId) {
      this.#options.providerCalls.updateResult(callId, {
        state: batch.status === "complete" ? "accepted" : batch.status === "partial" ? "human_review" : "failed",
        actualCostMicroUsd: microUsd(0),
        errorReasonCode: batch.status === "complete" ? null : "provider_failed",
        finishedAt: request.retrievedAt,
      });
    }
    return batch;
  }
}
