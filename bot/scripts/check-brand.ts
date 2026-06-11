// Proves brand-config path resolution works regardless of launch directory.
// Run from repo root AND from bot/: npx tsx scripts/check-brand.ts
import { getBrand } from "../src/services/brand-config.js";

const brand = await getBrand("valdes");
console.log(`cwd=${process.cwd()}`);
if (!brand) {
  console.error("FAIL: getBrand('valdes') returned null");
  process.exit(1);
}
console.log(
  `OK: loaded brand_key=${brand.brand_key} status=${brand.status} banned_words=${brand.voice.banned_words.length} platforms=${brand.cadence.platforms.join(",")}`,
);
