import path from "node:path";
import { z } from "zod";

export const SUPPORTED_NICHE_IDS = ["pool_service", "landscaping", "hvac"] as const;

const finiteMicroUsdSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);

const secondsSchema = z.number().int().positive().max(31_536_000);

export const leadEngineConfigSchema = z
  .object({
    dataRoot: z
      .string()
      .min(1)
      .refine((value) => path.isAbsolute(value), {
        message: "Lead-engine data root must be an absolute path",
      }),
    networkMode: z.literal("disabled").default("disabled"),
    paidProviders: z
      .object({ enabled: z.literal(false).default(false) })
      .strict()
      .default({ enabled: false }),
    defaultNiche: z.literal("pool_service").default("pool_service"),
    enabledNiches: z
      .tuple([z.literal("pool_service")])
      .default(["pool_service"]),
    runBudgetMicroUsd: finiteMicroUsdSchema.default(0),
    providerBudgetsMicroUsd: z
      .object({
        overture: finiteMicroUsdSchema.default(0),
        website: finiteMicroUsdSchema.default(0),
        search: finiteMicroUsdSchema.default(0),
        enrichment: finiteMicroUsdSchema.default(0),
        verification: finiteMicroUsdSchema.default(0),
      })
      .strict()
      .default({
        overture: 0,
        website: 0,
        search: 0,
        enrichment: 0,
        verification: 0,
      }),
    cache: z
      .object({
        enabled: z.boolean().default(false),
        directoryName: z.literal("cache").default("cache"),
        ttlSeconds: secondsSchema.default(86_400),
        maxEntries: z.number().int().positive().max(1_000_000).default(10_000),
      })
      .strict()
      .default({
        enabled: false,
        directoryName: "cache",
        ttlSeconds: 86_400,
        maxEntries: 10_000,
      }),
    evidenceFreshness: z
      .object({
        businessIdentitySeconds: secondsSchema.default(2_592_000),
        locationSeconds: secondsSchema.default(2_592_000),
        personIdentitySeconds: secondsSchema.default(604_800),
        contactPointSeconds: secondsSchema.default(604_800),
      })
      .strict()
      .default({
        businessIdentitySeconds: 2_592_000,
        locationSeconds: 2_592_000,
        personIdentitySeconds: 604_800,
        contactPointSeconds: 604_800,
      }),
    logging: z
      .object({
        level: z.enum(["error", "warn", "info"]).default("info"),
        directoryName: z.literal("logs").default("logs"),
        includeContactValues: z.literal(false).default(false),
        includeRawEvidence: z.literal(false).default(false),
      })
      .strict()
      .default({
        level: "info",
        directoryName: "logs",
        includeContactValues: false,
        includeRawEvidence: false,
      }),
  })
  .strict();

export type LeadEngineConfig = z.infer<typeof leadEngineConfigSchema>;
