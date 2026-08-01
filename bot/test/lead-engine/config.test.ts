import { readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadLeadEngineConfig,
  resolveLeadEnginePaths,
} from "../../src/lead-engine/config/loader.js";

const repositoryRoot = path.resolve(process.cwd(), "..");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const candidate = path.join(directory, entry);
    return statSync(candidate).isDirectory()
      ? sourceFiles(candidate)
      : candidate.endsWith(".ts")
        ? [candidate]
        : [];
  });
}

describe("lead-engine configuration", () => {
  it("defaults every external capability to disabled and pool_service only", () => {
    const config = loadLeadEngineConfig(
      { dataRoot: path.join(os.tmpdir(), "rocco-config-test") },
      { repositoryRoot },
    );

    expect(config.networkMode).toBe("disabled");
    expect(config.paidProviders.enabled).toBe(false);
    expect(config.defaultNiche).toBe("pool_service");
    expect(config.enabledNiches).toEqual(["pool_service"]);
    expect(config.runBudgetMicroUsd).toBe(0);
    expect(Object.values(config.providerBudgetsMicroUsd)).toEqual([0, 0, 0, 0, 0]);
    expect(Number.isFinite(config.cache.ttlSeconds)).toBe(true);
    expect(config.logging.includeContactValues).toBe(false);
    expect(config.logging.includeRawEvidence).toBe(false);
  });

  it("rejects relative and repository-local data roots", () => {
    expect(() =>
      loadLeadEngineConfig({ dataRoot: "relative/data" }, { repositoryRoot }),
    ).toThrow("absolute path");
    expect(() =>
      loadLeadEngineConfig(
        { dataRoot: path.join(repositoryRoot, "private-data") },
        { repositoryRoot },
      ),
    ).toThrow("outside the repository");
  });

  it("rejects network, paid-provider, unsupported-niche, and credential fields", () => {
    const dataRoot = path.join(os.tmpdir(), "rocco-config-deny-test");
    expect(() =>
      loadLeadEngineConfig({ dataRoot, networkMode: "enabled" }, { repositoryRoot }),
    ).toThrow();
    expect(() =>
      loadLeadEngineConfig(
        { dataRoot, paidProviders: { enabled: true } },
        { repositoryRoot },
      ),
    ).toThrow();
    expect(() =>
      loadLeadEngineConfig(
        { dataRoot, enabledNiches: ["hvac"] },
        { repositoryRoot },
      ),
    ).toThrow();
    expect(() =>
      loadLeadEngineConfig(
        { dataRoot, apiKey: "synthetic-placeholder" },
        { repositoryRoot },
      ),
    ).toThrow();
  });

  it("keeps all derived paths under the external data root", () => {
    const config = loadLeadEngineConfig(
      { dataRoot: path.join(os.tmpdir(), "rocco-path-test") },
      { repositoryRoot },
    );
    const paths = resolveLeadEnginePaths(config);

    expect(Object.values(paths).every((entry) => entry.startsWith(config.dataRoot))).toBe(true);
    expect(paths.databasePath.endsWith(".sqlite")).toBe(true);
  });

  it("contains no network-capable imports or fetch calls in the Phase 1 namespace", () => {
    const sourceRoot = path.join(process.cwd(), "src", "lead-engine");
    const content = sourceFiles(sourceRoot)
      .filter((file) => !file.includes(`${path.sep}crawl${path.sep}`))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    expect(content).not.toMatch(/from\s+["'](?:node:)?(?:http|https|net|tls|dns|undici)/);
    expect(content).not.toMatch(/\bfetch\s*\(/);
  });
});
