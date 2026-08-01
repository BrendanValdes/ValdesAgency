import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

describe("Phase 2 artifact safety", () => {
  it("accepts only the marked synthetic Parquet fixture", async () => {
    const repositoryRoot = path.resolve(process.cwd(), "..");
    const fixturePath = path.join(
      process.cwd(),
      "test",
      "lead-engine",
      "fixtures",
      "discovery",
      "synthetic-overture.parquet",
    );
    const originalArgv = process.argv;
    const originalExitCode = process.exitCode;
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.doMock("node:child_process", () => ({ execFileSync: vi.fn(() => repositoryRoot) }));
    try {
      process.argv = [process.execPath, "check-lead-artifacts.mjs", "--check", fixturePath];
      process.exitCode = undefined;
      await import("../../scripts/check-lead-artifacts.mjs?synthetic-parquet-check");
      expect(process.exitCode ?? 0).toBe(0);
    } finally {
      process.argv = originalArgv;
      process.exitCode = originalExitCode;
      log.mockRestore();
      vi.doUnmock("node:child_process");
    }
  });

  it("continues to reject unmarked binary lead-like files", async () => {
    const repositoryRoot = path.resolve(process.cwd(), "..");
    const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "rocco-real-leads-binary-"));
    const prohibitedPath = path.join(temporaryRoot, "leads.parquet");
    writeFileSync(prohibitedPath, Buffer.from([0x50, 0x41, 0x52, 0x31, 0x00, 0x50, 0x41, 0x52, 0x31]));
    const originalArgv = process.argv;
    const originalExitCode = process.exitCode;
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.doMock("node:child_process", () => ({ execFileSync: vi.fn(() => repositoryRoot) }));
    try {
      process.argv = [process.execPath, "check-lead-artifacts.mjs", "--check", prohibitedPath];
      process.exitCode = undefined;
      await import("../../scripts/check-lead-artifacts.mjs?binary-rejection-check");
      expect(process.exitCode).toBe(1);
      expect(error.mock.calls.flat().join(" ")).toContain("binary lead artifact");
    } finally {
      process.argv = originalArgv;
      process.exitCode = originalExitCode;
      error.mockRestore();
      vi.doUnmock("node:child_process");
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });
});
