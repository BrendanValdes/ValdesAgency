import type { SqliteDatabase } from "../../db/database.js";
import { stableHash, stableJson } from "../../shared/stable.js";
import type { OverturePlacesAdapterAudit } from "../adapters/overture-places-live.js";
import type { OvertureBudgetSnapshot, OvertureBudgetUsage } from "./budgets.js";
import type { OverturePlacesQueryPlan, OvertureReleasePin } from "./types.js";
import {
  OVERTURE_PLACES_ADAPTER_VERSION,
  OVERTURE_PLACES_PROVIDER_ID,
  OVERTURE_POOL_TAXONOMY_MAPPING_VERSION,
} from "./types.js";

interface ReleasePinRow {
  run_id: string;
  provider_id: string;
  adapter_version: string;
  release_id: string;
  schema_version: string;
  taxonomy_mapping_version: string;
  catalog_url: string;
  catalog_checksum: string;
  resolved_at: string;
  asset_manifest_json: string;
  license: string;
  attribution: string;
  coverage_key: string;
  bbox_json: string;
  query_fingerprint: string;
  query_plan_json: string;
  selected_columns_json: string;
  input_fingerprint: string;
  budget_limits_json: string;
  budget_usage_json: string;
  created_at: string;
  updated_at: string;
}

export interface PersistedOvertureReleasePin {
  readonly runId: string;
  readonly release: OvertureReleasePin;
  readonly plan: OverturePlacesQueryPlan;
  readonly inputFingerprint: string;
  readonly budgetUsage: OvertureBudgetUsage;
  readonly createdAt: string;
  readonly updatedAt: string;
}

function releaseInputFingerprint(input: {
  release: OvertureReleasePin;
  plan: OverturePlacesQueryPlan;
}): string {
  return stableHash({
    providerId: OVERTURE_PLACES_PROVIDER_ID,
    adapterVersion: OVERTURE_PLACES_ADAPTER_VERSION,
    releaseId: input.release.releaseId,
    schemaVersion: input.release.schemaVersion,
    taxonomyMappingVersion: OVERTURE_POOL_TAXONOMY_MAPPING_VERSION,
    assetIds: input.release.assets.map((asset) => asset.assetId).sort(),
    coverageKey: input.plan.coverageKey,
    bounds: input.plan.bounds,
    queryFingerprint: input.plan.fingerprint,
  });
}

