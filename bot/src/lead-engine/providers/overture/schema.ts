import { z } from "zod";
import { overtureFailure } from "./errors.js";
import {
  OVERTURE_FEATURE_TYPE,
  OVERTURE_PLACES_SCHEMA_CONTRACT_VERSION,
  OVERTURE_THEME,
  type OverturePlaceSchemaDescriptor,
} from "./types.js";

const text = z.string().trim().min(1).max(2_048);
const category = z.string().trim().min(1).max(200);

const sourceSchema = z.object({
  property: text.nullable().optional(),
  dataset: text.nullable().optional(),
  record_id: text.nullable().optional(),
  update_time: z.string().datetime().nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
});

const addressSchema = z.object({
  freeform: text.nullable(),
  locality: text,
  region: text,
  postcode: text.nullable(),
  country: z.string().length(2),
});

export const overturePlaceRecordSchema = z.object({
  id: text,
  version: z.number().int().nonnegative(),
  sources: z.array(sourceSchema).max(50),
  names: z.object({
    primary: text.nullable(),
    common: z.record(z.string().min(2).max(20), text).default({}),
  }),
  basic_category: category.nullable(),
  taxonomy: z.object({
    primary: category.nullable(),
    hierarchy: z.array(category).max(30),
    alternates: z.array(category).max(30),
  }),
  confidence: z.number().min(0).max(1).nullable(),
  operating_status: z.enum([
    "open",
    "temporarily_closed",
    "permanently_closed",
    "unknown",
  ]),
  websites: z.array(text).max(20),
  emails: z.array(text).max(20),
  phones: z.array(text).max(20),
  addresses: z.array(addressSchema).max(20),
  brand: text.nullable().optional(),
  geometry: z.object({
    type: z.literal("Point"),
    coordinates: z.tuple([
      z.number().min(-180).max(180),
      z.number().min(-90).max(90),
    ]),
  }),
});

export type OverturePlaceRecord = z.infer<typeof overturePlaceRecordSchema>;

const REQUIRED_FIELDS = Object.freeze({
  id: "string",
  version: "int64",
  sources: "list<struct>",
  names: "struct",
  basic_category: "string",
  taxonomy: "struct",
  confidence: "double",
  operating_status: "string",
  websites: "list<string>",
  emails: "list<string>",
  phones: "list<string>",
  addresses: "list<struct>",
  geometry: "geometry",
} as const);

export function validateOverturePlaceSchema(
  descriptor: OverturePlaceSchemaDescriptor,
): OverturePlaceSchemaDescriptor {
  if (descriptor.schemaVersion !== OVERTURE_PLACES_SCHEMA_CONTRACT_VERSION ||
    descriptor.theme !== OVERTURE_THEME || descriptor.featureType !== OVERTURE_FEATURE_TYPE) {
    throw overtureFailure("schema_unsupported", "Overture Places schema version/theme/type is unsupported", {
      category: "schema_validation_failed",
    });
  }
  const byName = new Map(descriptor.fields.map((field) => [field.name, field]));
  if (byName.size !== descriptor.fields.length) {
    throw overtureFailure("schema_invalid", "Overture Places schema contains duplicate fields", {
      category: "schema_validation_failed",
    });
  }
  for (const [name, type] of Object.entries(REQUIRED_FIELDS)) {
    const field = byName.get(name);
    if (!field || !field.required || field.type !== type) {
      throw overtureFailure("schema_invalid", `Overture required field ${name} is missing or incompatible`, {
        category: "schema_validation_failed",
      });
    }
  }
  return descriptor;
}
