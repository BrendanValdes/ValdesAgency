// Render sample cards for visual verification — all 3 templates × 2 sizes.
// Usage: npx tsx scripts/render-cards-cli.ts [outDir]
// Writes deterministic filenames (template-size.jpg) so reruns overwrite.

import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { getBrand } from "../src/services/brand-config.js";
import {
  type CardSize,
  type CardTemplate,
  renderCard,
} from "../src/services/image-cards.js";

const outDir = resolve(process.cwd(), process.argv[2] ?? "card-samples");
await mkdir(outDir, { recursive: true });

const brand = await getBrand("valdes");
if (!brand) throw new Error("brand valdes not found");

const FIXTURES: Array<{ template: CardTemplate; headline: string }> = [
  {
    template: "framework",
    headline: "The 4-point trust check every pool company fails",
  },
  {
    template: "statement",
    headline: "62 Yelp reviews. A Yahoo email. One of these wins.",
  },
  {
    template: "roundup",
    headline: "Five pool companies audited this week. Same hole in all five.",
  },
];

for (const f of FIXTURES) {
  for (const size of ["ig", "fb"] as CardSize[]) {
    const buf = await renderCard({ brand, template: f.template, headline: f.headline, size });
    // JPEG magic bytes sanity: FF D8 ... FF D9
    if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error(`${f.template}-${size}: not a JPEG`);
    const path = join(outDir, `${f.template}-${size}.jpg`);
    await writeFile(path, buf);
    console.log(`${f.template}-${size}.jpg  ${(buf.length / 1024).toFixed(0)}KB`);
  }
}
console.log(`\nWrote 6 samples to ${outDir}`);
