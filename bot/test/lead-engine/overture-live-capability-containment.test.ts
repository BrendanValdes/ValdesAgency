import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { loadRuntimeLeadPolicy } from "../../src/lead-engine/config/lead-policy.js";
import { NetworkPolicyAuthorizer } from "../../src/lead-engine/config/network-capability.js";
import { createDirectHttpFetcher } from "../../src/lead-engine/crawl/fetchers/direct-http.js";
import {
  parseOvertureCanaryArguments,
  runOverturePlacesCanary,
} from "../../scripts/run-overture-places-canary.js";
import { syntheticLivePolicy } from "./fixtures/overture/synthetic-live.js";

const repositoryRoot = path.resolve(process.cwd(), "..");

function files(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const target = path.join(directory, entry);
    return statSync(target).isDirectory() ? files(target) : [target];
  });
}

function canaryArgs(databasePath: string): string[] {
  return [
    "--confirm-live-overture",
    "--market", "phoenix-canary",
    "--max-results", "25",
    "--max-bytes", String(8 * 1024 * 1024),
    "--max-seconds", "30",
    "--database", databasePath,
    "--release", "latest",
  ];
}

describe("live Overture production capability", () => {
  it("keeps the checked-in provider disabled with zero network and monetary allowance", () => {
    const policy = loadRuntimeLeadPolicy();
    expect(policy.networkMode).toBe("disabled");
    expect(policy.providers.overture_places_live).toMatchObject({
      id: "overture_places_live",
      sourceClass: "local_public_dataset",
      enabled: false,
      requiresNetwork: true,
      canIncurCost: false,
      requestBudget: 0,
      byteBudget: 0,
      costBudgetMicroUsd: 0,
      maxRequestDurationMs: 0,
      access: "official_overture_https_only",
      pinnedReleaseRequired: true,
    });
    const authorizer = new NetworkPolicyAuthorizer(policy);
    expect(() => authorizer.issuePublicWebCapability({
      providerId: "overture_places_live",
      runId: "run-synthetic-denied",
      assessmentId: "scope-synthetic-denied",
      operation: "discovery",
      maxRequests: 1,
      maxBytes: 1,
      maxBytesPerRequest: 1,
      maxRequestDurationMs: 1,
      costBudgetMicroUsd: 0,
      ttlMs: 1,
    })).toThrow("provider_disabled");
  });

  it("binds an ephemeral capability to discovery and rejects website or mismatched scopes", () => {
    const live = syntheticLivePolicy();
    try {
      expect(live.capability).toMatchObject({
        providerId: "overture_places_live",
        runId: "run-synthetic-overture",
        assessmentId: "scope-synthetic-overture",
        operation: "discovery",
      });
      expect(() => createDirectHttpFetcher({
        capability: live.capability,
        providerId: "overture_places_live",
        runId: "run-synthetic-overture",
        assessmentId: "scope-synthetic-overture",
      })).toThrow("capability_operation_mismatch");
      expect(() => createDirectHttpFetcher({
        capability: live.capability,
        providerId: "overture_places_live",
        runId: "different-run",
        assessmentId: "scope-synthetic-overture",
        operation: "discovery",
      })).toThrow("capability_run_mismatch");
      expect(createDirectHttpFetcher({
        capability: live.capability,
        providerId: "overture_places_live",
        runId: "run-synthetic-overture",
        assessmentId: "scope-synthetic-overture",
        operation: "discovery",
      })).toMatchObject({ sourceClass: "public_web" });
    } finally {
      live.cleanup();
    }
  });
});

