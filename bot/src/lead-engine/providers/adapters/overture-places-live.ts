import {
  assertRuntimeLeadPolicy,
  requireProviderPolicy,
  type RuntimeLeadPolicy,
} from "../../config/lead-policy.js";
import {
  assertPublicWebCapability,
  type PublicWebCapability,
} from "../../config/network-capability.js";
import type { CoverageCell } from "../../geography/types.js";
import { stableJson } from "../../shared/stable.js";
import {
  normalizedDiscoveryResultSchema,
  type DiscoveryProviderRequest,
  type NormalizedDiscoveryResult,
} from "../contracts.js";
import { failedEnvelope, normalizedEnvelope } from "../provider-envelope.js";
import type { DiscoveryProviderGateway, ProviderBatch } from "../provider-gateway.js";
import {
  assertTrustedOvertureAssetQueryEngine,
  type OvertureAssetQueryEngine,
} from "../overture/asset-query-engine.js";
import { validateOvertureAsset } from "../overture/asset-validator.js";
import type { OvertureBudgetSnapshot, OvertureBudgetTracker } from "../overture/budgets.js";
import { OverturePlacesError, overtureFailure } from "../overture/errors.js";
import {
  assertOverturePlanMatchesCell,
} from "../overture/query.js";
import {
  overturePlaceRecordSchema,
  validateOverturePlaceSchema,
  type OverturePlaceRecord,
} from "../overture/schema.js";
import { classifyOverturePoolCategory } from "../overture/taxonomy.js";
import {
  OVERTURE_PLACES_ADAPTER_VERSION,
  OVERTURE_PLACES_PROVIDER_ID,
  OVERTURE_POOL_TAXONOMY_MAPPING_VERSION,
  type OverturePlacesQueryPlan,
  type OvertureReleasePin,
} from "../overture/types.js";

export interface OverturePlacesAdapterAudit {
  readonly providerId: typeof OVERTURE_PLACES_PROVIDER_ID;
  readonly adapterVersion: typeof OVERTURE_PLACES_ADAPTER_VERSION;
  readonly releaseId: string;
  readonly schemaVersion: string;
  readonly taxonomyMappingVersion: typeof OVERTURE_POOL_TAXONOMY_MAPPING_VERSION;
  readonly coverageKey: string;
  readonly queryFingerprint: string;
  readonly assetIds: ReadonlyArray<string>;
  readonly acceptedCount: number;
  readonly rejectedCount: number;
  readonly reviewCount: number;
  readonly duplicateCount: number;
  readonly status: "complete" | "partial" | "failed";
  readonly failureCode: string | null;
  readonly budget: OvertureBudgetSnapshot;
}

function primaryName(record: OverturePlaceRecord): string | null {
  if (record.names.primary) return record.names.primary;
  return Object.entries(record.names.common)
    .sort(([left], [right]) => left.localeCompare(right))[0]?.[1] ?? null;
}

function insideCell(record: OverturePlaceRecord, cell: CoverageCell): boolean {
  const [longitude, latitude] = record.geometry.coordinates;
  return longitude >= cell.bounds.west && longitude <= cell.bounds.east &&
    latitude >= cell.bounds.south && latitude <= cell.bounds.north;
}

export class OverturePlacesLiveDiscoveryProvider implements DiscoveryProviderGateway {
  readonly providerId = OVERTURE_PLACES_PROVIDER_ID;
  readonly #capability: PublicWebCapability;
  readonly #runId: string;
  readonly #assessmentId: string;
  readonly #release: OvertureReleasePin;
  readonly #coverageCell: CoverageCell;
  readonly #plan: OverturePlacesQueryPlan;
  readonly #budget: OvertureBudgetTracker;
  readonly #signal: AbortSignal;
  readonly #queryEngine: OvertureAssetQueryEngine;
  readonly #auditSink: { record(audit: OverturePlacesAdapterAudit): void };
  #lastAudit: OverturePlacesAdapterAudit | null = null;

  constructor(input: {
    policy: RuntimeLeadPolicy;
    capability: PublicWebCapability;
    runId: string;
    assessmentId: string;
    release: OvertureReleasePin;
    coverageCell: CoverageCell;
    plan: OverturePlacesQueryPlan;
    budget: OvertureBudgetTracker;
    signal: AbortSignal;
    queryEngine: OvertureAssetQueryEngine;
    auditSink?: { record(audit: OverturePlacesAdapterAudit): void };
  }) {
    assertRuntimeLeadPolicy(input.policy);
    const policy = requireProviderPolicy(input.policy, OVERTURE_PLACES_PROVIDER_ID);
    if (!policy.enabled || policy.sourceClass !== "local_public_dataset" ||
      !policy.requiresNetwork || policy.access !== "official_overture_https_only" ||
      !policy.pinnedReleaseRequired || policy.canIncurCost ||
      !policy.operations.includes("discovery")) {
      throw overtureFailure("query_invalid", "Executable policy does not authorize live Overture Places discovery", {
        category: "policy_blocked",
      });
    }
    assertPublicWebCapability(input.capability, {
      providerId: OVERTURE_PLACES_PROVIDER_ID,
      runId: input.runId,
      assessmentId: input.assessmentId,
      operation: "discovery",
    });
    assertTrustedOvertureAssetQueryEngine(input.queryEngine);
    assertOverturePlanMatchesCell(input.plan, input.coverageCell);
    if (input.plan.releaseId !== input.release.releaseId ||
      input.release.assets.length === 0 || input.release.schemaVersion.trim() === "") {
      throw overtureFailure("release_changed", "Overture query plan is not pinned to its resolved release", {
        category: "policy_blocked",
      });
    }
    for (const asset of input.release.assets) validateOvertureAsset(asset);
    input.budget.assertArea(input.plan.areaSquareKm);
    this.#capability = input.capability;
    this.#runId = input.runId;
    this.#assessmentId = input.assessmentId;
    this.#release = input.release;
    this.#coverageCell = input.coverageCell;
    this.#plan = input.plan;
    this.#budget = input.budget;
    this.#signal = input.signal;
    this.#queryEngine = input.queryEngine;
    this.#auditSink = input.auditSink ?? { record: () => undefined };
  }

