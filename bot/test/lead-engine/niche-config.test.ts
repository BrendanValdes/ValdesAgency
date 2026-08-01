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

  it("validates all six stable niche IDs", () => {
    const configurations = loadNicheConfigurations();
    expect([...configurations.keys()]).toEqual(PHASE_2_NICHE_IDS);
    expect([...configurations.values()].every((config) => config.configuration_version === "1.0.0")).toBe(true);
  });

  it("keeps pool service as the only enabled niche", () => {
    const enabled = [...loadNicheConfigurations().values()]
      .filter((config) => config.enabled)
      .map((config) => config.id);
    expect(enabled).toEqual(["pool_service"]);
  });

  it.each(PHASE_2_NICHE_IDS.slice(1))("keeps supported niche %s valid but benchmark-gated", (nicheId) => {
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

