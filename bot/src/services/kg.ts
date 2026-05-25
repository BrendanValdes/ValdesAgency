// Knowledge Graph (KG) read service for ROCCO.
// ============================================================================
// Direct filesystem access to memory/memory.jsonl. Shares the same store as
// the mcp-knowledge-graph MCP server used by Claude in dev sessions. The
// deployed bot cannot reach Claude's MCP tools, so both sides treat the JSONL
// file as the source of truth and use compatible line-delimited JSON.
//
// Read-only for Gate 3.2. Write operations (storeEntity, etc.) land in sub-build
// 3.5 if needed for first-draft generation.
// ============================================================================

import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { env } from "../env.js";
import { log } from "../logger.js";

// ---------- Types ----------

export type KgEntity = {
  type: "entity";
  name: string;
  entityType: string;
  observations: string[];
};

export type KgRelation = {
  type: "relation";
  from: string;
  to: string;
  relationType: string;
};

type KgHeader = {
  type: "_aim";
  source: string;
};

type KgLine = KgEntity | KgRelation | KgHeader;

export type ClientOutcomeFields = {
  client_name: string;
  client_niche: string;
  metric_name: string;
  metric_value_before: number;
  metric_value_after: number;
  time_window: string;
  verifiable: boolean;
  shareable: boolean;
  source_entity_name: string;
};

// ---------- Cache ----------

const KG_FILE_PATH_DEFAULT = "memory/memory.jsonl";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

type Cache = {
  entities: KgEntity[];
  relations: KgRelation[];
  loadedAt: number;
};

let cache: Cache | null = null;

function getKgPath(): string {
  const configured = process.env.KG_FILE_PATH ?? KG_FILE_PATH_DEFAULT;
  return resolve(process.cwd(), configured);
}

async function loadAll(): Promise<Cache> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
    return cache;
  }

  const path = getKgPath();
  const entities: KgEntity[] = [];
  const relations: KgRelation[] = [];

  let raw: string;
  try {
    const fileStat = await stat(path);
    if (!fileStat.isFile()) {
      log.warn("kg_path_not_file", { path });
      cache = { entities, relations, loadedAt: Date.now() };
      return cache;
    }
    raw = await readFile(path, "utf8");
  } catch (err) {
    log.warn("kg_read_failed", { path, err: String(err) });
    cache = { entities, relations, loadedAt: Date.now() };
    return cache;
  }

  const lines = raw.split("\n");
  let parsed = 0;
  let skipped = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    try {
      const obj = JSON.parse(trimmed) as KgLine;
      if (obj.type === "entity") {
        entities.push(obj);
        parsed++;
      } else if (obj.type === "relation") {
        relations.push(obj);
        parsed++;
      }
      // headers (_aim) silently ignored
    } catch (err) {
      skipped++;
      log.warn("kg_line_parse_failed", { line: trimmed.slice(0, 100), err: String(err) });
    }
  }

  log.info("kg_loaded", { path, entities: entities.length, relations: relations.length, parsed, skipped });

  cache = { entities, relations, loadedAt: Date.now() };
  return cache;
}

// ---------- Public reads ----------

export async function loadAllEntities(): Promise<KgEntity[]> {
  const c = await loadAll();
  return c.entities;
}

export async function loadAllRelations(): Promise<KgRelation[]> {
  const c = await loadAll();
  return c.relations;
}

export async function findEntitiesByType(entityType: string): Promise<KgEntity[]> {
  const c = await loadAll();
  return c.entities.filter((e) => e.entityType === entityType);
}

export async function findEntityByName(name: string): Promise<KgEntity | null> {
  const c = await loadAll();
  return c.entities.find((e) => e.name === name) ?? null;
}

// ---------- ClientOutcome (Scenario 3 unlock Gate A) ----------

// Parse observation strings of form "field_name: value" into a record.
// Convention used by mcp-knowledge-graph: observations are free-text strings,
// but for typed entities we follow "key: value" lines so this function can
// reconstruct a structured object.
function parseObservationFields(observations: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const obs of observations) {
    const idx = obs.indexOf(":");
    if (idx === -1) continue;
    const key = obs.slice(0, idx).trim();
    const value = obs.slice(idx + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

function parseBoolean(v: string | undefined): boolean | null {
  if (v === undefined) return null;
  const lower = v.toLowerCase();
  if (lower === "true" || lower === "yes" || lower === "1") return true;
  if (lower === "false" || lower === "no" || lower === "0") return false;
  return null;
}

function parseNumber(v: string | undefined): number | null {
  if (v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function findPublishableClientOutcomes(brandKey: string): Promise<ClientOutcomeFields[]> {
  const all = await findEntitiesByType("ClientOutcome");
  const valid: ClientOutcomeFields[] = [];

  for (const entity of all) {
    const f = parseObservationFields(entity.observations);
    const before = parseNumber(f.metric_value_before);
    const after = parseNumber(f.metric_value_after);
    const verifiable = parseBoolean(f.verifiable);
    const shareable = parseBoolean(f.shareable);
    const brand = f.brand_key ?? f.brand;

    if (brand !== brandKey) continue;
    if (!f.client_name || !f.client_niche || !f.metric_name || !f.time_window) continue;
    if (before === null || after === null) continue;
    if (verifiable !== true || shareable !== true) continue;

    valid.push({
      client_name: f.client_name,
      client_niche: f.client_niche,
      metric_name: f.metric_name,
      metric_value_before: before,
      metric_value_after: after,
      time_window: f.time_window,
      verifiable,
      shareable,
      source_entity_name: entity.name,
    });
  }

  return valid;
}

// ---------- Pattern filtering ----------

function compilePattern(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, "i");
  } catch (err) {
    log.warn("kg_pattern_compile_failed", { pattern, err: String(err) });
    return null;
  }
}

export function isBlockedByPatterns(text: string, patterns: string[]): boolean {
  for (const p of patterns) {
    const re = compilePattern(p);
    if (re && re.test(text)) return true;
  }
  return false;
}

export type FilterResult = {
  allowed: KgEntity[];
  blocked: Array<{ entity: KgEntity; matchedPattern: string }>;
};

export function filterEntitiesByBlockedPatterns(
  entities: KgEntity[],
  patterns: string[],
): FilterResult {
  const compiled = patterns
    .map((p) => ({ pattern: p, regex: compilePattern(p) }))
    .filter((c): c is { pattern: string; regex: RegExp } => c.regex !== null);

  const allowed: KgEntity[] = [];
  const blocked: Array<{ entity: KgEntity; matchedPattern: string }> = [];

  for (const entity of entities) {
    const haystack = [entity.name, entity.entityType, ...entity.observations].join("\n");
    let matchedPattern: string | null = null;
    for (const c of compiled) {
      if (c.regex.test(haystack)) {
        matchedPattern = c.pattern;
        break;
      }
    }
    if (matchedPattern) {
      blocked.push({ entity, matchedPattern });
    } else {
      allowed.push(entity);
    }
  }

  return { allowed, blocked };
}

// ---------- Cache invalidation (for tests / future writes) ----------

export function _resetCache(): void {
  cache = null;
}

// Re-export env so callers can introspect KG_FILE_PATH override.
// Note: env import kept to wire up logger context; not unused.
void env;
