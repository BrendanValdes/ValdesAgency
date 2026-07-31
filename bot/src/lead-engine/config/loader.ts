import {
  chmodSync,
  existsSync,
  mkdirSync,
  realpathSync,
} from "node:fs";
import path from "node:path";
import {
  leadEngineConfigSchema,
  type LeadEngineConfig,
} from "./schema.js";

export interface LeadEnginePaths {
  dataRoot: string;
  databasePath: string;
  cacheRoot: string;
  evidenceRoot: string;
  logsRoot: string;
  temporaryRoot: string;
}

function canonicalizePotentialPath(candidate: string): string {
  const missingSegments: string[] = [];
  let existingAncestor = path.resolve(candidate);

  while (!existsSync(existingAncestor)) {
    const parent = path.dirname(existingAncestor);
    if (parent === existingAncestor) break;
    missingSegments.unshift(path.basename(existingAncestor));
    existingAncestor = parent;
  }

  const canonicalAncestor = existsSync(existingAncestor)
    ? realpathSync(existingAncestor)
    : existingAncestor;
  return path.resolve(canonicalAncestor, ...missingSegments);
}

export function isPathInside(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function assertExternalDataRoot(
  dataRoot: string,
  repositoryRoot: string,
): string {
  if (!path.isAbsolute(dataRoot)) {
    throw new Error("Lead-engine data root must be an absolute external path");
  }
  if (!path.isAbsolute(repositoryRoot)) {
    throw new Error("Repository root must be absolute");
  }

  const canonicalDataRoot = canonicalizePotentialPath(dataRoot);
  const canonicalRepositoryRoot = canonicalizePotentialPath(repositoryRoot);
  if (isPathInside(canonicalRepositoryRoot, canonicalDataRoot)) {
    throw new Error("Lead-engine production data must remain outside the repository");
  }
  return canonicalDataRoot;
}

export function loadLeadEngineConfig(
  input: unknown,
  options: { repositoryRoot: string },
): LeadEngineConfig {
  const config = leadEngineConfigSchema.parse(input);
  return {
    ...config,
    dataRoot: assertExternalDataRoot(config.dataRoot, options.repositoryRoot),
  };
}

export function resolveLeadEnginePaths(config: LeadEngineConfig): LeadEnginePaths {
  return {
    dataRoot: config.dataRoot,
    databasePath: path.join(config.dataRoot, "rocco-lead-engine.sqlite"),
    cacheRoot: path.join(config.dataRoot, config.cache.directoryName),
    evidenceRoot: path.join(config.dataRoot, "evidence"),
    logsRoot: path.join(config.dataRoot, config.logging.directoryName),
    temporaryRoot: path.join(config.dataRoot, "tmp"),
  };
}

export function ensureLeadEngineDataRoot(paths: LeadEnginePaths): void {
  for (const directory of [
    paths.dataRoot,
    paths.cacheRoot,
    paths.evidenceRoot,
    paths.logsRoot,
    paths.temporaryRoot,
  ]) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    chmodSync(directory, 0o700);
  }
}
