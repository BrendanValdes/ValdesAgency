import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse, stringify } from "yaml";

export interface TemporaryLeadPolicyRoot {
  readonly root: string;
  cleanup(): void;
}

export function createTemporaryLeadPolicyRoot(): TemporaryLeadPolicyRoot {
  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "rocco-lead-policy-"));
  const root = path.join(temporaryRoot, "leads");
  cpSync(path.resolve(process.cwd(), "..", "config", "leads"), root, {
    recursive: true,
  });
  return {
    root,
    cleanup: () => rmSync(temporaryRoot, { recursive: true, force: true }),
  };
}

export function updatePolicyYaml(
  root: string,
  filename: "schema.yaml" | "providers.yaml",
  mutate: (value: Record<string, unknown>) => void,
): void {
  const filePath = path.join(root, filename);
  const value = parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
  mutate(value);
  writeFileSync(filePath, stringify(value));
}
