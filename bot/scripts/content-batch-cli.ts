// Headless content batch — generates drafts and prints them to stdout
// instead of posting to Discord. Review-in-terminal path for Gate 3.
// Run: npx tsx scripts/content-batch-cli.ts [scenarioId ...]
import { generateDrafts, getSpec } from "../src/features/content.js";

const scenarios = process.argv
  .slice(2)
  .map((a) => Number.parseInt(a, 10))
  .filter((n) => Number.isInteger(n));

const { brand, cluster, drafts } = await generateDrafts(
  scenarios.length > 0 ? { scenarios } : {},
);

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
  console.log(`DRAFT ${n}/${drafts.length} — S${d.scenarioId} ${spec.name} — ${spec.platform}`);
  console.log(`Voice-check: ${status}`);
  if (!d.passed && d.failures.length > 0) {
    for (const f of d.failures) console.log(`  ✗ ${f.check}: ${f.detail}`);
  }
  console.log("-".repeat(72));
  console.log(d.body);
}
console.log(line);
const clean = drafts.filter((d) => d.passed).length;
console.log(`SUMMARY: ${drafts.length} drafts · ${clean} clean · ${drafts.length - clean} flagged`);