describe("dedicated Overture canary containment", () => {
  it("requires every deliberate flag and enforces hard result/byte/time/database bounds", () => {
    const databasePath = path.join(os.tmpdir(), "rocco-overture-parse-test.sqlite");
    expect(() => parseOvertureCanaryArguments(canaryArgs(databasePath).slice(1), repositoryRoot)).toThrow("--confirm-live-overture");
    expect(() => parseOvertureCanaryArguments(
      canaryArgs(databasePath).map((value) => value === "phoenix-canary" ? "las-vegas" : value),
      repositoryRoot,
    )).toThrow("phoenix-canary");
    expect(() => parseOvertureCanaryArguments(
      canaryArgs(databasePath).map((value) => value === "25" ? "26" : value),
      repositoryRoot,
    )).toThrow("hard canary maxima");
    expect(() => parseOvertureCanaryArguments(
      canaryArgs(path.join(repositoryRoot, "canary.sqlite")),
      repositoryRoot,
    )).toThrow("outside the repository");
    expect(() => parseOvertureCanaryArguments(
      [...canaryArgs(databasePath), "--export", "/tmp/export.json"],
      repositoryRoot,
    )).toThrow("Unknown");
    writeFileSync(databasePath, "synthetic-placeholder", { mode: 0o600 });
    try {
      expect(() => parseOvertureCanaryArguments(
        canaryArgs(databasePath),
        repositoryRoot,
      )).toThrow("must not already exist");
    } finally {
      rmSync(databasePath, { force: true });
    }
  });

  it("reports the demonstrated transport limitation with aggregate-only output and no network/database residue", async () => {
    const databasePath = path.join(os.tmpdir(), `rocco-overture-blocked-${process.pid}.sqlite`);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const report = await runOverturePlacesCanary({
        argv: canaryArgs(databasePath),
        repositoryRoot,
        now: () => Date.parse("2026-08-01T12:00:00.000Z"),
      });
      expect(report).toMatchObject({
        ran: false,
        approvedDestinationsContacted: [],
        releaseId: "not_resolved",
        requests: 0,
        bytes: 0,
        rowsConsidered: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        duplicateCount: 0,
        reviewCount: 0,
        aggregateVerdict: "blocked_secure_transport_unavailable",
        safetyWarnings: ["secure_remote_geoparquet_transport_unavailable"],
      });
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(existsSync(databasePath)).toBe(false);
      expect(JSON.stringify(report)).not.toMatch(/businessName|phone|email|website|street|address|providerRecord/i);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("is not imported by startup, commands, services, cron, CRM, Discord, Retell, or exports", () => {
    const production = [
      path.join(process.cwd(), "src", "index.ts"),
      path.join(process.cwd(), "src", "features"),
      path.join(process.cwd(), "src", "services"),
      path.join(process.cwd(), "src", "cron"),
      path.join(process.cwd(), "src", "commands"),
    ].flatMap((target) => {
      if (!existsSync(target)) return [];
      return statSync(target).isDirectory() ? files(target) : [target];
    }).filter((file) => /\.(?:ts|js|mjs)$/.test(file));
    const source = production.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(source).not.toMatch(/overture-places-live|run-overture-places-canary|overture_places_live/);

    const packageJson = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
    };
    expect(JSON.stringify({
      prebuild: packageJson.scripts.prebuild,
      start: packageJson.scripts.start,
      dev: packageJson.scripts.dev,
    })).not.toMatch(/overture|canary|lead-engine/);
    expect(Object.keys(packageJson.dependencies)).not.toEqual(expect.arrayContaining([
      "duckdb", "parquet", "hyparquet", "apache-arrow",
    ]));
  });

  it("does not expose a business-website crawl, export, CRM, verification, or contact path", () => {
    const overtureSource = [
      ...files(path.join(process.cwd(), "src", "lead-engine", "providers", "overture")),
      path.join(process.cwd(), "src", "lead-engine", "providers", "adapters", "overture-places-live.ts"),
      path.join(process.cwd(), "scripts", "run-overture-places-canary.ts"),
    ].map((file) => readFileSync(file, "utf8")).join("\n");
    expect(overtureSource).not.toMatch(/discord|retell|composio|dialer|sendEmail|sendSms|placeCall|crmExport/i);
    expect(overtureSource).not.toMatch(/fetch\s*\(.*website|crawl\s*\(.*website/i);
    expect(overtureSource).not.toMatch(/setInterval\s*\(|cron\.schedule|node-cron|production_worker/i);
  });
});