  audit(): OverturePlacesAdapterAudit | null {
    return this.#lastAudit;
  }

  #recordAudit(input: Omit<OverturePlacesAdapterAudit,
    "providerId" | "adapterVersion" | "releaseId" | "schemaVersion" |
    "taxonomyMappingVersion" | "coverageKey" | "queryFingerprint" | "assetIds" | "budget">): void {
    const audit: OverturePlacesAdapterAudit = Object.freeze({
      providerId: OVERTURE_PLACES_PROVIDER_ID,
      adapterVersion: OVERTURE_PLACES_ADAPTER_VERSION,
      releaseId: this.#release.releaseId,
      schemaVersion: this.#release.schemaVersion,
      taxonomyMappingVersion: OVERTURE_POOL_TAXONOMY_MAPPING_VERSION,
      coverageKey: this.#coverageCell.coverageKey,
      queryFingerprint: this.#plan.fingerprint,
      assetIds: Object.freeze(this.#release.assets.map((asset) => asset.assetId)),
      ...input,
      budget: this.#budget.snapshot(),
    });
    this.#lastAudit = audit;
    this.#auditSink.record(audit);
  }

  async discover(request: DiscoveryProviderRequest): Promise<ProviderBatch<NormalizedDiscoveryResult>> {
    const base = {
      providerId: this.providerId,
      sourceClass: "local_public_dataset" as const,
      claimState: "public_unverified_candidate" as const,
      operation: request.operation,
      providerSchemaVersion: `${OVERTURE_PLACES_ADAPTER_VERSION}:${this.#release.schemaVersion}`,
      correlationId: request.correlationId,
      observedAt: request.observedAt,
      retrievedAt: request.retrievedAt,
      cost: { billable: false, billableUnits: 0, unit: "none" as const, microUsd: 0 },
      cache: { status: "bypassed" as const, key: null },
    };
    try {
      if (request.nicheId !== "pool_service" || request.coverageKey !== this.#coverageCell.coverageKey ||
        !request.queryId.trim()) {
        throw overtureFailure("query_invalid", "Provider request does not match the pinned pool-service query/cell", {
          category: "policy_blocked",
        });
      }
      if (this.#signal.aborted) {
        throw overtureFailure("cancelled", "Overture Places discovery was cancelled", {
          category: "cancelled",
        });
      }
      assertPublicWebCapability(this.#capability, {
        providerId: OVERTURE_PLACES_PROVIDER_ID,
        runId: this.#runId,
        assessmentId: this.#assessmentId,
        operation: "discovery",
      });
      this.#budget.assertActive();
      const beforeQuery = this.#budget.snapshot().consumed;
      const result = await this.#queryEngine.query({
        release: this.#release,
        coverageCell: this.#coverageCell,
        plan: this.#plan,
        signal: this.#signal,
        budget: this.#budget,
      });
      const afterTransfer = this.#budget.snapshot().consumed;
      if (this.#signal.aborted) {
        throw overtureFailure("cancelled", "Overture Places discovery was cancelled", {
          category: "cancelled",
        });
      }
      validateOverturePlaceSchema(result.schema);
      if (result.schema.schemaVersion !== this.#release.schemaVersion ||
        result.requestCount < 0 || !Number.isSafeInteger(result.requestCount) ||
        result.downloadedBytes < 0 || !Number.isSafeInteger(result.downloadedBytes) ||
        result.processedBytes < 0 || !Number.isSafeInteger(result.processedBytes) ||
        result.rowsRead < result.records.length || !Number.isSafeInteger(result.rowsRead) ||
        result.rowsRead > this.#plan.maxRows || result.records.length > this.#plan.maxRows) {
        throw overtureFailure("result_invalid", "Overture query engine returned inconsistent bounded usage or schema", {
          category: "schema_validation_failed",
        });
      }
      if (afterTransfer.assetRequests - beforeQuery.assetRequests !== result.requestCount ||
        afterTransfer.downloadedBytes - beforeQuery.downloadedBytes !== result.downloadedBytes) {
        throw overtureFailure("result_invalid", "Overture query engine usage does not match capability-budget accounting", {
          category: "budget_blocked",
        });
      }
      const pinnedAssets = new Set(this.#release.assets.map((asset) => asset.assetId));
      if (result.assets.length === 0 || result.assets.some((asset) =>
        !pinnedAssets.has(validateOvertureAsset(asset).assetId)
      )) {
        throw overtureFailure("asset_invalid", "Overture query used an asset outside the pinned release", {
          category: "authorization_failed",
        });
      }
      this.#budget.recordProcessing({ bytes: result.processedBytes, rows: result.rowsRead });

      const records = new Map<string, OverturePlaceRecord>();
      let duplicateCount = 0;
      let rejectedCount = 0;
      for (const raw of result.records) {
        const parsed = overturePlaceRecordSchema.safeParse(raw);
        if (!parsed.success || !insideCell(parsed.data, this.#coverageCell)) {
          rejectedCount += 1;
          continue;
        }
        const existing = records.get(parsed.data.id);
        if (existing) {
          if (existing.version !== parsed.data.version ||
            stableJson(existing) !== stableJson(parsed.data)) {
            throw overtureFailure("result_invalid", "Duplicate Overture ID has conflicting feature versions or values", {
              category: "schema_validation_failed",
            });
          }
          duplicateCount += 1;
          continue;
        }
        records.set(parsed.data.id, parsed.data);
      }

      const envelopes = [];
      let reviewCount = 0;
      for (const record of [...records.values()].sort((left, right) => left.id.localeCompare(right.id))) {
        const category = classifyOverturePoolCategory({
          basicCategory: record.basic_category,
          taxonomy: record.taxonomy,
        });
        if (category.disposition === "excluded" || category.disposition === "missing") {
          rejectedCount += 1;
          continue;
        }
        const name = primaryName(record);
        const address = record.addresses[0];
        if (!name || !address) {
          rejectedCount += 1;
          continue;
        }
        if (category.disposition === "review") reviewCount += 1;
        const normalized = {
          providerPlaceId: record.id,
          name,
          categories: [...new Set([
            record.basic_category,
            record.taxonomy.primary,
            ...record.taxonomy.hierarchy,
            ...record.taxonomy.alternates,
          ].filter((value): value is string => Boolean(value)))],
          address: {
            line1: address.freeform,
            city: address.locality,
            region: address.region,
            postalCode: address.postcode,
            countryCode: address.country.toUpperCase(),
          },
          domains: record.websites,
          phones: record.phones,
          emails: record.emails,
          brandName: record.brand ?? null,
          groupHint: record.brand ?? null,
          providerObservation: {
            releaseId: this.#release.releaseId,
            featureVersion: record.version,
            schemaVersion: this.#release.schemaVersion,
            taxonomyMappingVersion: OVERTURE_POOL_TAXONOMY_MAPPING_VERSION,
            basicCategory: record.basic_category,
            taxonomyPrimary: record.taxonomy.primary,
            taxonomyHierarchy: record.taxonomy.hierarchy,
            taxonomyAlternates: record.taxonomy.alternates,
            categoryDisposition: category.disposition,
            providerConfidence: record.confidence,
            operatingStatus: record.operating_status,
            sourceMetadata: record.sources.map((source) => ({
              property: source.property ?? null,
              dataset: source.dataset ?? null,
              recordId: source.record_id ?? null,
              updateTime: source.update_time ?? null,
              confidence: source.confidence ?? null,
            })),
            coverageKey: this.#coverageCell.coverageKey,
            queryFingerprint: this.#plan.fingerprint,
            assetIds: result.assets.map((asset) => asset.assetId),
          },
        };
        envelopes.push(normalizedEnvelope(
          {
            ...base,
            providerResultId: record.id,
            rawForChecksum: stableJson(record),
            retainRawReference: true,
          },
          normalized,
          normalizedDiscoveryResultSchema,
        ));
      }
      const acceptedCount = envelopes.filter((envelope) => envelope.validation.status === "accepted").length;
      rejectedCount += envelopes.length - acceptedCount;
      this.#budget.recordCandidates(acceptedCount);
      const status = acceptedCount === 0 && rejectedCount > 0 ? "partial" as const : "complete" as const;
      this.#recordAudit({
        acceptedCount,
        rejectedCount,
        reviewCount,
        duplicateCount,
        status,
        failureCode: null,
      });
      return { status, envelopes };
    } catch (error) {
      const failure = error instanceof OverturePlacesError
        ? error
        : overtureFailure("result_invalid", "Overture Places adapter rejected an unexpected result", {
            category: "provider_failure",
          });
      const envelope = failedEnvelope<NormalizedDiscoveryResult>(base, failure.category, failure.retryable);
      this.#recordAudit({
        acceptedCount: 0,
        rejectedCount: 0,
        reviewCount: 0,
        duplicateCount: 0,
        status: "failed",
        failureCode: failure.code,
      });
      return { status: "failed", envelopes: [envelope] };
    }
  }
}
