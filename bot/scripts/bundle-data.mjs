// Bundles the skills/ playbooks and the leads file into bot/data/
// so the deployed image is self-contained and the repo root can exclude
// skills/, memory/, clients/ from the Railway build.

import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const botRoot = resolve(here, "..");
const repoRoot = resolve(botRoot, "..");

const dataDir = join(botRoot, "data");
const skillsSrc = join(repoRoot, "skills");
const skillsDst = join(dataDir, "skills");
const leadsSrc = join(repoRoot, "memory", "leads", "vegas-pool-leads.md");
const leadsDst = join(dataDir, "leads", "vegas-pool-leads.md");

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function copySkills() {
  if (!(await exists(skillsSrc))) {
    console.warn(`[bundle-data] skills/ source not found at ${skillsSrc} — skipping`);
    return 0;
  }
  await rm(skillsDst, { recursive: true, force: true });
  await mkdir(skillsDst, { recursive: true });
  const entries = await readdir(skillsSrc);
  let count = 0;
  for (const f of entries) {
    if (!f.endsWith(".md")) continue;
    await cp(join(skillsSrc, f), join(skillsDst, f));
    count += 1;
  }
  return count;
}

async function copyLeads() {
  if (!(await exists(leadsSrc))) {
    console.warn(`[bundle-data] leads file not found at ${leadsSrc} — skipping`);
    return false;
  }
  await mkdir(dirname(leadsDst), { recursive: true });
  await cp(leadsSrc, leadsDst);
  return true;
}

const skillCount = await copySkills();
const leadsCopied = await copyLeads();

console.log(
  `[bundle-data] bundled ${skillCount} skill files + leads=${leadsCopied} into ${dataDir}`,
);
