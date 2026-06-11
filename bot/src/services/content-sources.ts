// Content source loader for the Gate 3 generator.
// ============================================================================
// Reads the CURRENT pool dial-sheet files (POOL *.md) and extracts the Hook
// column — the per-lead marketing diagnosis (stale copyright, placeholder
// testimonials, @gmail business email, etc.). Those diagnoses are the raw
// material the generator abstracts into educational content.
//
// LEAK GUARD (layer 1): Company / Owner / Phone are never extracted — only
// City, Tier, and the diagnosis. URLs and emails inside the diagnosis are
// scrubbed before the text ever reaches the LLM. Layers 2 (generation prompt)
// and 3 (kg.ts isBlockedByPatterns on the final draft) live in features/content.ts.
//
// Paths resolve through brand-config's resolveDataDir (marker walk-up from
// module dir + cwd, bundled `data/` fallback) — never cwd-relative. Works
// from any cwd locally and from the Railway image.
// ============================================================================

import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { log } from "../logger.js";
import type { BrandConfig } from "./brand-config.js";
import { resolveDataDir } from "./brand-config.js";

export type DiagnosisSeed = {
  city: string;
  tier: string;
  diagnosis: string;
};

const EMAIL_RE = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi;
// URLs and bare domains (summerlinhillspoolservice.com, www.x.com, https://...).
const URL_RE =
  /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|biz|info|co|io|us)\b\S*/gi;

// Leading owner-name vocative: hooks often open "Greg, saw your site...".
const VOCATIVE_RE = /^[A-Z][a-zA-Z'’.-]+,\s+/;

/** Strip identifying owner names / URLs / emails from a diagnosis before it reaches the model. */
function scrub(hook: string): string {
  return hook
    .replace(VOCATIVE_RE, "")
    .replace(EMAIL_RE, "[their email]")
    .replace(URL_RE, "[their site]")
    .replace(/\s+/g, " ")
    .trim();
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

/**
 * Parse the first "## Leads Table" in a dial sheet into row records keyed by
 * lowercased header name. Robust to column reordering — reads the header row.
 */
function parseLeadsTable(md: string): Array<Record<string, string>> {
  const lines = md.split(/\r?\n/);
  const start = lines.findIndex((l) => l.includes("## Leads Table"));
  if (start === -1) return [];

  let i = start + 1;
  let headerLine: string | undefined;
  for (; i < lines.length; i++) {
    const l = lines[i] ?? "";
    if (l.trim().startsWith("|") && /company/i.test(l) && /hook/i.test(l)) {
      headerLine = l;
      break;
    }
  }
  if (headerLine === undefined) return [];

  const header = splitRow(headerLine).map((h) => h.toLowerCase());
  i++;
  // Skip the |---|---| separator row if present.
  if (/^\s*\|[\s:|-]+\|\s*$/.test(lines[i] ?? "")) i++;

  const rows: Array<Record<string, string>> = [];
  for (; i < lines.length; i++) {
    const l = lines[i] ?? "";
    if (!l.trim().startsWith("|")) break;
    const cells = splitRow(l);
    const rec: Record<string, string> = {};
    header.forEach((h, idx) => {
      rec[h] = cells[idx] ?? "";
    });
    rows.push(rec);
  }
  return rows;
}

/**
 * Load anonymized marketing diagnoses from the current POOL dial-sheet files.
 * Returns City + Tier + scrubbed diagnosis only. Never returns company/owner/phone.
 */
export async function loadPoolDiagnoses(brand: BrandConfig): Promise<DiagnosisSeed[]> {
  const dir = resolveDataDir(brand.sources.lead_scrapes);

  let files: string[];
  try {
    files = await readdir(dir);
  } catch (err) {
    log.warn("content_sources_dir_missing", { dir, err: String(err) });
    return [];
  }

  const poolFiles = files.filter((f) => f.startsWith("POOL ") && f.endsWith(".md"));
  const seeds: DiagnosisSeed[] = [];

  for (const filename of poolFiles) {
    let text: string;
    try {
      text = await readFile(resolve(dir, filename), "utf8");
    } catch (err) {
      log.warn("content_sources_file_unreadable", { filename, err: String(err) });
      continue;
    }
    if (!text.includes("## Leads Table")) continue;

    for (const row of parseLeadsTable(text)) {
      const diagnosis = scrub(row.hook ?? "");
      if (!diagnosis) continue;
      seeds.push({
        city: (row.city ?? "").trim() || "Las Vegas",
        tier: (row.tier ?? "").trim() || "unknown",
        diagnosis,
      });
    }
  }

  log.info("content_sources_loaded", {
    pool_files: poolFiles.length,
    seeds: seeds.length,
  });
  return seeds;
}
