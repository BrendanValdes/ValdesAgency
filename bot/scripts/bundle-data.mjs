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
// Dial sheets bundle to data/memory/leads so resolveDataDir's `data/<dir>`
// fallback finds them under the same relative path as the live repo.
const leadsSrc = join(repoRoot, "memory", "leads");
const leadsDst = join(dataDir, "memory", "leads");
const brandsSrc = join(repoRoot, "config", "brands");
const brandsDst = join(dataDir, "config", "brands");
// Tone-sample voice anchors bundle to data/memory/voice so the deployed bot
// loads the real anchor instead of the valdes.yaml fallback (anthropic.ts
// getTonePath resolves memory/voice/<brand>-tone-samples.md via resolveDataDir).
const voiceSrc = join(repoRoot, "memory", "voice");
const voiceDst = join(dataDir, "memory", "voice");

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
    console.warn(`[bundle-data] leads dir not found at ${leadsSrc} — skipping`);
    return 0;
  }
  // Drop the pre-rename bundle location (data/leads/vegas-pool-leads.md).
  await rm(join(dataDir, "leads"), { recursive: true, force: true });
  await rm(leadsDst, { recursive: true, force: true });
  await mkdir(leadsDst, { recursive: true });
  const entries = await readdir(leadsSrc);
  let count = 0;
  for (const f of entries) {
    // Same filter as content-sources.ts loadPoolDiagnoses — only the POOL
    // dial sheets feed the content system; CSVs and other niches stay out.
    if (!(f.startsWith("POOL ") && f.endsWith(".md"))) continue;
    await cp(join(leadsSrc, f), join(leadsDst, f));
    count += 1;
  }
  return count;
}

async function copyBrands() {
  if (!(await exists(brandsSrc))) {
    console.warn(`[bundle-data] config/brands source not found at ${brandsSrc} — skipping`);
    return 0;
  }
  await rm(brandsDst, { recursive: true, force: true });
  await mkdir(brandsDst, { recursive: true });
  const entries = await readdir(brandsSrc);
  let count = 0;
  for (const f of entries) {
    if (!f.endsWith(".yaml")) continue;
    await cp(join(brandsSrc, f), join(brandsDst, f));
    count += 1;
  }
  return count;
}

async function copyVoice() {
  if (!(await exists(voiceSrc))) {
    console.warn(`[bundle-data] memory/voice source not found at ${voiceSrc} — skipping`);
    return 0;
  }
  await rm(voiceDst, { recursive: true, force: true });
  await mkdir(voiceDst, { recursive: true });
  const entries = await readdir(voiceSrc);
  let count = 0;
  for (const f of entries) {
    if (!f.endsWith("-tone-samples.md")) continue;
    await cp(join(voiceSrc, f), join(voiceDst, f));
    count += 1;
  }
  return count;
}

const skillCount = await copySkills();
const leadsCount = await copyLeads();
const brandCount = await copyBrands();
const voiceCount = await copyVoice();

console.log(
  `[bundle-data] bundled ${skillCount} skill files + ${leadsCount} POOL dial sheets + ${brandCount} brand configs + ${voiceCount} tone-sample files into ${dataDir}`,
);
