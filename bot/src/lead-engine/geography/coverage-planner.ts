import { stableId } from "../shared/stable.js";
import { coverageKey, normalizedBounds } from "./coverage-keys.js";
import { boundsOverlap, subdivideCell } from "./subdivision.js";
import type {
  CoverageCell,
  CoverageManifest,
  CoverageStatus,
  GeographyTarget,
} from "./types.js";

export interface CoveragePlanInput {
  nicheId: string;
  configurationVersion: string;
  queryVersion: string;
  strategy: "dense" | "rural" | "adaptive";
  targets: ReadonlyArray<GeographyTarget>;
  resultCap: number;
  maxDepth: number;
  minimumSpan?: number;
  resume?: Readonly<Record<string, CoverageStatus>>;
}

function rootCell(input: CoveragePlanInput, target: GeographyTarget): CoverageCell {
  const normalizedTarget = { ...target, bounds: normalizedBounds(target.bounds) };
  const key = coverageKey({
    target: normalizedTarget,
    nicheId: input.nicheId,
    configurationVersion: input.configurationVersion,
    queryVersion: input.queryVersion,
    depth: 0,
  });
  return {
    coverageKey: key,
    parentCoverageKey: null,
    level: target.level,
    label: target.label,
    countryCode: target.countryCode.toUpperCase(),
    subdivisionCode: target.subdivisionCode?.toUpperCase() ?? null,
    bounds: normalizedTarget.bounds,
    depth: 0,
    strategy: input.strategy,
    nicheId: input.nicheId,
    configurationVersion: input.configurationVersion,
    queryVersion: input.queryVersion,
    status: input.resume?.[key] ?? "pending",
    stopReason: null,
  };
}

function detectOverlaps(cells: ReadonlyArray<CoverageCell>) {
  const overlaps: Array<{ left: string; right: string }> = [];
  for (let leftIndex = 0; leftIndex < cells.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < cells.length; rightIndex += 1) {
      const left = cells[leftIndex];
      const right = cells[rightIndex];
      if (left && right && left.depth === right.depth && boundsOverlap(left, right)) {
        overlaps.push({ left: left.coverageKey, right: right.coverageKey });
      }
    }
  }
  return overlaps;
}

export function planCoverage(input: CoveragePlanInput): CoverageManifest {
  if (!Number.isInteger(input.resultCap) || input.resultCap < 1) {
    throw new Error("Coverage result cap must be a positive integer");
  }
  if (!Number.isInteger(input.maxDepth) || input.maxDepth < 0 || input.maxDepth > 12) {
    throw new Error("Coverage maximum depth must be between 0 and 12");
  }
  const minimumSpan = input.minimumSpan ?? 0.01;
  const uniqueRoots = new Map<string, CoverageCell>();
  for (const target of input.targets) {
    const cell = rootCell(input, target);
    const existing = uniqueRoots.get(cell.coverageKey);
    if (!existing || cell.label.localeCompare(existing.label) < 0) {
      uniqueRoots.set(cell.coverageKey, cell);
    }
  }
  let cells = [...uniqueRoots.values()].sort((left, right) =>
    left.coverageKey.localeCompare(right.coverageKey),
  );
  if (input.strategy === "dense") {
    cells = cells.flatMap((cell) => {
      if (cell.status !== "pending" || input.maxDepth === 0) return [cell];
      const children = subdivideCell(cell, minimumSpan);
      return children.length === 0 ? [cell] : children.map((child) => ({
        ...child,
        status: input.resume?.[child.coverageKey] ?? child.status,
      }));
    });
  }
  const overlaps = detectOverlaps(cells);
  return {
    manifestId: stableId("coverage_manifest", {
      nicheId: input.nicheId,
      configurationVersion: input.configurationVersion,
      queryVersion: input.queryVersion,
      strategy: input.strategy,
      resultCap: input.resultCap,
      maxDepth: input.maxDepth,
      minimumSpan,
      cells: cells.map((cell) => cell.coverageKey),
    }),
    nicheId: input.nicheId,
    configurationVersion: input.configurationVersion,
    queryVersion: input.queryVersion,
    strategy: input.strategy,
    resultCap: input.resultCap,
    maxDepth: input.maxDepth,
    minimumSpan,
    cells,
    overlaps,
  };
}

export function recordCoverageResult(
  manifest: CoverageManifest,
  targetKey: string,
  resultCount: number,
): CoverageManifest {
  const target = manifest.cells.find((cell) => cell.coverageKey === targetKey);
  if (!target) throw new Error(`Coverage key was not planned: ${targetKey}`);
  if (!Number.isInteger(resultCount) || resultCount < 0) {
    throw new Error("Coverage result count must be a nonnegative integer");
  }
  let replacement: CoverageCell[];
  if (resultCount < manifest.resultCap) {
    replacement = [{ ...target, status: "completed", stopReason: null }];
  } else if (target.depth >= manifest.maxDepth) {
    replacement = [{ ...target, status: "blocked", stopReason: "maximum_depth" }];
  } else {
    const children = subdivideCell(target, manifest.minimumSpan);
    replacement = children.length > 0
      ? [{ ...target, status: "partial", stopReason: null }, ...children]
      : [{ ...target, status: "blocked", stopReason: "minimum_span" }];
  }
  const byKey = new Map(
    manifest.cells
      .filter((cell) => cell.coverageKey !== targetKey)
      .map((cell) => [cell.coverageKey, cell]),
  );
  for (const cell of replacement) byKey.set(cell.coverageKey, cell);
  const cells = [...byKey.values()].sort((left, right) =>
    left.coverageKey.localeCompare(right.coverageKey),
  );
  return { ...manifest, cells, overlaps: detectOverlaps(cells) };
}
