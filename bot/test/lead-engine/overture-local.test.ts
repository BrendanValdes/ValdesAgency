import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { OvertureLocalDiscoveryProvider } from "../../src/lead-engine/providers/adapters/overture-local.js";
import type { DiscoveryProviderRequest } from "../../src/lead-engine/providers/contracts.js";
import { encodeSyntheticOvertureParquet } from "./fixtures/discovery/parquet-writer.js";

const fixtureRoot = path.join(process.cwd(), "test", "lead-engine", "fixtures", "discovery");
const fixturePath = path.join(fixtureRoot, "synthetic-overture.parquet");
const checksum = createHash("sha256").update(readFileSync(fixturePath)).digest("hex");
const request: DiscoveryProviderRequest = {
  operation: "discovery",
  correlationId: "overture-synthetic-correlation",
  queryId: "query-synthetic-overture",
  queryText: "synthetic pool service",
  nicheId: "pool_service",
  coverageKey: "coverage-synthetic-overture",
  observedAt: "2026-01-15T12:00:00.000Z",
  retrievedAt: "2026-01-15T12:00:01.000Z",
};

function provider(overrides: Partial<ConstructorParameters<typeof OvertureLocalDiscoveryProvider>[0]> = {}) {
  return new OvertureLocalDiscoveryProvider({
    fixturePath,
    allowedFixtureRoot: fixtureRoot,
    releaseId: "synthetic-2026-01-15",
    sha256: checksum,
    ...overrides,
  });
}

describe("local Overture-style Parquet adapter", () => {
  it("reads and normalizes the pinned synthetic local fixture", async () => {
    const batch = await provider().discover(request);
    expect(batch.status).toBe("complete");
    expect(batch.envelopes).toHaveLength(2);
    expect(batch.envelopes[0]).toMatchObject({
      providerId: "overture_local",
      providerResultId: "overture-synthetic-place-001",
      validation: { status: "accepted", issues: [] },
      rawReferenceChecksum: checksum,
    });
  });

  it("requires matching pinned release and checksum", async () => {
    await expect(provider({ releaseId: "synthetic-wrong" }).discover(request)).rejects.toThrow("release identifier");
    await expect(provider({ sha256: "0".repeat(64) }).discover(request)).rejects.toThrow("checksum");
  });

  it("rejects missing expected fields as validation failures", async () => {
    const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "rocco-overture-malformed-"));
    const malformedPath = path.join(temporaryRoot, "synthetic-malformed.parquet");
    const content = encodeSyntheticOvertureParquet([{ id: "missing-fields" }], "synthetic-malformed");
    writeFileSync(malformedPath, content);
    try {
      const malformedChecksum = createHash("sha256").update(content).digest("hex");
      const batch = await provider({ fixturePath: malformedPath, allowedFixtureRoot: temporaryRoot, releaseId: "synthetic-malformed", sha256: malformedChecksum }).discover(request);
      expect(batch.status).toBe("failed");
      expect(batch.envelopes[0]?.validation.status).toBe("rejected");
      expect(batch.envelopes[0]?.normalizedResult).toBeNull();
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("rejects relative and root-escaping fixture paths", async () => {
    await expect(provider({ fixturePath: "synthetic-overture.parquet" }).discover(request)).rejects.toThrow("absolute paths");
    await expect(provider({ allowedFixtureRoot: path.dirname(fixtureRoot) }).discover(request)).resolves.toBeDefined();
    const outsideRoot = mkdtempSync(path.join(os.tmpdir(), "rocco-overture-outside-"));
    try {
      await expect(provider({ allowedFixtureRoot: outsideRoot }).discover(request)).rejects.toThrow("escapes");
    } finally {
      rmSync(outsideRoot, { recursive: true, force: true });
    }
  });

  it("performs no network request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await provider().discover(request);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