function mapReleasePin(row: ReleasePinRow): PersistedOvertureReleasePin {
  const assetManifest = JSON.parse(row.asset_manifest_json) as OvertureReleasePin["assets"];
  const plan = JSON.parse(row.query_plan_json) as OverturePlacesQueryPlan;
  return {
    runId: row.run_id,
    release: {
      releaseId: row.release_id,
      schemaVersion: row.schema_version,
      catalogUrl: row.catalog_url,
      catalogChecksum: row.catalog_checksum,
      resolvedAt: row.resolved_at,
      assets: assetManifest,
      license: row.license,
      attribution: row.attribution,
    },
    plan,
    inputFingerprint: row.input_fingerprint,
    budgetUsage: JSON.parse(row.budget_usage_json) as OvertureBudgetUsage,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function monotonicUsage(previous: OvertureBudgetUsage, next: OvertureBudgetUsage): boolean {
  return Object.keys(previous).every((key) =>
    next[key as keyof OvertureBudgetUsage] >= previous[key as keyof OvertureBudgetUsage]
  );
}

export class OvertureLineageRepository {
  readonly #database: SqliteDatabase;
  readonly #clock: { now(): string };

  constructor(database: SqliteDatabase, clock: { now(): string }) {
    this.#database = database;
    this.#clock = clock;
  }

  getReleasePin(runId: string): PersistedOvertureReleasePin | null {
    const row = this.#database.prepare(
      "SELECT * FROM overture_release_pins WHERE run_id = ?",
    ).get(runId) as ReleasePinRow | undefined;
    return row ? mapReleasePin(row) : null;
  }

  pinRelease(input: {
    runId: string;
    release: OvertureReleasePin;
    plan: OverturePlacesQueryPlan;
    budget: OvertureBudgetSnapshot;
  }): PersistedOvertureReleasePin {
    const inputFingerprint = releaseInputFingerprint(input);
    const at = this.#clock.now();
    this.#database.prepare(`
      INSERT OR IGNORE INTO overture_release_pins
        (run_id, provider_id, adapter_version, release_id, schema_version,
         taxonomy_mapping_version, catalog_url, catalog_checksum, resolved_at,
         asset_manifest_json, license, attribution, coverage_key, bbox_json,
         query_fingerprint, query_plan_json, selected_columns_json, input_fingerprint,
         budget_limits_json, budget_usage_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.runId,
      OVERTURE_PLACES_PROVIDER_ID,
      OVERTURE_PLACES_ADAPTER_VERSION,
      input.release.releaseId,
      input.release.schemaVersion,
      OVERTURE_POOL_TAXONOMY_MAPPING_VERSION,
      input.release.catalogUrl,
      input.release.catalogChecksum,
      input.release.resolvedAt,
      stableJson(input.release.assets),
      input.release.license,
      input.release.attribution,
      input.plan.coverageKey,
      stableJson(input.plan.bounds),
      input.plan.fingerprint,
      stableJson(input.plan),
      stableJson(input.plan.selectedColumns),
      inputFingerprint,
      stableJson(input.budget.allowed),
      stableJson(input.budget.consumed),
      at,
      at,
    );
    const persisted = this.getReleasePin(input.runId);
    if (!persisted || persisted.inputFingerprint !== inputFingerprint ||
      stableHash(persisted.release) !== stableHash(input.release) ||
      persisted.plan.fingerprint !== input.plan.fingerprint) {
      throw new Error("Existing Overture release pin conflicts with the current run input");
    }
    return persisted;
  }

  updateBudgetUsage(runId: string, usage: OvertureBudgetUsage): PersistedOvertureReleasePin {
    const current = this.getReleasePin(runId);
    if (!current) throw new Error("Overture release pin must exist before budget usage is recorded");
    if (!monotonicUsage(current.budgetUsage, usage)) {
      throw new Error("Overture cumulative budget usage cannot decrease across retries or resumes");
    }
    this.#database.prepare(`
      UPDATE overture_release_pins SET budget_usage_json = ?, updated_at = ? WHERE run_id = ?
    `).run(stableJson(usage), this.#clock.now(), runId);
    return this.getReleasePin(runId) as PersistedOvertureReleasePin;
  }

  recordProviderCall(input: {
    providerCallId: string;
    runId: string;
    queryId: string;
    audit: OverturePlacesAdapterAudit;
  }): void {
    const existing = this.#database.prepare(
      "SELECT * FROM overture_provider_call_lineage WHERE provider_call_id = ?",
    ).get(input.providerCallId) as Record<string, unknown> | undefined;
    const values = {
      providerCallId: input.providerCallId,
      runId: input.runId,
      queryId: input.queryId,
      queryFingerprint: input.audit.queryFingerprint,
      assetIds: [...input.audit.assetIds].sort(),
      requestCount: input.audit.budget.consumed.assetRequests,
      downloadedBytes: input.audit.budget.consumed.downloadedBytes,
      processedBytes: input.audit.budget.consumed.processedBytes,
      rowsRead: input.audit.budget.consumed.rowsRead,
      acceptedCount: input.audit.acceptedCount,
      rejectedCount: input.audit.rejectedCount,
      reviewCount: input.audit.reviewCount,
      duplicateCount: input.audit.duplicateCount,
      status: input.audit.status,
      failureCode: input.audit.failureCode,
      budgetUsage: input.audit.budget.consumed,
    };
    if (existing) {
      const comparable = {
        providerCallId: existing.provider_call_id,
        runId: existing.run_id,
        queryId: existing.query_id,
        queryFingerprint: existing.query_fingerprint,
        assetIds: JSON.parse(existing.asset_ids_json as string),
        requestCount: existing.request_count,
        downloadedBytes: existing.downloaded_bytes,
        processedBytes: existing.processed_bytes,
        rowsRead: existing.rows_read,
        acceptedCount: existing.accepted_count,
        rejectedCount: existing.rejected_count,
        reviewCount: existing.review_count,
        duplicateCount: existing.duplicate_count,
        status: existing.status,
        failureCode: existing.failure_code,
        budgetUsage: JSON.parse(existing.budget_usage_json as string),
      };
      if (stableHash(comparable) !== stableHash(values)) {
        throw new Error("Repeated Overture provider-call lineage is not idempotent");
      }
      return;
    }
    this.#database.prepare(`
      INSERT INTO overture_provider_call_lineage
        (provider_call_id, run_id, query_id, query_fingerprint, asset_ids_json,
         request_count, downloaded_bytes, processed_bytes, rows_read, accepted_count,
         rejected_count, review_count, duplicate_count, status, failure_code,
         budget_usage_json, recorded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      values.providerCallId,
      values.runId,
      values.queryId,
      values.queryFingerprint,
      stableJson(values.assetIds),
      values.requestCount,
      values.downloadedBytes,
      values.processedBytes,
      values.rowsRead,
      values.acceptedCount,
      values.rejectedCount,
      values.reviewCount,
      values.duplicateCount,
      values.status,
      values.failureCode,
      stableJson(values.budgetUsage),
      this.#clock.now(),
    );
  }
}

export { releaseInputFingerprint as overtureReleaseInputFingerprint };
