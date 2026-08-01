import { describe, expect, it } from "vitest";
import {
  planCoverage,
  recordCoverageResult,
} from "../../src/lead-engine/geography/coverage-planner.js";
import { GEOGRAPHY_LEVELS } from "../../src/lead-engine/geography/types.js";
import {
  syntheticMetro,
  syntheticRuralCounty,
} from "./fixtures/geography/synthetic.js";

const base = {
  nicheId: "pool_service",
  configurationVersion: "1.0.0",
  queryVersion: "query-1.0.0",
  resultCap: 100,
  maxDepth: 3,
} as const;

describe("nationwide coverage planning primitives", () => {
  it("represents every nationwide geography level without canonical city lists", () => {
    expect(GEOGRAPHY_LEVELS).toEqual([
      "country",
      "state",
      "county",
      "metro",
      "city",
      "bounding_area",
      "grid_cell",
    ]);
  });

  it("produces stable coverage and manifest keys", () => {
    const first = planCoverage({ ...base, strategy: "rural", targets: [syntheticRuralCounty] });
    const second = planCoverage({ ...base, strategy: "rural", targets: [syntheticRuralCounty] });
    expect(second).toEqual(first);
  });

  it("uses distinct deterministic dense and rural plans", () => {
    const dense = planCoverage({ ...base, strategy: "dense", targets: [syntheticMetro] });
    const rural = planCoverage({ ...base, strategy: "rural", targets: [syntheticMetro] });
    expect(dense.cells).toHaveLength(4);
    expect(dense.cells.every((cell) => cell.depth === 1)).toBe(true);
    expect(rural.cells).toHaveLength(1);
  });

  it("detects overlapping equivalent-level targets", () => {
    const plan = planCoverage({
      ...base,
      strategy: "rural",
      targets: [
        syntheticMetro,
        { ...syntheticMetro, label: "Overlapping Synthetic Metro", bounds: { west: -112, south: 33, east: -110, north: 35 } },
      ],
    });
    expect(plan.overlaps).toHaveLength(1);
  });

  it("subdivides a capped cell and tracks parent-child hierarchy", () => {
    const plan = planCoverage({ ...base, strategy: "rural", targets: [syntheticMetro] });
    const updated = recordCoverageResult(plan, plan.cells[0]!.coverageKey, 100);
    const parent = updated.cells.find((cell) => cell.depth === 0)!;
    const children = updated.cells.filter((cell) => cell.depth === 1);
    expect(parent.status).toBe("partial");
    expect(children).toHaveLength(4);
    expect(children.every((cell) => cell.parentCoverageKey === parent.coverageKey)).toBe(true);
  });

  it("stops safely at maximum depth", () => {
    const plan = planCoverage({ ...base, strategy: "rural", targets: [syntheticMetro], maxDepth: 0 });
    const updated = recordCoverageResult(plan, plan.cells[0]!.coverageKey, 100);
    expect(updated.cells[0]).toMatchObject({ status: "blocked", stopReason: "maximum_depth" });
  });

  it("resumes by stable coverage key without changing the plan", () => {
    const initial = planCoverage({ ...base, strategy: "rural", targets: [syntheticMetro] });
    const key = initial.cells[0]!.coverageKey;
    const resumed = planCoverage({ ...base, strategy: "rural", targets: [syntheticMetro], resume: { [key]: "completed" } });
    expect(resumed.cells[0]?.coverageKey).toBe(key);
    expect(resumed.cells[0]?.status).toBe("completed");
  });

  it("prevents duplicate equivalent planned cells", () => {
    const first = planCoverage({
      ...base,
      strategy: "rural",
      targets: [syntheticMetro, { ...syntheticMetro, label: "Alias for the Same Synthetic Metro" }],
    });
    const reversed = planCoverage({
      ...base,
      strategy: "rural",
      targets: [{ ...syntheticMetro, label: "Alias for the Same Synthetic Metro" }, syntheticMetro],
    });
    expect(first.cells).toHaveLength(1);
    expect(reversed).toEqual(first);
  });

  it("does not duplicate subdivisions when a capped result is replayed", () => {
    const plan = planCoverage({ ...base, strategy: "rural", targets: [syntheticMetro] });
    const first = recordCoverageResult(plan, plan.cells[0]!.coverageKey, plan.resultCap);
    const second = recordCoverageResult(first, plan.cells[0]!.coverageKey, plan.resultCap);
    expect(second).toEqual(first);
    expect(new Set(second.cells.map((cell) => cell.coverageKey)).size).toBe(second.cells.length);
  });

  it("distinguishes terminal and resumable states", () => {
    const plan = planCoverage({ ...base, strategy: "rural", targets: [syntheticMetro] });
    const completed = recordCoverageResult(plan, plan.cells[0]!.coverageKey, 12);
    expect(completed.cells[0]?.status).toBe("completed");
    const resumed = planCoverage({ ...base, strategy: "rural", targets: [syntheticMetro], resume: { [plan.cells[0]!.coverageKey]: "failed" } });
    expect(resumed.cells[0]?.status).toBe("failed");
  });
});
