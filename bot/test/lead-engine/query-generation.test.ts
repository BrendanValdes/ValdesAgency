import { describe, expect, it, vi } from "vitest";
import { loadNicheConfigurations } from "../../src/lead-engine/config/niches.js";
import { generateDiscoveryQueries } from "../../src/lead-engine/discovery/query-generator.js";
import { planCoverage } from "../../src/lead-engine/geography/coverage-planner.js";
import { syntheticMetro } from "./fixtures/geography/synthetic.js";

function fixtureCell(label = syntheticMetro.label) {
  return planCoverage({
    nicheId: "pool_service",
    configurationVersion: "1.0.0",
    queryVersion: "query-1.0.0",
    strategy: "rural",
    targets: [{ ...syntheticMetro, label }],
    resultCap: 1000,
    maxDepth: 5,
  }).cells[0]!;
}

describe("deterministic query generation", () => {
  it("returns identical ordered queries and stable hashes for identical input", () => {
    const niche = loadNicheConfigurations().get("pool_service")!;
    const first = generateDiscoveryQueries({ niche, geography: fixtureCell(), queryVersion: "query-1.0.0" });
    const second = generateDiscoveryQueries({ niche, geography: fixtureCell(), queryVersion: "query-1.0.0" });
    expect(second).toEqual(first);
    expect(first.every((query) => /^[a-f0-9]{64}$/.test(query.configurationHash))).toBe(true);
  });

  it("removes duplicate terms without changing first-seen order", () => {
    const base = loadNicheConfigurations().get("pool_service")!;
    const niche = { ...base, search_terms: ["pool service", "Pool Service", "pool cleaning"], service_synonyms: ["pool cleaning"] };
    const queries = generateDiscoveryQueries({ niche, geography: fixtureCell(), queryVersion: "query-1.0.0" });
    expect(queries).toHaveLength(2);
    expect(queries[0]?.text.startsWith("pool service ")).toBe(true);
  });

  it("makes query IDs geography-specific", () => {
    const niche = loadNicheConfigurations().get("pool_service")!;
    const left = generateDiscoveryQueries({ niche, geography: fixtureCell("Synthetic City A"), queryVersion: "query-1.0.0" });
    const right = generateDiscoveryQueries({ niche, geography: fixtureCell("Synthetic City B"), queryVersion: "query-1.0.0" });
    expect(left[0]?.queryId).not.toBe(right[0]?.queryId);
  });

  it("retains explicit negative and adjacent-industry exclusions", () => {
    const niche = loadNicheConfigurations().get("pool_service")!;
    const query = generateDiscoveryQueries({ niche, geography: fixtureCell(), queryVersion: "query-1.0.0" })[0]!;
    expect(query.negativeTerms).toContain("supply only");
    expect(query.negativeTerms).toContain("pool builders");
    expect(query.text).toContain('-"pool builders"');
  });

  it("rejects disabled niches and performs no LLM or network work", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const niche = loadNicheConfigurations().get("septic_pumping_repair")!;
    expect(() => generateDiscoveryQueries({ niche, geography: fixtureCell(), queryVersion: "query-1.0.0" })).toThrow("benchmark gate");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

