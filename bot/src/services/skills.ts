import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { env } from "../env.js";
import { log } from "../logger.js";

const cache = new Map<string, string>();

export async function loadSkill(name: string): Promise<string> {
  const cached = cache.get(name);
  if (cached) return cached;
  const path = resolve(env.paths.skillsDir, `${name}.md`);
  try {
    const text = await readFile(path, "utf8");
    cache.set(name, text);
    return text;
  } catch (err) {
    log.warn("skill_load_failed", { name, path, err: String(err) });
    return "";
  }
}

export async function loadAllSkills(): Promise<Record<string, string>> {
  const names = [
    "sales",
    "lessons-learned",
    "ads",
    "marketing",
    "content",
    "website",
    "website-build",
    "design-references",
    "sonoview",
    "trade-n-travel",
    "agent-architecture",
  ];
  const out: Record<string, string> = {};
  for (const n of names) {
    const text = await loadSkill(n);
    if (text) out[n] = text;
  }
  return out;
}

export async function loadLeadsFile(): Promise<string> {
  const path = resolve(env.paths.leadsFile);
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    log.warn("leads_load_failed", { path, err: String(err) });
    return "";
  }
}
