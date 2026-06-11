// Headless content batch — generates drafts and prints them to stdout
// instead of posting to Discord. Review-in-terminal path for Gate 3.
// Run: npx tsx scripts/content-batch-cli.ts [scenarioId ...] [--offset N]
// --offset N skips the first N seeds per city, pulling a fresh cluster.
import { generateDrafts, getSpec } from "../src/features/content.js";

const args = process.argv.slice(2);
let seedOffset = 0;
const offsetIdx = args.indexOf("--offset");
if (offsetIdx !== -1) {
  seedOffset = Number.parseInt(args[offsetIdx + 1] ?? "", 10);
  if (!Number.isInteger(seedOffset) || seedOffset < 0) {
    console.error("--offset requires a non-negative integer");
    process.exit(1);
  }
  args.splice(offsetIdx, 2);
}

const scenarios = args
  .map((a) => Number.parseInt(a, 10))
  .filter((n) => Number.isInteger(n));

const { brand, cluster, drafts } = await generateDrafts({
  ...(scenarios.length > 0 ? { scenarios } : {}),
  seedOffset,
});

const line = "=".repeat(72);
console.log(line);
console.log(`CONTENT BATCH — ${brand.display_name}`);
console.log(
  `${drafts.length} draft(s) · seeds from ${cluster.length} pool diagnoses (${[...new Set(cluster.map((c) => c.city))].join(", ")})`,
);

let n = 0;
for (const d of drafts) {
  n += 1;
  const spec = getSpec(d.scenarioId);
  const status = d.passed ? "PASS" : `FLAGGED after ${d.attempts} attempt(s)`;
  console.log(line);
  const tag = d.format === "video" ? " [VIDEO SCRIPT]" : "";
  console.log(`DRAFT ${n}/${drafts.length} — S${d.scenarioId} ${spec.name} — ${spec.platform}${tag}`);
  console.log(`Voice-check: ${status}`);
  for (const f of d.failures) {
    console.log(`  ${d.passed ? "⚠" : "✗"} ${f.check}: ${f.detail}`);
  }
  console.log("-".repeat(72));
  console.log(d.body);
}
console.log(line);
const clean = drafts.filter((d) => d.passed).length;
console.log(`SUMMARY: ${drafts.length} drafts · ${clean} clean · ${drafts.length - clean} flagged`);
