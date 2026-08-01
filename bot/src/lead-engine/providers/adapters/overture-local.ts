import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { isPathInside } from "../../config/loader.js";
import {
  normalizedDiscoveryResultSchema,
  type DiscoveryProviderRequest,
  type NormalizedDiscoveryResult,
} from "../contracts.js";
import { normalizedEnvelope } from "../provider-envelope.js";
import type {
  DiscoveryProviderGateway,
  ProviderBatch,
} from "../provider-gateway.js";
import { readJsonRowsFromParquet } from "./parquet-lite.js";

const overtureRowSchema = z
  .object({
    id: z.string().trim().min(1),
    names: z.object({ primary: z.string().trim().min(1) }).strict(),
    categories: z.object({ primary: z.string().trim().min(1) }).strict(),
    addresses: z
      .array(
        z
          .object({
            freeform: z.string().trim().min(1),
            locality: z.string().trim().min(1),
            region: z.string().trim().min(1),
            postcode: z.string().trim().min(1).nullable(),
            country: z.string().length(2),
          })
          .strict(),
      )
      .length(1),
    websites: z.array(z.string().trim().min(1)),
    phones: z.array(z.string().trim().min(1)),
    brand: z.string().trim().min(1).nullable(),
  })
  .strict();

const fixtureRowSchema = z.object({
  synthetic_fixture: z.literal(true),
  release_id: z.string().trim().min(1),
  place: z.unknown(),
}).strict();

export interface OvertureLocalOptions {
  fixturePath: string;
  allowedFixtureRoot: string;
  releaseId: string;
  sha256: string;
}

function loadFixture(options: OvertureLocalOptions): {
  bytes: Buffer;
  rows: unknown[];
} {
  if (!path.isAbsolute(options.fixturePath) || !path.isAbsolute(options.allowedFixtureRoot)) {
    throw new Error("Overture local fixture and allowed root must be explicit absolute paths");
  }
  if (!/^[a-f0-9]{64}$/.test(options.sha256)) {
    throw new Error("Overture local fixture requires a pinned lowercase SHA-256 checksum");
  }
  if (!options.releaseId.trim()) {
    throw new Error("Overture local fixture requires a pinned release identifier");
  }
  const allowedRoot = realpathSync(options.allowedFixtureRoot);
  const fixturePath = realpathSync(options.fixturePath);
  if (!isPathInside(allowedRoot, fixturePath)) {
    throw new Error("Overture local fixture path escapes its explicitly allowed root");
  }
  if (!statSync(fixturePath).isFile() || path.extname(fixturePath) !== ".parquet") {
    throw new Error("Overture local fixture must be a .parquet file");
  }
  const bytes = readFileSync(fixturePath);
  const checksum = createHash("sha256").update(bytes).digest("hex");
  if (checksum !== options.sha256) throw new Error("Overture local fixture checksum does not match its pin");
  const fixtureRows = readJsonRowsFromParquet(bytes).map((row) => fixtureRowSchema.parse(row));
  if (fixtureRows.length === 0) {
    throw new Error("Overture local fixture must contain release-pinned synthetic rows");
  }
  if (fixtureRows.some((row) => row.release_id !== options.releaseId)) {
    throw new Error("Overture local fixture release identifier does not match its pin");
  }
  return { bytes, rows: fixtureRows.map((row) => row.place) };
}

export class OvertureLocalDiscoveryProvider implements DiscoveryProviderGateway {
  readonly providerId = "overture_local";
  readonly #options: OvertureLocalOptions;

  constructor(options: OvertureLocalOptions) {
    this.#options = options;
  }

  async discover(
    request: DiscoveryProviderRequest,
  ): Promise<ProviderBatch<NormalizedDiscoveryResult>> {
    const fixture = loadFixture(this.#options);
    const checksum = createHash("sha256").update(fixture.bytes).digest("hex");
    const envelopes = fixture.rows.map((raw) => {
      const parsed = overtureRowSchema.safeParse(raw);
      const normalized = parsed.success
        ? {
            providerPlaceId: parsed.data.id,
            name: parsed.data.names.primary,
            categories: [parsed.data.categories.primary],
            address: {
              line1: parsed.data.addresses[0]?.freeform ?? null,
              city: parsed.data.addresses[0]?.locality ?? "",
              region: parsed.data.addresses[0]?.region ?? "",
              postalCode: parsed.data.addresses[0]?.postcode ?? null,
              countryCode: parsed.data.addresses[0]?.country ?? "",
            },
            domains: parsed.data.websites,
            phones: parsed.data.phones,
            brandName: parsed.data.brand,
            groupHint: parsed.data.brand,
          }
        : raw;
      return normalizedEnvelope(
        {
          providerId: this.providerId,
          sourceClass: "synthetic_fixture",
          claimState: "observed",
          operation: request.operation,
          providerSchemaVersion: `overture-${this.#options.releaseId}`,
          correlationId: request.correlationId,
          providerResultId: parsed.success ? parsed.data.id : null,
          observedAt: request.observedAt,
          retrievedAt: request.retrievedAt,
          cost: { billable: false, billableUnits: 0, unit: "none", microUsd: 0 },
          cache: { status: "bypassed", key: null },
          rawForChecksum: fixture.bytes,
          retainRawReference: true,
        },
        normalized,
        normalizedDiscoveryResultSchema,
      );
    });
    const failures = envelopes.filter((envelope) => envelope.validation.status === "rejected").length;
    return {
      status: failures === 0 ? "complete" : failures === envelopes.length ? "failed" : "partial",
      envelopes,
    };
  }
}
