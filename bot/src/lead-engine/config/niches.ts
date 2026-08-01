import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { stableHash } from "../shared/stable.js";

export const PHASE_2_NICHE_IDS = [
  "pool_service",
  "septic_pumping_repair",
  "well_pump_water_treatment",
  "commercial_refrigeration_ice_machines",
  "automatic_gates_access_control",
  "mobile_truck_fleet_repair",
] as const;

export type Phase2NicheId = (typeof PHASE_2_NICHE_IDS)[number];

const nonemptyList = z.array(z.string().trim().min(1)).min(1);

export const nicheConfigurationSchema = z
  .object({
    id: z.enum(PHASE_2_NICHE_IDS),
    display_name: z.string().trim().min(1),
    enabled: z.boolean(),
    search_terms: nonemptyList,
    service_synonyms: nonemptyList,
    required_indicators: nonemptyList,
    negative_keywords: nonemptyList,
    excluded_adjacent_industries: nonemptyList,
    relevant_categories: nonemptyList,
    chain_franchise_exclusions: nonemptyList,
    geography_strategy: z
      .object({
        mode: z.literal("nationwide"),
        density: z.enum(["dense", "rural", "adaptive"]),
        result_cap: z.number().int().positive(),
        max_depth: z.number().int().min(0).max(12),
      })
      .strict(),
    icp_placeholders: nonemptyList,
    pain_signal_placeholders: nonemptyList,
    required_evidence_policy: z
      .object({
        candidate_identity: z.literal("provider_observation"),
        qualification: z.literal("future_phase"),
      })
      .strict(),
    owner_titles_to_seek: nonemptyList,
    export_tags: nonemptyList,
    configuration_version: z.string().regex(/^\d+\.\d+\.\d+$/),
  })
  .strict();

export type NicheConfiguration = z.infer<typeof nicheConfigurationSchema>;

const NICHE_FILES: Readonly<Record<Phase2NicheId, string>> = {
  pool_service: "pool-service.yaml",
  septic_pumping_repair: "septic-pumping-repair.yaml",
  well_pump_water_treatment: "well-pump-water-treatment.yaml",
  commercial_refrigeration_ice_machines: "commercial-refrigeration-ice-machines.yaml",
  automatic_gates_access_control: "automatic-gates-access-control.yaml",
  mobile_truck_fleet_repair: "mobile-truck-fleet-repair.yaml",
};

export const DEFAULT_NICHE_CONFIG_ROOT = fileURLToPath(
  new URL("../../../../config/leads/niches/", import.meta.url),
);

export function nicheConfigurationHash(config: NicheConfiguration): string {
  return stableHash(config);
}

export function loadNicheConfigurations(
  configurationRoot = DEFAULT_NICHE_CONFIG_ROOT,
): ReadonlyMap<Phase2NicheId, NicheConfiguration> {
  const result = new Map<Phase2NicheId, NicheConfiguration>();
  for (const nicheId of PHASE_2_NICHE_IDS) {
    const filename = NICHE_FILES[nicheId];
    const parsed = nicheConfigurationSchema.parse(
      parse(readFileSync(path.join(configurationRoot, filename), "utf8")),
    );
    if (parsed.id !== nicheId) {
      throw new Error(`Niche configuration filename does not match ID: ${nicheId}`);
    }
    result.set(nicheId, parsed);
  }
  const enabled = [...result.values()].filter((config) => config.enabled);
  if (enabled.length !== 1 || enabled[0]?.id !== "pool_service") {
    throw new Error("Pool service must be the only enabled Phase 2 niche");
  }
  return result;
}

export function resolveNicheConfiguration(
  requestedNiche?: string,
  configurations = loadNicheConfigurations(),
): NicheConfiguration {
  const nicheId = requestedNiche ?? "pool_service";
  if (!(PHASE_2_NICHE_IDS as readonly string[]).includes(nicheId)) {
    throw new Error(`Unsupported niche: ${nicheId}`);
  }
  const config = configurations.get(nicheId as Phase2NicheId);
  if (!config) throw new Error(`Missing niche configuration: ${nicheId}`);
  if (!config.enabled) {
    throw new Error(`Niche ${nicheId} is disabled pending its benchmark gate`);
  }
  return config;
}
