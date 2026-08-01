import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function files(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const target = path.join(directory, entry);
    return statSync(target).isDirectory() ? files(target) : [target];
  });
}

function existingFiles(directories: ReadonlyArray<string>): string[] {
  return directories.flatMap((directory) => {
    try {
      return statSync(directory).isDirectory() ? files(directory) : [directory];
    } catch {
      return [];
    }
  });
}

describe("Phase 3D1 offline orchestration containment", () => {
  it("is not imported or invoked by startup, Discord, CRM, Retell, cron, commands, or services", () => {
    const root = process.cwd();
    const productionFiles = existingFiles([
      path.join(root, "src/index.ts"),
      path.join(root, "src/features"),
      path.join(root, "src/services"),
      path.join(root, "src/cron"),
      path.join(root, "src/commands"),
    ]).filter((file) => /\.(?:ts|js|mjs)$/.test(file));
    const source = productionFiles.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(source).not.toMatch(/lead-engine\/orchestration/);
    expect(source).not.toMatch(/runOfflineLeadAssessment\s*\(/);
  });

  it("is not reachable through export scripts, website booking code, or package start/dev commands", () => {
    const repositoryRoot = path.resolve(process.cwd(), "..");
    const sourceFiles = existingFiles([
      path.join(process.cwd(), "scripts"),
      path.join(repositoryRoot, "website"),
    ]).filter((file) => /\.(?:ts|tsx|js|mjs|json)$/.test(file));
    const source = sourceFiles.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(source).not.toMatch(/lead-engine\/orchestration/);
    expect(source).not.toMatch(/runOfflineLeadAssessment\s*\(/);

    const packageJson = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    expect(packageJson.scripts.start).not.toMatch(/lead-engine|orchestration/);
    expect(packageJson.scripts.dev).not.toMatch(/lead-engine|orchestration/);
  });

  it("imports no public networking capability, live provider, or external integration", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/lead-engine/orchestration/offline-lead-pipeline.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/network-capability|direct-http|overture-local/);
    expect(source).not.toMatch(/issuePublicWebCapability|createDirectHttpFetcher/);
    expect(source).not.toMatch(/discord|retell|crm|composio|(?:from\s+["'][^"']*exports?|booking.*adapter)/i);
    expect(source).not.toMatch(/process\.env|globalThis\.fetch|await\s+fetch\s*\(/);
  });
});
