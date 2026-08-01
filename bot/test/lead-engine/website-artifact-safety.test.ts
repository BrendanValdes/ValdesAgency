import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

describe("Phase 3 website fixture artifact safety", () => {
  it("accepts the clearly synthetic reserved-domain website fixture", async () => {
    const repositoryRoot = path.resolve(process.cwd(), "..");
    const fixturePath = path.join(process.cwd(), "test/lead-engine/fixtures/websites/synthetic/valid-local-business.html");
    const originalArgv = process.argv;
    const originalExitCode = process.exitCode;
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.doMock("node:child_process", () => ({ execFileSync: vi.fn(() => repositoryRoot) }));
    try {
      process.argv = [process.execPath, "check-lead-artifacts.mjs", "--check", fixturePath];
      process.exitCode = undefined;
      await import("../../scripts/check-lead-artifacts.mjs?website-fixture-check");
      expect(process.exitCode ?? 0).toBe(0);
    } finally {
      process.argv = originalArgv;
      process.exitCode = originalExitCode;
      log.mockRestore();
      vi.doUnmock("node:child_process");
    }
  });

  it("continues rejecting unmarked raw production-page paths", async () => {
    const repositoryRoot = path.resolve(process.cwd(), "..");
    const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "rocco-raw-page-guard-"));
    const prohibited = path.join(temporaryRoot, "raw-website-pages", "captured.html");
    const directory = path.dirname(prohibited);
    const { mkdirSync } = await import("node:fs");
    mkdirSync(directory, { recursive: true });
    writeFileSync(prohibited, "<html><body>unmarked captured page</body></html>");
    const originalArgv = process.argv;
    const originalExitCode = process.exitCode;
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.doMock("node:child_process", () => ({ execFileSync: vi.fn(() => repositoryRoot) }));
    try {
      process.argv = [process.execPath, "check-lead-artifacts.mjs", "--check", prohibited];
      process.exitCode = undefined;
      await import("../../scripts/check-lead-artifacts.mjs?raw-page-rejection-check");
      expect(process.exitCode).toBe(1);
      expect(error.mock.calls.flat().join(" ")).toContain("raw crawled-page path");
    } finally {
      process.argv = originalArgv;
      process.exitCode = originalExitCode;
      error.mockRestore();
      vi.doUnmock("node:child_process");
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });
});
