import { describe, expect, it } from "vitest";
import {
  PHASE_2_NICHE_IDS,
  loadNicheConfigurations,
  nicheConfigurationHash,
  resolveNicheConfiguration,
} from "../../src/lead-engine/config/niches.js";

describe("versioned niche configuration", () => {
  it("defaults omitted niche deterministically to enabled pool service", () => {
    expect(resolveNicheConfiguration().id).toBe("pool_service");
    expect(resolveNicheConfiguration().enabled).toBe(true);
  });

  it("validates all seven stable niche IDs", () => {
    const configurations = loadNicheConfigurations();
    expect([...configurations.keys()]).toEqual(PHASE_2_NICHE_IDS);
    // The executable lead policy requires every niche configuration_version to
    // equal the global schema_version, so all seven stay in lockstep at 1.0.0.
    expect([...configurations.values()].every((config) => config.configuration_version === "1.0.0")).toBe(true);
  });

  it("enables pool service and foundation waterproofing together", () => {
    const enabled = [...loadNicheConfigurations().values()]
      .filter((config) => config.enabled)
      .map((config) => config.id);
    expect(enabled).toEqual(["pool_service", "foundation_waterproofing"]);
    expect(resolveNicheConfiguration("foundation_waterproofing").enabled).toBe(true);
  });

  it.each(PHASE_2_NICHE_IDS.slice(2))("keeps supported niche %s valid but benchmark-gated", (nicheId) => {
    const config = loadNicheConfigurations().get(nicheId);
    expect(config?.enabled).toBe(false);
    expect(() => resolveNicheConfiguration(nicheId)).toThrow("disabled pending its benchmark gate");
  });

  it("rejects unsupported niches before configuration resolution", () => {
    expect(() => resolveNicheConfiguration("landscaping")).toThrow("Unsupported niche");
  });

  it("produces stable content hashes", () => {
    const first = loadNicheConfigurations().get("pool_service");
    const second = loadNicheConfigurations().get("pool_service");
    expect(first).toBeDefined();
    expect(nicheConfigurationHash(first!)).toBe(nicheConfigurationHash(second!));
    expect(nicheConfigurationHash(first!)).toMatch(/^[a-f0-9]{64}$/);
  });
});
